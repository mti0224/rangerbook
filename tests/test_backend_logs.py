"""Journal limits/redaction and real membership session/role enforcement, synthetic only."""
from contextlib import contextmanager
import json
import sys
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import pytest

from membership import backend_logs as logs
from membership.service import Membership


@pytest.mark.parametrize('text', [
    'password=hunter2', 'token=private', '"client_secret": "value"',
    'Authorization: Bearer private', 'Cookie: session=private',
    'https://example.test/verify?token=private', 'LF_AC=private',
    'payload\n-----BEGIN RSA PRIVATE KEY-----\nprivate',
    'eyJheader.payload.signature', 'access_key_id=private',
    'https://example.test/callback?code=private', '__Host-rangerbook_session=private',
    'to\x1b[31mken=private', 'otp=123456',
])
def test_sensitive_events_are_redacted(text):
    assert logs.redact(text) == '[REDACTED: sensitive log entry]'


def test_report_bounded_allowlist_filters_and_metadata(monkeypatch):
    seen = []
    def read(command):
        seen.append(command)
        return '\n'.join(json.dumps(row) for row in [
            {'__REALTIME_TIMESTAMP':'1793113116000000', '_SYSTEMD_UNIT':'rangerbook-auth.service', 'PRIORITY':'3', 'MESSAGE':'Failure 119801 <script>alert(1)</script>'},
            {'__REALTIME_TIMESTAMP':'1793113116000000', '_SYSTEMD_UNIT':'nginx.service', 'MESSAGE':'private other service'},
            {'__REALTIME_TIMESTAMP':'1793113116000000', 'UNIT':'rangerbook-auth.service', 'MESSAGE':'token=private'},
            {'MESSAGE':'bad timestamp'},
        ])
    monkeypatch.setattr(logs, 'read_journal', read)
    result = logs.report('auth', 24, 'error', 200, '119801')
    assert len(result['items']) == 1
    assert set(result['items'][0]) == {'time','service','priority','message'}
    assert seen[0][0] == '/usr/bin/journalctl'
    assert '--lines=200' in seen[0] and '--priority=3' in seen[0]
    assert seen[0][-2:] == ['rangerbook-auth.service', '--priority=3']
    assert logs.redact(list(b'ordinary log')) == 'ordinary log'
    assert len(logs.redact('x'*10000)) == 4001


@pytest.fixture
def client(monkeypatch):
    member = object.__new__(Membership)
    member.app = FastAPI()
    state = {'role': None, 'mfa': True, 'active': True, 'password': False, 'enrolled': True}
    @contextmanager
    def db():
        yield SimpleNamespace(execute=lambda *a: SimpleNamespace(fetchone=lambda:{'mfa_verified':state['mfa']}))
    def lookup(request):
        if state['role'] is None:
            return None
        return {'id':'synthetic', 'role':state['role'], 'account_active':state['active'],
                'totp_secret':'enrolled' if state['enrolled'] and state['role']=='super_admin' else None,
                'must_change_password':state['password']}
    member.h = SimpleNamespace(lookup_session_user=lookup, db=db, session_hash=lambda x:x, SESSION_COOKIE='synthetic')
    rate = []
    member.rate = lambda *a, **kw: rate.append(kw)
    reads = []
    monkeypatch.setattr(logs, 'read_journal', lambda command: reads.append(command) or '')
    logs.install(member)
    return TestClient(member.app), state, reads, rate


def test_roles_mfa_revocation_and_no_store(client):
    c, state, reads, rate = client
    for role, code in [(None,401),('user',403),('admin',403),('super_admin',200)]:
        state['role'] = role
        response = c.get('/admin/backend-logs')
        assert response.status_code == code
    assert len(reads) == len(rate) == 1
    assert response.headers['cache-control'] == 'no-store, private'
    for key in ['mfa', 'active', 'enrolled']:
        state[key] = False
        assert c.get('/admin/backend-logs').status_code in (401,403)
        state[key] = True
    state['password'] = True
    assert c.get('/admin/backend-logs').status_code == 403
    state['password'] = False
    state['role'] = 'admin'  # Revocation applies to the very next request.
    assert c.get('/admin/backend-logs').status_code == 403
    assert len(reads) == 1


@pytest.mark.parametrize('query', ['source=../../etc/passwd','source=nginx','hours=0','hours=169','limit=501','limit=-1','level=--help','keyword='+'x'*101])
def test_invalid_queries_never_read_journal(client, query):
    c, state, reads, _ = client
    state['role'] = 'super_admin'
    assert c.get('/admin/backend-logs?'+query).status_code == 422
    assert not reads


def test_journal_failure_is_generic(client, monkeypatch):
    c, state, _, _ = client
    state['role'] = 'super_admin'
    def fail(command):
        raise HTTPException(503, 'logs.unavailable')
    monkeypatch.setattr(logs, 'read_journal', fail)
    assert c.get('/admin/backend-logs').json() == {'detail':'logs.unavailable'}


def test_reader_rejects_large_output_and_nonzero_exit():
    for code in ['import sys; sys.stdout.write("x"*1100000)', 'raise SystemExit(1)']:
        with pytest.raises(HTTPException) as error:
            logs.read_journal([sys.executable, '-c', code])
        assert error.value.status_code == 503


def test_reader_deadline_reaps_child(monkeypatch):
    clock = iter([0, 6])
    monkeypatch.setattr(logs.time, 'monotonic', lambda:next(clock))
    with pytest.raises(HTTPException) as error:
        logs.read_journal([sys.executable, '-c', 'import time; time.sleep(60)'])
    assert error.value.status_code == 503
