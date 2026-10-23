"""ExecCondition: skip secret resolution unless approved test mail is pending."""
import os
import sqlite3
import time
from pathlib import Path

from .launch import ROOT


def main():
    path = Path(os.environ.get('RANGERBOOK_AUTH_DB', '')).resolve()
    if os.environ.get('RANGERBOOK_STAGE') != '1' or path != ROOT / 'auth.db':
        return 1
    if os.environ.get('RANGERBOOK_MAIL_ENABLED') != '1':
        return 1
    if not os.environ.get('RANGERBOOK_MAIL_RECIPIENT_ALLOWLIST', '').strip():
        return 1
    if time.time() >= float(os.environ.get('RANGERBOOK_STAGE_EXPIRES_AT', '0')):
        return 1
    with sqlite3.connect(f'file:{path}?mode=ro', uri=True) as con:
        exists = con.execute("SELECT 1 FROM sqlite_master WHERE name='member_stage_mail_budget'").fetchone()
        if exists and con.execute('SELECT used FROM member_stage_mail_budget WHERE id=1').fetchone()[0] >= 5:
            return 1
        return 0 if con.execute("SELECT 1 FROM member_outbox WHERE status='pending' AND next_attempt<=? AND lease_until<? LIMIT 1", (time.time(), time.time())).fetchone() else 1


if __name__ == '__main__':
    raise SystemExit(main())
