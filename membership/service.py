"""Additive integration with the existing FastAPI/Argon2/cookie service.

No game endpoints, credentials or production data belong in this module.
"""
import base64
import hashlib
import hmac
import io
import json
import math
import os
import re
import secrets
import sqlite3
import time
import uuid
from urllib.parse import urlencode
from typing import Literal

import jwt
import pyotp
import qrcode
import requests
from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

from .schema import migrate

GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
GOOGLE_KEYS = 'https://www.googleapis.com/oauth2/v3/certs'
GENERIC = {'ok': True, 'message_key': 'member.checkEmail'}


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def gmail(value):
    """Google consumer aliases must not bypass uniqueness checks."""
    value = value.strip().lower()
    local, domain = value.rsplit('@', 1)
    if domain in {'gmail.com', 'googlemail.com'}:
        return local.split('+', 1)[0].replace('.', '') + '@gmail.com'
    return value


def email_value(value):
    value = value.strip().lower()
    if len(value) > 254 or not re.fullmatch(r'[^\s@<>\x00-\x1f]+@[^\s@<>\x00-\x1f]+\.[^\s@<>\x00-\x1f]+', value):
        raise HTTPException(422, 'member.invalidEmail')
    return gmail(value)


class Payload(BaseModel):
    model_config = ConfigDict(extra='forbid')


class PasswordProof(Payload):
    password: str = Field(min_length=1, max_length=128)
    code: str = Field(default='', max_length=64)


class Code(Payload):
    code: str = Field(min_length=1, max_length=64)


class Register(Payload):
    account: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=10, max_length=128)
    email: str = Field(min_length=3, max_length=254)
    captcha: str = Field(min_length=1, max_length=2048)


class Identifier(Payload):
    identifier: str = Field(min_length=1, max_length=254)


class Rescue(Identifier):
    source: Literal['registration', 'google'] = 'registration'


class ActionProof(Payload):
    code: str = Field(default='', max_length=64)


class Token(Payload):
    token: str = Field(min_length=32, max_length=128)


class Reset(Token):
    password: str = Field(min_length=10, max_length=128)


class Membership:
    def __init__(self, host):
        self.h = host
        self.app = host.app
        # Fail closed at startup: never silently run mandatory 2FA without encryption.
        self.cipher = Fernet(os.environ['RANGERBOOK_MEMBER_KEY'].encode())
        self.frontend = os.environ.get('RANGERBOOK_FRONTEND_URL', 'https://rangerbook.warmycat.com').rstrip('/')
        if not self.frontend.startswith('https://') or self.frontend not in host.ALLOWED_ORIGINS:
            raise RuntimeError('Frontend must be a configured HTTPS origin')
        self.google_id = os.environ.get('RANGERBOOK_GOOGLE_CLIENT_ID', '')
        self.google_secret = os.environ.get('RANGERBOOK_GOOGLE_CLIENT_SECRET', '')
        self.callback = os.environ.get('RANGERBOOK_GOOGLE_REDIRECT_URI', '')
        self.turnstile_key = os.environ.get('RANGERBOOK_TURNSTILE_SECRET', '')
        self.turnstile_site = os.environ.get('RANGERBOOK_TURNSTILE_SITE_KEY', '')
        self.mail_enabled = os.environ.get('RANGERBOOK_MAIL_ENABLED') == '1'
        self.jwks = jwt.PyJWKClient(GOOGLE_KEYS, timeout=5)

    def seal(self, value):
        return self.cipher.encrypt(value.encode()).decode()

    def open(self, value):
        return self.cipher.decrypt(value.encode()).decode()

    def audit(self, con, uid, event):
        con.execute('INSERT INTO member_audit(user_id,event,created) VALUES (?,?,?)', (uid, event, time.time()))

    def session_id(self, request):
        return self.h.session_hash(request.cookies.get(self.h.SESSION_COOKIE, ''))

    def raw(self, request: Request):
        user = self.h.lookup_session_user(request)
        if not user or not user['account_active']:
            raise HTTPException(401, 'member.loginRequired')
        return user

    def full(self, request: Request):
        user = self.raw(request)
        with self.h.db() as con:
            session = con.execute('SELECT * FROM sessions WHERE token_hash=?', (self.session_id(request),)).fetchone()
        if (user['totp_secret'] or user['role'] == 'super_admin') and not session['mfa_verified']:
            raise HTTPException(403, 'member.mfaRequired')
        # A super admin with no enrolled factor can never get a full session.
        if user['role'] == 'super_admin' and not user['totp_secret']:
            raise HTTPException(403, 'member.setupRequired')
        if user['must_change_password'] and request.url.path != '/auth/change-password':
            raise HTTPException(403, 'member.passwordRequired')
        return user

    def state(self, request):
        try:
            user = self.raw(request)
        except HTTPException:
            return {'logged_in': False, 'role': 'user'}
        try:
            self.full(request)
        except HTTPException:
            return {'logged_in': False, 'role': 'user', 'account': user['account'],
                    'mfa_required': bool(user['totp_secret']),
                    'setup_required': user['role'] == 'super_admin' and not user['totp_secret'],
                    'must_change_password': bool(user['must_change_password'])}
        return {'logged_in': True, **self.h.public_user(user)}

    def rate(self, request, action, subject, **kw):
        try:
            self.h.limit_auth(request, 'v2-' + action, str(subject), **kw)
        except HTTPException as error:
            if error.status_code != 429:
                raise
            wait = self.rate_wait(request, action, subject, **kw)
            raise HTTPException(429, 'member.rateLimited', headers={'Retry-After': str(max(1, wait))}) from None

    def rate_wait(self, request, action, subject, ip_limit=30, subject_limit=20, window=900):
        """Report the existing limiter's remaining window without consuming attempts."""
        now, wait = time.time(), 0
        ip = request.client.host if request.client else 'unknown'
        with self.h.db() as con:
            for column, value, limit in [('ip_hash', digest(ip), ip_limit),
                                          ('subject_hash', digest(str(subject).casefold()), subject_limit)]:
                row = con.execute(f'SELECT created_at FROM auth_rate_events WHERE action=? AND {column}=? AND created_at>? ORDER BY created_at DESC LIMIT 1 OFFSET ?',
                                  ('v2-' + action, value, now - window, limit - 1)).fetchone()
                if row:
                    wait = max(wait, math.ceil(row[0] + window - now))
        return wait

    def password(self, user, password):
        try:
            self.h.PASSWORD_HASHER.verify(user['password_hash'], password)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(401, 'member.badProof') from None

    def factor(self, con, user, code):
        """Atomic replay prevention, including concurrently submitted recovery codes."""
        if not user['totp_secret']:
            raise HTTPException(403, 'member.setupRequired')
        totp = pyotp.TOTP(self.open(user['totp_secret']))
        step = int(time.time()) // 30
        for candidate in [step, step - 1, step + 1]:
            if hmac.compare_digest(totp.at(candidate * 30), code):
                changed = con.execute('UPDATE users SET totp_last_step=? WHERE id=? AND totp_last_step<?',
                                      (candidate, user['id'], candidate)).rowcount
                if changed:
                    return
                raise HTTPException(401, 'member.badProof')
        if con.execute('DELETE FROM member_recovery_codes WHERE user_id=? AND digest=?',
                       (user['id'], digest(code.replace('-', '').upper()))).rowcount:
            self.audit(con, user['id'], 'recovery_code_used')
            return
        raise HTTPException(401, 'member.badProof')

    def reauth(self, request, user, payload):
        self.h.require_trusted_origin(request)
        self.rate(request, 'reauth', user['id'], subject_limit=5)
        self.password(user, payload.password)
        # Resolve the full session before the write transaction; the legacy
        # lookup updates last_seen_at and therefore needs its own writer lock.
        if user['totp_secret']:
            self.full(request)
        with self.h.db() as con:
            con.execute('BEGIN IMMEDIATE')
            con.execute('UPDATE sessions SET reauth_until=? WHERE token_hash=?', (time.time() + 600, self.session_id(request)))
            self.audit(con, user['id'], 'reauthenticated')

    def recent(self, request, user):
        self.h.require_trusted_origin(request)
        with self.h.db() as con:
            row = con.execute('SELECT reauth_until FROM sessions WHERE token_hash=?', (self.session_id(request),)).fetchone()
        if not row or row[0] < time.time():
            raise HTTPException(403, 'member.reauthRequired')

    def codes(self, con, uid):
        values = [secrets.token_hex(10).upper() for _ in range(10)]
        con.execute('DELETE FROM member_recovery_codes WHERE user_id=?', (uid,))
        con.executemany('INSERT INTO member_recovery_codes VALUES (?,?)', [(uid, digest(v)) for v in values])
        return values

    def queue(self, con, email, kind, token=None):
        if not self.mail_enabled and kind != 'security':
            raise HTTPException(503, 'member.unconfigured')
        # A global cap is also enforced; failures cannot become an SES flood.
        if con.execute("SELECT COUNT(*) FROM member_outbox WHERE next_attempt>?", (time.time() - 86400,)).fetchone()[0] >= 100:
            raise HTTPException(429, 'member.rateLimited')
        data = {'email': email, 'kind': kind, 'token': token, 'frontend': self.frontend, 'expires': time.time() + 900 if token else None}
        con.execute('INSERT INTO member_outbox(id,payload,next_attempt) VALUES (?,?,?)',
                    (secrets.token_hex(16), self.seal(json.dumps(data)), time.time()))

    def issue(self, con, uid, kind, email):
        token = secrets.token_urlsafe(48)
        con.execute('DELETE FROM member_tokens WHERE user_id=? AND kind=?', (uid, kind))
        con.execute('INSERT INTO member_tokens VALUES (?,?,?,?,?)', (digest(token), uid, kind, email, time.time() + 900))
        self.queue(con, email, kind, token)

    def take(self, con, token, kind):
        row = con.execute('DELETE FROM member_tokens WHERE digest=? AND kind=? AND expires>? RETURNING *',
                          (digest(token), kind, time.time())).fetchone()
        if not row:
            raise HTTPException(400, 'member.invalidLink')
        return row

    def captcha(self, token, request):
        if not (self.turnstile_key and self.turnstile_site):
            raise HTTPException(503, 'member.unconfigured')
        try:
            response = requests.post('https://challenges.cloudflare.com/turnstile/v0/siteverify',
                data={'secret': self.turnstile_key, 'response': token,
                      'remoteip': request.client.host, 'idempotency_key': str(uuid.uuid4())}, timeout=5)
            response.raise_for_status()
            data = response.json()
        except (requests.RequestException, ValueError):
            raise HTTPException(503, 'member.unavailable') from None
        from urllib.parse import urlparse
        if data.get('success') is not True or data.get('hostname') != urlparse(self.frontend).hostname or data.get('action') != 'register':
            raise HTTPException(400, 'member.captchaFailed')

    def google_claims(self, token, nonce):
        key = self.jwks.get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key, algorithms=['RS256'], audience=self.google_id,
                            issuer=['https://accounts.google.com', 'accounts.google.com'],
                            options={'require': ['exp', 'iat', 'iss', 'aud', 'sub', 'nonce', 'email', 'email_verified']})
        if (not isinstance(claims['sub'], str) or not claims['sub'] or len(claims['sub']) > 255 or
            claims['email_verified'] is not True or not hmac.compare_digest(str(claims['nonce']), nonce) or
            claims.get('azp', self.google_id) != self.google_id):
            raise ValueError('Invalid Google claims')
        email = email_value(claims['email'])
        return claims['sub'], email

    def install(self):
        h, app = self.h, self.app
        # Pages and the API use separate origins; browsers need explicit access
        # to the cooldown header while existing CORS origin rules stay intact.
        for layer in app.user_middleware:
            if layer.cls is CORSMiddleware:
                layer.kwargs['expose_headers'] = sorted(set(layer.kwargs.get('expose_headers', [])) | {'Retry-After'})
        with h.db() as con:
            try:
                ready = con.execute('SELECT 1 FROM member_migrations WHERE version=2').fetchone()
            except sqlite3.OperationalError:
                ready = None
            if not ready:
                raise RuntimeError('Run python -m membership.manage migrate with a verified backup first')
        if os.environ.get('RANGERBOOK_STAGE') == '1':
            import game_binding
            from .stage.storage_compat import configure
            configure(game_binding)
        app.dependency_overrides[h.require_user] = self.full
        old_paths = {'/auth/register', '/auth/login', '/auth/me'}
        app.router.routes[:] = [route for route in app.router.routes if getattr(route, 'path', '') not in old_paths]
        full, raw = self.full, self.raw

        @app.get('/auth/features')
        def features():
            return {'members_v2': True, 'google': bool(self.google_id and self.google_secret and self.callback),
                    'registration': bool(self.turnstile_key and self.turnstile_site and self.mail_enabled),
                    'turnstile_site_key': self.turnstile_site,
                    'member_navigation': os.environ.get('RANGERBOOK_MEMBER_NAVIGATION') == '1'}

        @app.get('/auth/me')
        def me(request: Request):
            return self.state(request)

        @app.post('/auth/login')
        def login(payload: h.Credentials, request: Request):
            h.require_trusted_origin(request)
            account = h.normalize_account(payload.account)
            self.rate(request, 'login', account)
            with h.db() as con:
                user = con.execute('SELECT * FROM users WHERE account=? COLLATE NOCASE', (account,)).fetchone()
            self.password(user or {'password_hash': h.DUMMY_PASSWORD_HASH}, payload.password)
            if not user or not user['account_active']:
                raise HTTPException(401, 'member.badProof')
            token = h.create_session(user['id'])
            # Password-only sessions for enrolled users and all super admins are short lived.
            if user['totp_secret'] or user['role'] == 'super_admin':
                from datetime import timedelta
                with h.db() as con:
                    con.execute('UPDATE sessions SET expires_at=? WHERE token_hash=?',
                                (h.isoformat(h.utc_now() + timedelta(minutes=10)), digest(token)))
            with h.db() as con:
                self.audit(con, user['id'], 'password_login')
            response = JSONResponse({'logged_in': not (user['totp_secret'] or user['role'] == 'super_admin'),
                'account': user['account'], 'role': 'user' if user['totp_secret'] or user['role'] == 'super_admin' else user['role'],
                'mfa_required': bool(user['totp_secret']),
                'setup_required': user['role'] == 'super_admin' and not user['totp_secret'],
                'must_change_password': bool(user['must_change_password'])})
            h.set_session_cookie(response, token)
            return response

        @app.post('/auth/reauth')
        def reauth(payload: PasswordProof, request: Request, user=Depends(raw)):
            self.reauth(request, user, payload)
            return {'ok': True, 'reauth_valid_for': 600}

        @app.get('/auth/security')
        def security(request: Request, user=Depends(raw)):
            with h.db() as con:
                session = con.execute('SELECT reauth_until FROM sessions WHERE token_hash=?', (self.session_id(request),)).fetchone()
            if not session:
                raise HTTPException(401, 'member.loginRequired')
            return {'totp_enabled': bool(user['totp_secret']), 'totp_required': user['role'] == 'super_admin',
                    'google_email': user['recovery_email'] if self.state(request)['logged_in'] else None, 'email_verified': bool(user['email_verified']),
                    'reauth_valid_for': max(0, int(session['reauth_until'] - time.time())),
                    'reauth_retry_after': self.rate_wait(request, 'reauth', user['id'], subject_limit=5)}

        @app.post('/auth/2fa/verify')
        def verify(payload: Code, request: Request, user=Depends(raw)):
            h.require_trusted_origin(request)
            self.rate(request, 'factor', user['id'], subject_limit=5)
            with h.db() as con:
                con.execute('BEGIN IMMEDIATE')
                self.factor(con, user, payload.code)
                self.audit(con, user['id'], 'factor_verified')
            # Rotate the cookie after privilege elevation, never promote the challenge cookie.
            return self.promote(request, user)

        @app.post('/auth/2fa/setup')
        def setup(request: Request, user=Depends(raw)):
            self.recent(request, user)
            if user['totp_secret']:
                raise HTTPException(409, 'member.alreadyEnabled')
            secret = pyotp.random_base32()
            uri = pyotp.TOTP(secret).provisioning_uri(name=user['account'], issuer_name='Rangerbook')
            image = qrcode.make(uri)
            buf = io.BytesIO()
            image.save(buf, format='PNG')
            with h.db() as con:
                con.execute('INSERT OR REPLACE INTO member_totp_setup VALUES (?,?,?)',
                            (self.session_id(request), self.seal(secret), time.time() + 600))
            return {'qr': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode(), 'manual_key': secret}

        @app.post('/auth/2fa/enable')
        def enable(payload: Code, request: Request, user=Depends(raw)):
            self.recent(request, user)
            self.rate(request, 'factor', user['id'], subject_limit=5)
            with h.db() as con:
                con.execute('BEGIN IMMEDIATE')
                setup = con.execute('SELECT * FROM member_totp_setup WHERE session_hash=? AND expires>?',
                                    (self.session_id(request), time.time())).fetchone()
                if not setup or user['totp_secret'] or not pyotp.TOTP(self.open(setup['secret'])).verify(payload.code, valid_window=0):
                    raise HTTPException(400, 'member.badProof')
                changed = con.execute('UPDATE users SET totp_secret=?,totp_last_step=? WHERE id=? AND totp_secret IS NULL',
                            (setup['secret'], int(time.time()) // 30, user['id'])).rowcount
                if not changed:
                    raise HTTPException(409, 'member.alreadyEnabled')
                codes = self.codes(con, user['id'])
                con.execute('DELETE FROM member_totp_setup WHERE session_hash=?', (self.session_id(request),))
                con.execute('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', (user['id'], self.session_id(request)))
                self.audit(con, user['id'], 'totp_enabled')
            return self.promote(request, user, {'recovery_codes': codes})

        @app.post('/auth/2fa/recovery-codes')
        def recovery(payload: ActionProof, request: Request, user=Depends(full)):
            self.recent(request, user)
            if not user['totp_secret']:
                raise HTTPException(403, 'member.setupRequired')
            self.rate(request, 'factor', user['id'], subject_limit=5)
            with h.db() as con:
                con.execute('BEGIN IMMEDIATE')
                self.factor(con, user, payload.code)
                codes = self.codes(con, user['id'])
                self.audit(con, user['id'], 'recovery_codes_replaced')
            return {'recovery_codes': codes}

        @app.post('/auth/2fa/disable')
        def disable(payload: Code, request: Request, user=Depends(full)):
            self.recent(request, user)
            if user['role'] == 'super_admin':
                raise HTTPException(403, 'member.mandatory2fa')
            self.rate(request, 'factor', user['id'], subject_limit=5)
            with h.db() as con:
                con.execute('BEGIN IMMEDIATE')
                self.factor(con, user, payload.code)
                con.execute('UPDATE users SET totp_secret=NULL,totp_last_step=-1 WHERE id=?', (user['id'],))
                con.execute('DELETE FROM member_recovery_codes WHERE user_id=?', (user['id'],))
                con.execute('DELETE FROM sessions WHERE user_id=?', (user['id'],))
                self.audit(con, user['id'], 'totp_disabled')
            return {'ok': True}

        @app.post('/auth/2fa/cancel')
        def cancel_setup(request: Request, user=Depends(raw)):
            h.require_trusted_origin(request)
            with h.db() as con:
                con.execute('DELETE FROM member_totp_setup WHERE session_hash=?', (self.session_id(request),))
            return {'ok': True}

        @app.post('/auth/register')
        def register(payload: Register, request: Request):
            h.require_trusted_origin(request)
            if not self.mail_enabled:
                raise HTTPException(503, 'member.unconfigured')
            account, email = h.normalize_account(payload.account), email_value(payload.email)
            self.rate(request, 'register', account, ip_limit=5, subject_limit=3, window=3600)
            self.rate(request, 'register-email', email, ip_limit=5, subject_limit=3, window=3600)
            self.captcha(payload.captcha, request)
            h.validate_password(payload.password)
            hashed = h.PASSWORD_HASHER.hash(payload.password)
            with h.db() as con:
                con.execute('BEGIN IMMEDIATE')
                uid = 'usr_' + secrets.token_hex(12)
                exists = con.execute('SELECT 1 FROM users WHERE account=? COLLATE NOCASE OR email=? COLLATE NOCASE OR recovery_email=? COLLATE NOCASE', (account, email, email)).fetchone()
                if not exists:
                    # Existing schema has no "none" application status: rejected means no active application.
                    con.execute("INSERT INTO users(id,account,password_hash,role,admin_application_status,created_at,email,account_active) VALUES (?,?,?,'user','rejected',?,?,0)", (uid, account, hashed, h.isoformat(), email))
                    self.issue(con, uid, 'verify', email)
                    self.audit(con, uid, 'registration_requested')
            return JSONResponse(GENERIC, status_code=202)

        @app.post('/auth/email/resend')
        def resend(payload: Identifier, request: Request):
            h.require_trusted_origin(request)
            self.rate(request, 'resend', payload.identifier, ip_limit=10, subject_limit=3, window=3600)
            with h.db() as con:
                user = con.execute('SELECT * FROM users WHERE account=? COLLATE NOCASE OR email=? COLLATE NOCASE', (payload.identifier, payload.identifier)).fetchone()
                if user and not user['account_active']:
                    token = con.execute("SELECT expires FROM member_tokens WHERE user_id=? AND kind='verify'", (user['id'],)).fetchone()
                    if not token or token[0] < time.time() + 840:
                        self.issue(con, user['id'], 'verify', user['email'])
            return JSONResponse(GENERIC, status_code=202)

        @app.post('/auth/email/verify')
        def confirm(payload: Token, request: Request):
            h.require_trusted_origin(request)
            self.rate(request, 'email-verify', digest(payload.token), ip_limit=20)
            with h.db() as con:
                con.execute('BEGIN IMMEDIATE')
                token = self.take(con, payload.token, 'verify')
                con.execute('UPDATE users SET email_verified=1,account_active=1 WHERE id=?', (token['user_id'],))
                self.audit(con, token['user_id'], 'email_verified')
            return {'ok': True}

        @app.post('/auth/password/forgot')
        def forgot(payload: Rescue, request: Request):
            h.require_trusted_origin(request)
            self.rate(request, 'forgot-ip', 'global', ip_limit=10, subject_limit=100, window=3600)
            # Subject limiting silently suppresses mail; cannot enumerate existing accounts via 429.
            try:
                self.rate(request, 'forgot', payload.identifier, ip_limit=10, subject_limit=3, window=3600)
                with h.db() as con:
                    user = con.execute('SELECT * FROM users WHERE account=? COLLATE NOCASE', (payload.identifier,)).fetchone()
                email = None
                if user:
                    if payload.source == 'registration' and user['email_verified']:
                        email = user['email']
                    elif payload.source == 'google' and user['google_sub']:
                        email = user['recovery_email']
                if email and self.mail_enabled:
                    self.rate(request, 'forgot-email', email, ip_limit=10, subject_limit=3, window=3600)
                    with h.db() as con:
                        # A resend inside 60s must not invalidate a link already in transit.
                        active = con.execute("SELECT expires FROM member_tokens WHERE user_id=? AND kind='reset'", (user['id'],)).fetchone()
                        if not active or active[0] < time.time() + 840:
                            self.issue(con, user['id'], 'reset', email)
            except HTTPException as error:
                if error.status_code not in {429, 503}:
                    raise
            return JSONResponse(GENERIC, status_code=202)

        @app.post('/auth/password/reset/check')
        def check_reset(payload: Token, request: Request):
            h.require_trusted_origin(request)
            self.rate(request, 'reset-check', digest(payload.token), ip_limit=30)
            with h.db() as con:
                token = con.execute("SELECT 1 FROM member_tokens WHERE digest=? AND kind='reset' AND expires>?", (digest(payload.token), time.time())).fetchone()
            if not token:
                raise HTTPException(400, 'member.invalidLink')
            return {'ok': True}

        @app.post('/auth/password/reset')
        def reset(payload: Reset, request: Request):
            h.require_trusted_origin(request)
            self.rate(request, 'reset', digest(payload.token), ip_limit=20)
            h.validate_password(payload.password)
            hashed = h.PASSWORD_HASHER.hash(payload.password)
            with h.db() as con:
                con.execute('BEGIN IMMEDIATE')
                token = self.take(con, payload.token, 'reset')
                con.execute('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?', (hashed, token['user_id']))
                con.execute('DELETE FROM sessions WHERE user_id=?', (token['user_id'],))
                con.execute('DELETE FROM member_oauth WHERE user_id=?', (token['user_id'],))
                self.queue(con, token['email'], 'security')
                self.audit(con, token['user_id'], 'password_reset')
            response = JSONResponse({'ok': True})
            h.clear_session_cookie(response)
            return response

        @app.post('/member/admin-application')
        def apply(request: Request, user=Depends(full)):
            h.require_trusted_origin(request)
            self.rate(request, 'application', user['id'], subject_limit=1, window=86400)
            with h.db() as con:
                con.execute("UPDATE users SET admin_application_status='pending' WHERE id=? AND role='user'", (user['id'],))
                self.audit(con, user['id'], 'admin_application')
            return {'ok': True}

        @app.post('/auth/google/start')
        def google_start(payload: ActionProof, request: Request, user=Depends(full)):
            self.recent(request, user)
            if not (self.google_id and self.google_secret and self.callback):
                raise HTTPException(503, 'member.unconfigured')
            if user['totp_secret']:
                self.rate(request, 'factor', user['id'], subject_limit=5)
                with h.db() as con:
                    con.execute('BEGIN IMMEDIATE')
                    self.factor(con, user, payload.code)
            state, nonce, verifier = (secrets.token_urlsafe(48) for _ in range(3))
            challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
            with h.db() as con:
                con.execute('DELETE FROM member_oauth WHERE user_id=? OR expires<?', (user['id'], time.time()))
                con.execute('INSERT INTO member_oauth VALUES (?,?,?,?,?,?)', (digest(state), user['id'], self.session_id(request), nonce, self.seal(verifier), time.time() + 300))
            return {'url': GOOGLE_AUTH + '?' + urlencode({'client_id': self.google_id, 'redirect_uri': self.callback,
                'response_type': 'code', 'scope': 'openid email', 'state': state, 'nonce': nonce,
                'code_challenge': challenge, 'code_challenge_method': 'S256', 'prompt': 'select_account'})}

        @app.get('/auth/google/callback')
        def google_callback(request: Request, state: str = '', code: str = '', error: str = ''):
            # No submitted redirect URL is ever honored; no tokens leave this backend.
            try:
                user = full(request)
                # OAuth may complete only within the same live password proof.
                with h.db() as con:
                    proof = con.execute('SELECT reauth_until FROM sessions WHERE token_hash=?', (self.session_id(request),)).fetchone()
                if not proof or proof[0] < time.time():
                    raise ValueError('Expired proof')
                if not state or len(state) > 128 or not code or len(code) > 4096 or error:
                    raise ValueError('Invalid callback')
                with h.db() as con:
                    con.execute('BEGIN IMMEDIATE')
                    flow = con.execute('DELETE FROM member_oauth WHERE state_hash=? AND session_hash=? AND user_id=? AND expires>? RETURNING *', (digest(state), self.session_id(request), user['id'], time.time())).fetchone()
                if not flow:
                    raise ValueError('Invalid state')
                response = requests.post(GOOGLE_TOKEN, data={'client_id': self.google_id, 'client_secret': self.google_secret,
                    'code': code, 'code_verifier': self.open(flow['verifier']), 'redirect_uri': self.callback,
                    'grant_type': 'authorization_code'}, timeout=5)
                response.raise_for_status()
                sub, email = self.google_claims(response.json()['id_token'], flow['nonce'])
                with h.db() as con:
                    con.execute('BEGIN IMMEDIATE')
                    live = con.execute('SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>? AND s.reauth_until>? AND u.password_hash=?',
                        (self.session_id(request), user['id'], h.isoformat(), time.time(), user['password_hash'])).fetchone()
                    if not live:
                        raise ValueError('Session changed during authorization')
                    # Also prevent a recovery email from claiming another member's registration email.
                    conflict = con.execute('SELECT 1 FROM users WHERE id<>? AND (email=? COLLATE NOCASE OR recovery_email=? COLLATE NOCASE OR google_sub=?)', (user['id'], email, email, sub)).fetchone()
                    if conflict:
                        raise ValueError('Identity already linked')
                    con.execute('UPDATE users SET google_sub=?,recovery_email=? WHERE id=?', (sub, email, user['id']))
                    con.execute('DELETE FROM member_tokens WHERE user_id=? AND kind=\'reset\'', (user['id'],))
                    self.audit(con, user['id'], 'google_linked')
                return RedirectResponse(self.frontend + '/account/#google=ok', status_code=303)
            except (HTTPException, ValueError, KeyError, requests.RequestException, jwt.PyJWTError, sqlite3.IntegrityError):
                return RedirectResponse(self.frontend + '/account/#google=failed', status_code=303)

        @app.post('/auth/google/unlink')
        def google_unlink(payload: ActionProof, request: Request, user=Depends(full)):
            self.recent(request, user)
            if user['totp_secret']:
                self.rate(request, 'factor', user['id'], subject_limit=5)
            with h.db() as con:
                con.execute('BEGIN IMMEDIATE')
                if user['totp_secret']:
                    self.factor(con, user, payload.code)
                con.execute('UPDATE users SET google_sub=NULL,recovery_email=NULL WHERE id=?', (user['id'],))
                con.execute('DELETE FROM member_tokens WHERE user_id=? AND kind=\'reset\'', (user['id'],))
                con.execute('DELETE FROM member_oauth WHERE user_id=?', (user['id'],))
                self.audit(con, user['id'], 'google_unlinked')
            return {'ok': True}

        # Keep the exact same ownership checks and team calculations. Only change the dependency.
        # FastAPI dependency overrides apply recursively to these captured dependencies.
        app.dependency_overrides[h.require_admin] = self.admin
        app.dependency_overrides[h.require_super_admin] = self.super_admin
        # Re-register personal routes with a member dependency, then remove old duplicates.
        personal = [r for r in app.routes if getattr(r, 'path', '').startswith(('/admin/game-', '/admin/personal-teams'))]
        for route in personal:
            app.router.routes.remove(route)
        start = len(app.routes)
        h.register_game_binding_routes(app, h.db, self.full, h.require_trusted_origin, h.PASSWORD_HASHER, h.limit_auth)
        for route in list(app.routes[start:]):
            app.add_api_route(route.path.replace('/admin/', '/member/', 1), route.endpoint, methods=list(route.methods))
        return self

    def promote(self, request, user, extra=None):
        h = self.h
        from datetime import timedelta
        token = secrets.token_urlsafe(48)
        now = h.isoformat()
        with h.db() as con:
            con.execute('BEGIN IMMEDIATE')
            # A password reset/revocation racing the factor check wins.
            current = con.execute('SELECT 1 FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.password_hash=?',
                (self.session_id(request), now, user['password_hash'])).fetchone()
            if not current:
                raise HTTPException(401, 'member.loginRequired')
            con.execute('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at,mfa_verified) VALUES (?,?,?,?,?,1)',
                (digest(token), user['id'], now, h.isoformat(h.utc_now() + timedelta(days=h.SESSION_DAYS)), now))
            con.execute('DELETE FROM sessions WHERE token_hash=?', (self.session_id(request),))
        response = JSONResponse({'ok': True, **(extra or {})})
        h.set_session_cookie(response, token)
        return response

    def admin(self, request: Request):
        user = self.full(request)
        if user['role'] not in {'admin', 'super_admin'}:
            raise HTTPException(403, 'member.adminRequired')
        return user

    def super_admin(self, request: Request):
        user = self.full(request)
        if user['role'] != 'super_admin':
            raise HTTPException(403, 'member.superRequired')
        return user


def install(host):
    if os.environ.get('RANGERBOOK_MEMBERS_V2') != '1':
        return None
    return Membership(host).install()
