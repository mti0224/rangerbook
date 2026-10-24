"""Synthetic messages and stub SES only; no network, addresses or live tokens."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import hashlib
import json
import secrets
import sqlite3
import time

import boto3
from botocore.stub import Stubber
from cryptography.fernet import Fernet
import pytest

from membership.mail_templates import render_email
from membership.mail_worker import deliver_batch
from membership.schema import migrate
from membership.stage.mail_policy import mail_limits


@pytest.fixture
def outbox(tmp_path):
    database=tmp_path/'auth.db'
    with sqlite3.connect(database) as con:
        con.executescript("CREATE TABLE users(id TEXT PRIMARY KEY,account TEXT,password_hash TEXT,role TEXT);"
                          "CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT);"
                          "CREATE TABLE game_account_bindings(user_id TEXT PRIMARY KEY,game_uid TEXT);"
                          "INSERT INTO users VALUES('fixture','fixture-user','synthetic-hash','user');")
        migrate(con)
    @contextmanager
    def connect():
        with sqlite3.connect(database,timeout=15) as con:
            con.row_factory=sqlite3.Row
            yield con
    cipher=Fernet(Fernet.generate_key())
    def enqueue(kind='reset',locale='zh-Hant',expires=None,current=True):
        token=secrets.token_urlsafe(32)
        expires=time.time()+900 if expires is None else expires
        payload={'email':'approved@example.test','kind':kind,'locale':locale,'username':'fixture-user',
                 'frontend':'https://rangerbook-test.warmycat.com','token':token,'expires':expires}
        with connect() as con:
            if current and kind in {'reset','verify'}:
                con.execute('INSERT INTO member_tokens VALUES(?,?,?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),'fixture',kind,payload['email'],expires))
            con.execute('INSERT INTO member_outbox(id,payload,next_attempt) VALUES(?,?,0)',(secrets.token_hex(8),cipher.encrypt(json.dumps(payload).encode()).decode()))
        return token
    return connect,cipher,enqueue,database


class SES:
    def __init__(self):self.requests=[]
    def send_email(self,**kwargs):
        self.requests.append(kwargs)
        return {'MessageId':'synthetic-message'}


@pytest.mark.parametrize('locale',['zh-Hant','en','jp','th'])
@pytest.mark.parametrize('kind',['verify','reset'])
def test_translated_html_text_and_safe_substitutions(locale,kind):
    url='https://rangerbook-test.warmycat.com/account-action/#'+kind+'='+'a'*64
    username='<img src=x onerror=alert(1)> **name** {ACTION_URL}'
    content=render_email(kind,username,url,locale)
    text=content['Body']['Text']['Data'];markup=content['Body']['Html']['Data']
    assert username in text and url in text
    assert '<img' not in markup and '&lt;img' in markup
    assert '**name** {ACTION_URL}' in markup
    assert '<strong>' in markup and '<em>' in markup
    assert markup.count('href=')==1 and 'rel="noreferrer"' in markup
    assert '<script' not in markup and '<img' not in markup
    assert content['Subject']['Charset']=='UTF-8'
    if locale=='zh-Hant':
        assert '您好，'+username+'：' in text
        assert '感謝您使用 LINE Ranger 資料站！' in text
        assert '此郵件由系統自動發送，請勿直接回覆。' in text
        if kind=='reset':assert '此密碼重設連結將於寄出後 15 分鐘失效，且僅能使用一次。' in text


def test_superseded_and_expired_tokens_do_not_spend_budget(outbox):
    connect,cipher,enqueue,_=outbox
    enqueue(current=False);enqueue(expires=time.time()-10);enqueue(locale='jp')
    ses=SES()
    result=deliver_batch(connect,cipher,ses,'fixture-set',delivery_budget=20)
    assert result=={'sent':1,'failed':0,'suppressed':2}
    assert len(ses.requests)==1
    assert 'パスワード' in ses.requests[0]['Content']['Simple']['Body']['Text']['Data']
    with connect() as con:assert con.execute('SELECT used FROM member_stage_mail_budget').fetchone()[0]==1


def test_current_link_has_fifteen_minutes_from_send_attempt(outbox):
    connect,cipher,enqueue,_=outbox
    token=enqueue(expires=time.time()+10)
    before=time.time();ses=SES();deliver_batch(connect,cipher,ses,'fixture-set')
    with connect() as con:expiry=con.execute('SELECT expires FROM member_tokens WHERE digest=?',(hashlib.sha256(token.encode()).hexdigest(),)).fetchone()[0]
    assert before+900<=expiry<=time.time()+900
    assert '#reset='+token in ses.requests[0]['Content']['Simple']['Body']['Text']['Data']


def test_twenty_attempts_preserve_four_already_used_and_parallel_cap(outbox):
    connect,cipher,enqueue,_=outbox
    for _ in range(25):enqueue(kind='security')
    with connect() as con:
        con.execute('CREATE TABLE member_stage_mail_budget(id INTEGER PRIMARY KEY,used INTEGER NOT NULL)')
        con.execute('INSERT INTO member_stage_mail_budget VALUES(1,4)')
    ses=SES()
    def run():return deliver_batch(connect,cipher,ses,'fixture-set',limit=30,delivery_budget=20)
    with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(lambda _:run(),range(2)))
    run()
    assert len(ses.requests)==16
    with connect() as con:
        assert con.execute('SELECT used FROM member_stage_mail_budget').fetchone()[0]==20
        assert con.execute("SELECT count(*) FROM member_outbox WHERE status='sent'").fetchone()[0]==16


def test_expired_window_stops_direct_worker_before_aws(outbox,monkeypatch):
    from membership import mail_worker
    connect,cipher,enqueue,_=outbox;enqueue();ses=SES()
    assert deliver_batch(connect,cipher,ses,'fixture-set',delivery_budget=20,delivery_deadline=time.time()-1)['sent']==0
    assert not ses.requests
    monkeypatch.setenv('RANGERBOOK_STAGE','1');monkeypatch.setenv('RANGERBOOK_MAIL_ENABLED','1')
    monkeypatch.setenv('RANGERBOOK_MAIL_RECIPIENT_ALLOWLIST','approved@example.test')
    monkeypatch.setenv('RANGERBOOK_STAGE_EXPIRES_AT','0');monkeypatch.setenv('RANGERBOOK_STAGE_MAIL_MAX_ATTEMPTS','20')
    monkeypatch.setattr(mail_worker.boto3,'Session',lambda **kw:pytest.fail('Expired mail must not create an AWS client'))
    mail_worker.main()


def test_readiness_and_worker_share_approved_ceiling(outbox,monkeypatch):
    from membership.stage import mail_ready
    connect,cipher,enqueue,database=outbox;enqueue(kind='security')
    with connect() as con:
        con.execute('CREATE TABLE member_stage_mail_budget(id INTEGER PRIMARY KEY,used INTEGER NOT NULL)')
        con.execute('INSERT INTO member_stage_mail_budget VALUES(1,5)')
    monkeypatch.setattr(mail_ready,'ROOT',database.parent)
    for key,value in {'RANGERBOOK_STAGE':'1','RANGERBOOK_AUTH_DB':str(database),'RANGERBOOK_MAIL_ENABLED':'1',
                      'RANGERBOOK_MAIL_RECIPIENT_ALLOWLIST':'approved@example.test','RANGERBOOK_STAGE_EXPIRES_AT':str(time.time()+900)}.items():monkeypatch.setenv(key,value)
    monkeypatch.delenv('RANGERBOOK_STAGE_MAIL_MAX_ATTEMPTS',raising=False)
    assert mail_ready.main()==1
    monkeypatch.setenv('RANGERBOOK_STAGE_MAIL_MAX_ATTEMPTS','20');assert mail_ready.main()==0
    with connect() as con:con.execute('UPDATE member_stage_mail_budget SET used=20')
    assert mail_ready.main()==1


@pytest.mark.parametrize('budget,deadline',[('21','100'),('0','100'),('abc','100'),('20','nan'),('20','inf')])
def test_invalid_mail_approval_configuration_fails_closed(budget,deadline):
    with pytest.raises(ValueError):mail_limits({'RANGERBOOK_STAGE_MAIL_MAX_ATTEMPTS':budget,'RANGERBOOK_STAGE_EXPIRES_AT':deadline})


def test_ses_sdk_accepts_utf8_multipart_content(outbox):
    connect,cipher,enqueue,_=outbox;enqueue(locale='th')
    ses=boto3.client('sesv2',region_name='ap-south-1',aws_access_key_id='synthetic',aws_secret_access_key='synthetic')
    with Stubber(ses) as stub:
        stub.add_response('send_email',{'MessageId':'synthetic'})
        assert deliver_batch(connect,cipher,ses,'fixture-set')['sent']==1
        stub.assert_no_pending_responses()
