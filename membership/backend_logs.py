"""Bounded, read-only journal viewer. Never accept paths, units or shell commands."""
import datetime
import json
import re
import selectors
import subprocess
import time
from typing import Literal

from fastapi import Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse

# Only Rangerbook application services. No system, secret-provider or other app logs.
SOURCES = {
    'auth': ('rangerbook-auth.service',),
    'updates': ('rangerbook-update.service', 'rangerbook-v2-update.service', 'rangerbook-private-resources.service'),
    'pvp': ('rangerbook-pvp-leaderboard.service', 'rangerbook-pvp-usage.service', 'rangerbook-pvp-usage-history.service'),
    'guildwar': ('rangerbook-guildwar-data.service', 'rangerbook-guildwar-ranking.service', 'rangerbook-guildwar-usage.service'),
    'players': ('rangerbook-player-index.service',),
    'mail': ('rangerbook-member-mail.service', 'rangerbook-member-health.service'),
    'traffic': ('rangerbook-traffic.service',),
}
ALL_UNITS = tuple(unit for units in SOURCES.values() for unit in units)
MAX_BYTES = 1024 * 1024
SENSITIVE = re.compile(
    r'(?i)(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|'
    r'authorization|cookie|lf[_-]?ac|recovery[_-]?code|manual[_-]?key|'
    r'client[_-]?secret|session|totp|otp|authorization[_-]?code|signature)'
    r'[\w-]*[\s\"\']*[:=]|\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=-]+|'
    r'[?&](?:code|state|key|sig|X-Amz-Credential|X-Amz-Signature)=|'
    r'-----BEGIN [\w ]*PRIVATE KEY-----|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|'
    r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'
)


def redact(message):
    if isinstance(message, list):
        try:
            message = bytes(message).decode('utf-8', errors='replace')
        except (ValueError, TypeError):
            return '[unreadable message]'
    text = str(message or '')
    text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text)
    text = re.sub(r'[\x00-\x08\x0b-\x1f\x7f]', '', text)
    # Redact the complete event, including multiline payloads and URL queries.
    if SENSITIVE.search(text):
        return '[REDACTED: sensitive log entry]'
    return text[:4000] + ('…' if len(text) > 4000 else '')


def read_journal(command):
    """Hard time/output bounds, no shell, and always reap the child process."""
    try:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        with process, selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            output = bytearray()
            deadline = time.monotonic() + 5
            try:
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise TimeoutError
                    if not selector.select(remaining):
                        raise TimeoutError
                    chunk = process.stdout.read1(65536)
                    if not chunk:
                        break
                    output.extend(chunk)
                    if len(output) > MAX_BYTES:
                        raise OverflowError
                if process.wait(timeout=max(0.01, deadline - time.monotonic())):
                    raise OSError
            finally:
                if process.poll() is None:
                    process.kill()
                process.wait()
            return output.decode('utf-8', errors='replace')
    except (OSError, TimeoutError, OverflowError, subprocess.TimeoutExpired):
        raise HTTPException(503, 'logs.unavailable') from None


def report(source, hours, level, limit, keyword):
    units = ALL_UNITS if source == 'all' else SOURCES[source]
    command = ['/usr/bin/journalctl', '--no-pager', '--quiet', '--output=json',
               '--output-fields=__REALTIME_TIMESTAMP,_SYSTEMD_UNIT,UNIT,PRIORITY,MESSAGE',
               '--reverse', '--lines=' + str(limit), '--since=' + str(hours) + ' hours ago']
    for unit in units:
        command.extend(['--unit', unit])
    if level != 'all':
        command.append('--priority=' + {'error': '3', 'warning': '4', 'info': '6'}[level])
    rows = []
    for line in read_journal(command).splitlines():
        try:
            entry = json.loads(line)
            if not isinstance(entry, dict):
                continue
            unit = entry.get('_SYSTEMD_UNIT')
            if unit not in units:
                unit = entry.get('UNIT')
            if unit not in units:
                continue
            message = redact(entry.get('MESSAGE', ''))
            if keyword.casefold() not in message.casefold():
                continue
            timestamp = datetime.datetime.fromtimestamp(int(entry['__REALTIME_TIMESTAMP']) / 1e6, datetime.timezone.utc).isoformat()
            priority = int(entry.get('PRIORITY', 6))
            rows.append({'time': timestamp, 'service': unit, 'priority': priority, 'message': message})
        except (ValueError, TypeError, KeyError, OverflowError, OSError):
            continue
    return {'items': rows[:limit], 'limit': limit,
            'updatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}


def install(membership):
    @membership.app.get('/admin/backend-logs')
    def backend_logs(request: Request, user=Depends(membership.super_admin),
                     source: Literal['all', 'auth', 'updates', 'pvp', 'guildwar', 'players', 'mail', 'traffic'] = 'all',
                     hours: int = Query(default=24, ge=1, le=168),
                     level: Literal['all', 'error', 'warning', 'info'] = 'all',
                     limit: int = Query(default=200, ge=1, le=500),
                     keyword: str = Query(default='', max_length=100)):
        membership.rate(request, 'backend-logs', user['id'], subject_limit=30, ip_limit=60, window=60)
        return JSONResponse(report(source, hours, level, limit, keyword.strip()),
                            headers={'Cache-Control': 'no-store, private', 'Pragma': 'no-cache'})
