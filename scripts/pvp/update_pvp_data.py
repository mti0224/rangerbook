#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Update public LINE Rangers PvP leaderboard and Ranger usage JSON.

Secrets never enter the public output. Production defaults:
  /home/ubuntu/rangerbook-secrets/latest_LF_AC.txt
  /home/ubuntu/rangerbook-secrets/pvp_config.json

pvp_config.json shape:
  {"uid": "...", "udid": "..."}

Modes:
  leaderboard  Fetch only LEGEND ranking and write res/pvp/leaderboard.json.
  full         Fetch ranking plus every player's PvP defense team and also write
               res/pvp/usage.json, including gear, awakening, talent and top-N
               usage details.
"""

from __future__ import annotations

import argparse
import fcntl
import gzip
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE_HOST = "https://rangers-api.line-apps.com"
DEFAULT_VERSION = "12.2"
DEFAULT_LEAGUE = "LEGEND"
APP_VERSION = "LGRGS/12.2.2;android/12"
USER_AGENT = "LGRGS/12.2.2 (Linux; U; Android 12; zh-TW; RMX3843 Build/W528JS)"
ACCEPT_LANGUAGE = "zh-Hant"
MCC = "000"
MNC = "00"
DEFAULT_SECRET_DIR = Path("/home/ubuntu/rangerbook-secrets")
DEFAULT_LF_AC_FILE = DEFAULT_SECRET_DIR / "latest_LF_AC.txt"
DEFAULT_CONFIG_FILE = DEFAULT_SECRET_DIR / "pvp_config.json"
DEFAULT_LOCK_FILE = Path("/tmp/rangerbook-pvp-update.lock")
EQUIP_SLOTS = ("WEAPON", "ARMOR", "ACC")
TOP_N_SCOPES = (10, 30, 50, 100)
NONE_CODE = "__NONE__"
UNKNOWN_CODE = "__UNKNOWN__"


class APIError(RuntimeError):
    pass


class AuthExpiredError(APIError):
    pass


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="更新 LINE Rangers PvP 公開資料")
    parser.add_argument("--mode", choices=("leaderboard", "full"), default="full")
    parser.add_argument("--uid", default=os.getenv("RANGER_PVP_UID"))
    parser.add_argument("--udid", default=os.getenv("RANGER_PVP_UDID"))
    parser.add_argument(
        "--lf-ac-file",
        type=Path,
        default=Path(os.getenv("RANGER_LF_AC_FILE", str(DEFAULT_LF_AC_FILE))),
    )
    parser.add_argument(
        "--config-file",
        type=Path,
        default=Path(os.getenv("RANGER_PVP_CONFIG", str(DEFAULT_CONFIG_FILE))),
    )
    parser.add_argument("--repo-root", type=Path, default=repo_root)
    parser.add_argument("--league", default=DEFAULT_LEAGUE)
    parser.add_argument("--version", default=DEFAULT_VERSION)
    parser.add_argument("--delay", type=float, default=0.20)
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--lock-file", type=Path, default=DEFAULT_LOCK_FILE)
    return parser.parse_args()


def read_lf_ac_file(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(f"找不到 LF_AC 檔案：{path}")
    value = path.read_text(encoding="utf-8", errors="ignore").strip()
    if not value:
        raise ValueError(f"LF_AC 檔案是空的：{path}")
    match = re.search(r"LF_AC=([^;\s]+)", value, flags=re.IGNORECASE)
    return match.group(1).strip() if match else value


def read_auth_config(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"設定檔必須是 JSON object：{path}")
    return {str(key): str(value).strip() for key, value in raw.items() if value is not None}


def resolve_auth(args: argparse.Namespace) -> tuple[str, str, str]:
    config = read_auth_config(args.config_file.expanduser())
    uid = (args.uid or config.get("uid") or "").strip()
    udid = (args.udid or config.get("udid") or "").strip()
    if not uid:
        raise ValueError("缺少 uid：請設定 --uid、RANGER_PVP_UID 或 pvp_config.json")
    if not udid:
        raise ValueError("缺少 udid：請設定 --udid、RANGER_PVP_UDID 或 pvp_config.json")
    return uid, udid, read_lf_ac_file(args.lf_ac_file.expanduser())


def make_headers(account_uid: str, lf_ac: str, udid: str) -> dict[str, str]:
    timestamp = str(int(time.time() * 1000))
    return {
        "Accept": "*/*",
        "Content-Type": "application/json; charset=utf-8;",
        "Accept-Encoding": "gzip",
        "Accept-Language": ACCEPT_LANGUAGE,
        "App-Version": APP_VERSION,
        "User-Agent": USER_AGENT,
        "uid": account_uid,
        "X-LINEGAME-MCC": MCC,
        "X-LINEGAME-MNC": MNC,
        "X-LINEGAME-TIMESTAMP": timestamp,
        "timeID": timestamp,
        "Cookie": f"LF_AC={lf_ac}; udid={udid};",
    }


def decode_response(raw: bytes, content_encoding: str | None) -> bytes:
    if content_encoding and "gzip" in content_encoding.lower():
        try:
            return gzip.decompress(raw)
        except OSError:
            pass
    return raw


def request_json(
    url: str,
    account_uid: str,
    lf_ac: str,
    udid: str,
    retries: int,
) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        request = Request(url, headers=make_headers(account_uid, lf_ac, udid), method="GET")
        try:
            with urlopen(request, timeout=30) as response:
                raw = decode_response(response.read(), response.headers.get("Content-Encoding"))
                parsed = json.loads(raw.decode("utf-8", errors="replace"))
                if not isinstance(parsed, dict):
                    raise APIError(f"API response 不是 object：{url}")
                return parsed
        except HTTPError as exc:
            body_raw = decode_response(exc.read(), exc.headers.get("Content-Encoding"))
            body = body_raw.decode("utf-8", errors="replace")
            if exc.code in (401, 403):
                raise AuthExpiredError(
                    f"HTTP {exc.code}：Session 或認證可能已失效。URL: {url} Response: {body[:500]}"
                ) from exc
            if exc.code == 429 or 500 <= exc.code <= 599:
                last_error = exc
                if attempt < retries:
                    time.sleep(min(2**attempt, 8))
                    continue
            raise APIError(f"HTTP {exc.code} URL: {url} Response: {body[:500]}") from exc
        except (URLError, json.JSONDecodeError, TimeoutError) as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(min(2**attempt, 8))
                continue
            break
    raise APIError(f"Request 失敗：{url}；最後錯誤：{last_error}")


def leaderboard_payload(data: dict[str, Any], *, league: str, version: str) -> dict[str, Any]:
    try:
        league_data = data["result"]["league"]
        ranking = league_data["rankingList"]
    except (KeyError, TypeError) as exc:
        raise APIError("找不到 result.league.rankingList") from exc
    if not isinstance(ranking, list):
        raise APIError("rankingList 不是 list")

    players: list[dict[str, Any]] = []
    for index, entry in enumerate(ranking, start=1):
        if not isinstance(entry, dict):
            continue
        raw_level = int(entry.get("level") or 0)
        players.append({
            "rank": int(entry.get("rank") or index),
            "score": float(entry.get("score") or 0),
            "displayName": str(entry.get("displayName") or "") if entry.get("availableName", True) else "",
            "availableName": bool(entry.get("availableName", True)),
            "nationalFlag": str(entry.get("nationalFlag") or ""),
            "level": raw_level,
            "displayLevel": ((raw_level - 1) % 99 + 1) if raw_level > 0 else None,
            "lastRank": int(entry.get("lastRank") or 0),
            "played": bool(entry.get("played", False)),
        })

    players.sort(key=lambda item: (item["rank"], -item["score"]))
    return {
        "metadata": {
            "generatedAtUtc": now_iso(),
            "league": league,
            "apiVersion": f"v{version}",
            "rankingCount": len(players),
            "totalCount": int(league_data.get("totalCount") or 0),
        },
        "players": players,
    }


def get_ranking_list(data: dict[str, Any]) -> list[dict[str, Any]]:
    try:
        ranking = data["result"]["league"]["rankingList"]
    except (KeyError, TypeError) as exc:
        raise APIError("找不到 result.league.rankingList") from exc
    if not isinstance(ranking, list):
        raise APIError("rankingList 不是 list")
    return [entry for entry in ranking if isinstance(entry, dict)]


def extract_pvp_unit_records(player_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Return full PvP defense-team unit records, supporting nested and flat layouts."""
    root = player_data.get("result", player_data)
    if not isinstance(root, dict):
        return []
    team_map = root.get("playerUnitTeamGroupMap")
    if not isinstance(team_map, dict):
        return []
    pvp_team = team_map.get("pvpteam")

    units: list[dict[str, Any]] = []
    if isinstance(pvp_team, list):
        units.extend(item for item in pvp_team if isinstance(item, dict))
    elif isinstance(pvp_team, dict):
        for value in pvp_team.values():
            if isinstance(value, list):
                units.extend(item for item in value if isinstance(item, dict))
            elif isinstance(value, dict):
                units.append(value)

    return [unit for unit in units if str(unit.get("unitCode") or "").strip()]


def extract_pvp_units(player_data: dict[str, Any]) -> list[str]:
    """Backward-compatible helper returning only unitCode values."""
    return [str(unit["unitCode"]).strip() for unit in extract_pvp_unit_records(player_data)]


def load_ranger_catalog(path: Path) -> dict[str, dict[str, str]]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError("Rangers_data.json 不是 list")
    catalog: dict[str, dict[str, str]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        ranger_id = str(row.get("ranger_id") or "").strip()
        if not ranger_id:
            continue
        catalog[ranger_id] = {
            "name": str(row.get("Ranger名稱") or ranger_id),
            "star": str(row.get("Ranger星數") or ""),
            "type": str(row.get("類型") or ""),
            "element": str(row.get("屬性") or ""),
        }
    return catalog


def normalize_unit_record(value: Any) -> dict[str, Any] | None:
    if isinstance(value, str):
        code = value.strip()
        return {"unitCode": code, "equipMap": {}} if code else None
    if not isinstance(value, dict):
        return None
    code = str(value.get("unitCode") or "").strip()
    if not code:
        return None
    return value


def counter_rows(counter: Counter[str], denominator: int) -> list[dict[str, Any]]:
    rows = [
        {
            "code": code,
            "count": count,
            "rate": round((count / denominator * 100) if denominator else 0, 2),
        }
        for code, count in counter.items()
    ]
    rows.sort(key=lambda item: (-item["count"], item["code"]))
    return rows


def talent_grade_code(value: Any) -> str:
    if value is None or value == "":
        return UNKNOWN_CODE
    try:
        grade = int(value)
    except (TypeError, ValueError):
        return UNKNOWN_CODE
    return str(max(0, grade))


def build_usage_rows(
    player_unit_records: Iterable[list[Any]],
    *,
    catalog: dict[str, dict[str, str]],
) -> tuple[int, list[dict[str, Any]]]:
    player_counter: Counter[str] = Counter()
    appearance_counter: Counter[str] = Counter()
    equipment_counters: dict[str, dict[str, Counter[str]]] = defaultdict(
        lambda: {slot: Counter() for slot in EQUIP_SLOTS}
    )
    awakening_counters: dict[str, Counter[str]] = defaultdict(Counter)
    talent_counters: dict[str, Counter[str]] = defaultdict(Counter)
    sample_count = 0

    for raw_records in player_unit_records:
        records = [record for value in raw_records if (record := normalize_unit_record(value))]
        if not records:
            continue
        sample_count += 1
        player_counter.update({str(record["unitCode"]).strip() for record in records})

        for record in records:
            ranger_id = str(record["unitCode"]).strip()
            appearance_counter[ranger_id] += 1

            equip_map = record.get("equipMap")
            if not isinstance(equip_map, dict):
                equip_map = {}
            for slot in EQUIP_SLOTS:
                equip = equip_map.get(slot)
                equip_code = ""
                if isinstance(equip, dict):
                    equip_code = str(equip.get("equipItemCode") or "").strip()
                equipment_counters[ranger_id][slot][equip_code or NONE_CODE] += 1

            awake_code = str(record.get("awakeAbilityCode") or "").strip()
            awakening_counters[ranger_id][awake_code or NONE_CODE] += 1
            talent_counters[ranger_id][talent_grade_code(record.get("talentGrade"))] += 1

    rows: list[dict[str, Any]] = []
    for ranger_id, player_count in player_counter.items():
        info = catalog.get(ranger_id, {})
        appearances = appearance_counter[ranger_id]
        rows.append({
            "rangerId": ranger_id,
            "name": info.get("name", ranger_id),
            "star": info.get("star", ""),
            "type": info.get("type", ""),
            "element": info.get("element", ""),
            "playerCount": player_count,
            "appearanceCount": appearances,
            "usageRate": round((player_count / sample_count * 100) if sample_count else 0, 2),
            "equipmentUsage": {
                slot: counter_rows(equipment_counters[ranger_id][slot], appearances)
                for slot in EQUIP_SLOTS
            },
            "awakeningUsage": counter_rows(awakening_counters[ranger_id], appearances),
            "talentUsage": counter_rows(talent_counters[ranger_id], appearances),
        })

    rows.sort(key=lambda item: (-item["playerCount"], -item["appearanceCount"], item["rangerId"]))
    for index, row in enumerate(rows, start=1):
        row["rank"] = index
    return sample_count, rows


def build_usage_payload(
    player_unit_records: Iterable[list[Any]],
    *,
    catalog: dict[str, dict[str, str]],
    ranking_count: int,
    failure_count: int,
    league: str,
    version: str,
) -> dict[str, Any]:
    sample_count, rows = build_usage_rows(player_unit_records, catalog=catalog)
    return {
        "metadata": {
            "generatedAtUtc": now_iso(),
            "league": league,
            "apiVersion": f"v{version}",
            "rankingCount": ranking_count,
            "sampleCount": sample_count,
            "playerDataFailureCount": failure_count,
            "definition": "usageRate = players using this Ranger / players with successfully fetched PvP defense teams",
            "detailRateDefinition": "gear/awakening/talent rate = appearances using the option / total Ranger appearances",
        },
        "rangers": rows,
    }


def build_usage_scopes(
    ranked_samples: Iterable[tuple[int, list[Any]]],
    *,
    catalog: dict[str, dict[str, str]],
    ranking_count: int,
    failed_ranks: Iterable[int] = (),
) -> dict[str, dict[str, Any]]:
    samples = list(ranked_samples)
    failed = list(failed_ranks)
    scopes: dict[str, dict[str, Any]] = {}
    for top_n in TOP_N_SCOPES:
        selected = [records for rank, records in samples if rank <= top_n]
        sample_count, rows = build_usage_rows(selected, catalog=catalog)
        scopes[str(top_n)] = {
            "rankingCount": min(top_n, ranking_count),
            "sampleCount": sample_count,
            "playerDataFailureCount": sum(1 for rank in failed if rank <= top_n),
            "rangers": rows,
        }
    return scopes


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def acquire_lock(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = path.open("w", encoding="utf-8")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        return None
    return handle


def run(args: argparse.Namespace) -> int:
    lock_handle = acquire_lock(args.lock_file)
    if lock_handle is None:
        print("另一個 PvP 更新程序仍在執行，本次略過。")
        return 0

    try:
        uid, udid, lf_ac = resolve_auth(args)
        league = args.league.strip().upper()
        version = args.version.strip().removeprefix("v")
        repo_root = args.repo_root.resolve()
        output_dir = repo_root / "res" / "pvp"
        base_url = f"{BASE_HOST}/v{version}"
        leaderboard_url = f"{base_url}/pvp/league/rank/{league}"

        print(f"[{now_iso()}] 更新 PvP：mode={args.mode} league={league} LF_AC length={len(lf_ac)}")
        leaderboard_data = request_json(leaderboard_url, uid, lf_ac, udid, args.retries)
        leaderboard = leaderboard_payload(leaderboard_data, league=league, version=version)
        atomic_write_json(output_dir / "leaderboard.json", leaderboard)
        print(f"排行榜已更新：{leaderboard['metadata']['rankingCount']} 人")

        if args.mode == "leaderboard":
            return 0

        ranking_list = get_ranking_list(leaderboard_data)
        ranked_samples: list[tuple[int, list[dict[str, Any]]]] = []
        failed_ranks: list[int] = []
        failures = 0
        for index, entry in enumerate(ranking_list, start=1):
            rank = int(entry.get("rank") or index)
            player_uid = str(entry.get("uid") or "").strip()
            if not player_uid:
                failures += 1
                failed_ranks.append(rank)
                continue
            player_url = f"{base_url}/player/units/team/equip/uid/{player_uid}"
            try:
                player_data = request_json(player_url, uid, lf_ac, udid, args.retries)
                unit_records = extract_pvp_unit_records(player_data)
                if unit_records:
                    ranked_samples.append((rank, unit_records))
                else:
                    failures += 1
                    failed_ranks.append(rank)
                    print(f"[{index}/{len(ranking_list)}] 找不到 PvP 防守隊伍：rank={rank}")
            except AuthExpiredError:
                raise
            except Exception as exc:  # Keep other players usable as a valid sample.
                failures += 1
                failed_ranks.append(rank)
                print(f"[{index}/{len(ranking_list)}] 玩家資料失敗：{exc}", file=sys.stderr)
            if args.delay > 0 and index < len(ranking_list):
                time.sleep(args.delay)

        catalog = load_ranger_catalog(repo_root / "res" / "Rangers_data.json")
        usage = build_usage_payload(
            [records for _, records in ranked_samples],
            catalog=catalog,
            ranking_count=len(ranking_list),
            failure_count=failures,
            league=league,
            version=version,
        )
        usage["scopes"] = build_usage_scopes(
            ranked_samples,
            catalog=catalog,
            ranking_count=len(ranking_list),
            failed_ranks=failed_ranks,
        )
        atomic_write_json(output_dir / "usage.json", usage)
        print(
            "角色使用率已更新："
            f"有效樣本 {usage['metadata']['sampleCount']} / {len(ranking_list)}，"
            f"角色 {len(usage['rangers'])} 種"
        )
        return 0
    finally:
        fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)
        lock_handle.close()


def main() -> int:
    try:
        return run(parse_args())
    except AuthExpiredError as exc:
        print(f"認證失效：{exc}", file=sys.stderr)
        return 3
    except Exception as exc:
        print(f"更新失敗：{exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
