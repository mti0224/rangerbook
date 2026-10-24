"""Create fresh synthetic acceptance accounts; never print credentials."""
import argparse
import json
import os
from pathlib import Path
import pwd
import grp
import secrets
import sqlite3
import subprocess
import sys
import time

from cryptography.fernet import Fernet
from .launch import ROOT


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--recipient', required=True)
    args = parser.parse_args()
    from membership.service import email_value
    recipient = email_value(args.recipient)
    if os.geteuid() != 0 or ROOT.exists():
        raise RuntimeError('Run as root once, with a fresh acceptance directory')
    os.umask(0o077)
    ROOT.mkdir(mode=0o700)
    template = Path(__file__).with_name('runtime.env.in').read_text()
    template = template.replace('RANGERBOOK_MAIL_ENABLED=0', 'RANGERBOOK_MAIL_ENABLED=1')
    template = template.replace('RANGERBOOK_MAIL_RECIPIENT_ALLOWLIST=', 'RANGERBOOK_MAIL_RECIPIENT_ALLOWLIST=' + recipient)
    template += '\nRANGERBOOK_STAGE_EXPIRES_AT=' + str(int(time.time()) + 86400) + '\n'
    (ROOT / 'runtime.env').write_text(template)
    (ROOT / 'key.env').write_text('RANGERBOOK_MEMBER_KEY=' + Fernet.generate_key().decode() + '\nAWS_TOKEN=' + secrets.token_urlsafe(48) + '\n')
    for key in list(os.environ):
        if key.startswith('RANGERBOOK_'):
            del os.environ[key]
    for line in template.splitlines():
        if line and not line.startswith('#'):
            key, value = line.split('=', 1)
            os.environ[key] = value
    os.environ['RANGERBOOK_MEMBERS_V2'] = '0'
    import app as host
    host.startup()
    credentials = {'entrance_user': 'rangerbook-test', 'entrance_password': secrets.token_urlsafe(24), 'accounts': []}
    with host.db() as con:
        for role in ['user', 'admin', 'super_admin']:
            account, password = 'stage-' + role.replace('_', '-'), secrets.token_urlsafe(24)
            con.execute('INSERT INTO users(id,account,password_hash,role,admin_application_status,created_at) VALUES (?,?,?,?,?,?)',
                ('usr_' + secrets.token_hex(12), account, host.PASSWORD_HASHER.hash(password), role,
                 'rejected' if role == 'user' else 'approved', host.isoformat()))
            credentials['accounts'].append({'account': account, 'role': role, 'password': password})
    from membership.manage import migrate_database
    migrate_database(ROOT / 'auth.db', ROOT / 'backups' / 'pre-v2.db')
    with sqlite3.connect(ROOT / 'auth.db') as con:
        assert con.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    hashed = subprocess.run(['openssl', 'passwd', '-6', '-stdin'], input=credentials['entrance_password']+'\n',
        text=True, capture_output=True, check=True).stdout.strip()
    gate = Path('/etc/nginx/rangerbook-membership-test.htpasswd')
    with gate.open('x') as handle:
        handle.write(credentials['entrance_user'] + ':' + hashed + '\n')
    gate.chmod(0o640)
    os.chown(gate, 0, grp.getgrnam('www-data').gr_gid)
    owner = pwd.getpwnam('ubuntu')
    for item in [ROOT, *ROOT.rglob('*')]:
        os.chown(item, owner.pw_uid, owner.pw_gid)
        item.chmod(0o700 if item.is_dir() else 0o600)
    # Root-only operator handoff. Neither web root nor application logs contain it.
    handoff = ROOT / 'operator-credentials.json'
    handoff.write_text(json.dumps(credentials, indent=2) + '\n')
    handoff.chmod(0o600)
    print(json.dumps({'synthetic_accounts': 3, 'migration': 'ok', 'backup': 'ok', 'credentials_printed': False}))


if __name__ == '__main__':
    main()
