"""Admin-only LINE Rangers account ownership verification and private team import.

Only official API responses are used for challenges.  Never trust team data from
the browser, never return the pre-verification roster, and never expose credentials.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import sqlite3
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

import requests
from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

import player_query as pq

PRIVATE_DIR = Path(os.getenv("RANGERBOOK_PRIVATE_TEAM_DIR", "/home/ubuntu/rangerbook-private/teams"))
TEAM_KEYS = tuple(f"team{i}" for i in range(1, 6))
NUMERIC = re.compile(r"^[0-9]{1,12}$")
PRIVATE_USER_ID = re.compile(r"^usr_[A-Za-z0-9_-]{12,64}$")


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime | None = None) -> str:
    return (value or now()).isoformat(timespec="seconds").replace("+00:00", "Z")


def fail(status: int, message: str) -> None:
    raise HTTPException(status_code=status, detail=message)


def init_tables(db: Callable) -> None:
    with db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS game_account_bindings (
                user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                game_uid TEXT NOT NULL UNIQUE,
                player_name TEXT NOT NULL,
                guild_name TEXT NOT NULL,
                verified_at TEXT NOT NULL,
                last_imported_at TEXT
            );
            CREATE TABLE IF NOT EXISTS game_player_candidates (
                candidate_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                game_uid TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                failed_attempts INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS game_verification_challenges (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                game_uid TEXT NOT NULL,
                team_key TEXT NOT NULL,
                subteam_key TEXT NOT NULL,
                first_slot INTEGER NOT NULL,
                second_slot INTEGER NOT NULL,
                baseline_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                status TEXT NOT NULL,
                check_count INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS game_verification_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                ip_key TEXT NOT NULL,
                subject_key TEXT NOT NULL,
                action TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_game_candidates_user
                ON game_player_candidates(user_id, expires_at);
            CREATE INDEX IF NOT EXISTS idx_game_challenges_user
                ON game_verification_challenges(user_id, expires_at);
            CREATE INDEX IF NOT EXISTS idx_game_events_user
                ON game_verification_events(user_id, action, created_at);
            CREATE INDEX IF NOT EXISTS idx_game_events_subject
                ON game_verification_events(subject_key, action, created_at);
        """)
        conn.execute("DELETE FROM game_player_candidates WHERE expires_at <= ?", (iso(),))
        conn.execute("DELETE FROM game_verification_challenges WHERE expires_at <= ?", (iso(),))
        conn.execute("DELETE FROM game_verification_events WHERE created_at < ?", (iso(now() - timedelta(days=2)),))


def official_player(uid: str) -> dict[str, Any]:
    """Return raw official result, never the public/normalized cache."""
    if not pq.UID_RE.fullmatch(uid):
        fail(422, "玩家識別碼格式不正確。")
    with pq._query_lock:
        core = pq._load_core()
        lf_ac = core.load_first_text(core.LF_AC_CANDIDATES, "LF_AC")
        config = core.load_config()
        account_uid = core.get_config_value(config, ("account_uid", "accountUid", "uid"))
        udid = core.get_config_value(config, ("udid", "UDID"))
        if not account_uid or not udid:
            fail(503, "官方 API 認證尚未設定。")
        try:
            with requests.Session() as session:
                response = core.api_get(session, f"/player/units/team/equip/uid/{uid}", account_uid, lf_ac, udid)
        except Exception:
            # Never echo official API errors: they can contain credentials or player data.
            fail(502, "官方遊戲資料暫時無法查詢，請稍後重試。")
    result = response.get("result") if isinstance(response, dict) else None
    if not isinstance(result, dict):
        fail(502, "官方遊戲資料格式不正確。")
    return result


def subgroup_slots(result: dict[str, Any], team: str, side: str) -> dict[str, dict[str, Any]]:
    groups = result.get("playerUnitTeamGroupMap")
    if not isinstance(groups, dict):
        return {}
    team_group = groups.get(team)
    if not isinstance(team_group, dict):
        return {}
    members = team_group.get(side)
    if not isinstance(members, list):
        return {}
    slots: dict[str, dict[str, Any]] = {}
    for unit in members:
        if not isinstance(unit, dict):
            return {}
        try:
            slot = int(unit["slot"])
            inv = int(unit["invenId"])
        except (KeyError, ValueError, TypeError):
            return {}
        if not 0 <= slot <= 4 or inv <= 0 or str(slot) in slots:
            return {}
        if str(unit.get("teamNo")) != side or not str(unit.get("unitCode") or ""):
            return {}
        slots[str(slot)] = {"invenId": inv, "unitCode": str(unit["unitCode"])}
    return slots


def choose_swap(result: dict[str, Any]) -> tuple[str, str, int, int, dict[str, dict[str, Any]]]:
    candidates: list[tuple[str, str, int, int, dict[str, dict[str, Any]]]] = []
    for team in TEAM_KEYS:
        for side in ("1", "2"):
            slots = subgroup_slots(result, team, side)
            keys = sorted(slots, key=int)
            for i, a in enumerate(keys):
                for b in keys[i + 1:]:
                    if slots[a]["invenId"] != slots[b]["invenId"] and slots[a]["unitCode"] != slots[b]["unitCode"]:
                        candidates.append((team, side, int(a), int(b), slots))
    if not candidates:
        fail(422, "目前沒有可進行位置交換驗證的隊伍，請先配置至少兩隻不同 Ranger。")
    return secrets.choice(candidates)


def is_exact_swap(baseline: dict[str, Any], current: dict[str, Any], first: int, second: int) -> bool:
    if set(baseline) != set(current) or str(first) not in baseline or str(second) not in baseline:
        return False
    if baseline[str(first)]["invenId"] == baseline[str(second)]["invenId"]:
        return False
    for slot, original in baseline.items():
        expected = baseline[str(second)] if slot == str(first) else baseline[str(first)] if slot == str(second) else original
        if current[slot]["invenId"] != expected["invenId"]:
            return False
    return True


def limited(conn: sqlite3.Connection, user_id: str, ip: str, subject: str, action: str,
            limit: int, window_minutes: int) -> None:
    import hashlib
    lower = iso(now() - timedelta(minutes=window_minutes))
    ip_key = hashlib.sha256(ip.encode()).hexdigest()
    subject_key = hashlib.sha256(subject.encode()).hexdigest()
    by_user = conn.execute(
        "SELECT COUNT(*) FROM game_verification_events WHERE user_id=? AND action=? AND created_at>=?",
        (user_id, action, lower)
    ).fetchone()[0]
    by_subject = conn.execute(
        "SELECT COUNT(*) FROM game_verification_events WHERE subject_key=? AND action=? AND created_at>=?",
        (subject_key, action, lower)
    ).fetchone()[0]
    by_ip = conn.execute(
        "SELECT COUNT(*) FROM game_verification_events WHERE ip_key=? AND action=? AND created_at>=?",
        (ip_key, action, lower)
    ).fetchone()[0]
    if by_user >= limit or by_subject >= limit or by_ip >= limit * 4:
        fail(429, "操作過於頻繁，請稍後再試。")
    conn.execute(
        "INSERT INTO game_verification_events(user_id,ip_key,subject_key,action,created_at) VALUES (?,?,?,?,?)",
        (user_id, ip_key, subject_key, action, iso())
    )


def private_path(user_id: str) -> Path:
    if not PRIVATE_USER_ID.fullmatch(user_id):
        fail(500, "資料站帳號格式不正確。")
    return PRIVATE_DIR / user_id / "latest.json"


def private_read(user_id: str) -> dict[str, Any] | None:
    path = private_path(user_id)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def private_write(user_id: str, payload: dict[str, Any]) -> None:
    path = private_path(user_id)
    directory = path.parent
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(directory, 0o700)
    fd, tmp = tempfile.mkstemp(prefix=".team-", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def normalize_personal_teams(result: dict[str, Any]) -> dict[str, Any]:
    """Extract just Ranger/team/equipment fields; no player assets or age."""
    output: dict[str, Any] = {}
    for team in TEAM_KEYS:
        sides: dict[str, Any] = {}
        for side, label in (("1", "A"), ("2", "B")):
            members = []
            groups = result.get("playerUnitTeamGroupMap") or {}
            raw = (groups.get(team) or {}).get(side, []) if isinstance(groups, dict) and isinstance(groups.get(team), dict) else []
            for unit in raw if isinstance(raw, list) else []:
                if not isinstance(unit, dict):
                    continue
                slot = unit.get("slot")
                if not isinstance(slot, int) or not 0 <= slot <= 4:
                    continue
                sanitized = pq._public_unit_record(unit)
                if sanitized:
                    members.append({"slot": slot, **sanitized})
            sides[label] = sorted(members, key=lambda x: x["slot"])
        output[team] = sides
    # Preserve the exact same public-facing Ranger fields for PvP and Guild War
    # as the existing player search renderer, without wallet/player metadata.
    groups = result.get("playerUnitTeamGroupMap")
    groups = groups if isinstance(groups, dict) else {}
    for key in ("pvpteam", "guildwar"):
        output[key] = []
        for unit in pq._flatten_unit_records(groups.get(key)):
            public = pq._public_unit_record(unit)
            if public:
                output[key].append(public)
    return output


class UnbindRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class CandidateStart(BaseModel):
    candidateId: str = Field(min_length=16, max_length=128)
    medal: str = Field(min_length=1, max_length=12)


class VerifyRequest(BaseModel):
    challengeId: str = Field(min_length=16, max_length=128)


def register_routes(app: FastAPI, db: Callable, require_admin: Callable, require_trusted_origin: Callable, password_hasher: Any, limit_auth: Callable) -> None:
    def user_id(user: Any) -> str:
        return str(user["id"])

    @app.get("/admin/game-players/search")
    def game_player_search(q: str, request: Request, user: Any = Depends(require_admin)) -> dict[str, Any]:
        if len(q.strip()) < 2 or len(q) > 64:
            return {"items": [], "count": 0}
        identity = user_id(user)
        with db() as conn:
            limited(conn, identity, request.client.host if request.client else "", identity, "search", 20, 10)
        try:
            matches = pq.search_players(q, limit=20)
        except (OSError, ValueError, KeyError):
            fail(503, "玩家索引暫時不可用。")
        expires = iso(now() + timedelta(minutes=5))
        items = []
        with db() as conn:
            conn.execute("DELETE FROM game_player_candidates WHERE user_id=?", (identity,))
            for item in matches.get("items", []):
                uid = str(item.get("uid") or "")
                if not pq.UID_RE.fullmatch(uid):
                    continue
                candidate = secrets.token_urlsafe(24)
                conn.execute(
                    "INSERT INTO game_player_candidates(candidate_id,user_id,game_uid,expires_at) VALUES (?,?,?,?)",
                    (candidate, identity, uid, expires)
                )
                items.append({"candidateId": candidate, "name": item.get("name") or "", "guildName": item.get("guildName") or ""})
        return {"items": items, "count": len(items)}

    @app.get("/admin/game-binding/status")
    def binding_status(user: Any = Depends(require_admin)) -> dict[str, Any]:
        with db() as conn:
            bound = conn.execute(
                "SELECT player_name,guild_name,verified_at,last_imported_at FROM game_account_bindings WHERE user_id=?",
                (user_id(user),)
            ).fetchone()
            pending = conn.execute(
                "SELECT id,team_key,subteam_key,first_slot,second_slot,expires_at FROM game_verification_challenges "
                "WHERE user_id=? AND status='pending' AND expires_at>? ORDER BY created_at DESC LIMIT 1",
                (user_id(user), iso())
            ).fetchone()
        return {
            "bound": bool(bound),
            "player": dict(bound) if bound else None,
            "challenge": {
                "challengeId": pending["id"], "team": int(pending["team_key"][4:]),
                "side": "A" if pending["subteam_key"] == "1" else "B",
                "firstPosition": pending["first_slot"] + 1,
                "secondPosition": pending["second_slot"] + 1,
                "expiresAt": pending["expires_at"]
            } if pending and not bound else None
        }

    @app.post("/admin/game-binding/start")
    def binding_start(payload: CandidateStart, request: Request, user: Any = Depends(require_admin)) -> dict[str, Any]:
        require_trusted_origin(request)
        if not NUMERIC.fullmatch(payload.medal):
            fail(422, "請輸入半形數字。")
        identity = user_id(user)
        with db() as conn:
            if conn.execute("SELECT 1 FROM game_account_bindings WHERE user_id=?", (identity,)).fetchone():
                fail(409, "此資料站帳號已綁定遊戲帳號。")
            candidate = conn.execute(
                "SELECT * FROM game_player_candidates WHERE candidate_id=? AND user_id=?",
                (payload.candidateId, identity)
            ).fetchone()
            if not candidate or candidate["expires_at"] <= iso() or candidate["failed_attempts"] >= 3:
                fail(410, "搜尋結果已失效，請重新搜尋。")
            uid = candidate["game_uid"]
            if conn.execute("SELECT 1 FROM game_account_bindings WHERE game_uid=?", (uid,)).fetchone():
                fail(409, "此遊戲帳號已綁定。")
            limited(conn, identity, request.client.host if request.client else "", uid, "medal", 5, 60)
            conn.execute(
                "UPDATE game_player_candidates SET failed_attempts=failed_attempts+1 WHERE candidate_id=?",
                (payload.candidateId,)
            )
        result = official_player(uid)
        medal = (result.get("player") or {}).get("guildWarMedal")
        if not isinstance(medal, int) or isinstance(medal, bool):
            fail(502, "官方資料沒有有效的公會獎牌數量。")
        if int(payload.medal) != medal:
            fail(422, "公會獎牌數量不符，請確認後重試。")
        team, side, first, second, baseline = choose_swap(result)
        challenge_id = secrets.token_urlsafe(32)
        expires = iso(now() + timedelta(minutes=10))
        with db() as conn:
            # Two simultaneous requests must not leave ambiguous active challenges.
            conn.execute("UPDATE game_verification_challenges SET status='cancelled' WHERE user_id=? AND status='pending'", (identity,))
            conn.execute(
                "INSERT INTO game_verification_challenges "
                "(id,user_id,game_uid,team_key,subteam_key,first_slot,second_slot,baseline_json,created_at,expires_at,status) "
                "VALUES (?,?,?,?,?,?,?,?,?,?, 'pending')",
                (challenge_id, identity, uid, team, side, first, second, json.dumps(baseline), iso(), expires)
            )
            conn.execute("DELETE FROM game_player_candidates WHERE user_id=?", (identity,))
        return {
            "challengeId": challenge_id, "team": int(team[4:]), "side": "A" if side == "1" else "B",
            "firstPosition": first + 1, "secondPosition": second + 1, "expiresAt": expires
        }

    @app.post("/admin/game-binding/verify")
    def binding_verify(payload: VerifyRequest, request: Request, user: Any = Depends(require_admin)) -> dict[str, Any]:
        require_trusted_origin(request)
        identity = user_id(user)
        with db() as conn:
            row = conn.execute(
                "SELECT * FROM game_verification_challenges WHERE id=? AND user_id=?",
                (payload.challengeId, identity)
            ).fetchone()
            if not row or row["status"] != "pending" or row["expires_at"] <= iso() or row["check_count"] >= 5:
                fail(410, "驗證任務已結束或過期，請重新開始。")
            limited(conn, identity, request.client.host if request.client else "", row["game_uid"], "verify", 12, 20)
            conn.execute("UPDATE game_verification_challenges SET check_count=check_count+1 WHERE id=?", (row["id"],))
        current = subgroup_slots(official_player(row["game_uid"]), row["team_key"], row["subteam_key"])
        baseline = json.loads(row["baseline_json"])
        if not is_exact_swap(baseline, current, row["first_slot"], row["second_slot"]):
            return {"verified": False, "message": "尚未偵測到指定的正確位置交換，請確認遊戲已儲存隊伍。"}
        player_index = pq.load_player_index().get("players", {}).get(row["game_uid"], {})
        with db() as conn:
            conn.execute("BEGIN IMMEDIATE")
            latest = conn.execute(
                "SELECT status,expires_at FROM game_verification_challenges WHERE id=? AND user_id=?",
                (row["id"], identity)
            ).fetchone()
            if not latest or latest["status"] != "pending" or latest["expires_at"] <= iso():
                fail(410, "驗證任務已失效。")
            try:
                conn.execute(
                    "INSERT INTO game_account_bindings(user_id,game_uid,player_name,guild_name,verified_at) VALUES (?,?,?,?,?)",
                    (identity, row["game_uid"], str(player_index.get("name") or ""), str(player_index.get("guildName") or ""), iso())
                )
            except sqlite3.IntegrityError:
                fail(409, "遊戲帳號已被綁定，或目前帳號已有綁定。")
            conn.execute("UPDATE game_verification_challenges SET status='passed' WHERE id=?", (row["id"],))
        return {"verified": True, "message": "遊戲帳號已成功綁定，請恢復隊伍原本的位置再匯入。"}


    @app.post("/admin/game-binding/unbind")
    def unbind_game_account(payload: UnbindRequest, request: Request, user: Any = Depends(require_admin)) -> dict[str, Any]:
        # A valid session alone is not sufficient for a destructive UID switch.
        require_trusted_origin(request)
        limit_auth(request, "unbind", user_id(user), subject_limit=5)
        try:
            password_hasher.verify(user["password_hash"], payload.password)
        except HTTPException:
            raise
        except Exception:
            fail(403, "目前帳號密碼不正確。")
        identity = user_id(user)
        with db() as conn:
            conn.execute("BEGIN IMMEDIATE")
            found = conn.execute(
                "SELECT 1 FROM game_account_bindings WHERE user_id=?", (identity,)
            ).fetchone()
            if not found:
                fail(404, "目前沒有已綁定的遊戲帳號。")
            # Clear the private import in the same critical section as the
            # binding removal. A failed deletion rolls back the SQL changes.
            private_path(identity).unlink(missing_ok=True)
            conn.execute("DELETE FROM game_verification_challenges WHERE user_id=?", (identity,))
            conn.execute("DELETE FROM game_player_candidates WHERE user_id=?", (identity,))
            conn.execute("DELETE FROM game_account_bindings WHERE user_id=?", (identity,))
        return {"ok": True, "message": "已解除遊戲帳號綁定，私人匯入隊伍已清除。"}

    @app.get("/admin/personal-teams")
    def get_personal_teams(user: Any = Depends(require_admin)) -> dict[str, Any]:
        with db() as conn:
            bound = conn.execute(
                "SELECT 1 FROM game_account_bindings WHERE user_id=?", (user_id(user),)
            ).fetchone()
        if not bound:
            return {"bound": False, "teams": {k: {"A": [], "B": []} for k in TEAM_KEYS}}
        private = private_read(user_id(user))
        return {"bound": True, **(private or {"teams": {k: {"A": [], "B": []} for k in TEAM_KEYS}})}

    @app.post("/admin/personal-teams/import")
    def import_personal_teams(request: Request, user: Any = Depends(require_admin)) -> dict[str, Any]:
        require_trusted_origin(request)
        identity = user_id(user)
        with db() as conn:
            row = conn.execute(
                "SELECT game_uid FROM game_account_bindings WHERE user_id=?", (identity,)
            ).fetchone()
            if not row:
                fail(403, "請先完成遊戲帳號驗證。")
            limited(conn, identity, request.client.host if request.client else "", row["game_uid"], "import", 8, 20)
        result = official_player(row["game_uid"])
        teams = normalize_personal_teams(result)
        payload = {"schemaVersion": 1, "importedAtUtc": iso(), "source": "official_api", "teams": teams}
        private_write(identity, payload)
        with db() as conn:
            conn.execute("UPDATE game_account_bindings SET last_imported_at=? WHERE user_id=?", (payload["importedAtUtc"], identity))
        return {"ok": True, "importedAtUtc": payload["importedAtUtc"], "teams": teams}
