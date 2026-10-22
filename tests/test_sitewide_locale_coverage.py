"""Authored overrides must stay complete and preserve bound argument positions."""
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SitewideLocaleCoverage(unittest.TestCase):
    def test_all_languages_and_arguments(self):
        rows = json.loads((ROOT / "assets/locales/sitewide-overrides.json").read_text())
        self.assertEqual(len(rows), len({row["key"] for row in rows}))
        self.assertGreater(len(rows), 100)
        for row in rows:
            # The Ultra label overrides the periodically published UI catalog
            # so its canonical Traditional Chinese spelling stays authoritative.
            self.assertTrue(row["key"].startswith("UI:site.") or row["key"] == "UI:dynamic.ultra")
            args = sorted(re.findall(r"%N\d+", row["zh_TW"]))
            for locale in ("zh_TW", "en", "th", "jp"):
                self.assertIsInstance(row[locale], str)
                self.assertTrue(row[locale].strip(), (row["key"], locale))
                self.assertEqual(args, sorted(re.findall(r"%N\d+", row[locale])), (row["key"], locale))

    def test_each_explicit_site_key_exists(self):
        rows = json.loads((ROOT / "assets/locales/sitewide-overrides.json").read_text())
        keys = {row["key"].removeprefix("UI:") for row in rows}
        for script in (ROOT / "assets/js").glob("*.js"):
            for key in re.findall(r'["\'](site\.[a-zA-Z][a-zA-Z.]+)["\']', script.read_text()):
                if key.endswith("."):
                    continue  # A known prefix with an explicit per-view suffix.
                self.assertIn(key, keys, str(script))


if __name__ == "__main__":
    unittest.main()
