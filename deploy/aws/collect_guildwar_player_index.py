#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fcntl
import importlib.util
import json
import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

CORE_PATH = Path("/home/ubuntu/rangerbook-scripts/collect_guildwar_usage.py")
DEFAULT_OUTPUT = Path("/home/ubuntu/rangerbook-data/player_index.json")
LOCK_FILE = Path("/tmp/rangerbook-guildwar-player-index.lock")

TIERS = (
    {"code": "LEGEND", "label": "傳奇", "gradeId": 1},
    {"code": "MASTER", "label": "大師", "gradeId": 2},
    {"code": "DIAMOND", "label": "鑽石", "gradeId": 3},
    {"code": "PLATINUM", "label": "白金", "gradeId": 4},
    {"code": "GOLD", "label": "黃金", "gradeId": 5},
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def load_core(path: Path):
    spec = importlib.util.spec_from_file_location("guildwar_player_index_core", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"無法載入 Guild War core：{path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def acquire_lock(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = path.open("w")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as exc:
        handle.close()
        raise RuntimeError("另一個玩家索引更新程序正在執行") from exc
    return handle


def atomic_write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, separators=(",", ":"))
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp_name, path)
        os.chmod(path, 0o600)
    except Exception:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass
        raise


def load_existing(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {"metadata": {}, "players": {}}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"metadata": {}, "players": {}}
    if not isinstance(payload, dict):
        return {"metadata": {}, "players": {}}
    players = payload.get("players")
    return {
        "metadata": payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {},
        "players": players if isinstance(players, dict) else {},
    }


def member_name(member: dict[str, Any]) -> str:
    return str(
        member.get("name")
        or member.get("userName")
        or member.get("displayName")
        or member.get("playerName")
        or "未公開名稱"
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Collect a private Guild War player UID/name index from Legend through Gold"
    )
    parser.add_argument("--core", type=Path, default=CORE_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--delay", type=float, default=0.05)
    parser.add_argument("--max-errors", type=int, default=60)
    args = parser.parse_args()

    lock = acquire_lock(LOCK_FILE)
    try:
        core = load_core(args.core)
        lf_ac = core.load_first_text(core.LF_AC_CANDIDATES, "LF_AC")
        config = core.load_config()
        account_uid = core.get_config_value(config, ("account_uid", "accountUid", "uid"))
        udid = core.get_config_value(config, ("udid", "UDID"))
        if not account_uid or not udid:
            raise ValueError("pvp_config.json 缺少 account_uid 或 udid")

        existing = load_existing(args.output)
        players: dict[str, Any] = dict(existing["players"])
        started_at = utc_now()
        seen_this_run: set[str] = set()
        tier_counts: dict[str, dict[str, int]] = {}
        errors = 0

        print(f"[START] Guild War player index output={args.output}")

        with requests.Session() as session:
            for tier in TIERS:
                code = tier["code"]
                label = tier["label"]
                grade_id = tier["gradeId"]

                # guild_limit only slices the returned ranking list. A very high value means
                # "use every guild returned by this grade endpoint" without persisting rankings.
                guilds = core.fetch_top_guilds(
                    session,
                    account_uid,
                    lf_ac,
                    udid,
                    grade_id,
                    1_000_000,
                )
                tier_seen: set[str] = set()
                print(f"[TIER] {code} {label} guilds={len(guilds)}")

                for index, guild in enumerate(guilds, 1):
                    gid = str(guild.get("uid") or "")
                    guild_name = str(guild.get("displayName") or guild.get("guildName") or "")
                    if not gid:
                        continue

                    try:
                        members = core.fetch_guild_members(
                            session,
                            gid,
                            account_uid,
                            lf_ac,
                            udid,
                        )
                    except core.AuthenticationExpiredError:
                        raise
                    except Exception as exc:
                        errors += 1
                        print(f"  [WARN] {code} guild #{index} member fetch failed: {exc}")
                        if errors > args.max_errors:
                            raise RuntimeError(f"公會成員 API 錯誤過多：{errors} > {args.max_errors}")
                        continue

                    now = utc_now()
                    for member in members:
                        if not isinstance(member, dict):
                            continue
                        uid = str(member.get("uid") or "").strip()
                        if not uid:
                            continue

                        player = players.get(uid)
                        if not isinstance(player, dict):
                            player = {}

                        player.update({
                            "name": member_name(member),
                            "guildName": guild_name,
                            "tier": code,
                            "lastSeenAtUtc": now,
                        })
                        players[uid] = player
                        seen_this_run.add(uid)
                        tier_seen.add(uid)

                    print(f"  [{index}/{len(guilds)}] {guild_name} members={len(members)}")

                    if args.delay > 0:
                        time.sleep(args.delay)

                tier_counts[code] = {
                    "guildCount": len(guilds),
                    "playerCount": len(tier_seen),
                }

        payload = {
            "metadata": {
                "updatedAtUtc": utc_now(),
                "startedAtUtc": started_at,
                "scope": "LEGEND_TO_GOLD",
                "playerCount": len(players),
                "seenThisRun": len(seen_this_run),
                "failureCount": errors,
                "tiers": tier_counts,
                "format": "rangerbook_player_index_v1",
            },
            "players": players,
        }
        atomic_write_json(args.output, payload)

        print(
            f"[PUBLISH] {args.output} players={len(players)} "
            f"seen={len(seen_this_run)} errors={errors}"
        )
        print("[DONE]")
        return 0
    except Exception as exc:
        print(f"[ERROR] {exc}", file=os.sys.stderr)
        return 1
    finally:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        finally:
            lock.close()


if __name__ == "__main__":
    raise SystemExit(main())
