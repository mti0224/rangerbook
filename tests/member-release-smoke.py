"""Synthetic release rehearsal over loopback TLS. Never uses production data/secrets.

Run in a fresh, restricted workspace with a prepared private backend release.
No source mocks: imports the complete prepared app/asgi and their dependencies.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import sqlite3
import subprocess
import sys
import time

import requests
import urllib3
from cryptography.fernet import Fernet
import pyotp


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--release', type=Path, required=True)
    parser.add_argument('--workspace', type=Path, required=True)
    parser.add_argument('--port', type=int, default=18765)
    args = parser.parse_args()
    release = args.release.resolve()
    work = args.workspace.resolve()
    work.mkdir(mode=0o700, parents=True, exist_ok=False)
    os.umask(0o077)
    database = work / 'synthetic.db'
    for key in list(os.environ):
        if key.startswith('RANGERBOOK_'):
            del os.environ[key]
    os.environ.update({
        'RANGERBOOK_AUTH_DB': str(database),
        'RANGERBOOK_MEMBERS_V2': '0',
        'RANGERBOOK_MAIL_ENABLED': '0',
        'RANGERBOOK_MEMBER_KEY': Fernet.generate_key().decode(),
        'RANGERBOOK_PRIVATE_TEAM_DIR': str(work / 'teams'),
        'RANGERBOOK_PLAYER_INDEX': str(work / 'player-index.json'),
        'RANGERBOOK_PLAYER_QUERY_CACHE': str(work / 'player-cache.json'),
        'RANGERBOOK_GUILDWAR_CORE': str(work / 'disabled-game-core.py'),
        'RANGERBOOK_TRAFFIC_CACHE_DIR': str(work / 'traffic'),
        'RANGERBOOK_V2_DATA_DIR': str(work / 'data'),
        'PYTHONPATH': str(release),
    })
    sys.path.insert(0, str(release))
    import app as host
    host.startup()
    password = secrets.token_urlsafe(24)
    hashed = host.PASSWORD_HASHER.hash(password)
    with host.db() as con:
        for role in ['user', 'admin', 'super_admin']:
            con.execute("INSERT INTO users(id,account,password_hash,role,admin_application_status,created_at) VALUES (?,?,?,?,'approved',?)",
                        (role, 'stage-' + role, hashed, role, host.isoformat()))
        con.execute("INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES ('synthetic-old-session','user',?,?,?)",
                    (host.isoformat(), '2099-01-01T00:00:00+00:00', host.isoformat()))
    with sqlite3.connect(database) as con:
        original_users = con.execute('SELECT id,account,password_hash,role FROM users ORDER BY id').fetchall()
        original_sessions = con.execute('SELECT * FROM sessions').fetchall()
    from membership.manage import migrate_database
    from membership.schema import migrate
    snapshot = work / 'backup' / 'pre-v2.db'
    migrate_database(database, snapshot)
    with sqlite3.connect(database) as con:
        migrate(con)
    with sqlite3.connect(database) as con:
        assert con.execute('SELECT id,account,password_hash,role FROM users ORDER BY id').fetchall() == original_users
        assert con.execute('SELECT count(*) FROM sessions').fetchone()[0] == len(original_sessions)
    assert snapshot.stat().st_mode & 0o777 == 0o600
    assert snapshot.parent.stat().st_mode & 0o777 == 0o700
    cert, key = work / 'tls.crt', work / 'tls.key'
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                    '-subj', '/CN=localhost', '-keyout', str(key), '-out', str(cert)],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    base = 'https://127.0.0.1:' + str(args.port)
    headers = {'Origin': 'https://rangerbook.warmycat.com'}
    results = ['additive_migration', 'repeat_migration', 'restricted_backup']

    def start(enabled):
        env = dict(os.environ, RANGERBOOK_MEMBERS_V2='1' if enabled else '0')
        proc = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'asgi:app', '--host', '127.0.0.1',
                                 '--port', str(args.port), '--no-access-log', '--ssl-certfile', str(cert),
                                 '--timeout-graceful-shutdown', '3',
                                 '--ssl-keyfile', str(key)], cwd=release, env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            if proc.poll() is not None:
                raise RuntimeError('Prepared ASGI process exited during startup')
            try:
                if requests.get(base + '/auth/me', verify=False, timeout=1).status_code == 200:
                    return proc
            except requests.RequestException:
                pass
            time.sleep(.1)
        proc.terminate()
        proc.wait(timeout=10)
        raise RuntimeError('Loopback startup timed out')

    def stop(proc):
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)

    def login(role):
        session = requests.Session()
        session.verify = False
        session.headers.update(headers)
        response = session.post(base + '/auth/login', json={'account': 'stage-' + role, 'password': password}, timeout=10)
        assert response.status_code == 200
        return session, response.json()

    proc = start(True)
    try:
        features = requests.get(base + '/auth/features', verify=False, timeout=5).json()
        assert features['members_v2'] and not features['google'] and not features['registration']
        assert not features['member_navigation']
        results.append('unconfigured_features_fail_closed')
        user, state = login('user')
        assert state['logged_in']
        assert user.get(base + '/member/game-binding/status', timeout=5).status_code == 200
        assert user.get(base + '/admin/users', timeout=5).status_code == 403
        results.append('ordinary_member_http_permissions')
        admin, state = login('admin')
        assert state['logged_in']
        assert admin.get(base + '/admin/access-check', timeout=5).status_code == 200
        assert admin.get(base + '/admin/users', timeout=5).status_code == 403
        with host.db() as con:
            con.execute("UPDATE users SET role='user' WHERE id='admin'")
        assert admin.get(base + '/admin/access-check', timeout=5).status_code == 403
        results.append('immediate_demotion')
        superuser, state = login('super_admin')
        assert state['setup_required'] and not state['logged_in']
        assert superuser.get(base + '/admin/users', timeout=5).status_code == 403
        assert superuser.post(base + '/auth/reauth', json={'password': password, 'code': ''}, timeout=10).status_code == 200
        response = superuser.post(base + '/auth/2fa/setup', timeout=5)
        assert response.status_code == 200
        secret = response.json()['manual_key']
        response = superuser.post(base + '/auth/2fa/enable', json={'code': pyotp.TOTP(secret).now()}, timeout=5)
        assert response.status_code == 200
        codes = response.json()['recovery_codes']
        assert superuser.get(base + '/admin/users', timeout=5).status_code == 200
        assert superuser.post(base + '/auth/2fa/disable', timeout=5).status_code == 403
        results.append('mandatory_super_admin_enrollment')
        assert superuser.post(base + '/auth/logout', timeout=5).status_code == 200
        superuser, state = login('super_admin')
        assert state['mfa_required'] and not state['logged_in']
        assert superuser.get(base + '/admin/users', timeout=5).status_code == 403
        assert superuser.post(base + '/auth/2fa/verify', json={'code': codes[0]}, timeout=5).status_code == 200
        assert superuser.get(base + '/admin/users', timeout=5).status_code == 200
        results.append('recovery_code_full_http_session')
        assert user.post(base + '/auth/logout', timeout=5).status_code == 200
        assert user.get(base + '/member/game-binding/status', timeout=5).status_code in {401, 403}
        results.append('http_logout_revocation')
    finally:
        stop(proc)
    # Restore only the synthetic pre-upgrade backup, with the stage stopped.
    restored = work / 'restored.db'
    shutil.copy2(snapshot, restored)
    os.chmod(restored, 0o600)
    with sqlite3.connect(restored) as con:
        assert con.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert con.execute('SELECT id,account,password_hash,role FROM users ORDER BY id').fetchall() == original_users
        assert con.execute('SELECT * FROM sessions').fetchall() == original_sessions
        assert 'totp_secret' not in {row[1] for row in con.execute('PRAGMA table_info(users)')}
    os.environ['RANGERBOOK_AUTH_DB'] = str(restored)
    proc = start(False)
    try:
        for role in ['user', 'admin', 'super_admin']:
            session, state = login(role)
            assert state['logged_in']
            assert session.get(base + '/auth/me', timeout=5).json()['role'] == role
        results.append('pre_upgrade_restore_legacy_login')
    finally:
        stop(proc)
    print(json.dumps({'passed': len(results), 'checks': results, 'mail_enabled': False,
                      'production_data_used': False, 'stage_process_stopped': True}))


if __name__ == '__main__':
    main()
