"""Unit tests for the administrator-only LINE Rangers game verification workflow.

Run with: python -m unittest discover -s backend/rangerbook_auth/tests -p 'test_game_binding.py'
Uses a temporary SQLite database and mocked official API, never production data.
"""
from __future__ import annotations

import copy
import importlib
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

AUTH_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AUTH_DIR))


def fake_result() -> dict:
    return {
        "player": {"guildWarMedal": 75, "userName": "TestPlayer"},
        "playerUnitTeamGroupMap": {
            "team2": {
                "1": [
                    {"teamNo": 1, "slot": i, "invenId": i + 100, "unitCode": f"u{i}e",
                     "unitLevel": 100, "equipMap": {}}
                    for i in range(5)
                ],
                "2": [
                    {"teamNo": 2, "slot": 0, "invenId": 201, "unitCode": "u20e",
                     "unitLevel": 150, "equipMap": {}},
                    {"teamNo": 2, "slot": 1, "invenId": 202, "unitCode": "u21e",
                     "unitLevel": 140, "equipMap": {}},
                ],
            },
            "team4": {},
        }
    }


class VerificationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        os.environ["RANGERBOOK_AUTH_DB"] = str(Path(self.tmp.name) / "auth.db")
        os.environ["RANGERBOOK_PRIVATE_TEAM_DIR"] = str(Path(self.tmp.name) / "private")
        if "app" in sys.modules:
            del sys.modules["app"]
        if "game_binding" in sys.modules:
            del sys.modules["game_binding"]
        self.app_module = importlib.import_module("app")
        self.gb = importlib.import_module("game_binding")
        self.app_module.init_db()
        self.gb.init_tables(self.app_module.db)
        self.uid = "rtestuid12345"
        self.user_id = "usr_abcdef123456789012345678"
        self.other_id = "usr_1234567890abcdef12345678"
        with self.app_module.db() as conn:
            for ident, role in [(self.user_id, "admin"), (self.other_id, "user")]:
                conn.execute(
                    "INSERT INTO users(id,account,password_hash,role,admin_application_status,created_at) "
                    "VALUES(?,?,? ,?,'approved',?)",
                    (ident, ident, "placeholder", role, self.gb.iso())
                )
        self.user = {"id": self.user_id, "role": "admin"}
        self.other = {"id": self.other_id, "role": "user"}
        self.request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"),
                                       headers={"origin": "https://rangerbook.warmycat.com"})
        self.routes = {r.path: r.endpoint for r in self.app_module.app.routes if hasattr(r, "path")}
        self.current = fake_result()
        self.p1 = patch.object(self.gb, "official_player", side_effect=lambda _uid: copy.deepcopy(self.current))
        self.p2 = patch.object(self.gb.pq, "search_players", side_effect=lambda q, limit: {
            "items": [{"uid": self.uid, "name": "TestPlayer", "guildName": "TestGuild"}]
        })
        self.p3 = patch.object(self.gb.pq, "load_player_index", return_value={
            "players": {self.uid: {"name": "TestPlayer", "guildName": "TestGuild"}}
        })
        for p in (self.p1, self.p2, self.p3):
            p.start()
            self.addCleanup(p.stop)

    def call(self, path, payload=None, user=None):
        endpoint = self.routes[path]
        if payload is None:
            if path.endswith("/search"):
                return endpoint(q="Test", request=self.request, user=user or self.user)
            if path.endswith("/import"):
                return endpoint(request=self.request, user=user or self.user)
            return endpoint(user=user or self.user)
        return endpoint(payload=payload, request=self.request, user=user or self.user)

    def started(self):
        items = self.call("/admin/game-players/search")["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(set(items[0]), {"candidateId", "name", "guildName"})
        challenge = self.call(
            "/admin/game-binding/start",
            self.gb.CandidateStart(candidateId=items[0]["candidateId"], medal="75"),
        )
        self.assertIn(challenge["team"], range(1, 6))
        self.assertIn(challenge["side"], ("A", "B"))
        self.assertNotIn("uid", challenge)
        return challenge

    def swap(self, challenge):
        team = self.current["playerUnitTeamGroupMap"][f'team{challenge["team"]}']
        side = "1" if challenge["side"] == "A" else "2"
        records = team[side]
        a = next(x for x in records if x["slot"] == challenge["firstPosition"] - 1)
        b = next(x for x in records if x["slot"] == challenge["secondPosition"] - 1)
        a["slot"], b["slot"] = b["slot"], a["slot"]

    def test_exact_swap_and_replay_rejected(self):
        challenge = self.started()
        self.swap(challenge)
        result = self.call("/admin/game-binding/verify",
                           self.gb.VerifyRequest(challengeId=challenge["challengeId"]))
        self.assertTrue(result["verified"])
        bound = self.call("/admin/game-binding/status")
        self.assertTrue(bound["bound"])
        with self.assertRaises(HTTPException) as e:
            self.call("/admin/game-binding/verify",
                      self.gb.VerifyRequest(challengeId=challenge["challengeId"]))
        self.assertEqual(e.exception.status_code, 410)

    def test_unchanged_roster_does_not_verify(self):
        challenge = self.started()
        result = self.call("/admin/game-binding/verify",
                           self.gb.VerifyRequest(challengeId=challenge["challengeId"]))
        self.assertFalse(result["verified"])
        self.assertFalse(self.call("/admin/game-binding/status")["bound"])

    def test_wrong_medal_rejected_and_no_challenge(self):
        item = self.call("/admin/game-players/search")["items"][0]
        with self.assertRaises(HTTPException) as e:
            self.call("/admin/game-binding/start",
                      self.gb.CandidateStart(candidateId=item["candidateId"], medal="76"))
        self.assertEqual(e.exception.status_code, 422)
        self.assertIsNone(self.call("/admin/game-binding/status")["challenge"])

    def test_expired_challenge_rejected(self):
        challenge = self.started()
        with self.app_module.db() as conn:
            conn.execute("UPDATE game_verification_challenges SET expires_at=? WHERE id=?",
                         ("2000-01-01T00:00:00Z", challenge["challengeId"]))
        self.swap(challenge)
        with self.assertRaises(HTTPException) as e:
            self.call("/admin/game-binding/verify",
                      self.gb.VerifyRequest(challengeId=challenge["challengeId"]))
        self.assertEqual(e.exception.status_code, 410)

    def test_user_cannot_verify_another_admin_challenge(self):
        challenge = self.started()
        with self.assertRaises(HTTPException) as e:
            self.call("/admin/game-binding/verify",
                      self.gb.VerifyRequest(challengeId=challenge["challengeId"]), user=self.other)
        self.assertEqual(e.exception.status_code, 410)

    def test_normal_users_rejected_by_dependency(self):
        with self.assertRaises(HTTPException) as e:
            self.app_module.require_admin(self.other)
        self.assertEqual(e.exception.status_code, 403)

    def test_slot_parser_excludes_mismatched_teams(self):
        data = fake_result()
        data["playerUnitTeamGroupMap"]["team2"]["2"][0]["teamNo"] = 1
        self.assertEqual(self.gb.subgroup_slots(data, "team2", "2"), {})

    def test_sanitized_private_import(self):
        challenge = self.started()
        self.swap(challenge)
        self.call("/admin/game-binding/verify",
                  self.gb.VerifyRequest(challengeId=challenge["challengeId"]))
        result = self.call("/admin/personal-teams/import")
        self.assertTrue(result["ok"])
        path = self.gb.private_path(self.user_id)
        payload = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(payload["source"], "official_api")
        self.assertNotIn("player", payload)
        self.assertNotIn("guildWarMedal", json.dumps(payload))
        self.assertEqual(len(payload["teams"]), 7)
        self.assertEqual(payload["teams"]["pvpteam"], [])
        self.assertEqual(payload["teams"]["guildwar"], [])
        self.assertEqual(self.call("/admin/personal-teams")["teams"], payload["teams"])

    def test_no_cross_user_binding(self):
        challenge = self.started()
        self.swap(challenge)
        self.call("/admin/game-binding/verify",
                  self.gb.VerifyRequest(challengeId=challenge["challengeId"]))
        with self.app_module.db() as conn:
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO game_account_bindings(user_id,game_uid,player_name,guild_name,verified_at)"
                    " VALUES (?,?,?,?,?)",
                    (self.other_id, self.uid, "x", "x", self.gb.iso())
                )


    def test_all_new_routes_require_admin(self):
        paths = [route for route in self.app_module.app.routes
                 if getattr(route, "path", "").startswith("/admin/game-") or
                    getattr(route, "path", "").startswith("/admin/personal-teams")]
        self.assertGreaterEqual(len(paths), 6)
        for route in paths:
            self.assertIn(self.app_module.require_admin,
                          [item.call for item in route.dependant.dependencies], route.path)

    def test_swap_has_to_preserve_every_other_position(self):
        baseline = self.gb.subgroup_slots(fake_result(), "team2", "1")
        changed = copy.deepcopy(baseline)
        changed["0"], changed["1"] = changed["1"], changed["0"]
        changed["2"], changed["3"] = changed["3"], changed["2"]
        self.assertFalse(self.gb.is_exact_swap(baseline, changed, 0, 1))
        changed = copy.deepcopy(baseline)
        changed["0"], changed["1"] = changed["1"], changed["0"]
        self.assertTrue(self.gb.is_exact_swap(baseline, changed, 0, 1))

    def test_import_not_available_before_binding(self):
        with self.assertRaises(HTTPException) as e:
            self.call("/admin/personal-teams/import")
        self.assertEqual(e.exception.status_code, 403)

    def test_candidate_does_not_reveal_uid(self):
        item = self.call("/admin/game-players/search")["items"][0]
        self.assertNotIn(self.uid, json.dumps(item, ensure_ascii=False))


    def test_import_pvp_and_guildwar_without_player_wallet(self):
        self.current["player"]["gem"] = 99999
        self.current["playerUnitTeamGroupMap"]["pvpteam"] = {
            "1": [{"unitCode": "u101e", "unitLevel": 180, "slot": 0, "equipMap": {}}],
            "2": [{"unitCode": "u102e", "unitLevel": 160, "slot": 0, "equipMap": {}}]
        }
        self.current["playerUnitTeamGroupMap"]["guildwar"] = {
            "1": [{"unitCode": "u103e", "unitLevel": 200, "slot": 0, "equipMap": {}}]
        }
        output = self.gb.normalize_personal_teams(self.current)
        self.assertEqual([x["unitCode"] for x in output["pvpteam"]], ["u101e", "u102e"])
        self.assertEqual(len(output["guildwar"]), 1)
        self.assertNotIn("gem", json.dumps(output))
        self.assertEqual(len(output), 7)

    def test_unbind_requires_password_deletes_private_import(self):
        password = "test-unbind-password"
        hashed = self.app_module.PASSWORD_HASHER.hash(password)
        self.user["password_hash"] = hashed
        with self.app_module.db() as conn:
            conn.execute("UPDATE users SET password_hash=? WHERE id=?", (hashed, self.user_id))
        challenge = self.started()
        self.swap(challenge)
        self.call("/admin/game-binding/verify",
                  self.gb.VerifyRequest(challengeId=challenge["challengeId"]))
        self.call("/admin/personal-teams/import")
        private_path = self.gb.private_path(self.user_id)
        self.assertTrue(private_path.exists())
        with self.assertRaises(HTTPException) as incorrect:
            self.call("/admin/game-binding/unbind", self.gb.UnbindRequest(password="invalid"))
        self.assertEqual(incorrect.exception.status_code, 403)
        self.assertTrue(private_path.exists())
        result = self.call("/admin/game-binding/unbind", self.gb.UnbindRequest(password=password))
        self.assertTrue(result["ok"])
        self.assertFalse(private_path.exists())
        self.assertFalse(self.call("/admin/game-binding/status")["bound"])
        with self.assertRaises(HTTPException) as no_binding:
            self.call("/admin/personal-teams/import")
        self.assertEqual(no_binding.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
