"""Additive SQLite migration. Existing accounts, hashes and sessions are preserved."""
import os
import sqlite3
from pathlib import Path

COLUMNS = {
    'users': {
        'email': 'TEXT', 'email_verified': 'INTEGER NOT NULL DEFAULT 0',
        'account_active': 'INTEGER NOT NULL DEFAULT 1', 'google_sub': 'TEXT',
        'recovery_email': 'TEXT', 'totp_secret': 'TEXT',
        'totp_last_step': 'INTEGER NOT NULL DEFAULT -1',
    },
    'sessions': {'mfa_verified': 'INTEGER NOT NULL DEFAULT 0', 'reauth_until': 'REAL NOT NULL DEFAULT 0'},
}
DDL = [
    'CREATE UNIQUE INDEX IF NOT EXISTS member_email ON users(email COLLATE NOCASE) WHERE email IS NOT NULL',
    'CREATE UNIQUE INDEX IF NOT EXISTS member_google ON users(google_sub) WHERE google_sub IS NOT NULL',
    'CREATE UNIQUE INDEX IF NOT EXISTS member_recovery_email ON users(recovery_email COLLATE NOCASE) WHERE recovery_email IS NOT NULL',
    '''CREATE TABLE IF NOT EXISTS member_tokens (
       digest TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       kind TEXT NOT NULL, email TEXT, expires REAL NOT NULL)''',
    '''CREATE TABLE IF NOT EXISTS member_totp_setup (
       session_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
       secret TEXT NOT NULL, expires REAL NOT NULL)''',
    '''CREATE TABLE IF NOT EXISTS member_recovery_codes (
       user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, digest TEXT NOT NULL,
       PRIMARY KEY(user_id,digest))''',
    '''CREATE TABLE IF NOT EXISTS member_oauth (
       state_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       session_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
       nonce TEXT NOT NULL, verifier TEXT NOT NULL, expires REAL NOT NULL)''',
    '''CREATE TABLE IF NOT EXISTS member_audit (
       id INTEGER PRIMARY KEY, user_id TEXT, event TEXT NOT NULL, created REAL NOT NULL)''',
    '''CREATE TABLE IF NOT EXISTS member_outbox (
       id TEXT PRIMARY KEY, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
       next_attempt REAL NOT NULL, lease_until REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending',
       ses_id TEXT)''',
    '''CREATE TABLE IF NOT EXISTS member_suppression (email TEXT PRIMARY KEY COLLATE NOCASE, reason TEXT NOT NULL)''',
    '''CREATE TABLE IF NOT EXISTS member_migrations (version INTEGER PRIMARY KEY, applied TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)''',
]


def migrate(connection):
    """Caller must have a verified backup before a production invocation."""
    connection.execute('BEGIN IMMEDIATE')
    for table, columns in COLUMNS.items():
        present = {row[1] for row in connection.execute('PRAGMA table_info(' + table + ')')}
        for name, definition in columns.items():
            if name not in present:
                connection.execute(f'ALTER TABLE {table} ADD COLUMN {name} {definition}')
    for statement in DDL:
        connection.execute(statement)
    connection.execute('INSERT OR IGNORE INTO member_migrations(version) VALUES (2)')


def backup(source, target):
    """SQLite online backup API includes WAL state; never copies a live .db file."""
    target = Path(target)
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    with sqlite3.connect(f'file:{Path(source).resolve()}?mode=ro', uri=True) as src, sqlite3.connect(target) as dst:
        src.backup(dst)
        if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Backup integrity check failed')
    os.chmod(target, 0o600)
