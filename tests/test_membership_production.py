"""Deployment holds and key recovery, using only synthetic files and loopback HTTP."""
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from cryptography.fernet import Fernet
import pytest

from membership.production import launch, prepare
from membership.production.health import inspect
from membership.schema import migrate


def test_cutover_cannot_start_while_interface_pending(tmp_path):
    approval = tmp_path / 'CUTOVER_APPROVED'
    env = {'RANGERBOOK_CUTOVER_APPROVAL': str(approval)}
    with pytest.raises(RuntimeError, match='held'):
        launch.require_approval(env)
    approval.write_text('synthetic approval')
    (tmp_path / 'INTERFACE_PENDING').write_text('await owner design')
    with pytest.raises(RuntimeError, match='held'):
        launch.require_approval(env)
    (tmp_path / 'INTERFACE_PENDING').unlink()
    launch.require_approval(env)


def configured():
    env = dict(launch.REQUIRED, RANGERBOOK_MEMBER_KEY=Fernet.generate_key().decode())
    for key in ['RANGERBOOK_GOOGLE_CLIENT_ID', 'RANGERBOOK_GOOGLE_CLIENT_SECRET',
                'RANGERBOOK_TURNSTILE_SITE_KEY', 'RANGERBOOK_TURNSTILE_SECRET']:
        env[key] = 'synthetic-not-a-credential'
    return env


@pytest.mark.parametrize('key,value', [
    ('RANGERBOOK_STAGE', '1'),
    ('RANGERBOOK_SESSION_COOKIE', '__Host-rangerbook_stage_session'),
    ('RANGERBOOK_AUTH_DB', '/tmp/synthetic.db'),
    ('RANGERBOOK_ALLOWED_ORIGINS', 'https://foreign.example'),
    ('AWS_SECRETS_MANAGER_AGENT_ENDPOINT', 'http://127.0.0.1:2773'),
    ('RANGERBOOK_GOOGLE_CLIENT_SECRET', '{{resolve:secretsmanager:synthetic}}'),
])
def test_production_refuses_mixed_stage_or_unresolved_configuration(key, value):
    env = configured()
    launch.validate(env)
    env[key] = value
    with pytest.raises(RuntimeError):
        launch.validate(env)


def test_provider_probe_is_health_only_and_rejects_redirects(monkeypatch):
    paths = []
    class Handler(BaseHTTPRequestHandler):
        redirect = False
        def log_message(self, *args):
            pass
        def do_GET(self):
            paths.append(self.path)
            self.send_response(302 if self.redirect else 200)
            if self.redirect:
                self.send_header('Location', '/must-not-be-requested')
            self.end_headers()
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    endpoint = 'http://127.0.0.1:' + str(server.server_port)
    monkeypatch.setattr(launch, 'ENDPOINT', endpoint)
    try:
        launch.wait_provider({'AWS_SECRETS_MANAGER_AGENT_ENDPOINT': endpoint}, attempts=1)
        Handler.redirect = True
        with pytest.raises(RuntimeError, match='unavailable'):
            launch.wait_provider({'AWS_SECRETS_MANAGER_AGENT_ENDPOINT': endpoint}, attempts=1)
        assert paths == ['/ping', '/ping']
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_review_bundle_separates_credentials_preserves_proxy_and_will_not_overwrite(tmp_path, monkeypatch):
    root = tmp_path / 'candidate'
    (root / 'release').mkdir(parents=True)
    (root / 'release/source-manifest.json').write_text('{}')
    (root / 'requirements.lock').write_text('# synthetic dependencies')
    provider = tmp_path / 'provider'
    provider.mkdir()
    (provider / 'aws-workload-credentials-provider').write_bytes(b'synthetic-binary')
    (provider / 'asm-exec').write_text('# synthetic wrapper')
    monkeypatch.setattr(prepare, 'PROVIDER_SHA256', hashlib.sha256(b'synthetic-binary').hexdigest())
    nginx = tmp_path / 'nginx.conf'
    nginx.write_text('server {\n    location / {\n        limit_req zone=synthetic burst=40 nodelay;\n        proxy_pass http://127.0.0.1:8765;\n        proxy_set_header X-Forwarded-For $remote_addr;\n    }\n}\n')
    unit = tmp_path / 'current.service'
    unit.write_text('EnvironmentFile=/home/ubuntu/rangerbook-auth/.env\nEnvironmentFile=/etc/rangerbook-auth-paths.env\nReadWritePaths=/home/ubuntu/rangerbook-private\n')
    backup = tmp_path / 'private-backup/member-key.env'
    result = prepare.prepare(root, provider, backup, nginx, unit)
    assert result['key_restore_verified']
    assert not (root / 'review/CUTOVER_APPROVED').exists()
    assert not (root / 'review/MAIL_APPROVED').exists()
    assert (root / 'review/INTERFACE_PENDING').is_file()
    assert (root / 'review/key.env').stat().st_mode & 0o777 == 0o600
    assert backup.stat().st_mode & 0o777 == 0o600
    assert backup.parent.stat().st_mode & 0o777 == 0o700
    runtime_key = (root / 'review/key.env').read_text().splitlines()[0].split('=', 1)[1]
    assert 'AWS_TOKEN' not in (root / 'review/key.env').read_text()
    assert 'RANGERBOOK_MEMBER_KEY' not in (root / 'review/provider.env').read_text()
    restored_key = backup.read_text().strip().split('=', 1)[1]
    assert Fernet(restored_key.encode()).decrypt(Fernet(runtime_key.encode()).encrypt(b'restore-proof')) == b'restore-proof'
    assert runtime_key not in (root / 'review/runtime.env').read_text()
    assert runtime_key not in (root / 'review/preparation.json').read_text()
    candidate = (root / 'review/nginx-auth.conf').read_text()
    assert 'location = /auth/google/callback {\n        access_log off;' in candidate
    assert 'access_log off;\n        error_log /dev/null crit;' in candidate
    assert candidate.count('limit_req zone=synthetic burst=40 nodelay;') == 2
    assert candidate.count('proxy_set_header X-Forwarded-For $remote_addr;') == 2
    assert 'server {\n    access_log /var/log/nginx/access.log rangerbook_membership_safe;' in candidate
    assert nginx.read_text().count('location') == 1
    for path in (root / 'review').glob('*.service'):
        text = path.read_text()
        assert 'INTERFACE_PENDING' in text and 'CUTOVER_APPROVED' in text
        assert 'rangerbook-member-stage' not in text
    before = backup.read_bytes()
    with pytest.raises(ValueError, match='new path'):
        prepare.prepare(root, provider, backup, nginx, unit)
    assert backup.read_bytes() == before


def test_mail_health_is_read_only_and_contains_no_private_payload(tmp_path):
    database = tmp_path / 'synthetic.db'
    with sqlite3.connect(database) as con:
        con.executescript('CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE sessions(token_hash TEXT PRIMARY KEY);')
        migrate(con)
        con.execute("INSERT INTO member_outbox(id,payload,next_attempt,status) VALUES ('private-id','never-output-recipient-or-token',0,'failed')")
    original = database.read_bytes()
    result = inspect(database, now=1000)
    assert not result['healthy']
    assert result['outbox_counts'] == {'failed': 1}
    assert 'private-id' not in json.dumps(result)
    assert 'never-output' not in json.dumps(result)
    assert database.read_bytes() == original
    missing = tmp_path / 'missing.db'
    with pytest.raises(sqlite3.OperationalError):
        inspect(missing)
    assert not missing.exists()
