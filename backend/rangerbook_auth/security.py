"""Authentication safeguards; no passwords or session tokens are logged."""
from __future__ import annotations

import hashlib
import threading
import time
from contextlib import contextmanager

from argon2 import PasswordHasher
from fastapi import HTTPException
from starlette.responses import JSONResponse


class RequestBodyLimit:
    """Bound streamed bodies too, rather than trusting Content-Length alone."""
    def __init__(self, app, max_bytes: int = 16384):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") not in {"POST", "PUT", "PATCH"}:
            return await self.app(scope, receive, send)
        messages, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            size += len(message.get("body", b""))
            if size > self.max_bytes:
                return await JSONResponse({"detail": "請求內容過大。"}, status_code=413)(scope, receive, send)
            messages.append(message)
            if not message.get("more_body", False):
                break

        async def replay():
            return messages.pop(0) if messages else await receive()

        await self.app(scope, replay, send)


def init_security_tables(connection) -> None:
    columns = {row[1] for row in connection.execute("PRAGMA table_info(users)")}
    if "must_change_password" not in columns:
        connection.execute("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0")
    connection.executescript("""
        CREATE TABLE IF NOT EXISTS auth_rate_events (
            action TEXT NOT NULL,
            ip_hash TEXT NOT NULL,
            subject_hash TEXT NOT NULL,
            created_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_auth_rate_ip ON auth_rate_events(action,ip_hash,created_at);
        CREATE INDEX IF NOT EXISTS idx_auth_rate_subject ON auth_rate_events(action,subject_hash,created_at);
        CREATE INDEX IF NOT EXISTS idx_auth_rate_created ON auth_rate_events(created_at);
    """)


def consume_rate_limit(connect, request, action: str, subject: str,
                       ip_limit: int = 30, subject_limit: int = 20, window: int = 900) -> None:
    """Persist attempts before password work, including unsuccessful requests.

    BEGIN IMMEDIATE makes the count plus insert atomic across workers. Only the
    proxy-normalized client address is used, never a client-supplied header.
    """
    timestamp = time.time()
    ip = request.client.host if request.client else "unknown"
    ip_hash = hashlib.sha256(ip.encode()).hexdigest()
    subject_hash = hashlib.sha256(subject.casefold().encode()).hexdigest()
    with connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("DELETE FROM auth_rate_events WHERE created_at < ?", (timestamp - 86400,))
        ip_count = connection.execute(
            "SELECT COUNT(*) FROM auth_rate_events WHERE action=? AND ip_hash=? AND created_at>?",
            (action, ip_hash, timestamp - window),
        ).fetchone()[0]
        subject_count = connection.execute(
            "SELECT COUNT(*) FROM auth_rate_events WHERE action=? AND subject_hash=? AND created_at>?",
            (action, subject_hash, timestamp - window),
        ).fetchone()[0]
        if ip_count >= ip_limit or subject_count >= subject_limit:
            raise HTTPException(429, "操作過於頻繁，請稍後再試。", headers={"Retry-After": str(window)})
        connection.execute("INSERT INTO auth_rate_events VALUES (?,?,?,?)",
                           (action, ip_hash, subject_hash, timestamp))


class BoundedPasswordHasher(PasswordHasher):
    """Argon2 is deliberately expensive; bound concurrent memory/CPU usage."""
    _slots = threading.BoundedSemaphore(2)

    @contextmanager
    def _slot(self):
        if not self._slots.acquire(blocking=False):
            raise HTTPException(429, "操作過於頻繁，請稍後再試。", headers={"Retry-After": "1"})
        try:
            yield
        finally:
            self._slots.release()

    def hash(self, *args, **kwargs):
        with self._slot():
            return super().hash(*args, **kwargs)

    def verify(self, *args, **kwargs):
        with self._slot():
            return super().verify(*args, **kwargs)


def password_change_required(user) -> bool:
    return "must_change_password" in user.keys() and bool(user["must_change_password"])
