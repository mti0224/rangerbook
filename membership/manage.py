"""Explicit offline migration and audited operator recovery. Never run from an API."""
import argparse
import os
import sqlite3
import time
from pathlib import Path

from .schema import backup, migrate


def migrate_database(database, backup_path):
    backup(database, backup_path)
    with sqlite3.connect(database) as con:
        before = con.execute('SELECT id,password_hash,role FROM users ORDER BY id').fetchall()
        session_count = con.execute('SELECT count(*) FROM sessions').fetchone()[0]
        bindings = con.execute('SELECT * FROM game_account_bindings ORDER BY user_id').fetchall()
        migrate(con)
        if (before != con.execute('SELECT id,password_hash,role FROM users ORDER BY id').fetchall() or
            session_count != con.execute('SELECT count(*) FROM sessions').fetchone()[0] or
            bindings != con.execute('SELECT * FROM game_account_bindings ORDER BY user_id').fetchall()):
            raise RuntimeError('Migration changed existing identity data')
        if con.execute('PRAGMA integrity_check').fetchone()[0] != 'ok' or con.execute('PRAGMA foreign_key_check').fetchall():
            raise RuntimeError('Database validation failed')
    os.chmod(database, 0o600)


def recover(database, account, ticket):
    """Operator must verify ownership out of band and record the ticket first.
    Revokes all sessions; next password login is restricted to mandatory enrollment.
    No password is printed and no unrestricted session is created.
    """
    with sqlite3.connect(database) as con:
        con.execute('PRAGMA foreign_keys=ON')
        con.execute('BEGIN IMMEDIATE')
        user = con.execute('SELECT id FROM users WHERE account=? COLLATE NOCASE', (account,)).fetchone()
        if not user:
            raise ValueError('Account not found')
        uid = user[0]
        con.execute('UPDATE users SET totp_secret=NULL,totp_last_step=-1 WHERE id=?', (uid,))
        con.execute('DELETE FROM member_recovery_codes WHERE user_id=?', (uid,))
        con.execute('DELETE FROM sessions WHERE user_id=?', (uid,))
        con.execute('INSERT INTO member_audit(user_id,event,created) VALUES (?,?,?)',
                    (uid, 'operator_totp_reenroll:' + ticket + ':uid=' + str(os.getuid()), time.time()))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['migrate','recover-totp'])
    parser.add_argument('database', type=Path)
    parser.add_argument('--backup', type=Path, required=True)
    parser.add_argument('--account')
    parser.add_argument('--ticket')
    args = parser.parse_args()
    if args.action == 'migrate':
        migrate_database(args.database, args.backup)
    else:
        if not args.account or not args.ticket:
            parser.error('Recovery requires --account and an approved --ticket reference')
        backup(args.database, args.backup)
        recover(args.database, args.account, args.ticket)
    print('Completed. Backup verified; no secrets displayed.')


if __name__ == '__main__':
    main()
