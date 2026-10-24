"""Run one bounded batch from a systemd timer. No email/token content is logged."""
import importlib
import hashlib
import json
import os
import re
import secrets
import sqlite3
import time
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from cryptography.fernet import Fernet

from .mail_templates import render_email


def deliver_batch(connect, cipher, ses, configuration_set, sender='noreply@warmycat.com', limit=10,
                  recipient_allowlist=None, delivery_budget=None, delivery_deadline=None):
    """Leases make overlapping workers safe. SES has no send idempotency token;
    a crash after send may duplicate a message, but links remain single use.
    """
    result = {'sent': 0, 'failed': 0, 'suppressed': 0}
    for _ in range(limit):
        now = time.time()
        if delivery_deadline is not None and now >= delivery_deadline:
            break
        with connect() as con:
            con.execute('BEGIN IMMEDIATE')
            row = con.execute("UPDATE member_outbox SET lease_until=? WHERE id=(SELECT id FROM member_outbox WHERE status='pending' AND next_attempt<=? AND lease_until<? ORDER BY next_attempt LIMIT 1) RETURNING *", (now + 120, now, now)).fetchone()
        if row is None:
            break
        payload = json.loads(cipher.decrypt(row['payload'].encode()))
        with connect() as con:
            suppressed = con.execute('SELECT 1 FROM member_suppression WHERE email=?', (payload['email'],)).fetchone()
        outside_allowlist = recipient_allowlist is not None and payload['email'].lower() not in recipient_allowlist
        kind = payload['kind']
        link_mail = kind in {'verify', 'reset'}
        invalid_link = kind not in {'verify', 'reset', 'security'} or link_mail and (payload.get('frontend') not in {
            'https://rangerbook.warmycat.com', 'https://rangerbook-test.warmycat.com'} or
            not isinstance(payload.get('token'), str) or
            not re.fullmatch(r'[A-Za-z0-9_-]{32,128}', payload.get('token', '')))
        if suppressed or outside_allowlist or invalid_link or (payload.get('expires') and payload['expires'] < now):
            with connect() as con:
                con.execute("UPDATE member_outbox SET status='suppressed',payload='' WHERE id=?", (row['id'],))
            result['suppressed'] += 1
            continue
        token_hash = hashlib.sha256(payload.get('token', '').encode()).hexdigest() if link_mail else None
        # Check the still-current token before spending any sending budget.
        # Resends may have superseded an encrypted message already in the queue.
        with connect() as con:
            con.execute('BEGIN IMMEDIATE')
            current = con.execute('SELECT u.account FROM member_tokens t JOIN users u ON u.id=t.user_id WHERE t.digest=? AND t.kind=? AND t.email=? AND t.expires>?',
                                  (token_hash, kind, payload['email'], now)).fetchone() if link_mail else None
            if link_mail and not current:
                con.execute("UPDATE member_outbox SET status='suppressed',payload='' WHERE id=?", (row['id'],))
                result['suppressed'] += 1
                continue
            if delivery_deadline is not None and time.time() >= delivery_deadline:
                con.execute('UPDATE member_outbox SET lease_until=0 WHERE id=?', (row['id'],))
                break
            reserved = True
            if delivery_budget is not None:
                # Count attempts before calling SES, including ambiguous timeouts.
                # This atomic ceiling survives restarts and concurrent workers.
                con.execute('CREATE TABLE IF NOT EXISTS member_stage_mail_budget (id INTEGER PRIMARY KEY CHECK(id=1), used INTEGER NOT NULL)')
                con.execute('INSERT OR IGNORE INTO member_stage_mail_budget VALUES (1,0)')
                reserved = con.execute('UPDATE member_stage_mail_budget SET used=used+1 WHERE id=1 AND used<? RETURNING used', (delivery_budget,)).fetchone()
                if not reserved:
                    con.execute('UPDATE member_outbox SET lease_until=0 WHERE id=?', (row['id'],))
            if not reserved:
                break
            if link_mail:
                # The copy promises fifteen minutes from sending. Never revive an
                # expired/revoked token; only the current live token gets this TTL.
                payload['expires'] = time.time() + 900
                con.execute('UPDATE member_tokens SET expires=? WHERE digest=? AND kind=?', (payload['expires'], token_hash, kind))
                payload['username'] = current['account']
                con.execute('UPDATE member_outbox SET payload=? WHERE id=?', (cipher.encrypt(json.dumps(payload).encode()).decode(), row['id']))
        # The token remains in the fragment, absent from access logs and Referer.
        url = payload['frontend'] + '/account-action/#' + kind + '=' + payload['token'] if link_mail else ''
        content = render_email(kind, payload.get('username', ''), url, payload.get('locale', 'zh-Hant'))
        try:
            response = ses.send_email(FromEmailAddress=sender, Destination={'ToAddresses': [payload['email']]},
                Content={'Simple': content},
                ConfigurationSetName=configuration_set)
        except (BotoCoreError, ClientError):
            attempts = row['attempts'] + 1
            with connect() as con:
                con.execute("UPDATE member_outbox SET attempts=?,next_attempt=?,lease_until=0,status=? WHERE id=?",
                            (attempts, now + min(3600, 30 * 2 ** attempts), 'failed' if attempts >= 5 else 'pending', row['id']))
            result['failed'] += 1
        else:
            with connect() as con:
                con.execute("UPDATE member_outbox SET status='sent',payload='',ses_id=? WHERE id=?", (response['MessageId'], row['id']))
            result['sent'] += 1
    return result


def consume_feedback(connect, sqs, queue_url, topic_arn):
    """SQS must allow SendMessage ONLY from the configured SES SNS topic.
    No public unsigned webhook or automatic SNS subscription confirmation.
    """
    response = sqs.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=10, WaitTimeSeconds=1)
    for message in response.get('Messages', []):
        # SES destination validation can publish plain-text SNS messages. A bad
        # envelope must not abort every subsequent mail/feedback batch forever.
        kind, entries = 'feedback_invalid', []
        try:
            envelope = json.loads(message['Body'])
            if envelope.get('Type') != 'Notification' or envelope.get('TopicArn') != topic_arn:
                raise ValueError('Unexpected notification source')
            event = json.loads(envelope['Message'])
            candidate = event.get('eventType', event.get('notificationType'))
            if candidate not in {'Send', 'Delivery', 'Bounce', 'Complaint', 'Reject', 'Rendering Failure', 'DeliveryDelay'}:
                raise ValueError('Unexpected event type')
            key = 'bounce' if candidate == 'Bounce' else 'complaint' if candidate == 'Complaint' else None
            entries = event.get(key, {}).get('bouncedRecipients' if key == 'bounce' else 'complainedRecipients', []) if key else []
            if not isinstance(entries, list) or any(not isinstance(e, dict) or not isinstance(e.get('emailAddress'), str) or not 1 <= len(e['emailAddress']) <= 320 for e in entries):
                raise ValueError('Invalid recipient shape')
            kind = candidate
        except (ValueError, TypeError, AttributeError, KeyError):
            entries = []
        with connect() as con:
            for entry in entries:
                con.execute('INSERT OR REPLACE INTO member_suppression VALUES (?,?)', (entry['emailAddress'].lower(), kind))
            con.execute("INSERT INTO member_audit(event,created) VALUES (?,?)", ('ses_' + str(kind), time.time()))
        sqs.delete_message(QueueUrl=queue_url, ReceiptHandle=message['ReceiptHandle'])


def main():
    from contextlib import contextmanager
    @contextmanager
    def connect():
        con = sqlite3.connect(os.environ['RANGERBOOK_AUTH_DB'], timeout=10)
        con.row_factory = sqlite3.Row
        try:
            yield con
            con.commit()
        finally:
            con.close()
    if os.environ.get('RANGERBOOK_MAIL_ENABLED') != '1':
        return
    # A test deployment may never silently fall back to unrestricted delivery.
    restricted = os.environ.get('RANGERBOOK_STAGE') == '1' or 'RANGERBOOK_MAIL_RECIPIENT_ALLOWLIST' in os.environ
    recipients = {value.strip().lower() for value in os.environ.get('RANGERBOOK_MAIL_RECIPIENT_ALLOWLIST', '').split(',') if value.strip()} if restricted else None
    if restricted and not recipients:
        raise RuntimeError('Test mail requires an explicit recipient allowlist')
    stage = os.environ.get('RANGERBOOK_STAGE') == '1'
    budget, deadline = None, None
    if stage:
        from .stage.mail_policy import mail_limits
        budget, deadline = mail_limits()
        if time.time() >= deadline:
            return
    # SDK retries would hide extra sends from the explicit test-mail budget.
    config = Config(retries={'total_max_attempts': 1 if stage else 2, 'mode': 'standard'}, connect_timeout=5, read_timeout=10)
    session = boto3.Session(region_name='ap-south-1')  # Instance role; never static access keys.
    if os.environ.get('RANGERBOOK_FEEDBACK_QUEUE'):
        consume_feedback(connect, session.client('sqs', config=config), os.environ['RANGERBOOK_FEEDBACK_QUEUE'], os.environ['RANGERBOOK_FEEDBACK_TOPIC'])
    result = deliver_batch(connect, Fernet(os.environ['RANGERBOOK_MEMBER_KEY'].encode()),
        session.client('sesv2', config=config), os.environ['RANGERBOOK_SES_CONFIGURATION_SET'],
        recipient_allowlist=recipients, delivery_budget=budget, delivery_deadline=deadline)
    with connect() as con:
        con.execute('DELETE FROM member_tokens WHERE expires<?', (time.time(),))
        con.execute('DELETE FROM member_totp_setup WHERE expires<?', (time.time(),))
        con.execute('DELETE FROM member_oauth WHERE expires<?', (time.time(),))
        con.execute('DELETE FROM member_audit WHERE created<?', (time.time() - 90 * 86400,))
    print(json.dumps(result))


if __name__ == '__main__':
    main()
