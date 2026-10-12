#!/usr/bin/env python3
"""Read-only audit of public V2 catalogs and semantic text bindings.

Empty official translations are reported, never filled or treated as success.
This CLI has no dependency on V1 output or the EC2 compiler environment.
"""
import argparse
import collections
import json
import re
from pathlib import Path

LANGUAGES = ("zh_TW", "en", "th", "jp")
FIELDS = {"key", *LANGUAGES}
TOKEN = re.compile(r"%(?:N\d*|d\d*|s|n)|\{\$\d+[pf]\}")
CJK = re.compile(r"[\u3400-\u9fff]")


def slots(text):
    """Numbered placeholders share argument slots; bare tokens are sequential."""
    sequential = 0
    result = []
    for match in TOKEN.finditer(text):
        token = match.group()
        indexed = re.fullmatch(r"%[Nd](\d+)", token)
        if indexed:
            result.append(int(indexed[1]) - 1)
        elif token.startswith("{$"):
            result.append(None)  # Native game formatting needs an explicit binding.
        else:
            result.append(sequential)
            sequential += 1
    return result


def audit(root):
    findings = []
    catalog = {}
    stats = {}
    references = collections.defaultdict(list)

    def issue(kind, path, **detail):
        findings.append({"kind": kind, "path": path, **detail})

    for kind in ("official", "custom", "ui"):
        file = root / "locales" / (kind + ".json")
        rows = json.loads(file.read_text(encoding="utf-8"))
        stats[kind] = {"total": len(rows), "missing": {
            lang: sum(not isinstance(r.get(lang), str) or not r[lang].strip()
                      for r in rows) for lang in LANGUAGES}}
        for i, row in enumerate(rows):
            path = f"locales/{kind}.json[{i}]"
            if set(row) != FIELDS or not all(isinstance(row.get(k), str) for k in FIELDS):
                issue("invalid_catalog_row", path)
                continue
            key = row["key"]
            if key in catalog:
                issue("duplicate_catalog_key", path, key=key)
            catalog[key] = row
            if any(ord(c) < 32 for c in key):
                issue("control_character_key", path, key=key)
            if kind != "official":
                layouts = {lang: slots(row[lang]) for lang in LANGUAGES if row[lang].strip()}
                signatures = {lang: sorted(s for s in values if s is not None)
                              for lang, values in layouts.items()}
                if len({tuple(v) for v in signatures.values()}) > 1:
                    issue("placeholder_signature_drift", path, key=key, signatures=signatures)

    def reference(key, path, args=None, bindings=None):
        references[key].append(path)
        if key not in catalog:
            issue("missing_catalog_key", path, key=key)
            return
        row = catalog[key]
        if not any(row[l].strip() for l in LANGUAGES):
            issue("empty_referenced_translation", path, key=key)
        for lang in LANGUAGES:
            if not row[lang].strip():
                continue
            required = slots(row[lang])
            native = [t[1:-1] for t in TOKEN.findall(row[lang]) if t.startswith("{$")]
            if native and bindings is not None:
                if any(not isinstance(bindings.get(t), dict) or
                       any(bindings[t].get(k) is None for k in ("min", "max", "unit"))
                       for t in native):
                    issue("invalid_native_bindings", path, key=key, language=lang, tokens=native)
                required = [s for s in required if s is not None]
            if required and args is None:
                issue("unbound_placeholder", path, key=key, language=lang,
                      tokens=TOKEN.findall(row[lang]))
            elif args is not None and (None in required or any(
                    s < 0 or s >= len(args) or args[s] is None for s in required if s is not None)):
                issue("invalid_template_arguments", path, key=key, language=lang,
                      requiredSlots=required, args=args)

    def walk(value, path):
        if isinstance(value, dict):
            if "effectKey" in value and value.get("effectKey") is None and value.get("effectCode") not in (None,"NONE"):
                issue("missing_effect_translation",path,effectCode=value["effectCode"])
            if "localizedEffect" in value and value.get("localizedEffect") is None and value.get("effectCode") not in (None,"NONE"):
                issue("missing_effect_translation",path,effectCode=value["effectCode"])
            if value.get("untranslated") is True:
                issue("untranslated_semantic_condition", path,
                      condition={k:v for k,v in value.items() if k!="untranslated"})
            if isinstance(value.get("templateKey"), str):
                args = value.get("args")
                if not isinstance(args, list):
                    issue("invalid_args_type", path)
                    args = []
                reference(value["templateKey"], path + ".templateKey", args)
            if isinstance(value.get("key"), str):
                reference(value["key"], path + ".key")
            for field, item in value.items():
                if field in ("key", "templateKey"):
                    continue
                if field.endswith("Key") and isinstance(item, str) and item:
                    args = value.get(field[:-3] + "Args")
                    bindings = value.get(field[:-3] + "Bindings")
                    reference(item, path + "." + field, args, bindings)
                elif field.endswith("Keys") and isinstance(item, list):
                    for i, key in enumerate(item):
                        if isinstance(key, str) and key:
                            reference(key, f"{path}.{field}[{i}]")
                if field == "effectCode" and isinstance(item, str) and item.startswith("SKILLEFF_"):
                    reference("CUSTOM:" + item, path + ".effectCode")
                walk(item, path + "." + field)
        elif isinstance(value, list):
            for i, item in enumerate(value):
                # Strings in parts are translation references too.
                if path.endswith(".parts") and isinstance(item, str):
                    reference(item, f"{path}[{i}]")
                else:
                    walk(item, f"{path}[{i}]")
        elif isinstance(value, str) and CJK.search(value):
            issue("literal_cjk_value", path, value=value)

    datasets = {}
    for file in sorted(root.rglob("*.json")):
        if "locales" in file.relative_to(root).parts or file.name in ("manifest.json", "translation-audit.json"):
            continue
        payload = json.loads(file.read_text(encoding="utf-8"))
        name = file.relative_to(root).as_posix()
        if not isinstance(payload, dict) or payload.get("schemaVersion") != 2:
            issue("invalid_dataset_envelope", name)
        datasets[name] = len(next((v for k, v in payload.items()
                                  if k != "schemaVersion" and isinstance(v, (dict, list))), []))
        walk(payload, name)
    return {"schemaVersion": 1, "catalogs": stats, "datasets": datasets,
            "referencedKeys": len(references),
            "missingReferencedKeys": sorted(k for k in references if k not in catalog),
            "emptyReferencedKeys": sorted(k for k in references if k in catalog
                                          and not any(catalog[k][l].strip() for l in LANGUAGES)),
            "findingCounts": dict(collections.Counter(x["kind"] for x in findings)),
            "findings": findings}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1] / "res/v2")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--strict", action="store_true", help="Exit nonzero for any structural/text binding finding")
    args = parser.parse_args()
    result = audit(args.root)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "findings"}, ensure_ascii=False, indent=2))
    return int(args.strict and bool(result["findings"]))


if __name__ == "__main__":
    raise SystemExit(main())
