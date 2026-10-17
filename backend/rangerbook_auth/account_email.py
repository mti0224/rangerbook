"""Email verification and one-time password recovery for Rangerbook Auth.

This module must never return a reset token to browsers or log it.
The sender and public reset URL are server-controlled configuration.
"""
from __future__ import annotations

import hashlib
import logging
import os
import secrets
import sqlite3
import time
from datetime import datetime, timezone
from email.utils import formataddr

from email_validator import EmailNotValidError, validate_email
from fastapi import Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

LOG = logging.getLogger(__name__)
RESET_MINUTES = 30
VERIFY_MINUTES = 30
GENERIC_REPLY = {"ok": True, "message": "若信箱已完成驗證，系統將寄送密碼重設連結。"}
TOKEN_BYTES = 32
FRONTEND_ORIGIN = "https://rangerbook.warmycat.com"


class EmailRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    current_password: str = Field(min_length=1, max_length=128)


class ForgotRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class TokenRequest(BaseModel):
    token: str = Field(min_length=32, max_length=256)


class ResetRequest(TokenRequest):
    new_password: str = Field(min_length=10, max_length=128)


def mail_configured() -> bool:
    return (
        os.getenv("RANGERBOOK_EMAIL_ENABLED", "0") == "1"
        and bool(os.getenv("RANGERBOOK_SES_FROM", "").strip())
    )


def require_mail_configured() -> None:
    if not mail_configured():
        raise HTTPException(503, "電子郵件服務尚未啟用，請稍後再試。")


def normalize_email(value: str) -> str:
    try:
        info = validate_email(value, check_deliverability=False)
        return info.normalized.lower()
    except EmailNotValidError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "電子郵件格式不正確。") from exc


def migrate_email_schema(connection: sqlite3.Connection) -> None:
    columns = {row[1] for row in connection.execute("PRAGMA table_info(users)")}
    for column in ("email", "email_verified_at", "pending_email"):
        if column not in columns:
            connection.execute(f"ALTER TABLE users ADD COLUMN {column} TEXT")
    connection.executescript("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_verified_email
          ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;
        CREATE TABLE IF NOT EXISTS email_action_tokens (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          purpose TEXT NOT NULL CHECK(purpose IN ('verify', 'reset')),
          target_email TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_email_tokens_user
          ON email_action_tokens(user_id, purpose);
        CREATE INDEX IF NOT EXISTS idx_email_tokens_expiry
          ON email_action_tokens(expires_at);
        CREATE TABLE IF NOT EXISTS email_rate_limits (
          action TEXT NOT NULL,
          subject_hash TEXT NOT NULL,
          period_start INTEGER NOT NULL,
          attempts INTEGER NOT NULL,
          PRIMARY KEY(action, subject_hash)
        );
    """)


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _limit(conn: sqlite3.Connection, action: str, subject: str, max_attempts: int) -> bool:
    now = int(time.time())
    key = token_hash(subject.casefold())
    row = conn.execute(
        "SELECT period_start, attempts FROM email_rate_limits WHERE action=? AND subject_hash=?",
        (action, key),
    ).fetchone()
    if not row or now - row["period_start"] >= 3600:
        conn.execute(
            "INSERT OR REPLACE INTO email_rate_limits(action,subject_hash,period_start,attempts)"
            " VALUES(?,?,?,1)", (action, key, now),
        )
        return True
    if row["attempts"] >= max_attempts:
        return False
    conn.execute(
        "UPDATE email_rate_limits SET attempts=attempts+1"
        " WHERE action=? AND subject_hash=?", (action, key),
    )
    return True


def _client_ip(request: Request) -> str:
    # Trust only the address established by the ASGI reverse-proxy configuration.
    return request.client.host if request.client else "unknown"


def _issue(conn: sqlite3.Connection, user_id: str, purpose: str, email: str) -> str:
    value = secrets.token_urlsafe(TOKEN_BYTES)
    now = int(time.time())
    conn.execute(
        "DELETE FROM email_action_tokens WHERE user_id=? AND purpose=?",
        (user_id, purpose),
    )
    conn.execute(
        "INSERT INTO email_action_tokens(token_hash,user_id,purpose,target_email,created_at,expires_at)"
        " VALUES(?,?,?,?,?,?)",
        (token_hash(value), user_id, purpose, email, now, now + 60 * (VERIFY_MINUTES if purpose == "verify" else RESET_MINUTES)),
    )
    return value


def _send_email(address: str, purpose: str, token: str) -> None:
    require_mail_configured()
    import boto3

    sender = os.environ["RANGERBOOK_SES_FROM"].strip()
    region = os.getenv("RANGERBOOK_SES_REGION", "ap-south-1")
    link_base = os.getenv(
        "RANGERBOOK_EMAIL_ACTION_BASE", FRONTEND_ORIGIN + "/admin/"
    )
    # A fixed configured HTTPS origin prevents Host-header poisoning.
    if not link_base.startswith(FRONTEND_ORIGIN + "/"):
        raise RuntimeError("RANGERBOOK_EMAIL_ACTION_BASE must use the configured HTTPS site origin")
    from urllib.parse import quote
    link = link_base + "#email-action=" + quote(purpose) + "&token=" + quote(token)
    is_reset = purpose == "reset"
    title = "Rangerbook 密碼重設" if is_reset else "Rangerbook 電子郵件驗證"
    text_body = (
        "有人申請重設 Rangerbook 帳號密碼。" if is_reset else "請驗證你的 Rangerbook 電子郵件地址。"
    ) + (
        "\n請在 30 分鐘內開啟以下連結（只能使用一次）：\n"
        + link
        + "\n若不是你本人操作，請忽略此郵件。\n"
    )
    boto3.client("sesv2", region_name=region).send_email(
        FromEmailAddress=sender,
        Destination={"ToAddresses": [address]},
        Content={"Simple": {
            "Subject": {"Data": title, "Charset": "UTF-8"},
            "Body": {"Text": {"Data": text_body, "Charset": "UTF-8"}},
        }},
    )


def start_verification(db, user_id: str, email: str, *, request: Request | None = None) -> None:
    require_mail_configured()
    address = normalize_email(email)
    with db() as conn:
        if request and not _limit(conn, "verify_ip", _client_ip(request), 6):
            raise HTTPException(429, "寄送次數過多，請稍後再試。")
        if not _limit(conn, "verify_account", user_id, 3):
            raise HTTPException(429, "寄送次數過多，請稍後再試。")
        occupied = conn.execute(
            "SELECT id FROM users WHERE email=? COLLATE NOCASE AND id<>?",
            (address, user_id),
        ).fetchone()
        if occupied:
            raise HTTPException(409, "此信箱已綁定其他帳號。")
        conn.execute("UPDATE users SET pending_email=? WHERE id=?", (address, user_id))
        token = _issue(conn, user_id, "verify", address)
    try:
        _send_email(address, "verify", token)
    except Exception:
        # Roll back the pending token; the account and password remain unchanged.
        with db() as conn:
            conn.execute(
                "DELETE FROM email_action_tokens WHERE token_hash=?",
                (token_hash(token),),
            )
        LOG.warning("Rangerbook email verification delivery failed")
        raise HTTPException(503, "驗證郵件暫時無法寄出，請稍後重試。") from None


def _send_reset(db, user_id: str, email: str) -> None:
    with db() as conn:
        token = _issue(conn, user_id, "reset", email)
    try:
        _send_email(email, "reset", token)
    except Exception:
        with db() as conn:
            conn.execute(
                "DELETE FROM email_action_tokens WHERE token_hash=?",
                (token_hash(token),),
            )
        LOG.warning("Rangerbook password reset delivery failed")
        raise


def install_email_routes(
    app, db, require_user, require_super_admin, require_trusted_origin,
    password_hasher, validate_password,
) -> None:
    @app.get("/auth/email/status")
    def email_status(user=Depends(require_user)):
        return {
            "email": user["email"],
            "verified": bool(user["email_verified_at"]),
            "pending_email": user["pending_email"],
        }

    @app.post("/auth/email/request-verification")
    def request_verification(payload: EmailRequest, request: Request, user=Depends(require_user)):
        require_trusted_origin(request)
        try:
            password_hasher.verify(user["password_hash"], payload.current_password)
        except Exception:
            raise HTTPException(401, "目前密碼不正確。") from None
        start_verification(db, user["id"], payload.email, request=request)
        return {"ok": True, "message": "驗證連結已寄出，請在 30 分鐘內完成驗證。"}

    @app.post("/auth/email/confirm")
    def confirm_email(payload: TokenRequest, request: Request):
        require_trusted_origin(request)
        now = int(time.time())
        with db() as conn:
            conn.execute("BEGIN IMMEDIATE")
            record = conn.execute(
                "SELECT * FROM email_action_tokens WHERE token_hash=? AND purpose='verify'",
                (token_hash(payload.token),),
            ).fetchone()
            if not record or record["expires_at"] <= now:
                raise HTTPException(400, "連結無效或已過期。")
            user = conn.execute(
                "SELECT pending_email FROM users WHERE id=?", (record["user_id"],)
            ).fetchone()
            if not user or user["pending_email"] != record["target_email"]:
                raise HTTPException(400, "連結無效或已過期。")
            other = conn.execute(
                "SELECT id FROM users WHERE email=? COLLATE NOCASE AND id<>?",
                (record["target_email"], record["user_id"]),
            ).fetchone()
            if other:
                raise HTTPException(409, "此電子郵件已被其他帳號綁定。")
            conn.execute(
                "UPDATE users SET email=?,email_verified_at=?,pending_email=NULL WHERE id=?",
                (record["target_email"], datetime.now(timezone.utc).isoformat(), record["user_id"]),
            )
            conn.execute(
                "DELETE FROM email_action_tokens WHERE user_id=? AND purpose='verify'",
                (record["user_id"],),
            )
        return {"ok": True, "message": "電子郵件驗證完成。"}

    @app.post("/auth/password/forgot")
    def forgot_password(payload: ForgotRequest, request: Request):
        require_trusted_origin(request)
        require_mail_configured()
        # Do not disclose whether an email address exists.
        with db() as conn:
            if not _limit(conn, "forgot_ip", _client_ip(request), 6):
                return GENERIC_REPLY
            try:
                address = normalize_email(payload.email)
            except HTTPException:
                return GENERIC_REPLY
            if not _limit(conn, "forgot_email", address, 3):
                return GENERIC_REPLY
            row = conn.execute(
                "SELECT id,email FROM users WHERE email=? COLLATE NOCASE"
                " AND email_verified_at IS NOT NULL",
                (address,),
            ).fetchone()
        if row:
            try:
                _send_reset(db, row["id"], row["email"])
            except Exception:
                pass  # Intentional: identical reply for unknown / delivery failure.
        return GENERIC_REPLY

    @app.post("/auth/password/reset")
    def reset_password(payload: ResetRequest, request: Request):
        require_trusted_origin(request)
        require_mail_configured()
        validate_password(payload.new_password)
        with db() as conn:
            if not _limit(conn, "reset_ip", _client_ip(request), 20):
                raise HTTPException(429, "請求過於頻繁。")
            conn.execute("BEGIN IMMEDIATE")
            record = conn.execute(
                "SELECT * FROM email_action_tokens WHERE token_hash=? AND purpose='reset'",
                (token_hash(payload.token),),
            ).fetchone()
            if not record or record["expires_at"] <= int(time.time()):
                raise HTTPException(400, "連結無效或已過期。")
            user = conn.execute(
                "SELECT email,email_verified_at FROM users WHERE id=?",
                (record["user_id"],),
            ).fetchone()
            if not user or not user["email_verified_at"] or user["email"] != record["target_email"]:
                raise HTTPException(400, "連結無效或已過期。")
            new_hash = password_hasher.hash(payload.new_password)
            conn.execute(
                "UPDATE users SET password_hash=? WHERE id=?", (new_hash, record["user_id"])
            )
            conn.execute("DELETE FROM sessions WHERE user_id=?", (record["user_id"],))
            conn.execute("DELETE FROM email_action_tokens WHERE user_id=?", (record["user_id"],))
        return {"ok": True, "message": "密碼已重設，請重新登入。"}

    @app.post("/admin/users/{user_id}/send-reset-link")
    def admin_send_reset(user_id: str, request: Request, _=Depends(require_super_admin)):
        require_trusted_origin(request)
        require_mail_configured()
        with db() as conn:
            if not _limit(conn, "admin_reset_ip", _client_ip(request), 20):
                raise HTTPException(429, "操作過於頻繁。")
            user = conn.execute(
                "SELECT id,email,email_verified_at,role FROM users WHERE id=?", (user_id,)
            ).fetchone()
            if not user or user["role"] == "super_admin":
                raise HTTPException(404, "找不到可操作的帳號。")
            if not user["email"] or not user["email_verified_at"]:
                raise HTTPException(409, "此帳號尚未驗證電子郵件，無法寄送重設連結。")
            if not _limit(conn, "admin_reset_user", user_id, 3):
                raise HTTPException(429, "寄送次數過多。")
        try:
            _send_reset(db, user_id, user["email"])
        except Exception:
            raise HTTPException(503, "郵件暫時無法寄出，請稍後重試。") from None
        return {"ok": True, "message": "一次性密碼重設連結已寄送。"}
