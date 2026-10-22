"""Public CI checks; the private deployed-source integration suite is separate."""
import os
import sqlite3
from pathlib import Path

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException

from membership.schema import migrate, backup
from membership.manage import migrate_database, recover
from membership.service import Membership, email_value, gmail, install


def legacy(path):
    with sqlite3.connect(path) as con:
        con.executescript('''CREATE TABLE users(id TEXT PRIMARY KEY, account TEXT UNIQUE, password_hash TEXT, role TEXT);
          CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE);
          CREATE TABLE game_account_bindings(user_id TEXT PRIMARY KEY,game_uid TEXT UNIQUE);
          INSERT INTO users VALUES ('synthetic','test','argon2-fixture','super_admin');
          INSERT INTO sessions VALUES ('hash-only','synthetic');
          INSERT INTO game_account_bindings VALUES ('synthetic','game-fixture');''')


def test_additive_migration_backup_restore(tmp_path):
    database=tmp_path/'test.db';legacy(database)
    target=tmp_path/'backup'/'test.db'
    migrate_database(database,target)
    with sqlite3.connect(database) as con:
        migrate(con)
    with sqlite3.connect(database) as con:
        assert con.execute('SELECT password_hash,role FROM users').fetchone()==('argon2-fixture','super_admin')
        assert con.execute('SELECT count(*) FROM sessions').fetchone()[0]==1
        assert con.execute('SELECT count(*) FROM game_account_bindings').fetchone()[0]==1
    assert target.stat().st_mode&0o777==0o600
    with sqlite3.connect(target) as con:
        assert 'totp_secret' not in {r[1] for r in con.execute('PRAGMA table_info(users)')}


def test_backup_does_not_overwrite(tmp_path):
    database=tmp_path/'test.db';legacy(database);target=tmp_path/'backup.db'
    backup(database,target)
    with pytest.raises(FileExistsError):backup(database,target)


def test_operator_recovery_only_enrollment_and_audit(tmp_path):
    database=tmp_path/'test.db';legacy(database)
    with sqlite3.connect(database) as con:migrate(con)
    recover(database,'test','test-ticket')
    with sqlite3.connect(database) as con:
        assert con.execute('SELECT role,password_hash,totp_secret FROM users').fetchone()==('super_admin','argon2-fixture',None)
        assert con.execute('SELECT count(*) FROM sessions').fetchone()[0]==0
        assert con.execute('SELECT count(*) FROM member_audit').fetchone()[0]==1


@pytest.mark.parametrize('value',['bad','x@y','<img>@example.test','x@a\n.com'])
def test_email_validation(value):
    with pytest.raises(HTTPException):email_value(value)


def test_google_aliases():
    assert email_value('Test.Name+tag@Googlemail.com')=='testname@gmail.com'
    assert email_value('user@example.test')=='user@example.test'


def test_feature_off_has_no_mutation(monkeypatch):
    monkeypatch.delenv('RANGERBOOK_MEMBERS_V2',raising=False)
    assert install(object()) is None
