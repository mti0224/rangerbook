"""Verify approved contextual game-term changes and their official provenance."""
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


def clean(text):
    text = re.sub(r"(?<=[A-Za-z])-\\+n(?=[A-Za-z])", "", text)
    return re.sub(r"\s+", " ", re.sub(r"\\+n", " ", text)).strip()


class GameTermAlignmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.audit = json.loads((ROOT / "docs/v2-audit/game-term-alignment-20261013.json").read_text())
        cls.rows = {}
        for kind in ("ui", "custom"):
            inputs = json.loads((ROOT / f"deploy/aws/v2/locales/{kind}.json").read_text())
            for row in inputs:
                key = "CUSTOM:" + row["key"] if kind == "custom" else row["key"]
                cls.rows[key] = dict(row, key=key)

    def test_every_change_has_exact_official_source_and_retains_slots(self):
        sources = {r["sourceKey"]: r for r in self.audit["selectedSources"]}
        self.assertEqual(len(self.audit["changes"]), 185)
        for change in self.audit["changes"]:
            actual = self.rows[change["key"]]
            self.assertEqual(actual["zh_TW"], change["zh_TW"])
            for language, edit in change["fields"].items():
                self.assertEqual(actual[language], edit["after"])
                tokens = lambda s: re.findall(r"%(?:N\d*|d\d*|s|n)", s)
                self.assertEqual(tokens(edit["before"]), tokens(edit["after"]), change["key"])
                self.assertTrue(edit["sources"], change["key"])
                for source in edit["sources"]:
                    self.assertEqual(source["officialText"], sources[source["sourceKey"]][language])
                    if source["mode"] == "official_label":
                        self.assertEqual(edit["after"], clean(source["officialText"]))
                    elif source["mode"] == "official_label_adapted":
                        self.assertEqual(edit["after"], clean(source["officialText"]).replace("%d", "%N1"))
                    elif source["mode"] == "official_artifact_base_name":
                        base = re.split(r"[:：]", re.sub(r"^\[[ABC]\]\s*", "", clean(source["officialText"])), maxsplit=1)[0].strip()
                        self.assertEqual(edit["after"], base)
                        self.assertEqual(source["removedDisplayFields"], ["grade", "target"])
                    elif source["mode"] == "official_term_fragment":
                        self.assertIn(source["fragment"], source["officialText"])
                        self.assertIn(source["fragment"], edit["after"])
                    else:
                        self.assertIn(clean(source["officialText"]), edit["after"])

    def test_context_conflicts_do_not_replace_unrelated_website_labels(self):
        self.assertEqual(self.rows["CUSTOM:REAPER_GIMMICK_TITLE"]["en"], "Reaper")
        self.assertEqual(self.rows["CUSTOM:LABYRINTH_ARTIFACT_NAME_bf_hp"]["en"], "Vital Jewel")
        self.assertEqual(self.rows["UI:copy.level"]["en"], "Level")
        self.assertEqual(self.rows["UI:copy.awakened"]["en"], "Awakened")
        self.assertEqual(self.rows["UI:ranger.hyper"]["en"], "Hyper")
        self.assertEqual(self.rows["UI:ranger.ultra"]["en"], "Ultra")

    def test_term_components_retain_numeric_scope_and_graceful_normalization(self):
        self.assertEqual(self.rows["CUSTOM:INK_GIMMICK_TITLE"]["th"], "หมึกทมิฬ")
        self.assertEqual(self.rows["CUSTOM:V2_GEAR_RESPAWN_TIME"]["en"], "Ranger Regeneration Time (%)")
        self.assertEqual(self.rows["CUSTOM:ABILITY_TALENT_TYPE_BARRIER"]["th"],
                         "บาเรียทักษะ (ลดความเสียหาย %d1% แล้วความสามารถมีคูลดาวน์ %d2 วินาที)")
        self.assertEqual(self.rows["UI:dynamic.talentStage"]["jp"], "才能%N1ステージ")
        self.assertEqual(self.rows["UI:nav.endless"]["en"], "INFINITOWER")
        self.assertEqual(self.rows["UI:copy.team"]["jp"], "グループ")

    def test_artifact_names_follow_all_437_matching_game_variants(self):
        checks = self.audit["artifactIdentityChecks"]
        self.assertEqual(len(checks), 21)
        self.assertEqual(sum(c["officialVariantsChecked"] for c in checks), 437)
        self.assertTrue(all(c["chineseBaseNameMatches"] and c["allLanguageBaseNamesAgree"] for c in checks))
        self.assertEqual(self.rows["CUSTOM:LABYRINTH_ARTIFACT_NAME_bf_atkspd"]["en"], "Fresh Lizard's Tail")
        self.assertEqual(self.rows["CUSTOM:LABYRINTH_ARTIFACT_NAME_df_atkrge"]["en"], "Heavy Boomerang")
        self.assertEqual(self.rows["CUSTOM:LABYRINTH_ARTIFACT_NAME_bf_redmg"]["en"], "Divine Mirror")
        artifacts = json.loads((ROOT / "res/v2/labyrinth-artifacts.json").read_text())["artifacts"]
        self.assertEqual(len(artifacts), 55)
        self.assertTrue(all(a["grade"] in {"A", "B", "C"} and a["pointsByTarget"] and a["effect"] for a in artifacts))

    def test_all_authored_inputs_are_complete_unique_five_column_rows(self):
        self.assertEqual(len(self.rows), 1339)
        self.assertEqual(len(self.audit["decisions"]), len(self.rows))
        for row in self.rows.values():
            self.assertEqual(set(row), {"key", "zh_TW", "en", "th", "jp"})
            self.assertTrue(all(isinstance(s, str) and s.strip() for s in row.values()))

    def test_official_absences_remain_marked(self):
        manifest = json.loads((ROOT / "res/v2/manifest.json").read_text())
        self.assertFalse(manifest["translationAudit"]["allReferencedTranslationsComplete"])
        self.assertEqual(self.audit["officialPublishedComparison"]["differentFields"], 0)
        self.assertEqual(self.audit["officialPublishedComparison"]["absentReferencedKeys"], 739)


if __name__ == "__main__":
    unittest.main()
