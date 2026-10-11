import json
import tempfile
import unittest
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec

SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "export_game_locales.py"
spec = spec_from_file_location("export_game_locales", SOURCE)
mod = module_from_spec(spec)
spec.loader.exec_module(mod)


class LocaleExportTests(unittest.TestCase):
    def test_official_and_custom_remain_separate(self):
        with tempfile.TemporaryDirectory() as td:
            raw, out = Path(td) / "raw", Path(td) / "out"
            raw.mkdir()
            (raw / "lang_unit.json").write_text(json.dumps([
                {"dataCode": "u1134e-brown_nm", "msgType": "UNIT", "language": "zh-Hant", "msg": "黑衣熊大"},
                {"dataCode": "u1134e-brown_nm", "msgType": "UNIT", "language": "en", "msg": "Black Jersey Brown"},
                {"dataCode": "SKILL_A", "msgType": "SKILL", "language": "en", "msg": "Attack"},
                {"dataCode": "EMPTY", "msgType": "UNIT", "language": "en", "msg": ""}
            ]), encoding="utf-8")
            (raw / "lang_equip.json").write_text(json.dumps([
                {"dataCode": "GEAR_NAME", "msgType": "EQUIP", "language": "en", "msg": "Weapon"}
            ]), encoding="utf-8")
            (raw / "custom.json").write_text(json.dumps({"MY_EFFECT": "自行翻譯"}), encoding="utf-8")
            (raw / "custom_en.json").write_text(json.dumps({"MY_EFFECT": "My effect"}), encoding="utf-8")
            summary = mod.build(raw, out, ["zh-Hant", "en"])
            en = json.loads((out / "en.json").read_text(encoding="utf-8"))
            zh = json.loads((out / "zh-Hant.json").read_text(encoding="utf-8"))
            self.assertEqual(en["official"]["UNIT"]["u1134e-brown_nm"], "Black Jersey Brown")
            self.assertEqual(en["official"]["EQUIP"]["GEAR_NAME"], "Weapon")
            self.assertNotIn("EMPTY", en["official"]["UNIT"])
            self.assertEqual(en["custom"]["MY_EFFECT"], "My effect")
            self.assertEqual(zh["custom"]["MY_EFFECT"], "自行翻譯")
            self.assertEqual(summary["locales"]["en"]["official"]["SKILL"], 1)
            self.assertEqual(json.loads((raw / "custom.json").read_text())["MY_EFFECT"], "自行翻譯")


if __name__ == "__main__":
    unittest.main()
