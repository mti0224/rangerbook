#!/usr/bin/env python3
"""Export official LINE Rangers locale dictionaries without modifying source data.

Official lang_unit/lang_equip data is separate from the author's custom.json.
Custom translations are never fetched or overwritten by the official updater.
Translations in custom_<locale>.json are optional drafts requiring human review.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

LOCALES = ("zh-Hant", "en", "ja", "ko", "th")
KINDS = ("UNIT", "SKILL", "ABILITY", "EQUIP")


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def build(raw_dir: Path, out_dir: Path, locales=LOCALES):
    translations = {l: {kind: {} for kind in KINDS} for l in locales}
    collisions = Counter()
    for filename in ("lang_unit.json", "lang_equip.json"):
        rows = read(raw_dir / filename)
        if not isinstance(rows, list):
            raise ValueError("Expected a JSON list in " + filename)
        for row in rows:
            if not isinstance(row, dict):
                continue
            language, kind = row.get("language"), row.get("msgType")
            code, message = row.get("dataCode"), row.get("msg")
            if language not in translations or kind not in KINDS:
                continue
            if not code or not isinstance(message, str) or not message.strip():
                continue
            previous = translations[language][kind].get(code)
            if previous is not None and previous != message:
                collisions[(language, kind)] += 1
            translations[language][kind][code] = message

    out_dir.mkdir(parents=True, exist_ok=True)
    result = {}
    for locale in locales:
        source = "custom.json" if locale == "zh-Hant" else "custom_" + locale + ".json"
        custom_file = raw_dir / source
        custom = read(custom_file) if custom_file.exists() else {}
        if not isinstance(custom, dict) or any(not isinstance(v, str) for v in custom.values()):
            raise ValueError("Expected a string-valued object in " + str(custom_file))
        payload = {"locale": locale, "official": translations[locale], "custom": custom}
        output = out_dir / (locale + ".json")
        temporary = output.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")
        temporary.replace(output)
        result[locale] = {
            "official": {k: len(v) for k, v in translations[locale].items()},
            "custom": len(custom),
            "bytes": output.stat().st_size,
        }
    return {"locales": result, "collisions": {str(k): v for k, v in collisions.items()}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=Path("data/raw"))
    parser.add_argument("--out-dir", type=Path, default=Path("res/i18n"))
    parser.add_argument("--locales", nargs="+", choices=LOCALES, default=list(LOCALES))
    args = parser.parse_args()
    print(json.dumps(build(args.raw_dir, args.out_dir, args.locales), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
