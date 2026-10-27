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


def clean_message(message):
    if isinstance(message, list):
        try:
            message = bytes(message).decode('utf-8', errors='replace')
        except (ValueError, TypeError):
            return '[unreadable message]'
    text = str(message or '')
    text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text)
    text = re.sub(r'[\x00-\x08\x0b-\x1f\x7f]', '', text)
    return text


def redact(message):
    text = clean_message(message)
    # Apply to the reconstructed event, including values printed on later lines.
    if SENSITIVE.search(text):
        return '[REDACTED: sensitive log entry]'
    return text[:4000] + ('…' if len(text) > 4000 else '')


class JsonBlock:
    """Track brackets once per character, ignoring brackets inside strings."""
    def __init__(self):
        self.stack = []
        self.quoted = False
        self.escaped = False
        self.invalid = False

    def feed(self, text):
        for char in text:
            if self.quoted:
                if self.escaped:
                    self.escaped = False
                elif char == '\\':
                    self.escaped = True
                elif char == '"':
                    self.quoted = False
            elif char == '"':
                self.quoted = True
            elif char in '{[':
                self.stack.append(char)
            elif char in '}]':
                if not self.stack or self.stack.pop() != {'}': '{', ']': '['}[char]:
                    self.invalid = True

    @property
    def open(self):
        return not self.invalid and bool(self.stack or self.quoted)


def continuation(text):
    stripped = text.strip()
    return (not stripped or text[:1].isspace() or stripped.startswith(('}', ']', '"')))


def traceback_start(text):
    return text.lstrip().startswith(('Traceback (most recent call last):', 'Exception Group Traceback'))


def traceback_continuation(text):
    return (not text.strip() or text[:1].isspace() or traceback_start(text)
            or text.startswith(('During handling of the above exception', 'The above exception was the direct cause'))
            or bool(re.match(r'^(?!INFO:|DEBUG:|WARNING:|ERROR:|NOTICE:)[\w.]+(?:Error|Exception|Warning):|^(?:Exception|KeyboardInterrupt|SystemExit|StopIteration):', text)))


def group_entries(entries):
    """Join only adjacent continuation lines from the same process and stream.

    Journal input is newest first. Reconstruct text in chronological order, then
    reverse the completed events, so JSON keys and traceback frames stay readable.
    Missing identity, process changes, pauses and independent messages are boundaries.
    """
    groups, current = [], None

    def finish():
        nonlocal current
        if current is not None:
            text = '\n'.join(current['parts'])
            message = ('[REDACTED: incomplete multiline entry]' if current['orphan'] else redact(text))
            groups.append({'time': current['time'], 'service': current['service'],
                           'priority': current['priority'], 'message': message,
                           'lineCount': text.count('\n') + 1,
                           'truncated': len(text) > 4000 and message.endswith('…'),
                           'partial': current['partial'] or current['kind'] == 'json'})
            current = None

    for entry in reversed(entries):
        if entry is None:
            finish()
            continue
        text = entry['message']
        same_stream = (current is not None and entry['stream'] is not None
                       and current['stream'] == entry['stream']
                       and current['priority'] == entry['priority']
                       and 0 <= entry['micros'] - current['micros'] <= 2_000_000)
        kind = current['kind'] if same_stream else None
        joins = ((kind in {'json', 'fragment'} and continuation(text))
                 or (kind == 'traceback' and traceback_continuation(text)))
        if joins:
            current['parts'].append(text)
            current.update(time=entry['time'], micros=entry['micros'])
            if kind == 'json':
                current['json'].feed(text)
                current['partial'] |= current['json'].invalid
                if not current['json'].open:
                    current['kind'] = None
            elif kind == 'fragment' and re.fullmatch(r'[}\]],?', text.strip()):
                current['kind'] = None
            continue
        finish()
        stripped = text.lstrip()
        tracker, kind, partial = JsonBlock(), None, False
        if stripped.startswith('{') or re.match(r'^\[\s*(?:$|["{\[\]\d\-tfn])', stripped):
            tracker.feed(text)
            if tracker.open:
                kind = 'json'
        elif traceback_start(text):
            kind = 'traceback'
        elif continuation(text):
            kind, partial = 'fragment', True
        current = {**entry, 'parts': [text], 'kind': kind, 'json': tracker, 'partial': partial, 'orphan': partial}
    finish()
    return list(reversed(groups))


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
               '--output-fields=__REALTIME_TIMESTAMP,_SYSTEMD_UNIT,UNIT,PRIORITY,MESSAGE,_PID,_STREAM_ID,_SYSTEMD_INVOCATION_ID,_BOOT_ID,_TRANSPORT',
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
                rows.append(None)
                continue
            unit = entry.get('_SYSTEMD_UNIT')
            if unit not in units:
                unit = entry.get('UNIT')
            if unit not in units:
                rows.append(None)
                continue
            message = clean_message(entry.get('MESSAGE', ''))
            micros = int(entry['__REALTIME_TIMESTAMP'])
            timestamp = datetime.datetime.fromtimestamp(micros / 1e6, datetime.timezone.utc).isoformat()
            priority = int(entry.get('PRIORITY', 6))
            identity = [entry.get(key) for key in ('_BOOT_ID', '_SYSTEMD_INVOCATION_ID', '_STREAM_ID', '_PID')]
            stream = ((unit, *identity) if entry.get('_TRANSPORT') == 'stdout'
                      and all(isinstance(value, str) and value for value in identity) else None)
            rows.append({'time': timestamp, 'micros': micros, 'stream': stream,
                         'service': unit, 'priority': priority, 'message': message})
        except (ValueError, TypeError, KeyError, OverflowError, OSError):
            rows.append(None)
    grouped = group_entries(rows)
    items = [row for row in grouped if keyword.casefold() in row['message'].casefold()]
    return {'items': items[:limit], 'limit': limit, 'rawCount': sum(row is not None for row in rows),
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
