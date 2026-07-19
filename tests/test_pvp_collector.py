import importlib.util
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "pvp" / "update_pvp_data.py"
spec = importlib.util.spec_from_file_location("update_pvp_data", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


class PvPCollectorTests(unittest.TestCase):
    def test_extract_nested_pvp_team(self):
        payload = {
            "result": {
                "playerUnitTeamGroupMap": {
                    "pvpteam": {
                        "1": [{"unitCode": "u001"}, {"unitCode": "u002"}],
                        "2": [{"unitCode": "u003"}],
                    }
                }
            }
        }
        self.assertEqual(module.extract_pvp_units(payload), ["u001", "u002", "u003"])

    def test_extract_flat_pvp_team(self):
        payload = {
            "result": {
                "playerUnitTeamGroupMap": {
                    "pvpteam": [
                        {"teamNo": 1, "unitCode": "u001"},
                        {"teamNo": 2, "unitCode": "u002"},
                    ]
                }
            }
        }
        self.assertEqual(module.extract_pvp_units(payload), ["u001", "u002"])

    def test_usage_counts_player_once_but_keeps_appearances(self):
        catalog = {
            "u001": {"name": "角色A", "star": "9星", "type": "力量型", "element": "火"},
            "u002": {"name": "角色B", "star": "9星", "type": "敏捷型", "element": "水"},
        }
        result = module.build_usage_payload(
            [["u001", "u001", "u002"], ["u001"]],
            catalog=catalog,
            ranking_count=2,
            failure_count=0,
            league="LEGEND",
            version="12.2",
        )
        self.assertEqual(result["metadata"]["sampleCount"], 2)
        by_id = {row["rangerId"]: row for row in result["rangers"]}
        self.assertEqual(by_id["u001"]["playerCount"], 2)
        self.assertEqual(by_id["u001"]["appearanceCount"], 3)
        self.assertEqual(by_id["u001"]["usageRate"], 100.0)
        self.assertEqual(by_id["u002"]["playerCount"], 1)
        self.assertEqual(by_id["u002"]["usageRate"], 50.0)

    def test_usage_aggregates_gear_and_awakening(self):
        catalog = {
            "u001": {"name": "角色A", "star": "9星", "type": "力量型", "element": "火"},
        }
        result = module.build_usage_payload(
            [[
                {
                    "unitCode": "u001",
                    "equipMap": {
                        "WEAPON": {"equipItemCode": "eq_wpn_a"},
                        "ARMOR": {"equipItemCode": "eq_amr_a"},
                        "ACC": {"equipItemCode": "eq_acc_a"},
                    },
                    "awakeAbilityCode": "aab001",
                },
                {
                    "unitCode": "u001",
                    "equipMap": {
                        "WEAPON": {"equipItemCode": "eq_wpn_a"},
                        "ARMOR": {"equipItemCode": "eq_amr_b"},
                    },
                },
            ]],
            catalog=catalog,
            ranking_count=1,
            failure_count=0,
            league="LEGEND",
            version="12.2",
        )
        row = result["rangers"][0]
        weapon = {item["code"]: item for item in row["equipmentUsage"]["WEAPON"]}
        armor = {item["code"]: item for item in row["equipmentUsage"]["ARMOR"]}
        acc = {item["code"]: item for item in row["equipmentUsage"]["ACC"]}
        awake = {item["code"]: item for item in row["awakeningUsage"]}

        self.assertEqual(weapon["eq_wpn_a"]["count"], 2)
        self.assertEqual(weapon["eq_wpn_a"]["rate"], 100.0)
        self.assertEqual(armor["eq_amr_a"]["rate"], 50.0)
        self.assertEqual(armor["eq_amr_b"]["rate"], 50.0)
        self.assertEqual(acc["eq_acc_a"]["rate"], 50.0)
        self.assertEqual(acc[module.NONE_CODE]["rate"], 50.0)
        self.assertEqual(awake["aab001"]["rate"], 50.0)
        self.assertEqual(awake[module.NONE_CODE]["rate"], 50.0)

    def test_leaderboard_level_display(self):
        payload = {
            "result": {
                "league": {
                    "totalCount": 9908,
                    "rankingList": [
                        {
                            "rank": 1,
                            "score": 1578.0,
                            "displayName": "Player",
                            "availableName": True,
                            "nationalFlag": "TW",
                            "level": 467,
                            "lastRank": 3,
                        }
                    ],
                }
            }
        }
        result = module.leaderboard_payload(payload, league="LEGEND", version="12.2")
        self.assertEqual(result["players"][0]["displayLevel"], 71)
        self.assertEqual(result["metadata"]["totalCount"], 9908)


if __name__ == "__main__":
    unittest.main()
