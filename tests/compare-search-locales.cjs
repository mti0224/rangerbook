const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const read = name => JSON.parse(fs.readFileSync(path.join(root, "res/v2", name + ".json")));
const index = read("ranger-index").rangers;
const fullIds = read("rangers").rangers.map(row => row.rangerCode);
const official = new Map(read("locales/official").map(row => [row.key, row]));
const ui = new Map([...read("locales/ui"), ...JSON.parse(fs.readFileSync(path.join(root,"assets/locales/sitewide-overrides.json")))].map(row => [row.key, row]));
const base = process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173";
const normalize = value => String(value || "").replace(/\\+n/g, " ").replace(/\s+/g, " ").trim();
const languages = ["zh_TW", "en", "th", "jp"];
const name = (row, locale) => {
  const words = official.get(row.nameKey) || {};
  return normalize(words[locale] || words.en || words.zh_TW || row.nameKey.slice(5));
};
const words = (key, locale) => ui.get("UI:" + key)[locale];
assert.deepEqual(index.map(row => row.rangerCode).sort(), fullIds.sort(), "search index must cover full Ranger data");
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const locale of languages) {
      const context = await browser.newContext({ viewport: { width: 1180, height: 900 } });
      await context.addInitScript(locale => localStorage.setItem("rangerbook-language", locale === "zh_TW" ? "zh-Hant" : locale), locale);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("https://**/*", route => route.abort());
      await page.goto(base + "/ranger/compare/", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.RangerbookI18n && !document.documentElement.dataset.rbLocalizing);
      await page.evaluate(() => window.RangerbookI18n.ready);
      const adapted = await page.evaluate(async () => (await fetch("/res/Ranger_index.json")).json());
      assert.deepEqual(adapted.map(row => row.id).sort(), index.map(row => row.rangerCode).sort());
      const sourceById = new Map(index.map(row => [row.rangerCode, row]));
      for (const row of adapted) {
        assert.equal(normalize(row.name), name(sourceById.get(row.id), "zh_TW"), "canonical names for existing consumers stay unchanged");
        assert.ok(row.localizedTags.length === 3 && row.nameAliases.length > 0);
      }
      const left = page.locator("#compareLeftInput");
      const right = page.locator("#compareRightInput");
      const list = page.locator("#compareLeftSuggestions");
      // English names must work in every locale; an existing short name occurs
      // after eight higher-ranked partial matches in the production index.
      const exact = index.find(row => row.rangerCode === "u001s-leonard");
      const exactIds = index.filter(row => name(row, "en") === name(exact, "en")).map(row => row.rangerCode);
      await left.fill(name(exact, "en"));
      await page.waitForFunction(ids => ids.includes(document.querySelector("#compareLeftSuggestions .compare-suggestion")?.dataset.id), exactIds);
      await list.locator('[data-id="' + exact.rangerCode + '"]').waitFor();
      assert.deepEqual((await list.locator(".compare-suggestion").evaluateAll((nodes, count) => nodes.slice(0, count).map(node => node.dataset.id), exactIds.length)).sort(), exactIds.sort());
      const expectedBrown = index.filter(row => row.rangerCode.includes("brown") || languages.some(lang => name(row, lang).toLowerCase().includes("brown")))
        .map(row => row.rangerCode).sort();
      assert.ok(expectedBrown.length > 8);
      await left.fill("bRoWn");
      await page.waitForFunction(count => document.querySelectorAll("#compareLeftSuggestions .compare-suggestion").length === count, expectedBrown.length);
      assert.deepEqual((await list.locator(".compare-suggestion").evaluateAll(nodes => nodes.map(node => node.dataset.id))).sort(), expectedBrown);
      assert.ok(await list.evaluate(el => el.scrollHeight > el.clientHeight), "all matches remain reachable by scrolling");
      const target = index.find(row => row.rangerCode === "u1631e-sally");
      // Each official language alias selects the same character on every site locale.
      for (const language of languages) {
        await left.fill(name(target, language));
        await list.locator('[data-id="' + target.rangerCode + '"]').waitFor();
      }
      for (const evolution of ["NORMAL", "ULTRA", "HYPER"]) {
        const row = evolution === "NORMAL" ? target : index.find(row => row.evolution === evolution && languages.every(lang => official.get(row.nameKey)?.[lang]));
        await left.fill(row.rangerCode);
        const suggestion = list.locator('[data-id="' + row.rangerCode + '"]');
        await suggestion.waitFor();
        const starKey = { NORMAL: "dynamic.stars", ULTRA: "dynamic.ultra", HYPER: "dynamic.hyper" }[evolution];
        const typeKey = { STR: "tag.str", INT: "tag.int", AGI: "tag.agi" }[row.roleType];
        const elementKey = { NONE: "copy.none", FIRE: "tag.fire", WATER: "tag.water", TREE: "tag.wood", LIGHT: "tag.light", DARK: "tag.dark" }[row.elementType];
        assert.equal(normalize(await suggestion.locator(".compare-suggestion-name").innerText()), name(row, locale));
        assert.equal(normalize(await suggestion.locator(".compare-suggestion-meta").innerText()),
          [words(starKey, locale).replace("%N1", row.starGrade), words(typeKey, locale), words(elementKey, locale)].join(" / "));
      }
      await left.fill(target.rangerCode);
      await list.locator('[data-id="' + target.rangerCode + '"]').click();
      // Images are intentionally blocked in this fixture and onerror removes
      // them. A selected character's ID is the stable data-readiness signal.
      await page.waitForFunction(id => [...document.querySelectorAll("#compareSelected .compare-selected-card .compare-suggestion-meta")]
        .some(node => node.textContent.trim() === id), target.rangerCode);
      assert.equal(await left.inputValue(), name(target, locale));
      await list.waitFor({ state: "hidden" });
      await right.fill(name(target, locale));
      await page.locator('#compareRightSuggestions [data-id="' + target.rangerCode + '"]').waitFor();
      await right.fill("");
      await page.locator("#compareRightSuggestions").waitFor({ state: "hidden" });
      await left.fill("");
      await list.waitFor({ state: "hidden" });
      assert.deepEqual(errors, []);
      console.log("COMPARE_SEARCH_OK", JSON.stringify({ locale, indexed: index.length, brownMatches: expectedBrown.length }));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

