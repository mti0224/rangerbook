from __future__ import annotations

from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app import (
    PASSWORD_HASHER,
    SESSION_COOKIE,
    app,
    db,
    require_admin,
    require_trusted_origin,
    session_hash,
    validate_password,
)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128)


@app.post("/auth/change-password")
def change_own_password(
    payload: PasswordChange,
    request: Request,
    user=Depends(require_admin),
) -> dict[str, object]:
    """Allow any authenticated administrator to change their own password."""
    require_trusted_origin(request)
    validate_password(payload.new_password)

    try:
        PASSWORD_HASHER.verify(user["password_hash"], payload.current_password)
    except VerifyMismatchError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="目前密碼錯誤。",
        ) from error
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="目前密碼錯誤。",
        ) from error

    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="新密碼不得與目前密碼相同。",
        )

    password_hash = PASSWORD_HASHER.hash(payload.new_password)
    token = request.cookies.get(SESSION_COOKIE)
    current_token_hash = session_hash(token) if token else None

    with db() as connection:
        connection.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (password_hash, user["id"]),
        )
        if current_token_hash:
            connection.execute(
                "DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?",
                (user["id"], current_token_hash),
            )
        else:
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))

    return {
        "ok": True,
        "account": user["account"],
        "other_sessions_revoked": True,
    }
