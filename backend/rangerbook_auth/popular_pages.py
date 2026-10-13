"""Public, allowlisted leaf-page ranking. No private traffic fields are exposed."""
from __future__ import annotations

import json
import os
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit


def load_catalog():
    root = Path(__file__).resolve().parent
    deployed = root / "popular-page-catalog.json"
    source = root.parents[1] / "assets/data/popular-pages.json"
    file = deployed if deployed.is_file() else source
    v2 = Path(os.getenv("RANGERBOOK_V2_DATA_DIR", "/home/ubuntu/rangerbook-v2/data/v2"))
    if not v2.is_dir():
        v2 = root.parents[1] / "res/v2"
    inputs = [file, v2 / "ranger-index.json", v2 / "equipment-name-index.json"]
    inputs += [v2 / f"stages/{mode}.json" for mode in ("hard", "extreme", "endless")]
    return _load_catalog(tuple((str(p), p.stat().st_mtime_ns, p.stat().st_size) for p in inputs))


@lru_cache(maxsize=1)
def _load_catalog(inputs):
    catalog = json.loads(Path(inputs[0][0]).read_text(encoding="utf-8"))
    for (file, _, _), array, field, prefix in zip(inputs[1:3],
            ("rangers", "equipment"), ("rangerCode", "equipCode"), ("/ranger/ranger/", "/gear/")):
        for row in json.loads(Path(file).read_text(encoding="utf-8"))[array]:
            code = row[field]
            if re.fullmatch(r"[A-Za-z0-9_-]+", code):
                catalog[prefix + code + "/"] = {}
    for (file, _, _), mode, prefix in zip(inputs[3:], ("hard", "extreme", "endless"),
            ("/mainstage/hard/stage/hs", "/mainstage/extreme/stage/es", "/endless/stage/end")):
        for row in json.loads(Path(file).read_text(encoding="utf-8"))["stages"]:
            match = re.fullmatch(mode + r"-(\d+)", row["stageId"])
            if match:
                catalog[prefix + match[1] + "/"] = {}
    return catalog


def canonical_path(value, catalog):
    if not isinstance(value, str) or not value.startswith("/") or value.startswith("//"):
        return None
    parsed = urlsplit(value)
    path = unquote(parsed.path)
    if path.startswith("/rangerbook/"):
        path = path[len("/rangerbook"):]
    if path.endswith("/index.html"):
        path = path[:-len("index.html")]
    path = path.rstrip("/") + "/"
    # Detail URLs are rewritten by the existing page controller. Keep them
    # separate from their list page, including ?detail= entry URLs.
    detail = parse_qs(parsed.query).get("detail", [None])[0]
    if detail and path in ("/ranger/ranger/", "/gear/") and re.fullmatch(r"[A-Za-z0-9_-]+", detail):
        path += detail + "/"
    path = {"/hsEnemy/": "/mainstage/hard/enemy/", "/infEnemy/": "/endless/enemy/"}.get(path, path)
    return path if path in catalog else None


def build_popular_report(pages, updated_at, catalog=None):
    catalog = load_catalog() if catalog is None else catalog
    counts = Counter()
    for page in pages:
        if not isinstance(page, dict):
            continue
        path = canonical_path(page.get("path"), catalog)
        views = page.get("views")
        if path and type(views) is int and views > 0:
            counts[path] += views
    top = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:3]
    return {
        "status": "ready", "days": 7, "updatedAt": updated_at,
        "pages": [{"rank": rank, "path": path, "views": views}
                  for rank, (path, views) in enumerate(top, 1)],
    }
