"""Run with RANGERBOOK_LEGACY_SOURCE pointing at a private read-only source snapshot.

Production accounts, email and game endpoints are never used. The real legacy
app/security/game-binding code is imported; unrelated data collectors are stubbed.
"""
import base64
import hashlib
import importlib
import json
import os
import shutil
import sqlite3
import sys
import time
import types
from pathlib import Path
from contextlib import contextmanager

import jwt
import pyotp
import pytest
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.testclient import TestClient

from membership.schema import migrate, backup
from membership.service import Membership, gmail, digest
from membership.mail_worker import deliver_batch, consume_feedback

PASS = 'test-password-for-isolation'
ORIGIN = 'https://rangerbook.warmycat.com'


@pytest.fixture
def env(tmp_path, monkeypatch):
    source = os.environ.get('RANGERBOOK_LEGACY_SOURCE')
    if not source:
        pytest.skip('Private legacy source required; not included in the public repository')
    monkeypatch.syspath_prepend(source)
    monkeypatch.setenv('RANGERBOOK_AUTH_DB', str(tmp_path / 'auth.db'))
    monkeypatch.setenv('RANGERBOOK_MEMBER_KEY', Fernet.generate_key().decode())
    monkeypatch.setenv('RANGERBOOK_MEMBERS_V2', '1')
    monkeypatch.setenv('RANGERBOOK_MAIL_ENABLED', '1')
    for name in ['app','asgi','security','game_binding']:
        sys.modules.pop(name, None)
    pq = types.ModuleType('player_query')
    pq.query_player_teams = lambda uid: {'teams': {}}
    pq.search_players = lambda q, limit=20: {'items': []}
    import re
    pq.UID_RE = re.compile(r'^[A-Za-z0-9_-]+$')
    monkeypatch.setitem(sys.modules, 'player_query', pq)
    pop = types.ModuleType('popular_pages');pop.build_popular_report = lambda **kw: {}
    monkeypatch.setitem(sys.modules, 'popular_pages', pop)
    h = importlib.import_module('app')
    importlib.import_module('asgi')
    h.startup()
    import game_binding
    monkeypatch.setattr(game_binding, 'PRIVATE_DIR', tmp_path / 'teams', raising=False)
    with h.db() as con:migrate(con)
    m = Membership(h).install()
    # Hash once; all fixture accounts deliberately synthetic.
    hashed = h.PASSWORD_HASHER.hash(PASS)
    with h.db() as con:
        for uid, role in [('a','user'),('b','user'),('admin','admin'),('super','super_admin')]:
            con.execute("INSERT INTO users(id,account,password_hash,role,admin_application_status,created_at) VALUES (?,?,?,?,'approved',?)", (uid, 'test-'+uid, hashed, role, h.isoformat()))
    c = TestClient(h.app, base_url='https://rangerbook-auth.warmycat.com', headers={'Origin': ORIGIN})
    return h,m,c


def login(c, who='a'):
    response=c.post('/auth/login', json={'account':'test-'+who,'password':PASS})
    assert response.status_code==200,response.text
    return response.json()


def reauth(c,code=''):
    return c.post('/auth/reauth', json={'password':PASS,'code':code})


def enroll(env, who='a'):
    h,m,c=env;login(c,who)
    assert reauth(c).status_code==200
    response=c.post('/auth/2fa/setup');assert response.status_code==200,response.text
    secret=response.json()['manual_key']
    code=pyotp.TOTP(secret).now()
    response=c.post('/auth/2fa/enable',json={'code':code})
    # A real 30-second boundary can pass while the request is in flight.
    next_code=pyotp.TOTP(secret).now()
    if response.status_code==400 and code!=next_code:
        response=c.post('/auth/2fa/enable',json={'code':next_code})
    assert response.status_code==200,response.text
    return secret,response.json()['recovery_codes']


def test_migration_preserves_and_repeats(env,tmp_path):
    h,m,c=env;login(c)
    with h.db() as con:
        old=[tuple(r) for r in con.execute('SELECT id,password_hash,role FROM users')]
        sessions=[tuple(r) for r in con.execute('SELECT * FROM sessions')]
        migrate(con)
    with h.db() as con:
        migrate(con)
    with h.db() as con:
        assert old==[tuple(r) for r in con.execute('SELECT id,password_hash,role FROM users')]
        assert sessions==[tuple(r) for r in con.execute('SELECT * FROM sessions')]
    out=tmp_path/'backup'/'auth.db';backup(h.DB_PATH,out)
    assert out.stat().st_mode&0o777==0o600
    with sqlite3.connect(out) as con: assert con.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    restored=tmp_path/'restored.db';shutil.copy2(out,restored)
    with sqlite3.connect(restored) as con: assert con.execute('SELECT count(*) FROM users').fetchone()[0]==4


@pytest.mark.parametrize('who,path,expected',[
 ('a','/admin/users',403),('a','/admin/resource-updates',403),('admin','/admin/users',403),
 ('admin','/admin/access-check',200),('a','/member/game-binding/status',200),
 ('a','/admin/game-binding/status',200),('super','/admin/users',403),
 ('super','/member/game-binding/status',403)])
def test_roles(env,who,path,expected):
    h,m,c=env;login(c,who)
    assert c.get(path).status_code==expected


def test_super_initial_setup_no_privilege_and_recovery(env):
    h,m,c=env
    state=login(c,'super');assert state['setup_required'] and not state['logged_in']
    assert c.get('/auth/me').json()['role']=='user'
    assert c.post('/auth/2fa/setup').status_code==403
    secret,codes=enroll(env,'super')
    assert c.get('/admin/users').status_code==200
    assert c.post('/auth/2fa/disable',json={'code':codes[2]}).status_code==403
    c.post('/auth/logout');state=login(c,'super')
    assert state['mfa_required'] and not state['logged_in']
    assert c.get('/admin/users').status_code==403
    assert c.post('/auth/2fa/verify',json={'code':codes[0]}).status_code==200
    assert c.get('/admin/users').status_code==200
    c.post('/auth/logout');login(c,'super')
    assert c.post('/auth/2fa/verify',json={'code':codes[0]}).status_code==401


def test_totp_replay_wrong_expiry_and_encryption(env):
    h,m,c=env;secret,codes=enroll(env)
    with h.db() as con:
        row=con.execute("SELECT * FROM users WHERE id='a'").fetchone()
        assert row['totp_secret']!=secret
        assert secret not in row['totp_secret']
        assert con.execute('SELECT digest FROM member_recovery_codes').fetchone()[0]!=codes[0]
    c.post('/auth/logout');login(c)
    assert c.get('/member/game-binding/status').status_code==403
    assert c.post('/auth/2fa/verify',json={'code':pyotp.TOTP(secret).now()}).status_code==401
    assert c.post('/auth/2fa/verify',json={'code':'000000'}).status_code==401
    assert c.post('/auth/2fa/verify',json={'code':pyotp.TOTP(secret).at(time.time()-180)}).status_code==401
    assert c.post('/auth/2fa/verify',json={'code':codes[1]}).status_code==200
    assert c.get('/member/game-binding/status').status_code==200
    assert reauth(c).status_code==200
    assert c.post('/auth/2fa/disable',json={'code':codes[2]}).status_code==429
    with h.db() as con:
        con.execute("UPDATE auth_rate_events SET created_at=created_at-901 WHERE action='v2-factor'")
    assert c.post('/auth/2fa/disable',json={'code':codes[2]}).status_code==200
    assert c.get('/auth/me').json()['logged_in'] is False


def test_factor_bruteforce(env):
    h,m,c=env;enroll(env);c.post('/auth/logout');login(c)
    responses=[c.post('/auth/2fa/verify',json={'code':'invalid'}).status_code for _ in range(6)]
    assert responses[-1]==429


def test_pending_expiry(env):
    h,m,c=env;login(c,'super')
    with h.db() as con:con.execute("UPDATE sessions SET expires_at='2000-01-01T00:00:00Z'")
    assert reauth(c).status_code==401


def test_cross_account_and_forged_body(env):
    h,m,c=env;login(c,'a')
    with h.db() as con:
        con.execute("INSERT INTO game_account_bindings(user_id,game_uid,player_name,guild_name,verified_at) VALUES ('b','synthetic-b','B','Guild',?)",(h.isoformat(),))
    assert c.get('/member/game-binding/status?user_id=b').json()['bound'] is False
    assert c.get('/member/personal-teams?user_id=b').status_code in {200,400}
    response=c.post('/member/game-binding/unbind',json={'password':PASS,'user_id':'b'})
    assert response.status_code in {400,404,422}
    with h.db() as con:assert con.execute("SELECT 1 FROM game_account_bindings WHERE user_id='b'").fetchone()
    assert c.get('/admin/users?role=super_admin').status_code==403


def test_demotion_and_expired_session(env):
    h,m,c=env;login(c,'admin')
    h.set_user_role('admin','user','test-super')
    assert c.get('/admin/access-check').status_code==401
    login(c)
    with h.db() as con:con.execute("UPDATE sessions SET expires_at='2000-01-01T00:00:00Z'")
    assert c.get('/member/game-binding/status').status_code==401


def test_password_change_preserves_current_and_revokes_others(env):
    h,m,c=env;login(c)
    other=h.create_session('a')
    assert c.post('/auth/change-password',json={'current_password':PASS,'new_password':'another-long-test-password'}).status_code==200
    with h.db() as con:
        assert con.execute('SELECT 1 FROM sessions WHERE token_hash=?',(digest(other),)).fetchone() is None
        assert con.execute('SELECT count(*) FROM sessions').fetchone()[0]==1


def test_csrf_and_sql_injection(env):
    h,m,c=env;login(c)
    assert c.post('/auth/reauth',headers={'Origin':'https://evil.invalid'},json={'password':PASS}).status_code==403
    assert c.post('/auth/password/forgot',headers={'Origin':''},json={'identifier':'a'}).status_code==403
    assert c.post('/auth/login',json={'account':"a' OR 1=1 --",'password':PASS}).status_code==422
    response=c.get('/member/game-binding/status')
    assert 'no-store' in response.headers['cache-control']
    assert response.headers['referrer-policy']=='no-referrer'


def test_registration_email_captcha_and_application_separate(env,monkeypatch):
    h,m,c=env
    m.turnstile_key='test-key';m.turnstile_site='test-site'
    class Reply:
        def raise_for_status(self):pass
        def json(self):return {'success':True,'hostname':'rangerbook.warmycat.com','action':'register'}
    monkeypatch.setattr('membership.service.requests.post',lambda *a,**kw: Reply())
    payload={'account':'new-member','password':PASS,'email':'new@example.test','captcha':'test-captcha'}
    assert c.post('/auth/register',json=payload).status_code==202
    with h.db() as con:
        user=con.execute("SELECT * FROM users WHERE account='new-member'").fetchone()
        assert user['role']=='user' and user['admin_application_status']!='pending' and user['account_active']==0
        mail=json.loads(m.open(con.execute('SELECT payload FROM member_outbox').fetchone()[0]))
        assert mail['token'] not in con.execute('SELECT digest FROM member_tokens').fetchone()[0]
    assert c.post('/auth/login',json={'account':'new-member','password':PASS}).status_code==401
    assert c.post('/auth/email/verify',json={'token':mail['token']}).status_code==200
    assert c.post('/auth/email/verify',json={'token':mail['token']}).status_code==400
    assert c.post('/auth/login',json={'account':'new-member','password':PASS}).status_code==200
    assert c.post('/member/admin-application').status_code==200
    duplicate=c.post('/auth/register',json=payload)
    assert duplicate.status_code==409 and duplicate.json()['detail']=='member.accountTaken'


@pytest.mark.parametrize('response',[{'success':False},{'success':True,'hostname':'evil.invalid','action':'register'},{'success':True,'hostname':'rangerbook.warmycat.com','action':'other'}])
def test_captcha_rejected_by_backend(env,monkeypatch,response):
    h,m,c=env;m.turnstile_key='test';m.turnstile_site='test'
    class Reply:
        def raise_for_status(self):pass
        def json(self):return response
    monkeypatch.setattr('membership.service.requests.post',lambda *a,**kw: Reply())
    assert c.post('/auth/register',json={'account':'new-user','password':PASS,'email':'a@example.test','captcha':'x'}).status_code==400


def test_unconfigured_registration(env):
    h,m,c=env
    assert c.get('/auth/features').json()['registration'] is False
    assert c.post('/auth/register',json={'account':'new-user','password':PASS,'email':'a@example.test','captcha':'x'}).status_code==503


def test_reset_expiry_single_use_revokes_without_disabling_2fa(env):
    h,m,c=env;secret,codes=enroll(env)
    with h.db() as con:
        con.execute("UPDATE users SET google_sub='sub-a',recovery_email='recovery@gmail.com' WHERE id='a'")
    a=c.post('/auth/password/forgot',json={'identifier':'test-a','source':'google'})
    b=c.post('/auth/password/forgot',json={'identifier':'missing'})
    assert a.status_code==b.status_code==202 and a.json()==b.json()
    with h.db() as con:
        mail=json.loads(m.open(con.execute('SELECT payload FROM member_outbox').fetchone()[0]))
    payload={'token':mail['token'],'password':'changed-long-password'}
    assert c.post('/auth/password/reset',json=payload).status_code==200
    assert c.post('/auth/password/reset',json=payload).status_code==400
    with h.db() as con:
        assert con.execute('SELECT count(*) FROM sessions').fetchone()[0]==0
        assert con.execute("SELECT totp_secret FROM users WHERE id='a'").fetchone()[0]
    response=c.post('/auth/login',json={'account':'test-a','password':'changed-long-password'})
    assert response.json()['mfa_required'] and not response.json()['logged_in']
    with h.db() as con:
        m.issue(con,'a','reset','recovery@gmail.com')
        mail=json.loads(m.open(con.execute("SELECT payload FROM member_outbox WHERE status='pending' ORDER BY next_attempt DESC").fetchone()[0]))
        con.execute('UPDATE member_tokens SET expires=?',(time.time()-1,))
    assert c.post('/auth/password/reset',json={'token':mail['token'],'password':PASS}).status_code==400


def test_email_aliases_and_forgot_throttling(env):
    h,m,c=env
    assert gmail('Test.Name+tag@googlemail.com')=='testname@gmail.com'
    for _ in range(5):
        assert c.post('/auth/password/forgot',json={'identifier':'missing'}).status_code==202
    for _ in range(6):r=c.post('/auth/password/forgot',json={'identifier':'other'})
    assert r.status_code==429


def test_google_state_nonce_signature_and_uniqueness(env,monkeypatch):
    h,m,c=env;login(c);assert reauth(c).status_code==200
    m.google_id='test-client';m.google_secret='test-secret';m.callback='https://rangerbook-auth.warmycat.com/auth/google/callback'
    key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    monkeypatch.setattr(m.jwks,'get_signing_key_from_jwt',lambda token:types.SimpleNamespace(key=key.public_key()))
    claims={'iss':'https://accounts.google.com','aud':'test-client','iat':int(time.time()),'exp':int(time.time())+300,'sub':'google-test-a','nonce':'nonce','email':'Test.Name@gmail.com','email_verified':True}
    encoded=jwt.encode(claims,key,algorithm='RS256')
    assert m.google_claims(encoded,'nonce')==('google-test-a','testname@gmail.com')
    with pytest.raises(ValueError):m.google_claims(encoded,'wrong')
    with pytest.raises(jwt.PyJWTError):m.google_claims(jwt.encode({**claims,'aud':'wrong'},key,algorithm='RS256'),'nonce')
    with pytest.raises(ValueError):m.google_claims(jwt.encode({**claims,'email_verified':False},key,algorithm='RS256'),'nonce')
    start=c.post('/auth/google/start',json={});assert start.status_code==200
    from urllib.parse import urlparse,parse_qs
    q=parse_qs(urlparse(start.json()['url']).query)
    assert q['code_challenge_method']==['S256']
    state=q['state'][0]
    class Reply:
        def raise_for_status(self):pass
        def json(self):return {'id_token':jwt.encode({**claims,'nonce':q['nonce'][0]},key,algorithm='RS256')}
    def exchange(*a,**kw):
        assert base64.urlsafe_b64encode(hashlib.sha256(kw['data']['code_verifier'].encode()).digest()).decode().rstrip('=')==q['code_challenge'][0]
        return Reply()
    monkeypatch.setattr('membership.service.requests.post',exchange)
    bad=c.get('/auth/google/callback?state=invalid&code=test',follow_redirects=False)
    assert bad.headers['location'].endswith('google=failed')
    ok=c.get('/auth/google/callback',params={'state':state,'code':'test'},follow_redirects=False)
    assert ok.headers['location'].endswith('google=ok')
    assert c.get('/auth/security').json()['google_email']=='testname@gmail.com'
    assert c.get('/auth/google/callback',params={'state':state,'code':'test'},follow_redirects=False).headers['location'].endswith('google=failed')
    login(c,'b');reauth(c)
    start=c.post('/auth/google/start',json={});q=parse_qs(urlparse(start.json()['url']).query)
    assert c.get('/auth/google/callback',params={'state':q['state'][0],'code':'test'},follow_redirects=False).headers['location'].endswith('google=failed')
    login(c,'a');reauth(c)
    # Denial keeps the original identity; replacement commits only after validation.
    start=c.post('/auth/google/start',json={});q=parse_qs(urlparse(start.json()['url']).query)
    assert c.get('/auth/google/callback',params={'state':q['state'][0],'error':'access_denied'},follow_redirects=False).headers['location'].endswith('google=failed')
    assert c.get('/auth/security').json()['google_email']=='testname@gmail.com'
    start=c.post('/auth/google/start',json={});q=parse_qs(urlparse(start.json()['url']).query)
    claims.update(sub='google-workspace-a',email='verified@workspace.test')
    assert c.get('/auth/google/callback',params={'state':q['state'][0],'code':'test'},follow_redirects=False).headers['location'].endswith('google=ok')
    assert c.get('/auth/security').json()['google_email']=='verified@workspace.test'
    # Revocation during the external code exchange must defeat the final commit.
    start=c.post('/auth/google/start',json={});q=parse_qs(urlparse(start.json()['url']).query)
    claims.update(sub='google-uncommitted',email='uncommitted@workspace.test')
    def revoke_during_exchange(*args,**kwargs):
        with h.db() as con:con.execute("DELETE FROM sessions WHERE user_id='a'")
        return exchange(*args,**kwargs)
    monkeypatch.setattr('membership.service.requests.post',revoke_during_exchange)
    assert c.get('/auth/google/callback',params={'state':q['state'][0],'code':'test'},follow_redirects=False).headers['location'].endswith('google=failed')
    with h.db() as con:assert con.execute("SELECT recovery_email FROM users WHERE id='a'").fetchone()[0]=='verified@workspace.test'
    login(c,'a');reauth(c)
    assert c.post('/auth/google/unlink',json={}).status_code==200
    assert c.get('/auth/security').json()['google_email'] is None


def test_reauth_cooldown_reports_remaining_time_without_consuming_attempts(env):
    h,m,c=env;login(c)
    for _ in range(5):
        assert c.post('/auth/reauth',json={'password':'wrong-password'}).status_code==401
    with h.db() as con:
        con.execute("UPDATE auth_rate_events SET created_at=? WHERE action='v2-reauth'", (time.time()-850,))
    state=c.get('/auth/security').json()
    assert state['reauth_valid_for']==0
    assert 45<=state['reauth_retry_after']<=50
    response=reauth(c)
    assert response.status_code==429
    assert response.json()['detail']=='member.rateLimited'
    assert 'Retry-After' in response.headers['Access-Control-Expose-Headers']
    assert 45<=int(response.headers['Retry-After'])<=50
    with h.db() as con:
        assert con.execute("SELECT count(*) FROM auth_rate_events WHERE action='v2-reauth'").fetchone()[0]==5
    login(c,'b')
    assert c.get('/auth/security').json()['reauth_retry_after']==0
    login(c,'a')
    with h.db() as con:
        con.execute("UPDATE auth_rate_events SET created_at=created_at-60 WHERE action='v2-reauth'")
    assert c.get('/auth/security').json()['reauth_retry_after']==0
    assert reauth(c).status_code==200


def test_reauth_validity_is_server_owned_and_expires(env):
    h,m,c=env;login(c)
    assert c.get('/auth/security').json()['reauth_valid_for']==0
    assert reauth(c).json()['reauth_valid_for']==600
    assert 595<=c.get('/auth/security').json()['reauth_valid_for']<=600
    m.google_id='test-client';m.google_secret='test-secret';m.callback=ORIGIN+'/auth/google/callback'
    assert c.post('/auth/google/start',json={}).status_code==200
    with h.db() as con:
        con.execute('UPDATE sessions SET reauth_until=?',(time.time()-1,))
    assert c.get('/auth/security').json()['reauth_valid_for']==0
    assert c.post('/auth/google/start',json={}).status_code==403


def test_email_worker_retry_and_suppression(env):
    h,m,c=env
    with h.db() as con:m.issue(con,'a','reset','synthetic@example.test')
    class SES:
        def send_email(self,**kw):
            assert '#reset=' in kw['Content']['Simple']['Body']['Text']['Data']
            return {'MessageId':'synthetic-id'}
    assert deliver_batch(h.db,m.cipher,SES(),'test-set')['sent']==1
    with h.db() as con:
        assert con.execute('SELECT payload FROM member_outbox').fetchone()[0]==''
        m.issue(con,'a','reset','blocked@example.test')
        con.execute("INSERT INTO member_suppression VALUES ('blocked@example.test','Bounce')")
    assert deliver_batch(h.db,m.cipher,SES(),'test-set')['suppressed']==1
    with h.db() as con:m.issue(con,'a','reset','retry@example.test')
    from botocore.exceptions import EndpointConnectionError
    class Broken:
        def send_email(self,**kw):raise EndpointConnectionError(endpoint_url='https://example.test')
    assert deliver_batch(h.db,m.cipher,Broken(),'test-set')['failed']==1
    with h.db() as con:
        row=con.execute("SELECT attempts,next_attempt FROM member_outbox WHERE status='pending'").fetchone()
        assert row[0]==1 and row[1]>time.time()


@pytest.mark.parametrize('locale',['zh-Hant','en','jp','th'])
def test_mail_locale_and_username_come_from_validated_request_and_account(env,monkeypatch,locale):
    h,m,c=env;monkeypatch.setattr(m,'captcha',lambda *args:None)
    response=c.post('/auth/register',json={'account':'new-locale','password':PASS,'email':'new-locale@example.test','captcha':'fixture','locale':locale})
    assert response.status_code==202
    with h.db() as con:
        payload=json.loads(m.open(con.execute('SELECT payload FROM member_outbox').fetchone()[0]))
        assert payload['locale']==locale and payload['username']=='new-locale'
        con.execute("UPDATE users SET email='approved@example.test',email_verified=1 WHERE id='a'")
    good=c.post('/auth/password/forgot',json={'identifier':'test-a','source':'registration','locale':locale})
    missing=c.post('/auth/password/forgot',json={'identifier':'missing','source':'registration','locale':locale})
    assert good.status_code==missing.status_code==202 and good.json()==missing.json()
    with h.db() as con:
        payload=json.loads(m.open(con.execute('SELECT payload FROM member_outbox ORDER BY next_attempt DESC LIMIT 1').fetchone()[0]))
        assert payload['kind']=='reset' and payload['locale']==locale and payload['username']=='test-a'
    assert c.post('/auth/password/forgot',json={'identifier':'test-a','locale':'<script>'}).status_code==422
    assert c.post('/auth/password/reset',json={'token':payload['token'],'password':'new-localized-password','locale':locale}).status_code==200
    with h.db() as con:
        notice=json.loads(m.open(con.execute('SELECT payload FROM member_outbox ORDER BY next_attempt DESC LIMIT 1').fetchone()[0]))
        assert notice['kind']=='security' and notice['locale']==locale and notice['username']=='test-a'


def test_stage_mail_paused_state_is_global_and_does_not_enumerate(env,monkeypatch):
    h,m,c=env
    monkeypatch.setenv('RANGERBOOK_STAGE','1')
    monkeypatch.setenv('RANGERBOOK_STAGE_MAIL_MAX_ATTEMPTS','20')
    monkeypatch.setenv('RANGERBOOK_STAGE_EXPIRES_AT','0')
    monkeypatch.setenv('RANGERBOOK_MAIL_RECIPIENT_ALLOWLIST','approved@example.test')
    assert c.get('/auth/features').json()['mail'] is False
    a=c.post('/auth/password/forgot',json={'identifier':'test-a'})
    b=c.post('/auth/password/forgot',json={'identifier':'missing'})
    assert a.status_code==b.status_code==202 and a.json()==b.json()
    monkeypatch.setenv('RANGERBOOK_STAGE_EXPIRES_AT',str(time.time()+900))
    assert c.get('/auth/features').json()['mail'] is True
    with h.db() as con:
        con.execute('CREATE TABLE member_stage_mail_budget(id INTEGER PRIMARY KEY,used INTEGER NOT NULL)')
        con.execute('INSERT INTO member_stage_mail_budget VALUES(1,20)')
    assert c.get('/auth/features').json()['mail'] is False


@pytest.mark.parametrize('legacy_stage_ids',[False,True])
def test_full_own_binding_swap_import_unbind(env,monkeypatch,tmp_path,legacy_stage_ids):
    h,m,c=env
    import game_binding as gb
    prefix='stage-' if legacy_stage_ids else 'usr_'
    ids={who:prefix+who*24 for who in ['a','b']}
    with h.db() as con:
        for who,uid in ids.items():con.execute('UPDATE users SET id=? WHERE id=?',(uid,who))
    if legacy_stage_ids:
        from membership.stage import storage_compat
        monkeypatch.setenv('RANGERBOOK_STAGE','1')
        monkeypatch.setenv('RANGERBOOK_PRIVATE_TEAM_DIR',str(gb.PRIVATE_DIR))
        monkeypatch.setattr(storage_compat,'ROOT',tmp_path)
        assert storage_compat.configure(gb)
    login(c)
    pq=sys.modules['player_query']
    pq.search_players=lambda q,limit=20:{'items':[{'uid':'game-a','name':'<script>fixture</script>','guildName':'Synthetic'}]}
    pq.load_player_index=lambda:{'players':{'game-a':{'name':'Synthetic','guildName':'Synthetic'}}}
    pq._public_unit_record=lambda unit:{'unitCode':unit['unitCode'],'level':1}
    pq._flatten_unit_records=lambda raw:raw if isinstance(raw,list) else []
    raw={'player':{'guildWarMedal':123},'playerUnitTeamGroupMap':{
      'team1':{'1':[{'slot':0,'invenId':1,'teamNo':'1','unitCode':'u-test-a'}, {'slot':1,'invenId':2,'teamNo':'1','unitCode':'u-test-b'}]},
      'pvpteam':[{'unitCode':'u-test-a'}], 'guildwar':[{'unitCode':'u-test-b'}]}}
    monkeypatch.setattr(gb,'official_player',lambda uid:raw)
    candidate=c.get('/member/game-players/search?q=fixture').json()['items'][0]
    # Candidate IDs are account-bound, even when a second user knows the token.
    login(c,'b')
    assert c.post('/member/game-binding/start',json={'candidateId':candidate['candidateId'],'medal':'123'}).status_code==410
    login(c,'a')
    challenge=c.post('/member/game-binding/start',json={'candidateId':candidate['candidateId'],'medal':'123'})
    assert challenge.status_code==200,challenge.text
    challenge=challenge.json()
    assert c.post('/member/game-binding/verify',json={'challengeId':challenge['challengeId']}).json()['verified'] is False
    units=raw['playerUnitTeamGroupMap']['team1']['1'];units[0]['slot'],units[1]['slot']=1,0
    assert c.post('/member/game-binding/verify',json={'challengeId':challenge['challengeId']}).json()['verified'] is True
    response=c.post('/member/personal-teams/import');assert response.status_code==200,response.text
    assert set(response.json()['teams'])=={'team1','team2','team3','team4','team5','pvpteam','guildwar'}
    private=gb.PRIVATE_DIR / ids['a'] / 'latest.json'
    assert private.is_file() and private.stat().st_mode&0o777==0o600
    assert private.parent.stat().st_mode&0o777==0o700
    assert json.loads(private.read_text())['teams']==response.json()['teams']
    assert c.get('/member/personal-teams').json()['bound'] is True
    login(c,'b')
    assert c.get('/member/personal-teams').json()['bound'] is False
    assert c.post('/member/game-binding/unbind',json={'password':PASS}).status_code==404
    assert private.is_file()
    login(c,'a')
    assert c.get('/admin/personal-teams').json()['bound'] is True
    assert c.post('/member/game-binding/unbind',json={'password':PASS}).status_code==200
    assert c.get('/member/game-binding/status').json()['bound'] is False
    assert not private.exists()


def test_registration_resend_limits_and_duplicate_email(env,monkeypatch):
    h,m,c=env;monkeypatch.setattr(m,'captcha',lambda *a:None)
    payload={'account':'new-account','password':PASS,'email':'a@example.test','captcha':'x'}
    assert c.post('/auth/register',json=payload).status_code==202
    assert c.post('/auth/register',json={**payload,'account':'other-account'}).status_code==202
    with h.db() as con:
        assert con.execute("SELECT count(*) FROM users WHERE email='a@example.test'").fetchone()[0]==1
        assert con.execute('SELECT count(*) FROM member_outbox').fetchone()[0]==1
    assert c.post('/auth/email/resend',json={'identifier':'new-account'}).status_code==202
    with h.db() as con:assert con.execute('SELECT count(*) FROM member_outbox').fetchone()[0]==1
    for _ in range(3):response=c.post('/auth/email/resend',json={'identifier':'new-account'})
    assert response.status_code==429


def test_real_totp_next_step_success(env,monkeypatch):
    h,m,c=env;secret,codes=enroll(env);c.post('/auth/logout');login(c)
    later=time.time()+30
    monkeypatch.setattr('membership.service.time.time',lambda:later)
    assert c.post('/auth/2fa/verify',json={'code':pyotp.TOTP(secret).at(later)}).status_code==200


def test_rfc6238_sha1_vector():
    secret=base64.b32encode(b'12345678901234567890').decode()
    assert pyotp.TOTP(secret,digits=8).at(59)=='94287082'


def test_operator_recovery_preserves_role_password_and_blocks_super(env,tmp_path):
    from membership.manage import recover
    h,m,c=env;enroll(env,'super')
    with h.db() as con:before=tuple(con.execute("SELECT role,password_hash FROM users WHERE id='super'").fetchone())
    recover(h.DB_PATH,'test-super','synthetic-ticket-1')
    with h.db() as con:
        assert before==tuple(con.execute("SELECT role,password_hash FROM users WHERE id='super'").fetchone())
        assert con.execute('SELECT count(*) FROM sessions').fetchone()[0]==0
        assert con.execute("SELECT count(*) FROM member_audit WHERE event LIKE 'operator_totp_reenroll:%'").fetchone()[0]==1
    assert login(c,'super')['setup_required']
    assert c.get('/admin/users').status_code==403


def test_ses_feedback_authenticated_queue(env):
    h,m,c=env
    class SQS:
        deleted=False
        def receive_message(self,**kw):return {'Messages':[{'ReceiptHandle':'test','Body':json.dumps({'Type':'Notification','TopicArn':'test-topic','Message':json.dumps({'eventType':'Complaint','complaint':{'complainedRecipients':[{'emailAddress':'synthetic@example.test'}]}})})}]}
        def delete_message(self,**kw):self.deleted=True
    sqs=SQS();consume_feedback(h.db,sqs,'test-queue','test-topic');assert sqs.deleted
    with h.db() as con:assert con.execute("SELECT reason FROM member_suppression WHERE email='synthetic@example.test'").fetchone()[0]=='Complaint'


@pytest.mark.parametrize('source',['registration','google'])
def test_recovery_destinations_no_disclosure(env,source):
    h,m,c=env
    with h.db() as con:
        con.execute("UPDATE users SET email='registered@outlook.test',email_verified=1,google_sub='stable-sub',recovery_email='linked@example.test' WHERE id='a'")
    valid=c.post('/auth/password/forgot',json={'identifier':'test-a','source':source})
    missing=c.post('/auth/password/forgot',json={'identifier':'missing','source':source})
    assert valid.status_code==missing.status_code==202 and valid.json()==missing.json()
    assert '@' not in valid.text and 'linked' not in valid.text
    with h.db() as con:
        mail=json.loads(m.open(con.execute('SELECT payload FROM member_outbox').fetchone()[0]))
        assert mail['email']==('registered@outlook.test' if source=='registration' else 'linked@example.test')
        assert 895<=con.execute('SELECT expires FROM member_tokens').fetchone()[0]-time.time()<=900
        before=con.execute('SELECT digest FROM member_tokens').fetchone()[0]
    # A quick resend keeps the existing link and does not queue another mail.
    assert c.post('/auth/password/forgot',json={'identifier':'test-a','source':source}).json()==valid.json()
    with h.db() as con:
        assert con.execute('SELECT digest FROM member_tokens').fetchone()[0]==before
        assert con.execute('SELECT count(*) FROM member_outbox').fetchone()[0]==1
    assert c.post('/auth/password/reset/check',json={'token':mail['token']}).status_code==200
    assert c.post('/auth/password/reset',json={'token':mail['token'],'password':'New-password-123'}).status_code==200
    assert c.post('/auth/password/reset/check',json={'token':mail['token']}).status_code==400


@pytest.mark.parametrize('source',['registration','google'])
def test_untrusted_or_missing_recovery_source_is_silent(env,source):
    h,m,c=env
    with h.db() as con:con.execute("UPDATE users SET email='unverified@example.test',email_verified=0,recovery_email='untrusted@example.test',google_sub=NULL WHERE id='a'")
    assert c.post('/auth/password/forgot',json={'identifier':'test-a','source':source}).status_code==202
    with h.db() as con:assert con.execute('SELECT count(*) FROM member_outbox').fetchone()[0]==0


def test_cancel_factor_and_sensitive_actions_require_current_factor(env):
    h,m,c=env;login(c);reauth(c)
    assert c.post('/auth/2fa/setup').status_code==200
    assert c.post('/auth/2fa/cancel').status_code==200
    assert c.get('/auth/security').json()['totp_enabled'] is False
    assert c.post('/auth/2fa/enable',json={'code':'123456'}).status_code==400
    secret,codes=enroll(env)
    assert reauth(c).status_code==200
    assert c.post('/auth/2fa/disable',json={'code':'wrong'}).status_code==401
    assert c.get('/auth/security').json()['totp_enabled'] is True
    assert c.post('/auth/2fa/recovery-codes',json={'code':'wrong'}).status_code==401
    assert c.post('/auth/2fa/disable',json={'code':codes[3]}).status_code==200
    assert c.get('/auth/me').json()['logged_in'] is False


def test_password_change_preserves_google_factor_and_wrong_password(env):
    h,m,c=env;secret,codes=enroll(env)
    with h.db() as con:con.execute("UPDATE users SET google_sub='stable-sub',recovery_email='linked@example.test' WHERE id='a'")
    assert c.post('/auth/change-password',json={'current_password':'wrong','new_password':'New-password-123'}).status_code==401
    assert c.post('/auth/change-password',json={'current_password':PASS,'new_password':'New-password-123'}).status_code==200
    with h.db() as con:
        user=con.execute("SELECT * FROM users WHERE id='a'").fetchone()
        assert user['totp_secret'] and user['google_sub']=='stable-sub' and user['recovery_email']=='linked@example.test'
    c.post('/auth/logout')
    state=c.post('/auth/login',json={'account':'test-a','password':'New-password-123'}).json()
    assert state['mfa_required'] and not state['logged_in']
    # A password proof cannot upgrade the pending MFA session.
    assert c.post('/auth/reauth',json={'password':'New-password-123'}).status_code==403


@pytest.mark.parametrize('who,with_factor',[('a',False),('a',True),('admin',True),('super',True)])
def test_required_password_change_follows_mfa_without_factor_loop(env,who,with_factor):
    h,m,c=env
    codes=[]
    if with_factor:
        _,codes=enroll(env,who)
    with h.db() as con:
        con.execute('UPDATE users SET must_change_password=1 WHERE id=?',(who,))
        before=con.execute('SELECT totp_secret,role FROM users WHERE id=?',(who,)).fetchone()
    c.post('/auth/logout')
    state=login(c,who)
    assert not state['logged_in']
    assert state['must_change_password'] and state['mfa_required']==with_factor
    if with_factor:
        assert c.post('/auth/change-password',json={'current_password':PASS,'new_password':'New-password-123'}).status_code==403
        assert c.post('/auth/2fa/verify',json={'code':codes[0]}).status_code==200
    state=c.get('/auth/me').json()
    assert not state['logged_in'] and state['role']=='user'
    assert state['must_change_password'] and not state['mfa_required'] and not state['setup_required']
    assert c.get('/member/game-binding/status').json()['detail']=='member.passwordRequired'
    assert c.get('/admin/users').status_code==403
    assert c.post('/auth/change-password',json={'current_password':'wrong','new_password':'New-password-123'}).status_code==401
    assert c.post('/auth/change-password',json={'current_password':PASS,'new_password':'New-password-123'}).status_code==200
    state=c.get('/auth/me').json()
    assert state['logged_in'] and not state['must_change_password']
    assert state['role']==before['role']
    with h.db() as con:
        after=con.execute('SELECT totp_secret,role FROM users WHERE id=?',(who,)).fetchone()
        assert tuple(after)==tuple(before)
    assert c.get('/member/game-binding/status').status_code==200


def test_expired_email_link_and_resend_after_cooldown(env,monkeypatch):
    h,m,c=env;monkeypatch.setattr(m,'captcha',lambda *args:None)
    body={'account':'new-outlook','password':PASS,'email':'new@outlook.test','captcha':'x'}
    assert c.post('/auth/register',json=body).status_code==202
    with h.db() as con:
        token=json.loads(m.open(con.execute('SELECT payload FROM member_outbox').fetchone()[0]))['token']
        con.execute('UPDATE member_tokens SET expires=?',(time.time()-1,))
    assert c.post('/auth/email/verify',json={'token':token}).status_code==400
    assert c.post('/auth/email/resend',json={'identifier':'new-outlook'}).status_code==202
    with h.db() as con:
        assert con.execute('SELECT count(*) FROM member_outbox').fetchone()[0]==2
        assert not con.execute("SELECT account_active FROM users WHERE account='new-outlook'").fetchone()[0]


@pytest.mark.parametrize('patch',[{'email':'bad-email'},{'account':'bad!name'},{'password':'short'}])
def test_bad_registration_format(env,monkeypatch,patch):
    h,m,c=env;monkeypatch.setattr(m,'captcha',lambda *args:None)
    response=c.post('/auth/register',json={**{'account':'new-valid','email':'new@example.test','password':PASS,'captcha':'x'},**patch})
    assert response.status_code in {400,422}
    with h.db() as con:assert con.execute('SELECT count(*) FROM users').fetchone()[0]==4


def test_abandon_pending_mfa_revokes_only_current_session_and_can_switch_accounts(env):
    h,m,c=env
    secret,codes=enroll(env,'a')
    with h.db() as con:
        factor=con.execute("SELECT totp_secret FROM users WHERE id='a'").fetchone()[0]
        recovery=con.execute("SELECT digest FROM member_recovery_codes WHERE user_id='a' ORDER BY digest").fetchall()
    c.post('/auth/logout')
    other=h.create_session('b')
    same_account_device=h.create_session('a')
    with h.db() as con:con.execute('UPDATE sessions SET mfa_verified=1 WHERE token_hash=?',(digest(same_account_device),))
    state=login(c,'a')
    assert state['mfa_required'] and not state['logged_in']
    pending=c.cookies.get(h.SESSION_COOKIE)
    assert c.get('/member/game-binding/status').status_code==403
    assert c.post('/auth/logout').status_code==200
    assert c.get('/auth/me').json()['logged_in'] is False
    with h.db() as con:
        assert not con.execute('SELECT 1 FROM sessions WHERE token_hash=?',(digest(pending),)).fetchone()
        assert con.execute('SELECT 1 FROM sessions WHERE token_hash=?',(digest(other),)).fetchone()
        assert con.execute('SELECT 1 FROM sessions WHERE token_hash=? AND mfa_verified=1',(digest(same_account_device),)).fetchone()
        assert con.execute("SELECT totp_secret FROM users WHERE id='a'").fetchone()[0]==factor
        assert con.execute("SELECT digest FROM member_recovery_codes WHERE user_id='a' ORDER BY digest").fetchall()==recovery
    c.cookies.set(h.SESSION_COOKIE,pending)
    assert c.get('/member/game-binding/status').status_code==401
    c.cookies.clear()
    state=login(c,'b')
    assert state['logged_in'] and not state['mfa_required']
    assert c.get('/member/game-binding/status').status_code==200


@pytest.mark.parametrize('account',['test-a','TEST-A',' test-a '])
def test_account_availability_existing_names(env,account):
    h,m,c=env
    r=c.post('/auth/account/availability',json={'account':account})
    assert r.status_code==200 and r.json()=={'available':False}
    assert r.headers['Cache-Control']=='no-store'


def test_account_availability_validation_origin_and_limits(env):
    h,m,c=env
    assert c.post('/auth/account/availability',json={'account':'new-name'}).json()=={'available':True}
    assert c.post('/auth/account/availability',json={'account':'bad name'}).status_code==422
    assert c.post('/auth/account/availability',json={'account':'new-name'},headers={'Origin':'https://evil.invalid'}).status_code==403
    for _ in range(29):
        assert c.post('/auth/account/availability',json={'account':'new-name'}).status_code==200
    r=c.post('/auth/account/availability',json={'account':'another-name'})
    assert r.status_code==429 and int(r.headers['Retry-After'])>0
    with h.db() as con:
        assert con.execute('SELECT count(*) FROM users').fetchone()[0]==4
        assert con.execute('SELECT count(*) FROM member_outbox').fetchone()[0]==0


def test_registration_rechecks_reserved_name_and_preserves_original(env,monkeypatch):
    h,m,c=env;monkeypatch.setattr(m,'captcha',lambda *a:None)
    payload={'account':'reserved-name','password':PASS,'email':'first@example.test','captcha':'x'}
    assert c.post('/auth/account/availability',json={'account':payload['account']}).json()['available']
    assert c.post('/auth/register',json=payload).status_code==202
    with h.db() as con:
        original=tuple(con.execute("SELECT * FROM users WHERE account='reserved-name'").fetchone())
    assert not c.post('/auth/account/availability',json={'account':'RESERVED-NAME'}).json()['available']
    r=c.post('/auth/register',json={**payload,'account':'RESERVED-NAME','email':'second@example.test'})
    assert r.status_code==409 and r.json()=={'detail':'member.accountTaken'}
    with h.db() as con:
        assert tuple(con.execute("SELECT * FROM users WHERE account='reserved-name'").fetchone())==original
        assert con.execute('SELECT count(*) FROM member_outbox').fetchone()[0]==1


def test_concurrent_registration_same_name_creates_one_user(env,monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    h,m,c=env;monkeypatch.setattr(m,'captcha',lambda *a:None)
    barrier=Barrier(2)
    original_hash=h.PASSWORD_HASHER.hash
    def synchronized_hash(self,password):
        hashed=original_hash(password);barrier.wait(timeout=20);return hashed
    monkeypatch.setattr(type(h.PASSWORD_HASHER),'hash',synchronized_hash)
    def submit(i):
        with TestClient(h.app,base_url='https://rangerbook-auth.warmycat.com',headers={'Origin':ORIGIN}) as client:
            return client.post('/auth/register',json={'account':['race-name','RACE-NAME'][i],
              'password':PASS,'email':f'race{i}@example.test','captcha':'x'}).status_code
    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(submit,range(2)))==[202,409]
    with h.db() as con:
        assert con.execute("SELECT count(*) FROM users WHERE account='race-name' COLLATE NOCASE").fetchone()[0]==1
        assert con.execute('SELECT count(*) FROM member_outbox').fetchone()[0]==1
