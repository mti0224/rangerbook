"""Directory metadata uses synthetic records and exposes only public fields."""
from contextlib import contextmanager
from types import SimpleNamespace
import sqlite3

from membership.admin_directory import account_directory


def test_directory_completed_logins_and_google_status(tmp_path):
    database = tmp_path / 'test.db'
    @contextmanager
    def db():
        with sqlite3.connect(database) as con:
            con.row_factory = sqlite3.Row
            yield con
    with db() as con:
        con.executescript('''
          CREATE TABLE users(id TEXT, account TEXT, role TEXT, totp_secret TEXT, must_change_password INTEGER, google_sub TEXT);
          CREATE TABLE sessions(user_id TEXT, created_at TEXT, mfa_verified INTEGER);
          CREATE TABLE member_audit(user_id TEXT, event TEXT, created REAL);
          INSERT INTO users VALUES ('a','alpha','user',NULL,0,'private-sub'), ('b','beta','super_admin','encrypted',0,NULL), ('c','gamma','user',NULL,0,NULL);
          INSERT INTO sessions VALUES ('a','2026-01-01T00:00:00+00:00',0), ('b','2026-10-01T00:00:00+00:00',0);
          INSERT INTO member_audit VALUES ('a','login_completed',1767312000), ('b','password_login',1790812800);
        ''')
    host = SimpleNamespace(db=db, public_user=lambda row:{'id':row['id'],'account':row['account'],'role':row['role']})
    result = {x['id']:x for x in account_directory(host)['items']}
    assert result['a']['google_linked'] is True
    assert result['a']['last_login_at'] == '2026-01-02T00:00:00+00:00'
    assert result['b']['last_login_at'] is None  # Password-only MFA challenge is not a login.
    assert result['b']['google_linked'] is False
    assert result['c']['last_login_at'] is None
    assert all(set(row)=={'id','account','role','last_login_at','google_linked'} for row in result.values())
