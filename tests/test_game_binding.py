"""Security-focused unit tests for game UID ownership verification.

Uses only synthetic data and an isolated temporary SQLite database.
"""
from __future__ import annotations

import copy
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend" / "rangerbook_auth"
sys.path.insert(0, str(BACKEND))
import game_binding as gb  # noqa: E402


def fake_team():
    return {
        "result": {
            "player": {"guildWarMedal": 125},
            "playerUnitTeamGroupMap": {
                "team3": {
                    "2": [
                        {"teamNo": 2, "slot": 0, "invenId": 101, "unitCode": "a"},
                        {"teamNo": 2, "slot": 1, "invenId": 102, "unitCode": "b"},
                        {"teamNo": 2, "slot": 3, "invenId": 103, "unitCode": "c"}
                    ]
                }
            }
        }
    }


class TestGameBinding(unittest.TestCase):
    def test_subgroup_keeps_distinct_identity_and_positions(self):
        result = fake_team()["result"]
        slots = gb.subgroup_slots(result, "team3", "2")
        self.assertEqual(set(slots), {"0", "1", "3"})
        self.assertEqual(slots["1"]["invenId"], 102)
        self.assertEqual(gb.subgroup_slots(result, "team3", "1"), {})

    def test_exact_swap(self):
        original = gb.subgroup_slots(fake_team()["result"], "team3", "2")
        changed = copy.deepcopy(original)
        changed["1"], changed["3"] = changed["3"], changed["1"]
        self.assertTrue(gb.is_exact_swap(original, changed, 1, 3))
        self.assertFalse(gb.is_exact_swap(original, original, 1, 3))

    def test_moving_wrong_slot_fails(self):
        original = gb.subgroup_slots(fake_team()["result"], "team3", "2")
        changed = copy.deepcopy(original)
        changed["0"], changed["1"] = changed["1"], changed["0"]
        self.assertFalse(gb.is_exact_swap(original, changed, 1, 3))

    def test_extra_modification_fails(self):
        original = gb.subgroup_slots(fake_team()["result"], "team3", "2")
        changed = copy.deepcopy(original)
        changed["1"], changed["3"] = changed["3"], changed["1"]
        changed["0"]["invenId"] = 999
        self.assertFalse(gb.is_exact_swap(original, changed, 1, 3))

    def test_slot_addition_and_missing_fail(self):
        original = gb.subgroup_slots(fake_team()["result"], "team3", "2")
        changed = copy.deepcopy(original)
        changed["1"], changed["3"] = changed["3"], changed["1"]
        changed["4"] = {"invenId": 204, "unitCode": "d"}
        self.assertFalse(gb.is_exact_swap(original, changed, 1, 3))
        del changed["4"]
        del changed["0"]
        self.assertFalse(gb.is_exact_swap(original, changed, 1, 3))

    def test_duplicate_slot_rejected(self):
        result = fake_team()["result"]
        result["playerUnitTeamGroupMap"]["team3"]["2"][1]["slot"] = 0
        self.assertEqual(gb.subgroup_slots(result, "team3", "2"), {})

    def test_choose_swap_only_eligible_subgroup(self):
        result = fake_team()["result"]
        for _ in range(10):
            team, side, a, b, slots = gb.choose_swap(result)
            self.assertEqual((team, side), ("team3", "2"))
            self.assertIn(str(a), slots)
            self.assertIn(str(b), slots)
            self.assertNotEqual(a, b)

    def test_private_path_rejects_traversal(self):
        from fastapi import HTTPException
        with self.assertRaises(HTTPException):
            gb.private_path("../../etc")
        with self.assertRaises(HTTPException):
            gb.private_path("usr_../../hello")

    def test_minimal_import_excludes_wallet(self):
        result = fake_team()["result"]
        result["player"]["gem"] = 999999
        output = gb.normalize_personal_teams(result)
        self.assertNotIn("player", output)
        self.assertNotIn("gem", str(output))
        self.assertEqual(output["team3"]["B"][0]["unitCode"], "a")

    def test_unique_binding_account_and_uid(self):
        with tempfile.TemporaryDirectory() as folder:
            conn = sqlite3.connect(":memory:")
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("CREATE TABLE users (id TEXT PRIMARY KEY)")
            conn.executemany("INSERT INTO users(id) VALUES(?)", [("usr_" + "a"*24,), ("usr_" + "b"*24,)])
            def local_db():
                from contextlib import contextmanager
                @contextmanager
                def manage():
                    try:
                        yield conn
                        conn.commit()
                    except Exception:
                        conn.rollback()
                        raise
                return manage()
            gb.init_tables(local_db)
            u1, u2 = "usr_"+"a"*24, "usr_"+"b"*24
            conn.execute(
                "INSERT INTO game_account_bindings(user_id,game_uid,player_name,guild_name,verified_at) VALUES(?,?,?,?,?)",
                (u1, "uid_1", "A", "Guild", gb.iso())
            )
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO game_account_bindings(user_id,game_uid,player_name,guild_name,verified_at) VALUES(?,?,?,?,?)",
                    (u2, "uid_1", "B", "Guild", gb.iso())
                )
            conn.rollback()
            conn.close()


if __name__ == "__main__":
    unittest.main()
