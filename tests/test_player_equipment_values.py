import importlib.util
import json
import subprocess
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
        items = root / "items.json"
        items.write_text(json.dumps([{"itemCode": "eq_actual", "equipGrade": 7, "maxEnchant": 5,
                                      "attr1": 40000, "attr1Prob": 20,
                                      "attr2": 40022, "attr2Prob": 10,
                                      "attr3": 40030, "attr3Prob": 20}]))
        attrs.write_text(json.dumps([
            {"attrNo": 110006, "unitEquipRandOptTrigType": "STR", "reinforceType": "HP_MUL", "minValue": 1.05, "maxValue": 1.5, "valueDivideGrades": 10},
            {"attrNo": 110017, "reinforceType": "SUMMON_ENGY_MUL", "minValue": -.062, "maxValue": -.08, "valueDivideGrades": 10},
            {"attrNo": 110015, "reinforceType": "SPE_ADD", "minValue": 6, "maxValue": 15, "valueDivideGrades": 10},
            {"attrNo": 40000, "reinforceType": "ALL_ATK_MUL", "minValue": .74, "maxValue": .74, "valueDivideGrades": 1},
            {"attrNo": 40022, "reinforceType": "SUMMON_ENGY_MUL", "minValue": -.05, "maxValue": -.1, "valueDivideGrades": 11},
            {"attrNo": 40030, "reinforceType": "CLN_SKLAVD_PROB_MUL", "minValue": .04, "maxValue": .04, "valueDivideGrades": 1},
        ]))
        catalog.write_text(json.dumps({"equipment": [{"highLevelOptions": {"switchOptions": [
            {"optionKey": "EQUIP:GEAR_FILTER_HP_MUL_nm", "upgradeStep": 50},
            {"optionKey": "EQUIP:GEAR_FILTER_SUMMON_ENGY_MUL_nm", "upgradeStep": -2},
            {"optionKey": "EQUIP:GEAR_FILTER_SPE_ADD_nm", "upgradeStep": 3},
        ]}}]}))
        for name, value in (("ATTR_PATH", attrs), ("CATALOG_PATH", catalog), ("ITEM_PATH", items)):
            p = patch.object(effects, name, value)
            p.start()
            self.addCleanup(p.stop)
        effects._definitions.cache_clear()
        effects._items.cache_clear()

    def basic_gear(self):
        return {**self.gear(), "currentEnchant": 5,
                "attr1No": 40022, "attr1ValueGrade": 5,
                "attr2No": 40030, "attr2ValueGrade": 0,
                "attr3No": 40000, "attr3ValueGrade": 0,
                "unitInvenId": "private", "accountUid": "private"}

    def test_actual_basic_rolls_enchant_and_reordered_fields(self):
        result = effects.public_equipment(self.basic_gear())
        self.assertEqual([o["value"] for o in result["normalOptions"]], [-45, 24, 444])
        self.assertEqual(result["attr4Condition"], {"kind": "rangerType", "value": "STR"})
        self.assertEqual(result["attr4OptionKey"], "EQUIP:GEAR_FILTER_HP_MUL_nm")
        self.assertNotIn("unitInvenId", result)
        self.assertNotIn("accountUid", result)

    def test_missing_invalid_basic_rolls_do_not_become_maximums(self):
        for field, value in (("currentEnchant", None), ("currentEnchant", 6),
                             ("attr1ValueGrade", -1), ("attr1ValueGrade", None)):
            with self.subTest(field=field, value=value):
                raw = self.basic_gear()
                raw[field] = value
                self.assertIsNone(effects.public_equipment(raw)["normalOptions"][0]["value"])

    def test_six_star_keeps_basic_effects_without_high_level_condition(self):
        items = json.loads(effects.ITEM_PATH.read_text())
        items[0]["equipGrade"] = 6
        effects.ITEM_PATH.write_text(json.dumps(items))
        result = effects.public_equipment(self.basic_gear())
        self.assertEqual(result["normalOptions"][1]["value"], 24)
        self.assertNotIn("attr4Condition", result)

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

    def test_team_analysis_installer_preserves_translations_and_is_idempotent(self):
        home = Path(self.temp.name) / "home"
        resolver = home / "rangerbook-auth/equipment_effects.py"
        locale = home / "rangerbook-v2/data/locales/ui.json"
        resolver.parent.mkdir(parents=True)
        locale.parent.mkdir(parents=True)
        resolver.write_text("# previous resolver\n")
        original = {"key": "UI:production.custom", "zh_TW": "keep existing"}
        locale.write_text(json.dumps([original]))
        command = [sys.executable, str(ROOT / "deploy/aws/install_team_analysis.py"), "--home", str(home)]
        subprocess.run(command, check=True, capture_output=True)
        self.assertEqual(resolver.read_text(), "# previous resolver\n")
        for _ in range(2):
            subprocess.run(command + ["--apply"], check=True, capture_output=True)
        rows = json.loads(locale.read_text())
        self.assertEqual(rows[0], original)
        self.assertEqual(len(rows), len({row['key'] for row in rows}))
        self.assertTrue(any(row['key'] == 'UI:analysis.title' for row in rows))
        self.assertEqual(len(list((home / "rangerbook-backups").glob("*/rangerbook-auth/equipment_effects.py"))), 2)


if __name__ == "__main__":
    unittest.main()
