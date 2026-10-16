#!/usr/bin/env python3
"""Install search-team analysis data support and merge its authored UI rows.

Dry-run by default. Only the Auth resolver and analysis.* locale rows change;
public collectors, authentication settings, and other translations are untouched.
Restart rangerbook-auth.service after a successful --apply.
"""
from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from install_player_equipment_values import atomic_write


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, default=Path("/home/ubuntu"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    module = (repo / "backend/rangerbook_auth/equipment_effects.py").read_text()
    compile(module, "equipment_effects.py", "exec")
    resolver = args.home / "rangerbook-auth/equipment_effects.py"
    locale = args.home / "rangerbook-v2/data/locales/ui.json"
    authored = json.loads((repo / "deploy/aws/v2/locales/ui.json").read_text())
    updates = {row["key"]: row for row in authored if row["key"].startswith("UI:analysis.")}
    if not updates or any(not row.get(lang) for row in updates.values() for lang in ("zh_TW", "en", "th", "jp")):
        raise ValueError("Missing analysis translations")
    current = json.loads(locale.read_text())
    if len({row['key'] for row in current}) != len(current):
        raise ValueError("Duplicate production locale keys")
    merged = [updates.pop(row['key'], row) for row in current] + list(updates.values())
    changes = [(resolver, module), (locale, json.dumps(merged, ensure_ascii=False, separators=(',', ':')) + '\n')]
    for target, content in changes:
        if not target.is_file():
            raise FileNotFoundError(target)
        print(('apply' if args.apply else 'dry-run'), target, len(content.encode()), 'bytes')
    if not args.apply:
        return
    backup = args.home / 'rangerbook-backups' / ('team-analysis-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    for target, _ in changes:
        saved = backup / target.relative_to(args.home)
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, saved)
    try:
        for target, content in changes:
            atomic_write(target, content, target.stat().st_mode & 0o777)
    except Exception:
        for target, _ in changes:
            shutil.copy2(backup / target.relative_to(args.home), target)
        raise
    print('backup:', backup)


if __name__ == '__main__':
    main()
