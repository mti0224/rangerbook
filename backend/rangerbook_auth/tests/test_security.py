"""Exercise actual ASGI permissions against temporary users and databases."""
import importlib
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from argon2.exceptions import VerifyMismatchError
from fastapi.testclient import TestClient

AUTH_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AUTH_DIR))
ORIGIN = "https://rangerbook.warmycat.com"
PASSWORD = "Only-a-test-password-482!"


class SecurityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db_path = Path(self.tmp.name) / "auth.db"
        self.env = patch.dict(os.environ, {
            "RANGERBOOK_AUTH_DB": str(self.db_path),
            "RANGERBOOK_PRIVATE_TEAM_DIR": str(Path(self.tmp.name) / "private"),
            "RANGERBOOK_TRAFFIC_CACHE_DIR": str(Path(self.tmp.name) / "traffic"),
        })
        self.env.start(); self.addCleanup(self.env.stop)
        for name in ("app", "asgi", "game_binding"):
            sys.modules.pop(name, None)
        self.module = importlib.import_module("asgi")
        self.core = importlib.import_module("app")
        self.client = TestClient(self.core.app, base_url="https://rangerbook-auth.warmycat.com")
        self.client.__enter__(); self.addCleanup(self.client.__exit__, None, None, None)
        hashed = self.core.PASSWORD_HASHER.hash(PASSWORD)
        with self.core.db() as conn:
            for account, role in (("root_test", "super_admin"), ("admin_test", "admin"), ("user_test", "user")):
                conn.execute("INSERT INTO users(id,account,password_hash,role,admin_application_status,created_at) VALUES (?,?,?,?,'approved',?)",
                             ("usr_" + account + "000000000000", account, hashed, role, self.core.isoformat()))

    def user_id(self, account):
        return "usr_" + account + "000000000000"

    def sign_in(self, account):
        token = self.core.create_session(self.user_id(account))
        self.client.cookies.set(self.core.SESSION_COOKIE, token)
        return token

    def post(self, path, payload=None, **options):
        return self.client.post(path, json=payload or {}, headers={"Origin": ORIGIN}, **options)

    def test_anonymous_and_regular_users_cannot_read_private_routes(self):
        for url in ("/admin/users", "/admin/traffic", "/admin/personal-teams", "/admin/game-binding/status", "/super-admin/player-search?q=test"):
            response = self.client.get(url)
            self.assertEqual(response.status_code, 401, url)
            self.assertIn("no-store", response.headers["cache-control"])
        self.sign_in("user_test")
        self.assertEqual(self.client.get("/admin/users").status_code, 403)
        self.assertEqual(self.client.get("/admin/personal-teams").status_code, 403)
        self.sign_in("admin_test")
        self.assertEqual(self.client.get("/admin/users").status_code, 403)

    def test_untrusted_and_missing_origins_rejected(self):
        for headers in ({}, {"Origin": "https://untrusted.invalid"}, {"Origin": ORIGIN + ".untrusted.invalid"}):
            self.assertEqual(self.client.post("/auth/login", json={"account": "admin_test", "password": PASSWORD}, headers=headers).status_code, 403)

    def test_session_cookie_flags_and_private_headers(self):
        response = self.post("/auth/login", {"account": "admin_test", "password": PASSWORD})
        self.assertEqual(response.status_code, 200)
        cookie = response.headers["set-cookie"]
        for flag in ("__Host-", "Secure", "HttpOnly", "SameSite=lax", "Path=/"):
            self.assertIn(flag, cookie)
        self.assertNotIn("Domain=", cookie)
        for key in ("cache-control", "x-content-type-options", "content-security-policy", "strict-transport-security"):
            self.assertIn(key, response.headers)
        self.assertIn("no-store", response.headers["cache-control"])

    def test_failed_login_attempts_persist_and_header_spoofing_does_not_bypass(self):
        with patch.object(self.core.PASSWORD_HASHER, "verify", side_effect=VerifyMismatchError):
            for n in range(20):
                response = self.client.post("/auth/login", json={"account": "admin_test", "password": "wrong"}, headers={"Origin": ORIGIN, "X-Forwarded-For": "198.51.100." + str(n)})
                self.assertEqual(response.status_code, 401)
            response = self.post("/auth/login", {"account": "ADMIN_TEST", "password": PASSWORD})
            self.assertEqual(response.status_code, 429)
            self.assertIn("retry-after", response.headers)
        with self.core.db() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM auth_rate_events WHERE action='login'").fetchone()[0], 20)

    def test_registration_limit_counts_unsuccessful_duplicates(self):
        with patch.object(self.core.PASSWORD_HASHER, "hash", return_value="not-used"):
            for _ in range(3):
                self.assertEqual(self.post("/auth/register", {"account": "admin_test", "password": PASSWORD}).status_code, 409)
            self.assertEqual(self.post("/auth/register", {"account": "admin_test", "password": PASSWORD}).status_code, 429)

    def test_password_hash_capacity_rejects_without_oom_or_false_401(self):
        slots = self.core.PASSWORD_HASHER._slots
        slots.acquire(); slots.acquire()
        try:
            response = self.post("/auth/login", {"account": "admin_test", "password": PASSWORD})
            self.assertEqual(response.status_code, 429)
        finally:
            slots.release(); slots.release()

    def test_reset_is_unique_revokes_sessions_and_forces_password_change(self):
        old_token = self.core.create_session(self.user_id("admin_test"))
        self.sign_in("root_test")
        path = "/admin/users/" + self.user_id("admin_test") + "/reset-password"
        first = self.post(path).json()["reset_password"]
        second = self.post(path).json()["reset_password"]
        self.assertNotEqual(first, second)
        self.assertGreaterEqual(len(second), 24)
        with self.core.db() as conn:
            self.assertIsNone(conn.execute("SELECT * FROM sessions WHERE token_hash=?", (self.core.session_hash(old_token),)).fetchone())
        response = self.post("/auth/login", {"account": "admin_test", "password": second})
        self.assertTrue(response.json()["must_change_password"])
        self.assertEqual(self.client.get("/admin/access-check").status_code, 403)
        response = self.post("/auth/change-password", {"current_password": second, "new_password": PASSWORD + "new"})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.client.get("/auth/me").json()["must_change_password"])
        self.assertEqual(self.client.get("/admin/access-check").status_code, 200)

    def test_only_super_admin_can_reset_and_super_admin_cannot_be_reset(self):
        path = "/admin/users/" + self.user_id("admin_test") + "/reset-password"
        self.assertEqual(self.post(path).status_code, 401)
        self.sign_in("admin_test"); self.assertEqual(self.post(path).status_code, 403)
        self.sign_in("root_test")
        self.assertEqual(self.post("/admin/users/" + self.user_id("root_test") + "/reset-password").status_code, 403)

    def test_regular_user_can_change_only_own_password(self):
        self.sign_in("user_test")
        self.assertEqual(self.post("/auth/change-password", {"current_password": PASSWORD, "new_password": PASSWORD + "new"}).status_code, 200)
        self.assertEqual(self.client.get("/admin/access-check").status_code, 403)

    def test_password_change_attempts_are_limited(self):
        self.sign_in("admin_test")
        for _ in range(5):
            self.assertEqual(self.post("/auth/change-password", {"current_password": "wrong", "new_password": PASSWORD + "new"}).status_code, 401)
        self.assertEqual(self.post("/auth/change-password", {"current_password": PASSWORD, "new_password": PASSWORD + "new"}).status_code, 429)

    def test_database_is_owner_only_and_sessions_are_bounded(self):
        self.assertEqual(stat.S_IMODE(self.db_path.stat().st_mode), 0o600)
        for _ in range(15):
            self.core.create_session(self.user_id("admin_test"))
        with self.core.db() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0], 10)

    def test_validation_does_not_reflect_password(self):
        marker = "PASSWORD-MARKER-" * 30
        response = self.post("/auth/login", {"account": "admin_test", "password": marker})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn(marker, response.text)
        self.assertNotIn('"input"', response.text)

    def test_streamed_body_limit(self):
        response = self.client.post("/auth/login", content=iter([b"x" * 9000, b"y" * 9000]), headers={"Origin": ORIGIN, "Content-Type": "application/json"})
        self.assertEqual(response.status_code, 413)
        self.assertIn("no-store", response.headers["cache-control"])

    def test_upstream_errors_do_not_disclose_paths_or_tokens(self):
        self.sign_in("root_test")
        with patch.object(self.core, "query_player_teams", side_effect=RuntimeError("secret-token=MARKER /home/private/data")):
            response = self.post("/super-admin/player-team-query", {"uid": "test"})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("MARKER", response.text)
        self.assertNotIn("/home/", response.text)

    def test_api_docs_are_disabled_and_public_cache_still_works(self):
        self.assertEqual(self.client.get("/docs").status_code, 404)
        self.assertEqual(self.client.get("/openapi.json").status_code, 404)
        response = self.client.get("/public/popular-pages")
        self.assertIn("public", response.headers["cache-control"])
        self.assertNotIn("no-store", response.headers["cache-control"])


if __name__ == "__main__":
    unittest.main()
