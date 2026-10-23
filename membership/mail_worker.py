"""Run one bounded batch from a systemd timer. No email/token content is logged."""
import importlib
import json
import os
import secrets
import sqlite3
import time
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from cryptography.fernet import Fernet

SUBJECTS = {'verify': 'Verify your Rangerbook email', 'reset': 'Reset your Rangerbook password',
            'security': 'Rangerbook account security notification'}


def deliver_batch(connect, cipher, ses, configuration_set, sender='noreply@warmycat.com', limit=10,
                  recipient_allowlist=None):
    """Leases make overlapping workers safe. SES has no send idempotency token;
    a crash after send may duplicate a message, but links remain single use.
    """
    result = {'sent': 0, 'failed': 0, 'suppressed': 0}
    for _ in range(limit):
        now = time.time()
        with connect() as con:
            con.execute('BEGIN IMMEDIATE')
            row = con.execute("UPDATE member_outbox SET lease_until=? WHERE id=(SELECT id FROM member_outbox WHERE status='pending' AND next_attempt<=? AND lease_until<? ORDER BY next_attempt LIMIT 1) RETURNING *", (now + 120, now, now)).fetchone()
        if row is None:
            break
        payload = json.loads(cipher.decrypt(row['payload'].encode()))
        with connect() as con:
            suppressed = con.execute('SELECT 1 FROM member_suppression WHERE email=?', (payload['email'],)).fetchone()
        outside_allowlist = recipient_allowlist is not None and payload['email'].lower() not in recipient_allowlist
        if suppressed or outside_allowlist or (payload.get('expires') and payload['expires'] < now):
            with connect() as con:
                con.execute("UPDATE member_outbox SET status='suppressed',payload='' WHERE id=?", (row['id'],))
            result['suppressed'] += 1
            continue
        kind = payload['kind']
        # Tokens stay in a URL fragment. They never reach Pages, analytics or access logs.
        text = 'Your Rangerbook account security settings were changed. If this was not you, contact the site owner.'
        if kind in {'verify', 'reset'}:
            text = ('This link expires in 15 minutes and can be used once.\n\n' + payload['frontend'] +
                    '/account-action/#' + kind + '=' + payload['token'] +
                    '\n\nIf you did not request this, ignore this email.')
        try:
            response = ses.send_email(FromEmailAddress=sender, Destination={'ToAddresses': [payload['email']]},
                Content={'Simple': {'Subject': {'Data': SUBJECTS[kind], 'Charset': 'UTF-8'},
                                   'Body': {'Text': {'Data': text, 'Charset': 'UTF-8'}}}},
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
    config = Config(retries={'total_max_attempts': 2, 'mode': 'standard'}, connect_timeout=5, read_timeout=10)
    session = boto3.Session(region_name='ap-south-1')  # Instance role; never static access keys.
    if os.environ.get('RANGERBOOK_FEEDBACK_QUEUE'):
        consume_feedback(connect, session.client('sqs', config=config), os.environ['RANGERBOOK_FEEDBACK_QUEUE'], os.environ['RANGERBOOK_FEEDBACK_TOPIC'])
    result = deliver_batch(connect, Fernet(os.environ['RANGERBOOK_MEMBER_KEY'].encode()),
        session.client('sesv2', config=config), os.environ['RANGERBOOK_SES_CONFIGURATION_SET'],
        recipient_allowlist=recipients)
    with connect() as con:
        con.execute('DELETE FROM member_tokens WHERE expires<?', (time.time(),))
        con.execute('DELETE FROM member_totp_setup WHERE expires<?', (time.time(),))
        con.execute('DELETE FROM member_oauth WHERE expires<?', (time.time(),))
        con.execute('DELETE FROM member_audit WHERE created<?', (time.time() - 90 * 86400,))
    print(json.dumps(result))


if __name__ == '__main__':
    main()
