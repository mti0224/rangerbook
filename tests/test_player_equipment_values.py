import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend/rangerbook_auth"))
import equipment_effects as effects
from player_query import extract_player_teams

spec = importlib.util.spec_from_file_location("equipment_installer", ROOT / "deploy/aws/install_player_equipment_values.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class EquipmentValuesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        attrs = root / "attrs.json"
        catalog = root / "equipment.json"
        attrs.write_text(json.dumps([
            {"attrNo": 110006, "reinforceType": "HP_MUL", "minValue": 1.05, "maxValue": 1.5, "valueDivideGrades": 10},
            {"attrNo": 110017, "reinforceType": "SUMMON_ENGY_MUL", "minValue": -.062, "maxValue": -.08, "valueDivideGrades": 10},
            {"attrNo": 110015, "reinforceType": "SPE_ADD", "minValue": 6, "maxValue": 15, "valueDivideGrades": 10},
        ]))
        catalog.write_text(json.dumps({"equipment": [{"highLevelOptions": {"switchOptions": [
            {"optionKey": "EQUIP:GEAR_FILTER_HP_MUL_nm", "upgradeStep": 50},
            {"optionKey": "EQUIP:GEAR_FILTER_SUMMON_ENGY_MUL_nm", "upgradeStep": -2},
            {"optionKey": "EQUIP:GEAR_FILTER_SPE_ADD_nm", "upgradeStep": 3},
        ]}}]}))
        for name, value in (("ATTR_PATH", attrs), ("CATALOG_PATH", catalog)):
            p = patch.object(effects, name, value)
            p.start()
            self.addCleanup(p.stop)
        effects._definitions.cache_clear()

    def gear(self, code=110006, grade=8, enchant=5):
        return {"equipItemCode": "eq_actual", "attr4No": code, "attr4ValueGrade": grade,
                "currentAdvancedEnchant": enchant, "goodGearAttr": 110015, "invenId": "private"}

    def test_selected_hp_roll_plus_advanced_enchant(self):
        result = effects.public_equipment(self.gear())
        self.assertEqual(result["attr4Value"], 395)
        self.assertEqual(result["attr4Unit"], "PERCENT")
        self.assertNotIn("invenId", result)
        self.assertNotIn("goodGearAttr", result)

    def test_zero_and_maximum_rolls_are_not_confused(self):
        self.assertEqual(effects.public_equipment(self.gear(grade=0, enchant=0))["attr4Value"], 105)
        self.assertEqual(effects.public_equipment(self.gear(grade=9, enchant=0))["attr4Value"], 150)

    def test_negative_mineral_cost_and_flat_speed(self):
        self.assertEqual(effects.public_equipment(self.gear(110017, 9, 5))["attr4Value"], -18)
        flat = effects.public_equipment(self.gear(110015, 9, 5))
        self.assertEqual((flat["attr4Value"], flat["attr4Unit"]), (30, "FLAT"))

    def test_missing_or_invalid_roll_is_never_assumed_maximum(self):
        for raw in (None, "", -1, 10, "no", True):
            self.assertNotIn("attr4Value", effects.public_equipment(self.gear(grade=raw)))
        self.assertNotIn("attr4Value", effects.public_equipment({"itemCode": "old", "attr4No": 110006}))
        self.assertNotIn("attr4Value", effects.public_equipment(self.gear(enchant=None)))

    def test_v2_data_unavailable_keeps_query_usable(self):
        effects.ATTR_PATH.unlink()
        result = effects.public_equipment(self.gear())
        self.assertEqual(result["attr4No"], 110006)
        self.assertNotIn("attr4Value", result)

    def test_all_team_types_preserve_actual_values(self):
        keys = [*(f"team{i}" for i in range(1, 6)), "pvpteam", "guildwar"]
        unit = {"unitCode": "u_actual", "equipMap": {"WEAPON": self.gear()}}
        teams = extract_player_teams({"result": {"playerUnitTeamGroupMap": {key: [unit] for key in keys}}})
        for key in keys:
            self.assertEqual(teams[key][0]["equipMap"]["WEAPON"]["attr4Value"], 395)

    def test_installer_preserves_unrelated_code_and_loads_shared_resolver(self):
        source = 'from pathlib import Path\nfrom typing import Any\nKEEP = 42\ndef compact_gear(value: Any):\n    return {"attr4No": value.get("attr4No")}\n'
        rewritten = installer.patch_serializer(source, "compact_gear")
        self.assertIn("KEEP = 42", rewritten)
        self.assertEqual(installer.patch_serializer(rewritten, "compact_gear"), rewritten)
        folder = Path(self.temp.name)
        target = folder / "collector.py"
        target.write_text(rewritten)
        (folder / "equipment_effects.py").write_text('def public_equipment(value):\n    return {"checked": value}\n')
        namespace = {"__file__": str(target)}
        exec(compile(rewritten, str(target), "exec"), namespace)
        self.assertEqual(namespace["compact_gear"](17), {"checked": 17})


if __name__ == "__main__":
    unittest.main()
