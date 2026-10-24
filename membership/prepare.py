"""Prepare a new release directory; never edits the active service or its database."""
import argparse
import ast
import hashlib
import json
import os
import shutil
from pathlib import Path


def prepare(source, destination):
    if destination.exists():
        raise ValueError('Destination must not exist')
    # Explicit source allowlist: no env, databases, logs, credentials, keys or team data.
    names = ['app.py', 'asgi.py', 'security.py', 'game_binding.py', 'player_query.py',
             'popular_pages.py', 'equipment_effects.py', 'traffic_collector.py', 'requirements.txt']
    destination.mkdir(mode=0o700, parents=True)
    manifest = {}
    for name in names:
        data = (source / name).read_bytes()
        manifest[name] = hashlib.sha256(data).hexdigest()
        (destination / name).write_bytes(data)
    shutil.copytree(Path(__file__).parent, destination / 'membership', ignore=shutil.ignore_patterns('__pycache__'))
    # asgi owns password changes; import extension only after all legacy routes exist.
    with (destination / 'asgi.py').open('a') as handle:
        handle.write('\nimport app as _membership_host\nfrom membership.service import install as _install_membership\n_membership = _install_membership(_membership_host)\n')
    for item in destination.rglob('*.py'):
        ast.parse(item.read_text())
    (destination / 'source-manifest.json').write_text(json.dumps(manifest, indent=2))
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    prepare(args.source.resolve(), args.destination.resolve())
    print('Release prepared; environment, venv, migration and service switch require separate steps.')


if __name__ == '__main__':
    main()
