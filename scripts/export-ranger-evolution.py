#!/usr/bin/env python3
"""Regenerate the rollout snapshot from official raw units and public Rangers."""
import argparse
import hashlib
import json
from pathlib import Path


def compile_edges(units, ranger_ids):
    fields = [("unitCodeAfterEvolution", "NORMAL"),
              ("unitCodeAfterTranscendence", "ULTRA"),
              ("unitCodeAfterHyper", "HYPER")]
    edges = []
    for row in units:
        source = row.get("unitCode")
        if source not in ranger_ids:
            continue
        for field, kind in fields:
            target = row.get(field)
            if not target:
                continue
            if target not in ranger_ids or target == source:
                raise ValueError(f"Invalid official evolution target: {source} -> {target}")
            edges.append({"from": source, "to": target, "kind": kind})
    return edges


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--units", type=Path, required=True)
    parser.add_argument("--rangers", type=Path, required=True)
    parser.add_argument("--source-date", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    raw = args.units.read_bytes()
    ids = {row["rangerCode"] for row in json.loads(args.rangers.read_text())["rangers"]}
    payload = {"schemaVersion": 1, "source": "official_unit",
               "sourceSha256": hashlib.sha256(raw).hexdigest(), "sourceDate": args.source_date,
               "edges": compile_edges(json.loads(raw), ids)}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"))+"\n")
