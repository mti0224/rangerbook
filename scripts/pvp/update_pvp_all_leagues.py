#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

LEAGUES = (
    "LEGEND",
    "MASTER_1", "MASTER_2", "MASTER_3",
    "DIAMOND_1", "DIAMOND_2", "DIAMOND_3",
    "GOLD_1", "GOLD_2", "GOLD_3",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Update and publish all LINE Rangers PvP leagues")
    parser.add_argument("--mode", choices=("leaderboard", "full"), default="full")
    parser.add_argument("--collector", type=Path, default=Path("/home/ubuntu/rangerbook-pvp/scripts/pvp/update_pvp_data.py"))
    parser.add_argument("--repo-root", type=Path, default=Path("/home/ubuntu/rangerbook-pvp"))
    parser.add_argument("--public-dir", type=Path, default=Path("/var/www/rangerbook-pvp"))
    parser.add_argument("--python", default=sys.executable)
    return parser.parse_args()


def destination_name(base: str, league: str) -> str:
    return f"{base}.json" if league == "LEGEND" else f"{base}_{league}.json"


def atomic_publish(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp = destination.with_name(f".{destination.name}.tmp-{os.getpid()}")
    shutil.copy2(source, temp)
    os.replace(temp, destination)


def prepare_temp_root(source_repo_root: Path, temp_root: Path) -> None:
    source_catalog = source_repo_root / "res" / "Rangers_data.json"
    if not source_catalog.is_file():
        raise FileNotFoundError(f"Missing Ranger catalog: {source_catalog}")
    temp_res = temp_root / "res"
    temp_res.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_catalog, temp_res / "Rangers_data.json")


def run_one(args: argparse.Namespace, league: str) -> None:
    print(f"\n===== PvP {league} / {args.mode} =====", flush=True)
    with tempfile.TemporaryDirectory(prefix=f"rangerbook-pvp-{league.lower()}-") as tmp:
        temp_root = Path(tmp)
        prepare_temp_root(args.repo_root, temp_root)
        subprocess.run([
            args.python, str(args.collector),
            "--mode", args.mode,
            "--league", league,
            "--repo-root", str(temp_root),
        ], check=True)

        generated = temp_root / "res" / "pvp"
        bases = ["leaderboard"] if args.mode == "leaderboard" else ["leaderboard", "usage", "player_teams"]
        for base in bases:
            source = generated / f"{base}.json"
            if not source.is_file():
                raise FileNotFoundError(f"Collector did not generate: {source}")
            destination = args.public_dir / destination_name(base, league)
            atomic_publish(source, destination)
            print(f"[PUBLISH] {destination}", flush=True)


def main() -> int:
    args = parse_args()
    args.collector = args.collector.resolve()
    args.repo_root = args.repo_root.resolve()
    args.public_dir = args.public_dir.resolve()
    if not args.collector.is_file():
        raise FileNotFoundError(f"Collector not found: {args.collector}")
    for league in LEAGUES:
        run_one(args, league)
    print("\n[DONE] All PvP leagues updated successfully.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
