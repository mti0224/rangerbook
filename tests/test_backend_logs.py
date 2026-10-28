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
    assert set(result['items'][0]) == {'time','service','priority','message','lineCount','partial','truncated'}
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
    monkeypatch.setattr(logs, 'read_journal', lambda command, **kw: reads.append(command) or '')
    logs.install(member)
    return TestClient(member.app), state, reads, rate


def test_roles_mfa_revocation_and_no_store(client):
    c, state, reads, rate = client
    for role, code in [(None,401),('user',403),('admin',403),('super_admin',200)]:
        state['role'] = role
        response = c.get('/admin/backend-logs?source=auth')
        assert response.status_code == code
    assert len(reads) == len(rate) == 1
    assert response.headers['cache-control'] == 'no-store, private'
    for key in ['mfa', 'active', 'enrolled']:
        state[key] = False
        assert c.get('/admin/backend-logs?source=auth').status_code in (401,403)
        state[key] = True
    state['password'] = True
    assert c.get('/admin/backend-logs?source=auth').status_code == 403
    state['password'] = False
    state['role'] = 'admin'  # Revocation applies to the very next request.
    assert c.get('/admin/backend-logs?source=auth').status_code == 403
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
    def fail(command, **kw):
        raise HTTPException(503, 'logs.unavailable')
    monkeypatch.setattr(logs, 'read_journal', fail)
    assert c.get('/admin/backend-logs?source=auth').json() == {'detail':'logs.unavailable'}


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


def journal_records(messages):
    """Same timestamp, as seen with buffered JSON output. Return newest first."""
    return list(reversed([
        {'__REALTIME_TIMESTAMP':'1793113116000000', '_SYSTEMD_UNIT':'rangerbook-auth.service',
         '_PID':'42', '_STREAM_ID':'stdout-1', '_SYSTEMD_INVOCATION_ID':'run-1',
         '_BOOT_ID':'boot-1', '_TRANSPORT':'stdout', 'PRIORITY':'6', 'MESSAGE':text}
        for text in messages
    ]))


def grouped_report(monkeypatch, records, keyword=''):
    monkeypatch.setattr(logs, 'read_journal', lambda command:'\n'.join(json.dumps(r) if r is not None else 'invalid json' for r in records))
    return logs.report('auth',24,'all',200,keyword)


def test_pretty_json_grouped_in_original_order_and_searched_as_event(monkeypatch):
    messages=['before', '{', '  "counts": {', '    "zh_TW": 0,', '    "en": 0,',
              '    "th": 0,', '    "jp": 0', '  },', '  "brackets": "} [ \\" quoted"', '}', 'after']
    result=grouped_report(monkeypatch,journal_records(messages))
    assert result['rawCount']==len(messages)
    assert [r['message'] for r in result['items']] == ['after','\n'.join(messages[1:-1]),'before']
    block=result['items'][1]
    assert block['lineCount']==9 and block['partial'] is False
    assert json.loads(block['message'])['counts']['jp']==0
    found=grouped_report(monkeypatch,journal_records(messages),'jp')['items']
    assert len(found)==1 and 'zh_TW' in found[0]['message']


def test_same_second_normal_messages_are_separate(monkeypatch):
    result=grouped_report(monkeypatch,journal_records(['[START] first','[END] second','INFO: third']))
    assert len(result['items'])==3


@pytest.mark.parametrize('key,value', [('_PID','43'),('_STREAM_ID','stdout-2'),('_SYSTEMD_INVOCATION_ID','run-2'),
                                     ('_BOOT_ID','boot-2'),('_TRANSPORT','journal'),('PRIORITY','3'),
                                     ('__REALTIME_TIMESTAMP','1793113119000000')])
def test_identity_priority_and_time_gap_are_boundaries(monkeypatch,key,value):
    records=journal_records(['{','  "x": 1','}'])
    records[0][key]=value
    result=grouped_report(monkeypatch,records)
    assert len(result['items'])>=2


def test_missing_identity_does_not_merge_by_time_alone(monkeypatch):
    records=journal_records(['{','  "x": 1','}'])
    for row in records:row.pop('_PID')
    assert len(grouped_report(monkeypatch,records)['items'])==3


def test_traceback_chain_groups_but_next_message_stays_separate(monkeypatch):
    messages=['Traceback (most recent call last):','  File "test.py", line 1, in main','    run()',
              'ValueError: invalid input','','During handling of the above exception, another exception occurred:',
              'Traceback (most recent call last):','  File "test.py", line 2','RuntimeError: failed','[NEXT] normal log']
    result=grouped_report(monkeypatch,journal_records(messages))
    assert len(result['items'])==2
    assert result['items'][0]['message']=='[NEXT] normal log'
    assert result['items'][1]['message']=='\n'.join(messages[:-1])


def test_group_redaction_hides_values_on_following_lines(monkeypatch):
    records=journal_records(['{','  "token":','    "SYNTHETIC-PRIVATE-VALUE"','}'])
    result=grouped_report(monkeypatch,records)
    assert len(result['items'])==1
    assert result['items'][0]['message']=='[REDACTED: sensitive log entry]'
    assert grouped_report(monkeypatch,records,'SYNTHETIC-PRIVATE-VALUE')['items']==[]


def test_query_starting_mid_block_marks_and_hides_unknown_context(monkeypatch):
    result=grouped_report(monkeypatch,journal_records(['    "SYNTHETIC-PRIVATE-VALUE"','}']))
    assert len(result['items'])==1
    assert result['items'][0]['partial']
    assert 'SYNTHETIC-PRIVATE-VALUE' not in result['items'][0]['message']


def test_invalid_entries_break_group_and_native_multiline_is_preserved(monkeypatch):
    records=journal_records(['{','  "x": 1','}'])
    records.insert(1,None)
    assert len(grouped_report(monkeypatch,records)['items'])>=2
    native='first line\nsecond line'
    row=grouped_report(monkeypatch,journal_records([native]))['items'][0]
    assert row['message']==native and row['lineCount']==2


def test_completed_run_detail_uses_same_full_session_guard(client):
    c,state,reads,rate=client
    url='/admin/backend-logs/runs/'+'a'*32+'?service=rangerbook-v2-update.service'
    for role,code in [(None,401),('user',403),('admin',403),('super_admin',404)]:
        state['role']=role
        assert c.get(url).status_code==code
    assert len(reads)==1
    state['mfa']=False
    assert c.get(url).status_code==403
    assert len(reads)==1


def test_run_detail_rejects_invalid_identity_and_service(client):
    c,state,reads,rate=client
    state['role']='super_admin'
    for url in ['/admin/backend-logs/runs/not-a-run?service=rangerbook-v2-update.service',
                '/admin/backend-logs/runs/'+'a'*32+'?service=nginx.service',
                '/admin/backend-logs/runs/'+'a'*32+'?service=rangerbook-auth.service']:
        assert c.get(url).status_code==422
    assert not reads
