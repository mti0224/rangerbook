"""Operator-only detached EC2 preflight. No install/reload, production DB or mail.

Runs the copied provider temporarily on 2774, uses asm-exec (never a direct secret
request), and tests Nginx on loopback dummy upstreams. Run as an authorized host
operator; the interface/cutover holds must remain in place throughout.
"""
import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidate', type=Path, required=True)
    parser.add_argument('--run-name', default='preflight-' + str(time.time_ns()))
    args = parser.parse_args()
    root = args.candidate.resolve()
    review = root / 'review'
    if not (review / 'INTERFACE_PENDING').is_file() or (review / 'CUTOVER_APPROVED').exists():
        raise RuntimeError('Preflight requires interface hold and no cutover approval')
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')
    for key in list(env):
        if key.startswith('RANGERBOOK_') or key == 'AWS_TOKEN':
            del env[key]
    for name in ['runtime.env', 'key.env', 'provider.env']:
        for line in (review / name).read_text().splitlines():
            if line and not line.startswith('#'):
                key, value = line.split('=', 1)
                env[key] = value
    python = str(root / 'venv/bin/python')
    if not re.fullmatch(r'preflight-[A-Za-z0-9_-]+', args.run_name):
        raise ValueError('Use a new private preflight run name')
    work = review / args.run_name
    work.mkdir(mode=0o700)
    checks = {}
    baseline = json.loads((review / 'preparation.json').read_text())['production_baselines']
    pid_before = subprocess.check_output(['systemctl', 'show', 'rangerbook-auth', '--property=MainPID', '--value'], text=True).strip()
    with (work / 'commands.log').open('x') as log:
        for path in sorted(review.glob('*.service')) + sorted(review.glob('*.timer')):
            subprocess.run(['systemd-analyze', 'verify', str(path)], stdout=log, stderr=log, check=True)
        checks['systemd_units_valid'] = True
        held = subprocess.run([python, '-m', 'membership.production.launch'], cwd=root / 'release', env=env, stdout=log, stderr=log)
        assert held.returncode != 0
        checks['production_start_held'] = True
        provider_env = {key: value for key, value in env.items() if not key.startswith('RANGERBOOK_')}
        provider = subprocess.Popen(['runuser', '-u', 'ubuntu', '--', str(root / 'bin/aws-workload-credentials-provider'),
            'sm', 'start', '--config', str(review / 'secrets.toml')], env=provider_env, stdout=log, stderr=log, start_new_session=True)
        try:
            sys.path.insert(0, str(root / 'release'))
            from membership.production.launch import wait_provider
            wait_provider(env)
            probe = subprocess.run(['runuser', '-u', 'ubuntu', '--', str(root / 'bin/asm-exec'), '--', python,
                '-m', 'membership.production.launch', '--check'], cwd=root / 'release', env=env, stdout=subprocess.PIPE, stderr=log, check=True)
            assert probe.stdout.strip() == b'Production configuration valid; application not started.'
            checks['independent_runtime_secret_resolution'] = True
        finally:
            os.killpg(provider.pid, signal.SIGTERM)
            provider.wait(timeout=15)
        config = subprocess.check_output(['nginx', '-T'], stderr=log, text=True)
        limits = re.findall(r'limit_req_zone\s+[^;]*zone=rangerbook_auth_api:[^;]*;', config)
        assert len(limits) == 1
        header = 'pid ' + str(work / 'nginx.pid') + ';\nerror_log ' + str(work / 'nginx-error.log') + ';\nevents {}\nhttp {\n' + limits[0] + '\n' + (review / 'nginx-http.conf').read_text()
        candidate = (review / 'nginx-auth.conf').read_text()
        private_log = str(work / 'access.log')
        syntax = work / 'nginx-syntax.conf'
        syntax.write_text(header + candidate.replace('/var/log/nginx/access.log', private_log) + '\n}\n')
        subprocess.run(['nginx', '-t', '-c', str(syntax)], stdout=log, stderr=log, check=True)
        checks['complete_nginx_candidate_valid'] = True
        received = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_GET(self):
                received.append(self.headers.get('X-Forwarded-For'))
                if 'synthetic-upstream-error' in self.path:
                    self.connection.shutdown(socket.SHUT_RDWR)
                    self.connection.close()
                    return
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'synthetic')
        upstream = ThreadingHTTPServer(('127.0.0.1', 18768), Handler)
        thread = threading.Thread(target=upstream.serve_forever, daemon=True)
        thread.start()
        functional = work / 'nginx-functional.conf'
        server = candidate.split('\nserver {', 1)[0].replace('listen 443 ssl;', 'listen 127.0.0.1:18767;')
        server = server.replace('http://127.0.0.1:8765', 'http://127.0.0.1:18768').replace('/var/log/nginx/access.log', private_log)
        functional.write_text(header + server + '\n}\n')
        nginx = subprocess.Popen(['nginx', '-c', str(functional), '-g', 'daemon off;'], stdout=log, stderr=log)
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            for attempt in range(30):
                try:
                    with opener.open('http://127.0.0.1:18767/health', timeout=1) as response:
                        assert response.status == 200
                    break
                except OSError:
                    if attempt == 29:
                        raise
                    time.sleep(0.1)
            request = urllib.request.Request('http://127.0.0.1:18767/auth/me?token=synthetic-sensitive-query',
                headers={'Cookie': 'session=synthetic-cookie', 'Referer': 'https://example.test/synthetic-referer', 'X-Forwarded-For': '203.0.113.9'})
            with opener.open(request, timeout=2) as response:
                assert response.status == 200
            before = (work / 'access.log').read_text()
            with opener.open('http://127.0.0.1:18767/auth/google/callback?code=synthetic-sensitive-code&state=synthetic-state', timeout=2) as response:
                assert response.status == 200
            assert (work / 'access.log').read_text() == before
            assert all(value not in before for value in ['synthetic', '/auth/', 'session=', 'example.test'])
            assert all(value == '127.0.0.1' for value in received)
            checks['callback_not_access_logged'] = True
            checks['safe_logs_exclude_request_data'] = True
            checks['forwarded_ip_normalized'] = True
            try:
                opener.open('http://127.0.0.1:18767/auth/google/callback?code=synthetic-upstream-error', timeout=2)
                raise AssertionError('Synthetic upstream failure was not exercised')
            except urllib.error.HTTPError as error:
                assert error.code == 502
            error_log = (work / 'nginx-error.log').read_text()
            assert 'synthetic-upstream-error' not in error_log and '/auth/google/callback' not in error_log
            assert (work / 'access.log').read_text() == before
            checks['callback_errors_exclude_sensitive_request'] = True
            oversized = urllib.request.Request('http://127.0.0.1:18767/auth/register', data=b'x' * 17000)
            try:
                opener.open(oversized, timeout=2)
                raise AssertionError('Oversized body accepted')
            except urllib.error.HTTPError as error:
                assert error.code == 413
            checks['existing_body_limit_preserved'] = True
        finally:
            nginx.terminate()
            nginx.wait(timeout=10)
            upstream.shutdown()
            upstream.server_close()
            thread.join()
        assert all(hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest for path, digest in baseline.items())
        assert subprocess.check_output(['systemctl', 'show', 'rangerbook-auth', '--property=MainPID', '--value'], text=True).strip() == pid_before
        with urllib.request.urlopen('http://127.0.0.1:8765/health', timeout=3) as response:
            assert response.status == 200
        checks['production_configuration_and_pid_unchanged'] = True
        checks['production_health_200'] = True
    result = {'passed': len(checks), 'checks': checks, 'interface_pending': True,
              'cutover_approved': False, 'mail_sent': False, 'production_db_used': False}
    (work / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    (review / 'preflight-latest.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    os.umask(0o077)
    main()
