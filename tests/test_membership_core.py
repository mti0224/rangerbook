"""Public CI checks; the private deployed-source integration suite is separate."""
import os
import sqlite3
from pathlib import Path

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException

from membership.schema import migrate, backup
from membership.manage import migrate_database, recover
from membership.service import Membership, email_value, gmail, install


def legacy(path):
    with sqlite3.connect(path) as con:
        con.executescript('''CREATE TABLE users(id TEXT PRIMARY KEY, account TEXT UNIQUE, password_hash TEXT, role TEXT);
          CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE);
          CREATE TABLE game_account_bindings(user_id TEXT PRIMARY KEY,game_uid TEXT UNIQUE);
          INSERT INTO users VALUES ('synthetic','test','argon2-fixture','super_admin');
          INSERT INTO sessions VALUES ('hash-only','synthetic');
          INSERT INTO game_account_bindings VALUES ('synthetic','game-fixture');''')


def test_additive_migration_backup_restore(tmp_path):
    database=tmp_path/'test.db';legacy(database)
    target=tmp_path/'backup'/'test.db'
    migrate_database(database,target)
    with sqlite3.connect(database) as con:
        migrate(con)
    with sqlite3.connect(database) as con:
        assert con.execute('SELECT password_hash,role FROM users').fetchone()==('argon2-fixture','super_admin')
        assert con.execute('SELECT count(*) FROM sessions').fetchone()[0]==1
        assert con.execute('SELECT count(*) FROM game_account_bindings').fetchone()[0]==1
    assert target.stat().st_mode&0o777==0o600
    with sqlite3.connect(target) as con:
        assert 'totp_secret' not in {r[1] for r in con.execute('PRAGMA table_info(users)')}


def test_backup_does_not_overwrite(tmp_path):
    database=tmp_path/'test.db';legacy(database);target=tmp_path/'backup.db'
    backup(database,target)
    with pytest.raises(FileExistsError):backup(database,target)


def test_operator_recovery_only_enrollment_and_audit(tmp_path):
    database=tmp_path/'test.db';legacy(database)
    with sqlite3.connect(database) as con:migrate(con)
    recover(database,'test','test-ticket')
    with sqlite3.connect(database) as con:
        assert con.execute('SELECT role,password_hash,totp_secret FROM users').fetchone()==('super_admin','argon2-fixture',None)
        assert con.execute('SELECT count(*) FROM sessions').fetchone()[0]==0
        assert con.execute('SELECT count(*) FROM member_audit').fetchone()[0]==1


@pytest.mark.parametrize('value',['bad','x@y','<img>@example.test','x@a\n.com'])
def test_email_validation(value):
    with pytest.raises(HTTPException):email_value(value)


def test_google_aliases():
    assert email_value('Test.Name+tag@Googlemail.com')=='testname@gmail.com'
    assert email_value('user@example.test')=='user@example.test'


def test_feature_off_has_no_mutation(monkeypatch):
    monkeypatch.delenv('RANGERBOOK_MEMBERS_V2',raising=False)
    assert install(object()) is None


def test_stage_mail_without_allowlist_stops_before_aws(monkeypatch):
    from membership.mail_worker import main
    monkeypatch.setenv('RANGERBOOK_STAGE', '1')
    monkeypatch.setenv('RANGERBOOK_MAIL_ENABLED', '1')
    monkeypatch.delenv('RANGERBOOK_MAIL_RECIPIENT_ALLOWLIST', raising=False)
    with pytest.raises(RuntimeError, match='allowlist'):
        main()


def test_synthetic_storage_compat_is_disabled_outside_stage(monkeypatch,tmp_path):
    import re
    from types import SimpleNamespace
    from membership.stage import storage_compat
    monkeypatch.delenv('RANGERBOOK_STAGE',raising=False)
    original=re.compile(r'^usr_[A-Za-z0-9_-]{12,64}$')
    binding=SimpleNamespace(PRIVATE_DIR=tmp_path/'teams',PRIVATE_USER_ID=original)
    assert storage_compat.configure(binding) is False
    assert binding.PRIVATE_USER_ID is original
    assert not binding.PRIVATE_USER_ID.fullmatch('stage-'+'a'*24)


@pytest.mark.parametrize('wrong_path',['database','team_env','team_module'])
def test_synthetic_storage_compat_rejects_other_roots(monkeypatch,tmp_path,wrong_path):
    import re
    from types import SimpleNamespace
    from membership.stage import storage_compat
    monkeypatch.setattr(storage_compat,'ROOT',tmp_path)
    monkeypatch.setenv('RANGERBOOK_STAGE','1')
    monkeypatch.setenv('RANGERBOOK_AUTH_DB',str(tmp_path/'auth.db'))
    monkeypatch.setenv('RANGERBOOK_PRIVATE_TEAM_DIR',str(tmp_path/'teams'))
    binding=SimpleNamespace(PRIVATE_DIR=tmp_path/'teams',PRIVATE_USER_ID=re.compile(r'^usr_.+$'))
    if wrong_path=='database':monkeypatch.setenv('RANGERBOOK_AUTH_DB',str(tmp_path.parent/'other.db'))
    if wrong_path=='team_env':monkeypatch.setenv('RANGERBOOK_PRIVATE_TEAM_DIR',str(tmp_path.parent/'teams'))
    if wrong_path=='team_module':binding.PRIVATE_DIR=tmp_path.parent/'teams'
    with pytest.raises(RuntimeError,match='isolated acceptance paths'):storage_compat.configure(binding)


def test_synthetic_storage_compat_rejects_traversal_and_noncanonical_ids(monkeypatch,tmp_path):
    import re
    from types import SimpleNamespace
    from membership.stage import storage_compat
    monkeypatch.setattr(storage_compat,'ROOT',tmp_path)
    monkeypatch.setenv('RANGERBOOK_STAGE','1')
    monkeypatch.setenv('RANGERBOOK_AUTH_DB',str(tmp_path/'auth.db'))
    monkeypatch.setenv('RANGERBOOK_PRIVATE_TEAM_DIR',str(tmp_path/'teams'))
    binding=SimpleNamespace(PRIVATE_DIR=tmp_path/'teams',PRIVATE_USER_ID=re.compile(r'^usr_.+$'))
    assert storage_compat.configure(binding)
    assert binding.PRIVATE_USER_ID.fullmatch('stage-'+'a'*24)
    assert binding.PRIVATE_USER_ID.fullmatch('usr_'+'a'*24)
    for value in ['../outside','stage-../outside','stage-'+'a'*23,'stage-'+'g'*24,'usr_foo/bar','/tmp/outside']:
        assert not binding.PRIVATE_USER_ID.fullmatch(value)


def test_stage_mail_only_sends_to_approved_recipient(tmp_path):
    import json
    from membership.mail_worker import deliver_batch
    database = tmp_path / 'outbox.db'
    legacy(database)
    cipher = Fernet(Fernet.generate_key())
    with sqlite3.connect(database) as con:
        migrate(con)
        for address in ['approved@example.test', 'blocked@example.test']:
            payload = cipher.encrypt(json.dumps({'email': address, 'kind': 'security'}).encode()).decode()
            con.execute('INSERT INTO member_outbox(id,payload,next_attempt) VALUES (?,?,0)', (address, payload))
    def connect():
        con = sqlite3.connect(database)
        con.row_factory = sqlite3.Row
        return con
    class SES:
        recipients = []
        def send_email(self, **kwargs):
            self.recipients.extend(kwargs['Destination']['ToAddresses'])
            return {'MessageId': 'synthetic'}
    ses = SES()
    result = deliver_batch(connect, cipher, ses, 'synthetic', recipient_allowlist={'approved@example.test'})
    assert result == {'sent': 1, 'failed': 0, 'suppressed': 1}
    assert ses.recipients == ['approved@example.test']


def test_stage_launcher_rejects_production_paths_and_unresolved_secrets():
    from membership.stage.launch import validate, ROOT, ORIGIN
    env = dict(line.split('=', 1) for line in (Path(__file__).parents[1] / 'membership/stage/runtime.env.in').read_text().splitlines() if line and not line.startswith('#'))
    env['RANGERBOOK_MEMBER_KEY'] = Fernet.generate_key().decode()
    with pytest.raises(RuntimeError, match='unresolved'):
        validate(env)
    for key in list(env):
        if '{{resolve:' in env[key]: env[key] = 'synthetic-fixture'
    validate(env)
    env['RANGERBOOK_AUTH_DB'] = '/home/ubuntu/rangerbook-private/auth/rangerbook_auth.db'
    with pytest.raises(RuntimeError, match='isolated directory'):
        validate(env)
    env['RANGERBOOK_AUTH_DB'] = str(ROOT / 'auth.db')
    env['RANGERBOOK_ALLOWED_ORIGINS'] = 'https://rangerbook.warmycat.com'
    with pytest.raises(RuntimeError, match='origin'):
        validate(env)


@pytest.mark.parametrize('fails', [False, True])
def test_stage_mail_budget_survives_repeated_batches(tmp_path, fails):
    import json
    from botocore.exceptions import EndpointConnectionError
    from membership.mail_worker import deliver_batch
    database = tmp_path / 'budget.db'
    legacy(database)
    cipher = Fernet(Fernet.generate_key())
    with sqlite3.connect(database) as con:
        migrate(con)
        for index in range(7):
            payload = cipher.encrypt(json.dumps({'email': 'approved@example.test', 'kind': 'security'}).encode()).decode()
            con.execute('INSERT INTO member_outbox(id,payload,next_attempt) VALUES (?,?,0)', (str(index), payload))
    def connect():
        con = sqlite3.connect(database)
        con.row_factory = sqlite3.Row
        return con
    class SES:
        calls = 0
        def send_email(self, **kwargs):
            self.calls += 1
            if fails: raise EndpointConnectionError(endpoint_url='https://example.test')
            return {'MessageId': 'synthetic'}
    ses = SES()
    for _ in range(3):
        deliver_batch(connect, cipher, ses, 'synthetic', limit=3,
            recipient_allowlist={'approved@example.test'}, delivery_budget=5)
    assert ses.calls == 5
    with connect() as con:
        assert con.execute('SELECT used FROM member_stage_mail_budget').fetchone()[0] == 5
        assert con.execute("SELECT COUNT(*) FROM member_outbox WHERE status='sent'").fetchone()[0] == (0 if fails else 5)


@pytest.mark.parametrize('bad', [
    'SES successfully validated the SNS destination',
    '[]',
    '{"eventType":"Complaint","complaint":{"complainedRecipients":[{}]}}',
])
def test_feedback_validation_messages_do_not_block_delivery(tmp_path, bad):
    import json
    from membership.mail_worker import consume_feedback
    database = tmp_path / 'feedback.db'
    legacy(database)
    with sqlite3.connect(database) as con:
        migrate(con)
    class Queue:
        deleted = []
        def receive_message(self, **kwargs):
            events = [bad, json.dumps({'eventType': 'Complaint', 'complaint': {
                'complainedRecipients': [{'emailAddress': 'synthetic@example.test'}]}})]
            return {'Messages': [{'ReceiptHandle': str(i), 'Body': json.dumps({
                'Type': 'Notification', 'TopicArn': 'expected-topic', 'Message': event})}
                for i, event in enumerate(events)]}
        def delete_message(self, **kwargs):
            self.deleted.append(kwargs['ReceiptHandle'])
    queue = Queue()
    consume_feedback(lambda: sqlite3.connect(database), queue, 'synthetic-queue', 'expected-topic')
    assert queue.deleted == ['0', '1']
    with sqlite3.connect(database) as con:
        assert con.execute('SELECT email,reason FROM member_suppression').fetchall() == [('synthetic@example.test', 'Complaint')]
        assert con.execute('SELECT event FROM member_audit ORDER BY id').fetchall() == [('ses_feedback_invalid',), ('ses_Complaint',)]


@pytest.mark.parametrize('status', [200, 401, 403, 429])
def test_stage_transport_preserves_failure_body_cookie_and_authorization(status):
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse
    from fastapi.testclient import TestClient
    from membership.stage.http_transport import StageAuthTransport
    app = FastAPI()
    @app.get('/auth/probe')
    def probe():
        response = JSONResponse({'detail': 'member.badProof'}, status_code=status,
                                headers={'Cache-Control': 'no-store, private', 'Retry-After': '13'})
        response.set_cookie('fixture', 'synthetic', secure=True, httponly=True)
        if status == 401:
            response.headers['WWW-Authenticate'] = 'Basic realm="application-must-not-prompt"'
        return response
    response = TestClient(StageAuthTransport(app)).get('/auth/probe')
    assert response.status_code == (403 if status == 401 else status)
    assert response.json() == {'detail': 'member.badProof'}
    assert response.headers.get('X-Rangerbook-Auth-Status') == ('401' if status == 401 else None)
    assert 'www-authenticate' not in response.headers
    assert response.headers['Cache-Control'] == 'no-store, private'
    assert response.headers['Retry-After'] == '13'
    assert 'HttpOnly' in response.headers['Set-Cookie']


def test_stage_transport_factory_cannot_start_with_production_environment(monkeypatch):
    from membership.stage.http_transport import create_app
    monkeypatch.delenv('RANGERBOOK_STAGE', raising=False)
    with pytest.raises(RuntimeError, match='isolated'):
        create_app()
