#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Record LINE Rangers resource-manifest changes without downloading assets.

This script consumes the raw manifest already fetched by api_db_to_raw.py on the
same 10-minute updater run. It writes:
- batches/<timestamp>_<resource-timestamp>.txt: one changed resource path per line
- history.jsonl: append-only structured history
- index.json: compact recent history for the admin API/UI
- recorder_state.json: duplicate-prevention state

No ZIP/OGG/asset payloads are downloaded here.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_OUTPUT_DIR = Path("/home/ubuntu/rangerbook-cache/resource-updates")
MAX_INDEX_BATCHES = 200


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_iso(dt: datetime | None = None) -> str:
    return (dt or utc_now()).isoformat(timespec="seconds").replace("+00:00", "Z")


def compact_stamp(dt: datetime | None = None) -> str:
    return (dt or utc_now()).strftime("%Y%m%dT%H%M%SZ")


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=str(path.parent),
    )
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    atomic_write_text(
        path,
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
    )


def load_json(path: Path, default: Any) -> Any:
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def extract_manifest_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    result = payload.get("result")
    if isinstance(result, list):
        rows = result
    elif isinstance(result, dict):
        rows = result.get("resources", [])
    else:
        rows = []
    return [row for row in rows if isinstance(row, dict)]


def normalize_path(row: dict[str, Any]) -> str:
    raw = str(row.get("resourcePath") or "").strip()
    if raw:
        if raw.startswith("http://") or raw.startswith("https://"):
            return raw
        return "/" + raw.lstrip("/")
    resource_id = str(row.get("resourceId") or "").strip()
    return f"[resourceId:{resource_id or 'unknown'}]"


def normalize_item(row: dict[str, Any]) -> dict[str, Any]:
    path = normalize_path(row)
    resource_type = str(row.get("resourceType") or "").strip().lower()
    signature = str(row.get("signature") or "").strip().lower()
    resource_id = str(row.get("resourceId") or "").strip()
    return {
        "path": path,
        "resourceId": resource_id or None,
        "resourceType": resource_type or None,
        "signature": signature or None,
        "size": row.get("size"),
        "deleted": bool(row.get("deleted")),
    }


def rows_digest(items: list[dict[str, Any]], resource_timestamp: str) -> str:
    canonical = json.dumps(
        {"resourceTimestamp": resource_timestamp, "items": items},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Record LINE Rangers changed resource paths",
    )
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--resource-state", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()

    now = utc_now()
    output_dir = args.output_dir
    batches_dir = output_dir / "batches"
    index_path = output_dir / "index.json"
    history_path = output_dir / "history.jsonl"
    recorder_state_path = output_dir / "recorder_state.json"
    latest_path = output_dir / "latest.txt"

    output_dir.mkdir(parents=True, exist_ok=True)
    batches_dir.mkdir(parents=True, exist_ok=True)

    manifest_payload = load_json(args.manifest, {})
    if not isinstance(manifest_payload, dict):
        raise RuntimeError(f"manifest root is not an object: {args.manifest}")

    resource_state = load_json(args.resource_state, {})
    if not isinstance(resource_state, dict):
        resource_state = {}

    rows = extract_manifest_rows(manifest_payload)
    items_by_key: dict[tuple[str, str | None, bool], dict[str, Any]] = {}
    for row in rows:
        item = normalize_item(row)
        key = (item["path"], item["signature"], item["deleted"])
        items_by_key[key] = item
    items = sorted(items_by_key.values(), key=lambda item: item["path"])

    resource_timestamp = str(
        resource_state.get("lastRemoteTimestamp")
        or resource_state.get("resourceTimestamp")
        or ""
    ).strip()

    state = load_json(recorder_state_path, {})
    if not isinstance(state, dict):
        state = {}

    digest = rows_digest(items, resource_timestamp)
    index = load_json(index_path, {})
    if not isinstance(index, dict):
        index = {}

    index.setdefault("schemaVersion", 1)
    index["lastCheckedAt"] = utc_iso(now)
    index["resourceTimestamp"] = resource_timestamp or None
    index.setdefault("batches", [])

    if not items:
        index["latestCount"] = 0
        atomic_write_json(index_path, index)
        state.update(
            {
                "schemaVersion": 1,
                "lastCheckedAt": utc_iso(now),
                "lastResourceTimestamp": resource_timestamp or None,
                "lastDigest": digest,
            }
        )
        atomic_write_json(recorder_state_path, state)
        print("[RESOURCE LOG] no changed resource paths in this manifest")
        return 0

    if state.get("lastDigest") == digest:
        index["latestCount"] = len(items)
        atomic_write_json(index_path, index)
        state["lastCheckedAt"] = utc_iso(now)
        atomic_write_json(recorder_state_path, state)
        print("[RESOURCE LOG] manifest already recorded; skipped duplicate")
        return 0

    db_items = [
        item
        for item in items
        if item.get("resourceType") in {"db", "ndb"}
        or str(item.get("path") or "").lower().endswith((".db", ".ndb"))
    ]
    deleted_items = [item for item in items if item.get("deleted")]

    safe_ts = resource_timestamp if resource_timestamp.isdigit() else "unknown"
    filename = f"{compact_stamp(now)}_{safe_ts}.txt"
    batch_path = batches_dir / filename
    text_body = "\n".join(item["path"] for item in items) + "\n"
    atomic_write_text(batch_path, text_body)
    atomic_write_text(latest_path, text_body)

    batch = {
        "id": f"{safe_ts}-{digest[:12]}",
        "detectedAt": utc_iso(now),
        "resourceTimestamp": resource_timestamp or None,
        "count": len(items),
        "dbCount": len(db_items),
        "deletedCount": len(deleted_items),
        "textFile": f"batches/{filename}",
        "items": items,
    }

    history_path.parent.mkdir(parents=True, exist_ok=True)
    with history_path.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                batch,
                ensure_ascii=False,
                separators=(",", ":"),
            )
            + "\n"
        )
        fh.flush()
        os.fsync(fh.fileno())

    batches = index.get("batches")
    if not isinstance(batches, list):
        batches = []
    batches = [
        item
        for item in batches
        if isinstance(item, dict) and item.get("id") != batch["id"]
    ]
    batches.insert(0, batch)
    index["batches"] = batches[:MAX_INDEX_BATCHES]
    index["latestCount"] = len(items)
    index["totalRecordedBatches"] = int(index.get("totalRecordedBatches") or 0) + 1
    atomic_write_json(index_path, index)

    state.update(
        {
            "schemaVersion": 1,
            "lastCheckedAt": utc_iso(now),
            "lastResourceTimestamp": resource_timestamp or None,
            "lastDigest": digest,
            "lastBatchId": batch["id"],
        }
    )
    atomic_write_json(recorder_state_path, state)

    print(
        f"[RESOURCE LOG] recorded {len(items)} changed paths "
        f"(db/ndb={len(db_items)}, deleted={len(deleted_items)}) -> {batch_path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
