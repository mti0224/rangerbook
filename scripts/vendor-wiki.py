"""Fetch pinned wiki browser dependencies and verify registry SHA-512 digests.

All assets are served from the website after vendoring; readers and authors do
not contact the package registry. Run from the repository root.
"""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
from io import BytesIO
import json
from pathlib import Path
import tarfile
from urllib.request import urlopen

DEPENDENCIES = [
    ('@editorjs/editorjs', '2.31.0', 'editorjs', {'dist/editorjs.umd.js', 'LICENSE'}),
    ('katex', '0.19.1', 'katex', {'dist/katex.min.js', 'dist/katex.min.css', 'LICENSE'}),
    ('@highlightjs/cdn-assets', '11.12.0', 'highlight', {'highlight.min.js', 'styles/github.min.css', 'styles/github-dark.min.css', 'LICENSE'}),
]


def fetch(item, root):
    package, version, directory, selected = item
    with urlopen('https://registry.npmjs.org/' + package + '/' + version, timeout=45) as response:
        metadata = json.load(response)
    with urlopen(metadata['dist']['tarball'], timeout=60) as response:
        raw = response.read()
    algorithm, digest = metadata['dist']['integrity'].split('-', 1)
    if algorithm != 'sha512' or base64.b64encode(hashlib.sha512(raw).digest()).decode() != digest:
        raise RuntimeError('Registry integrity mismatch: ' + package)
    target = root / 'assets' / 'vendor' / directory
    target.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=BytesIO(raw), mode='r:gz') as archive:
        for member in archive.getmembers():
            name = member.name.removeprefix('package/')
            if not member.isfile() or '..' in Path(name).parts:
                continue
            if name not in selected and not (directory == 'katex' and name.startswith('dist/fonts/')):
                continue
            relative = name.removeprefix('dist/') if directory != 'highlight' else name
            path = target / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(archive.extractfile(member).read())
    (target / 'version.json').write_text(json.dumps({'package': package, 'version': version, 'integrity': metadata['dist']['integrity']}))
    print(package, version, 'verified', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--destination', type=Path, default=Path(__file__).resolve().parents[1])
    options = parser.parse_args()
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(fetch, item, options.destination) for item in DEPENDENCIES]
        for future in futures:
            future.result()
