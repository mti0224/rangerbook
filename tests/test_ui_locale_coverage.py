"""Test single-source bilingual UI catalogue coverage without editing original HTML."""
from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import json
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
CJK = re.compile(r"[\u3400-\u9FFF]")


class UIParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.texts: list[str] = []
        self.keys: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        for key, value in attrs:
            if not value:
                continue
            if key in ("title", "placeholder", "aria-label") and CJK.search(value):
                self.texts.append(" ".join(value.split()))
            if key in ("data-i18n", "data-i18n-placeholder", "data-i18n-aria-label"):
                self.keys.append(value)

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)

    def handle_data(self, value):
        if not self.skip and CJK.search(value):
            self.texts.append(" ".join(value.split()))


class UITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT / "assets/locales/ui.json").read_text(encoding="utf-8"))

    def test_bilingual_keys_are_complete(self):
        self.assertEqual(set(self.catalog), {"zh-Hant", "en"})
        source, english = self.catalog["zh-Hant"], self.catalog["en"]
        self.assertEqual(set(source), set(english))
        self.assertGreaterEqual(len(source), 550)
        for key in source:
            self.assertTrue(key.strip())
            self.assertIsInstance(source[key], str)
            self.assertTrue(source[key].strip())
            self.assertIsInstance(english[key], str)
            self.assertTrue(english[key].strip(), key)

    def test_all_static_pages_and_accessible_fields_have_english_entries(self):
        source = self.catalog["zh-Hant"]
        known = set(source.values())
        misses = []
        count = 0
        pages = list(ROOT.rglob("*.html"))
        self.assertGreaterEqual(len(pages), 40)
        for page in pages:
            if any(folder in page.parts for folder in (".git", "node_modules", "dist")):
                continue
            parser = UIParser()
            parser.feed(page.read_text(encoding="utf-8"))
            # The independent V2 preview loads res/v2/locales/ui.json, not
            # assets/locales/ui.json. Validate its actual source catalog.
            page_source = source
            page_known = known
            if page.relative_to(ROOT).parts[0] == "v2":
                rows = json.loads((ROOT / "res/v2/locales/ui.json").read_text(encoding="utf-8"))
                self.assertTrue(all(r.get("en", "").strip() for r in rows))
                page_source = {r["key"].removeprefix("UI:"): r["zh_TW"] for r in rows}
                page_known = set(page_source.values()) | {
                    page_source["v2.title"] + "｜LINE Rangers Database",
                    "← " + page_source["v2.back"],
                    "日本語",  # Native language name in the language selector.
                }
            for text in parser.texts:
                count += 1
                if text not in page_known:
                    misses.append(str(page.relative_to(ROOT)) + ": " + text[:100])
            for key in parser.keys:
                if key not in page_source:
                    misses.append(str(page.relative_to(ROOT)) + ": undefined key " + key)
        self.assertGreater(count, 600)
        self.assertFalse(misses, "\n".join(misses[:45]))


if __name__ == "__main__":
    unittest.main()
