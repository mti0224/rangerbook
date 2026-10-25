"""Restricted directory metadata; never expose Google identities or credentials."""
from datetime import datetime, timezone


def account_directory(host):
    with host.db() as con:
        rows = con.execute('SELECT * FROM users ORDER BY CASE role WHEN \'super_admin\' THEN 0 WHEN \'admin\' THEN 1 ELSE 2 END, account COLLATE NOCASE').fetchall()
        # Completed logins survive logout/password changes in the audit log.
        logins = {row['user_id']: row['last_login'] for row in con.execute(
            "SELECT user_id, MAX(created) AS last_login FROM member_audit WHERE event='login_completed' GROUP BY user_id")}
        # Existing, fully authorized sessions provide a baseline for older accounts.
        sessions = {row['user_id']: row['last_login'] for row in con.execute('''
            SELECT s.user_id, MAX(s.created_at) AS last_login FROM sessions s JOIN users u ON u.id=s.user_id
            WHERE s.mfa_verified=1 OR (u.totp_secret IS NULL AND u.role<>'super_admin' AND u.must_change_password=0)
            GROUP BY s.user_id''')}
    items = []
    for row in rows:
        last = logins.get(row['id'])
        recorded = datetime.fromtimestamp(last, timezone.utc).isoformat() if last is not None else None
        baseline = sessions.get(row['id'])
        if baseline and (not recorded or datetime.fromisoformat(baseline.replace('Z', '+00:00')) > datetime.fromisoformat(recorded)):
            recorded = baseline
        items.append({**host.public_user(row), 'last_login_at': recorded, 'google_linked': bool(row['google_sub'])})
    return {'items': items}
