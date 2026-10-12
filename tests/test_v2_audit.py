"""Validate the auditor against defects that previously looked like success."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "v2_audit", Path(__file__).resolve().parents[1] / "scripts/audit_v2_data.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class V2AuditTests(unittest.TestCase):
    def run_audit(self, payload, rows):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "locales").mkdir()
            for kind in ("official", "custom", "ui"):
                (root / "locales" / (kind + ".json")).write_text(
                    json.dumps(rows if kind == "custom" else []))
            (root / "abilities.json").write_text(json.dumps({"schemaVersion": 2, **payload}))
            return module.audit(root)

    def row(self, key, text):
        return {"key": key, "zh_TW": text, "en": text, "th": "", "jp": ""}

    def test_arrays_nested_args_and_implicit_effects_are_checked(self):
        result = self.run_audit({"abilities": [{
            "conditionKeys": ["CUSTOM:array"],
            "effectKey": {"templateKey": "CUSTOM:outer", "args": [{"key": "CUSTOM:nested"}]},
            "effectCode": "SKILLEFF_MISSING"}]}, [self.row("CUSTOM:outer", "%N1")])
        self.assertEqual(set(result["missingReferencedKeys"]), {
            "CUSTOM:array", "CUSTOM:nested", "CUSTOM:SKILLEFF_MISSING"})

    def test_empty_row_is_not_a_successful_translation(self):
        result = self.run_audit({"abilities": [{"nameKey": "CUSTOM:empty"}]},
                                [self.row("CUSTOM:empty", "")])
        self.assertEqual(result["emptyReferencedKeys"], ["CUSTOM:empty"])

    def test_missing_argument_and_unbound_key_are_detected(self):
        result = self.run_audit({"abilities": [
            {"effectKey": "CUSTOM:template"},
            {"effectKey": {"templateKey": "CUSTOM:template", "args": [0]}}]},
            [self.row("CUSTOM:template", "%N2 / %N1")])
        self.assertEqual(result["findingCounts"]["unbound_placeholder"], 2)
        self.assertEqual(result["findingCounts"]["invalid_template_arguments"], 2)

    def test_zero_and_numbered_reordering_are_valid(self):
        result = self.run_audit({"abilities": [{"effectKey": {
            "templateKey": "CUSTOM:template", "args": [0, 8]}}]},
            [self.row("CUSTOM:template", "%N2 / %N1 / %N2")])
        self.assertFalse(result["findings"])

    def test_native_binding_requires_a_complete_range(self):
        row=self.row("CUSTOM:native", "Value {$3p}, duration {$4f}s")
        result=self.run_audit({"abilities":[{"descriptionKey":"CUSTOM:native",
            "descriptionBindings":{"$3p":{"min":0,"max":9,"unit":"PERCENT"}}}]},[row])
        self.assertEqual(result["findingCounts"]["invalid_native_bindings"],2)
        result=self.run_audit({"abilities":[{"descriptionKey":"CUSTOM:native",
            "descriptionBindings":{"$3p":{"min":0,"max":9,"unit":"PERCENT"},
                                   "$4f":{"min":1.5,"max":2,"unit":"SECOND"}}}]},[row])
        self.assertFalse(result["findings"])


if __name__ == "__main__":
    unittest.main()
