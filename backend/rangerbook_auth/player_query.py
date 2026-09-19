from __future__ import annotations

import importlib.util
import json
import os
import re
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

CORE_PATH = Path(os.getenv("RANGERBOOK_GUILDWAR_CORE", "/home/ubuntu/rangerbook-scripts/collect_guildwar_usage.py"))
PLAYER_INDEX_PATH = Path(os.getenv("RANGERBOOK_PLAYER_INDEX", "/home/ubuntu/rangerbook-data/player_index.json"))
PLAYER_CACHE_PATH = Path(os.getenv("RANGERBOOK_PLAYER_QUERY_CACHE", "/home/ubuntu/rangerbook-auth/player_lookup_cache.json"))
UID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
EQUIP_SLOTS = ("WEAPON", "ARMOR", "ACC")

_core: Any = None
_core_lock = threading.Lock()
_query_lock = threading.Lock()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


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


def load_player_index() -> dict[str, Any]:
    if not PLAYER_INDEX_PATH.is_file():
        raise FileNotFoundError(f"玩家索引尚未建立：{PLAYER_INDEX_PATH}")
    data = json.loads(PLAYER_INDEX_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("players"), dict):
        raise ValueError("玩家索引格式錯誤。")
    return data


def search_players(query: str, limit: int = 30) -> dict[str, Any]:
    query = str(query or "").strip()
    if not query:
        return {"items": [], "count": 0, "updatedAtUtc": None}

    needle = query.casefold()
    index = load_player_index()
    matches: list[tuple[int, str, dict[str, Any]]] = []

    for uid, raw in index["players"].items():
        if not isinstance(raw, dict):
            continue
        name = str(raw.get("name") or "")
        folded = name.casefold()
        if needle not in folded:
            continue
        rank = 0 if folded == needle else 1 if folded.startswith(needle) else 2
        matches.append((rank, name, {"uid": str(uid), **raw}))

    matches.sort(key=lambda row: (row[0], row[1].casefold(), row[2]["uid"]))
    safe_limit = max(1, min(int(limit), 100))
    items = [row[2] for row in matches[:safe_limit]]
    metadata = index.get("metadata") if isinstance(index.get("metadata"), dict) else {}

    return {
        "items": items,
        "count": len(matches),
        "updatedAtUtc": metadata.get("updatedAtUtc"),
    }


def _load_core() -> Any:
    global _core
    if _core is not None:
        return _core

    with _core_lock:
        if _core is not None:
            return _core
        if not CORE_PATH.is_file():
            raise FileNotFoundError(f"找不到 Guild War API core：{CORE_PATH}")

        spec = importlib.util.spec_from_file_location("rangerbook_player_query_core", CORE_PATH)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"無法載入 Guild War API core：{CORE_PATH}")

        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _core = module
        return module


def _flatten_unit_records(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        output: list[dict[str, Any]] = []
        for item in value:
            output.extend(_flatten_unit_records(item))
        return output

    if not isinstance(value, dict):
        return []

    if value.get("unitCode"):
        return [value]

    def sort_key(item: Any) -> tuple[int, int | str]:
        text = str(item)
        return (0, int(text)) if text.isdigit() else (1, text)

    output: list[dict[str, Any]] = []
    for key in sorted(value, key=sort_key):
        output.extend(_flatten_unit_records(value[key]))
    return output


def _team_no_from_record(record: dict[str, Any]) -> int | None:
    for key in ("teamNo", "teamNumber", "teamIndex", "slotNo"):
        value = record.get(key)
        try:
            number = int(value)
        except (TypeError, ValueError):
            continue
        if 1 <= number <= 5:
            return number
    return None


def _public_equipment(value: Any) -> dict[str, Any] | None:
    if isinstance(value, str):
        code = value.strip()
        return {"itemCode": code} if code else None

    if not isinstance(value, dict):
        return None

    code = str(value.get("equipItemCode") or value.get("itemCode") or value.get("code") or "").strip()
    if not code:
        return None

    output: dict[str, Any] = {"itemCode": code}
    attr4_no = value.get("attr4No")
    if attr4_no not in (None, ""):
        output["attr4No"] = attr4_no
    return output


def _public_unit_record(record: dict[str, Any]) -> dict[str, Any] | None:
    unit_code = str(record.get("unitCode") or "").strip()
    if not unit_code:
        return None

    output: dict[str, Any] = {"unitCode": unit_code}

    for key in ("level", "unitLevel", "unitLv", "rangerLevel"):
        value = record.get(key)
        if value not in (None, ""):
            output["level"] = value
            break

    equip_map = record.get("equipMap") if isinstance(record.get("equipMap"), dict) else {}
    output["equipMap"] = {
        slot: equipment
        for slot in EQUIP_SLOTS
        if (equipment := _public_equipment(equip_map.get(slot)))
    }

    for key in ("leonardPoint", "awakeAbilityCode", "awakeAbilityIcon", "talentGrade"):
        value = record.get(key)
        if value not in (None, ""):
            output[key] = value

    return output


def _normalize_records(value: Any) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for record in _flatten_unit_records(value):
        item = _public_unit_record(record)
        if item:
            output.append(item)
    return output


def extract_player_teams(player_data: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    root = player_data.get("result", player_data)
    team_map = root.get("playerUnitTeamGroupMap") if isinstance(root, dict) else None

    output = {
        **{f"team{i}": [] for i in range(1, 6)},
        "pvpteam": [],
        "guildwar": [],
    }
    if not isinstance(team_map, dict):
        return output

    output["pvpteam"] = _normalize_records(team_map.get("pvpteam"))
    output["guildwar"] = _normalize_records(team_map.get("guildwar"))

    for number in range(1, 6):
        for key in (f"team{number}", f"TEAM{number}", str(number)):
            if key not in team_map:
                continue
            records = _normalize_records(team_map.get(key))
            if records:
                output[f"team{number}"] = records
                break

    for group_key in ("team", "teams", "normalteam", "normalTeam"):
        grouped = team_map.get(group_key)
        if grouped is None:
            continue

        if isinstance(grouped, dict):
            for number in range(1, 6):
                if output[f"team{number}"]:
                    continue
                for key in (str(number), f"team{number}", f"TEAM{number}"):
                    if key not in grouped:
                        continue
                    records = _normalize_records(grouped.get(key))
                    if records:
                        output[f"team{number}"] = records
                        break

        grouped_records = _flatten_unit_records(grouped)
        for number in range(1, 6):
            if output[f"team{number}"]:
                continue
            records = [record for record in grouped_records if _team_no_from_record(record) == number]
            normalized = [_public_unit_record(record) for record in records]
            output[f"team{number}"] = [item for item in normalized if item]

    return output


def query_player_teams(uid: str) -> dict[str, Any]:
    uid = str(uid or "").strip()
    if not UID_RE.fullmatch(uid):
        raise ValueError("玩家 UID 格式不正確。")

    index = load_player_index()
    player = index["players"].get(uid)
    if not isinstance(player, dict):
        raise KeyError("玩家不在目前索引中。")

    with _query_lock:
        core = _load_core()
        lf_ac = core.load_first_text(core.LF_AC_CANDIDATES, "LF_AC")
        config = core.load_config()
        account_uid = core.get_config_value(config, ("account_uid", "accountUid", "uid"))
        udid = core.get_config_value(config, ("udid", "UDID"))

        if not account_uid or not udid:
            raise RuntimeError("pvp_config.json 缺少 account_uid 或 udid。")

        with requests.Session() as session:
            raw = core.api_get(
                session,
                f"/player/units/team/equip/uid/{uid}",
                account_uid,
                lf_ac,
                udid,
            )

        payload = {
            "queriedAtUtc": utc_now_iso(),
            "uid": uid,
            "name": player.get("name") or "未公開名稱",
            "guildName": player.get("guildName") or "",
            "tier": player.get("tier") or "",
            "teams": extract_player_teams(raw if isinstance(raw, dict) else {}),
        }
        atomic_write_json(PLAYER_CACHE_PATH, payload)
        return payload
