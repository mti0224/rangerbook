from __future__ import annotations

import hashlib
import os
import re
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator, Literal

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

APP_ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("RANGERBOOK_AUTH_DB", APP_ROOT / "rangerbook_auth.db")).resolve()
SESSION_COOKIE = os.getenv("RANGERBOOK_SESSION_COOKIE", "__Host-rangerbook_session")
SESSION_DAYS = int(os.getenv("RANGERBOOK_SESSION_DAYS", "7"))
RESET_PASSWORD = "qwer1234"
ALLOWED_ORIGINS = {
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "RANGERBOOK_ALLOWED_ORIGINS",
        "https://rangerbook.warmycat.com",
    ).split(",")
    if origin.strip()
}

ACCOUNT_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
PASSWORD_HASHER = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=1,
    hash_len=32,
    salt_len=16,
)

app = FastAPI(title="Rangerbook Auth API", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ALLOWED_ORIGINS),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


class Credentials(BaseModel):
    account: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=1, max_length=128)


class RoleUpdate(BaseModel):
    role: Literal["user", "admin"]


class UserRecord(dict):
    id: str
    account: str
    role: str
    admin_application_status: str
    created_at: str
    approved_at: str | None
    approved_by: str | None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def isoformat(value: datetime | None = None) -> str:
    return (value or utc_now()).isoformat().replace("+00:00", "Z")


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_db() -> None:
    with db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                account TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user', 'admin', 'super_admin')),
                admin_application_status TEXT NOT NULL
                    CHECK(admin_application_status IN ('pending', 'approved', 'rejected')),
                created_at TEXT NOT NULL,
                approved_at TEXT,
                approved_by TEXT
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
            CREATE INDEX IF NOT EXISTS idx_users_application_status
                ON users(admin_application_status, role);
            """
        )


@app.on_event("startup")
def startup() -> None:
    init_db()
    cleanup_expired_sessions()


def cleanup_expired_sessions() -> None:
    with db() as connection:
        connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (isoformat(),))


def normalize_account(account: str) -> str:
    account = account.strip()
    if not ACCOUNT_RE.fullmatch(account):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="帳號限 3–32 字元，只能使用英文字母、數字、底線、句點與連字號。",
        )
    return account


def validate_password(password: str) -> None:
    if len(password) < 10 or len(password) > 128:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="密碼長度必須為 10–128 字元。",
        )


def require_trusted_origin(request: Request) -> None:
    origin = (request.headers.get("origin") or "").rstrip("/")
    if origin not in ALLOWED_ORIGINS:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Origin not allowed")


def public_user(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "account": row["account"],
        "role": row["role"],
        "admin_application_status": row["admin_application_status"],
        "created_at": row["created_at"],
        "approved_at": row["approved_at"],
        "approved_by": row["approved_by"],
    }


def session_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(48)
    now = utc_now()
    expires = now + timedelta(days=SESSION_DAYS)
    with db() as connection:
        connection.execute(
            """
            INSERT INTO sessions(token_hash, user_id, created_at, expires_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (session_hash(token), user_id, isoformat(now), isoformat(expires), isoformat(now)),
        )
    return token


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        path="/",
        secure=True,
        httponly=True,
        samesite="lax",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE,
        path="/",
        secure=True,
        httponly=True,
        samesite="lax",
    )


def lookup_session_user(request: Request) -> sqlite3.Row | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None

    now = isoformat()
    token_digest = session_hash(token)
    with db() as connection:
        row = connection.execute(
            """
            SELECT u.*
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.expires_at > ?
            """,
            (token_digest, now),
        ).fetchone()
        if row:
            connection.execute(
                "UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?",
                (now, token_digest),
            )
        else:
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (token_digest,))
        return row


def require_user(request: Request) -> sqlite3.Row:
    user = lookup_session_user(request)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="尚未登入。")
    return user


def require_admin(user: sqlite3.Row = Depends(require_user)) -> sqlite3.Row:
    if user["role"] not in {"admin", "super_admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理員權限。")
    return user


def require_super_admin(user: sqlite3.Row = Depends(require_user)) -> sqlite3.Row:
    if user["role"] != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要最大管理者權限。")
    return user


def find_mutable_user(user_id: str) -> sqlite3.Row:
    with db() as connection:
        target = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到使用者。")
    if target["role"] == "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="不能透過此 API 修改最大管理者。")
    return target


def set_user_role(user_id: str, role: Literal["user", "admin"], actor_account: str) -> sqlite3.Row:
    now = isoformat()
    with db() as connection:
        if role == "admin":
            connection.execute(
                """
                UPDATE users
                SET role = 'admin', admin_application_status = 'approved',
                    approved_at = ?, approved_by = ?
                WHERE id = ?
                """,
                (now, actor_account, user_id),
            )
        else:
            connection.execute(
                """
                UPDATE users
                SET role = 'user', admin_application_status = 'rejected',
                    approved_at = NULL, approved_by = NULL
                WHERE id = ?
                """,
                (user_id,),
            )
        connection.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        updated = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return updated


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/auth/register")
def register(credentials: Credentials, request: Request) -> dict[str, Any]:
    require_trusted_origin(request)
    account = normalize_account(credentials.account)
    validate_password(credentials.password)

    user_id = f"usr_{secrets.token_hex(12)}"
    password_hash = PASSWORD_HASHER.hash(credentials.password)
    created_at = isoformat()

    try:
        with db() as connection:
            connection.execute(
                """
                INSERT INTO users(
                    id, account, password_hash, role, admin_application_status,
                    created_at, approved_at, approved_by
                ) VALUES (?, ?, ?, 'user', 'pending', ?, NULL, NULL)
                """,
                (user_id, account, password_hash, created_at),
            )
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="此帳號已存在。") from error

    return {
        "ok": True,
        "account": account,
        "role": "user",
        "admin_application_status": "pending",
    }


@app.post("/auth/login")
def login(credentials: Credentials, request: Request) -> JSONResponse:
    require_trusted_origin(request)
    account = normalize_account(credentials.account)

    with db() as connection:
        user = connection.execute(
            "SELECT * FROM users WHERE account = ? COLLATE NOCASE",
            (account,),
        ).fetchone()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="帳號或密碼錯誤。")

    try:
        PASSWORD_HASHER.verify(user["password_hash"], credentials.password)
    except VerifyMismatchError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="帳號或密碼錯誤。") from error
    except Exception as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="帳號或密碼錯誤。") from error

    if PASSWORD_HASHER.check_needs_rehash(user["password_hash"]):
        new_hash = PASSWORD_HASHER.hash(credentials.password)
        with db() as connection:
            connection.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user["id"]))

    token = create_session(user["id"])
    payload = {"logged_in": True, **public_user(user)}
    response = JSONResponse(payload)
    set_session_cookie(response, token)
    return response


@app.post("/auth/logout")
def logout(request: Request) -> JSONResponse:
    require_trusted_origin(request)
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        with db() as connection:
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (session_hash(token),))

    response = JSONResponse({"ok": True})
    clear_session_cookie(response)
    return response


@app.get("/auth/me")
def me(request: Request) -> dict[str, Any]:
    user = lookup_session_user(request)
    if not user:
        return {
            "logged_in": False,
            "account": None,
            "role": "user",
            "admin_application_status": None,
        }
    return {"logged_in": True, **public_user(user)}


@app.get("/admin/applications")
def list_applications(_: sqlite3.Row = Depends(require_super_admin)) -> dict[str, Any]:
    with db() as connection:
        rows = connection.execute(
            """
            SELECT * FROM users
            WHERE role = 'user' AND admin_application_status = 'pending'
            ORDER BY created_at ASC
            """
        ).fetchall()
    return {"items": [public_user(row) for row in rows]}


@app.post("/admin/applications/{user_id}/approve")
def approve_application(
    user_id: str,
    request: Request,
    actor: sqlite3.Row = Depends(require_super_admin),
) -> dict[str, Any]:
    require_trusted_origin(request)
    find_mutable_user(user_id)
    updated = set_user_role(user_id, "admin", actor["account"])
    return {"ok": True, "user": public_user(updated)}


@app.post("/admin/applications/{user_id}/reject")
def reject_application(
    user_id: str,
    request: Request,
    actor: sqlite3.Row = Depends(require_super_admin),
) -> dict[str, Any]:
    require_trusted_origin(request)
    find_mutable_user(user_id)
    updated = set_user_role(user_id, "user", actor["account"])
    return {"ok": True, "user": public_user(updated)}


@app.get("/admin/users")
def list_users(_: sqlite3.Row = Depends(require_super_admin)) -> dict[str, Any]:
    with db() as connection:
        rows = connection.execute(
            """
            SELECT * FROM users
            ORDER BY
                CASE role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
                account COLLATE NOCASE ASC
            """
        ).fetchall()
    return {"items": [public_user(row) for row in rows]}


@app.post("/admin/users/{user_id}/revoke")
def revoke_admin(
    user_id: str,
    request: Request,
    actor: sqlite3.Row = Depends(require_super_admin),
) -> dict[str, Any]:
    require_trusted_origin(request)
    target = find_mutable_user(user_id)
    if target["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="此帳號目前不是管理員。")
    updated = set_user_role(user_id, "user", actor["account"])
    return {"ok": True, "user": public_user(updated)}


@app.post("/admin/users/{user_id}/role")
def change_user_role(
    user_id: str,
    payload: RoleUpdate,
    request: Request,
    actor: sqlite3.Row = Depends(require_super_admin),
) -> dict[str, Any]:
    require_trusted_origin(request)
    find_mutable_user(user_id)
    updated = set_user_role(user_id, payload.role, actor["account"])
    return {"ok": True, "user": public_user(updated)}


@app.post("/admin/users/{user_id}/reset-password")
def reset_user_password(
    user_id: str,
    request: Request,
    _: sqlite3.Row = Depends(require_super_admin),
) -> dict[str, Any]:
    require_trusted_origin(request)
    target = find_mutable_user(user_id)
    password_hash = PASSWORD_HASHER.hash(RESET_PASSWORD)
    with db() as connection:
        connection.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))
        connection.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    return {
        "ok": True,
        "account": target["account"],
        "reset_password": RESET_PASSWORD,
    }


@app.post("/admin/users/{user_id}/delete")
def delete_user(
    user_id: str,
    request: Request,
    _: sqlite3.Row = Depends(require_super_admin),
) -> dict[str, Any]:
    require_trusted_origin(request)
    target = find_mutable_user(user_id)
    with db() as connection:
        connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
    return {
        "ok": True,
        "deleted": {"id": target["id"], "account": target["account"]},
    }


@app.get("/admin/access-check")
def admin_access_check(user: sqlite3.Row = Depends(require_admin)) -> dict[str, Any]:
    return {"ok": True, "role": user["role"], "account": user["account"]}


def bootstrap_super_admin(account: str, password: str) -> dict[str, Any]:
    init_db()
    account = normalize_account(account)
    validate_password(password)
    password_hash = PASSWORD_HASHER.hash(password)

    with db() as connection:
        existing_super_admin = connection.execute(
            "SELECT id, account FROM users WHERE role = 'super_admin' LIMIT 1"
        ).fetchone()
        if existing_super_admin and existing_super_admin["account"].casefold() != account.casefold():
            raise RuntimeError(
                f"super_admin already exists: {existing_super_admin['account']}. "
                "Remove or migrate it manually before creating another."
            )

        existing = connection.execute(
            "SELECT * FROM users WHERE account = ? COLLATE NOCASE",
            (account,),
        ).fetchone()
        now = isoformat()
        if existing:
            connection.execute(
                """
                UPDATE users
                SET password_hash = ?, role = 'super_admin',
                    admin_application_status = 'approved', approved_at = ?, approved_by = ?
                WHERE id = ?
                """,
                (password_hash, now, account, existing["id"]),
            )
            user_id = existing["id"]
        else:
            user_id = f"usr_{secrets.token_hex(12)}"
            connection.execute(
                """
                INSERT INTO users(
                    id, account, password_hash, role, admin_application_status,
                    created_at, approved_at, approved_by
                ) VALUES (?, ?, ?, 'super_admin', 'approved', ?, ?, ?)
                """,
                (user_id, account, password_hash, now, now, account),
            )

        row = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return public_user(row)
