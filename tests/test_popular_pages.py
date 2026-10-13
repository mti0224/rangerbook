"""Ranking correctness, pagination, and public/private API boundaries."""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend/rangerbook_auth"))
from popular_pages import build_popular_report, canonical_path, load_catalog


class RankingTests(unittest.TestCase):
    def test_hubs_admin_home_and_unknown_paths_never_rank(self):
        catalog = load_catalog()
        for path in ["/", "/index.html", "/ranger/", "/pvp/", "/guildwar/",
                     "/mainstage/", "/mainstage/hard/", "/endless/", "/labyrinth/",
                     "/admin/", "/pvp/search/", "/settings/", "/tests/a/",
                     "//example.com/pvp/usage/", "/ranger/ranger/not-a-real-page"]:
            self.assertIsNone(canonical_path(path, catalog), path)
        for path, metadata in catalog.items():
            if metadata:
                self.assertTrue((ROOT / path.strip("/") / "index.html").is_file(), path)

    def test_verified_detail_pages_rank_separately_from_lists(self):
        catalog = load_catalog()
        ranger = json.loads((ROOT / "res/v2/ranger-index.json").read_text())["rangers"][0]["rangerCode"]
        detail = "/ranger/ranger/" + ranger + "/"
        self.assertEqual(canonical_path("/ranger/ranger/?detail=" + ranger, catalog), detail)
        data = build_popular_report([
            {"path": detail.rstrip("/"), "views": 50},
            {"path": "/ranger/ranger/?detail=" + ranger, "views": 40},
            {"path": "/ranger/ranger/", "views": 30},
        ], "now")
        self.assertEqual([p["views"] for p in data["pages"]], [90, 30])
        self.assertEqual(canonical_path("/endless/stage/end1", catalog), "/endless/stage/end1/")
        self.assertIsNone(canonical_path("/endless/stage/end999999", catalog))

    def test_aliases_are_combined_before_ranking_with_stable_ties(self):
        rows = [
            {"path": "/", "views": 9000}, {"path": "/pvp/", "views": 8000},
            {"path": "/rangerbook/pvp/usage/index.html", "views": 40},
            {"path": "/pvp/usage?league=LEGEND", "views": 30},
            {"path": "/gear/", "views": 60}, {"path": "/ability/", "views": 60},
            {"path": "/pvp/leaderboard/", "views": 50},
            {"path": "/ranger/ranger/", "views": -1},
            {"path": "/ranger/compare/", "views": True},
        ]
        data = build_popular_report(rows, "2026-10-13T10:00:00Z")
        self.assertEqual(data["pages"], [
            {"rank": 1, "path": "/pvp/usage/", "views": 70},
            {"rank": 2, "path": "/ability/", "views": 60},
            {"rank": 3, "path": "/gear/", "views": 60},
        ])
        self.assertEqual(canonical_path("/hsEnemy/index.html", load_catalog()), "/mainstage/hard/enemy/")
        self.assertEqual(build_popular_report([], "now")["pages"], [])

    def test_collector_paginates_before_applying_allowlist(self):
        from google.analytics.data_v1beta.types import RunReportResponse
        import traffic_collector
        class Client:
            def __init__(self): self.requests = []
            def run_report(self, request):
                self.requests.append(request)
                rows = [("/pvp/", 500), ("/pvp/usage/", 90)] if request.offset == 0 else [("/gear/", 80)]
                return RunReportResponse(row_count=3, rows=[{
                    "dimension_values": [{"value": path}], "metric_values": [{"value": str(views)}]
                } for path, views in rows])
        client = Client()
        data = traffic_collector.generate_popular(client)
        self.assertEqual([r.offset for r in client.requests], [0, 2])
        self.assertEqual([p["path"] for p in data["pages"]], ["/pvp/usage/", "/gear/"])
        self.assertEqual(client.requests[0].date_ranges[0].start_date, "6daysAgo")
        self.assertEqual(client.requests[0].dimension_filter.filter.field_name, "hostName")


class PublicAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient
        cls.temp = tempfile.TemporaryDirectory()
        os.environ["RANGERBOOK_AUTH_DB"] = str(Path(cls.temp.name) / "auth.db")
        import app
        cls.api = app
        cls.client = TestClient(app.app)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        cls.temp.cleanup()

    def test_public_cache_does_not_expose_private_fields_and_admin_stays_protected(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(self.api, "TRAFFIC_CACHE_DIR", Path(directory)):
            response = self.client.get("/public/popular-pages")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["status"], "unconfigured")
            cache = Path(directory) / "popular-pages.json"
            data = build_popular_report([{"path": "/pvp/usage/", "views": 42}], "now")
            data.update(summary={"users": 100}, sources=[{"source": "private"}])
            data["pages"][0]["private"] = "hidden"
            cache.write_text(json.dumps(data))
            response = self.client.get("/public/popular-pages", headers={"Origin": "https://rangerbook.warmycat.com"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), build_popular_report(data["pages"], "now"))
            self.assertEqual(response.headers["access-control-allow-origin"], "https://rangerbook.warmycat.com")
            self.assertIn("max-age=300", response.headers["cache-control"])
            self.assertEqual(self.client.get("/admin/traffic?days=7").status_code, 401)
            cache.write_text("broken json")
            self.assertEqual(self.client.get("/public/popular-pages").status_code, 503)


if __name__ == "__main__":
    unittest.main()
