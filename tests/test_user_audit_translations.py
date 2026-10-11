import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CUSTOM = ROOT / "assets/locales/game-custom.json"
UI = ROOT / "assets/locales/ui.json"

class UserAuditLocalizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = json.loads(CUSTOM.read_text(encoding="utf-8"))
        cls.catalog = json.loads(UI.read_text(encoding="utf-8"))
        cls.by_key = {row["key"]: row for row in cls.rows}

    def test_user_reviewed_terms_imported(self):
        self.assertEqual(len(self.rows), 447)
        self.assertEqual(len(self.rows), len(self.by_key))
        for row in self.rows:
            self.assertEqual(set(row), {"key", "zh_TW", "en"})
            self.assertTrue(row["key"] and row["zh_TW"] and row["en"])
            self.assertFalse(re.search(r"[\u3400-\u9fff]", row["en"]), row["key"])

    def test_placeholder_count_preserved(self):
        pattern = r"%(?:d[12]?|s|n|N)"
        for row in self.rows:
            self.assertEqual(
                re.findall(pattern, row["zh_TW"]),
                re.findall(pattern, row["en"]),
                row["key"],
            )

    def test_requested_terminology(self):
        expected = {
            "LABYRINTH_ARTIFACT_NAME_bf_atk": "Ancient King's Sword",
            "SKILLEFF_BUFF-ATK": "ATK increase",
            "EQUIP_TYPE_WEAPON": "Weapon",
            "EQUIP_TYPE_ARMOR": "Armor",
            "EQUIP_TYPE_ACC": "Accessory",
        }
        for key, value in expected.items():
            self.assertEqual(self.by_key[key]["en"], value)
        ui = self.catalog["en"]
        for key, value in {
            "gear.normalOptions": "Normal Options",
            "gear.highLevelOptions": "High-Level Options",
            "gear.basicOptions": "Basic Options",
            "gear.specialOptions": "Special Options",
            "gear.switchOptions": "Switch Option List",
            "table.raid": "Guardian",
            "animation.idle": "Idle",
            "animation.knockback": "Knockback",
        }.items():
            self.assertEqual(ui[key], value)

if __name__ == "__main__":
    unittest.main()
