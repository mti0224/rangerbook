#!/usr/bin/env python3
"""Install the shared public-equipment serializer into the three live services.

Default is a dry run. Only the named serializer functions are replaced, keeping
unrelated production fixes. Backups and syntax checks precede atomic writes.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

TARGETS = (
    ("rangerbook-auth/player_query.py", "_public_equipment"),
    ("rangerbook-pvp/scripts/pvp/update_pvp_data.py", "_public_equipment"),
    ("rangerbook-scripts/collect_guildwar_compact.py", "compact_gear"),
)


def patch_serializer(source: str, name: str) -> str:
    tree = ast.parse(source)
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name)
    old = ast.get_source_segment(source, node)
    if "attr4No" not in old and "public_equipment" not in old:
        raise ValueError(f"Unexpected {name} serializer; refusing to replace")
    # Local import works for both the executable collectors and importlib loaders.
    replacement = (f"def {name}(value: Any) -> dict[str, Any] | None:\n"
                   "    return _equipment_values_module().public_equipment(value)\n")
    lines = source.splitlines(keepends=True)
    lines[node.lineno - 1:node.end_lineno] = [replacement]
    result = "".join(lines)
    if "def _equipment_values_module(" not in result:
        helper = '''
def _equipment_values_module():
    # Cache on the function: one resolver per process, with mtime-based data refresh.
    if not hasattr(_equipment_values_module, "module"):
        import importlib.util
        path = Path(__file__).with_name("equipment_effects.py")
        spec = importlib.util.spec_from_file_location("rangerbook_equipment_values", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _equipment_values_module.module = module
    return _equipment_values_module.module

'''
        # Before main() is invoked, including when this collector is executed.
        pos = result.find('\nif __name__ ==')
        result = result[:pos] + helper + result[pos:] if pos >= 0 else result + helper
    compile(result, "<patched serializer>", "exec")
    return result


def atomic_write(path: Path, content: str, mode: int):
    fd, temp = tempfile.mkstemp(prefix=".equipment-values-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as file:
            file.write(content)
            file.flush()
            os.fsync(file.fileno())
        os.chmod(temp, mode)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, default=Path("/home/ubuntu"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    source = Path(__file__).resolve().parents[2] / "backend/rangerbook_auth/equipment_effects.py"
    module = source.read_text()
    compile(module, str(source), "exec")
    changes = []
    for relative, name in TARGETS:
        target = args.home / relative
        changes.extend(((target, patch_serializer(target.read_text(), name)),
                        (target.with_name("equipment_effects.py"), module)))
    backup = args.home / "rangerbook-backups" / ("equipment-values-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
    if args.apply:
        for target, _ in changes:
            if target.exists():
                destination = backup / target.relative_to(args.home)
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, destination)
        written = []
        try:
            for target, content in changes:
                mode = target.stat().st_mode & 0o777 if target.exists() else 0o644
                atomic_write(target, content, mode)
                written.append(target)
        except Exception:
            for target in written:
                saved = backup / target.relative_to(args.home)
                if saved.exists():
                    shutil.copy2(saved, target)
                else:
                    target.unlink(missing_ok=True)
            raise
    print("applied" if args.apply else "dry-run", "backup:", backup if args.apply else "none")
    for target, content in changes:
        print(hashlib.sha256(content.encode()).hexdigest(), target)


if __name__ == "__main__":
    main()
