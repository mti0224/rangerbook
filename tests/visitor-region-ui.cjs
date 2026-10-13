const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173";
const paypal = "https://www.paypal.com/ncp/payment/SPHZE8H6CQYXW";
const languageKey = "rangerbook-language";
async function waitReady(page) {
  await page.waitForFunction(() => window.RangerbookI18n && window.RangerbookV2);
  await page.evaluate(() => Promise.all([window.RangerbookVisitor.ready, window.RangerbookI18n.ready, window.RangerbookV2.ready]));
}
async function verifyLanguage(page, expected) {
  await waitReady(page);
  assert.equal(await page.locator("html").getAttribute("lang"), expected === "jp" ? "ja" : expected);
  assert.equal(await page.evaluate(() => window.RangerbookI18n.locale), expected);
  assert.equal(await page.evaluate(() => window.RangerbookV2.locale), expected === "zh-Hant" ? "zh_TW" : expected);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), languageKey), expected);
  assert.equal(await page.locator("html").getAttribute("data-rb-localizing"), null);
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [country, expected] of [["TW", "zh-Hant"], ["HK", "zh-Hant"], ["MO", "zh-Hant"], ["TH", "th"], ["JP", "jp"], ["US", "en"], ["CN", "en"]]) {
      const context = await browser.newContext({ locale: "en-US", viewport: { width: 390, height: 844 } });
      let currentCountry = country, requests = 0;
      await context.route("https://api.country.is/**", route => {
        requests++;
        assert.equal(route.request().headers().referer, undefined);
        return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ country: currentCountry, ip: "192.0.2.1" }) });
      });
      await context.route("https://www.googletagmanager.com/**", route => route.abort());
      await context.route("https://rangerbook-auth.warmycat.com/**", route => route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(base + "/sponsor/", { waitUntil: "domcontentloaded" });
      await verifyLanguage(page, expected);
      const link = page.locator("[data-region-sponsor]");
      await page.waitForFunction(() => !document.querySelector("[data-region-sponsor]").hasAttribute("aria-disabled"));
      const href = await link.getAttribute("href");
      assert.ok(country === "TW" ? href.startsWith("https://payment.ecpay.com.tw/") : href === paypal);
      assert.equal(requests, 1, "first visit and sponsor share one lookup");
      assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage }).includes("192.0.2.1")), false);
      // Travel / a new network cannot replace the language already saved on this device.
      currentCountry = country === "JP" ? "TW" : "JP";
      await page.goto(base + "/settings/", { waitUntil: "domcontentloaded" });
      await verifyLanguage(page, expected);
      assert.equal(requests, 1, "returning pages need no country lookup for language");
      assert.equal(await page.locator('input[name="language"]:checked').inputValue(), expected);
      const manual = expected === "en" ? "th" : "en";
      await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.locator('input[name="language"][value="' + manual + '"]').click()]);
      await verifyLanguage(page, manual);
      await page.goto(base + "/sponsor/", { waitUntil: "domcontentloaded" });
      await verifyLanguage(page, manual);
      await page.waitForFunction(() => !document.querySelector("[data-region-sponsor]").hasAttribute("aria-disabled"));
      assert.equal(requests, 2);
      const nextHref = await link.getAttribute("href");
      assert.ok(currentCountry === "TW" ? nextHref.startsWith("https://payment.ecpay.com.tw/") : nextHref === paypal);
      assert.deepEqual(errors, []);
      console.log("REGION_OK", country, expected, "manual", manual);
      await context.close();
    }
    // A failed / malformed service response must not leave the page or link blocked.
    for (const mode of ["error", "invalid", "timeout"]) {
      const context = await browser.newContext();
      await context.route("https://api.country.is/**", async route => {
        if (mode === "timeout") await new Promise(resolve => setTimeout(resolve, 3000));
        await route.fulfill({ status: mode === "error" ? 503 : 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"country":"invalid"}' }).catch(() => {});
      });
      await context.route("https://www.googletagmanager.com/**", route => route.abort());
      await context.route("https://rangerbook-auth.warmycat.com/**", route => route.abort());
      const page = await context.newPage();
      await page.goto(base + "/sponsor/", { waitUntil: "domcontentloaded" });
      await verifyLanguage(page, "en");
      assert.equal(await page.locator("[data-region-sponsor]").getAttribute("href"), paypal);
      assert.equal(await page.locator("[data-region-sponsor]").getAttribute("aria-disabled"), null);
      console.log("REGION_FALLBACK_OK", mode);
      await context.close();
    }
    // A language preference saved during a pending lookup has priority.
    const context = await browser.newContext();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await context.route("https://api.country.is/**", async route => {
      await gate;
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"country":"JP"}' });
    });
    await context.route("https://www.googletagmanager.com/**", route => route.abort());
    await context.route("https://rangerbook-auth.warmycat.com/**", route => route.abort());
    const page = await context.newPage();
    await page.goto(base + "/sponsor/", { waitUntil: "domcontentloaded" });
    assert.equal(await page.evaluate(() => document.cookie.includes("rangerbook-language=")), false, "temporary defaults must not preempt country detection");
    assert.equal(await page.locator("[data-region-sponsor]").getAttribute("aria-disabled"), "true");
    await page.evaluate(key => localStorage.setItem(key, "th"), languageKey);
    release();
    await verifyLanguage(page, "th");
    assert.equal(await page.locator("[data-region-sponsor]").getAttribute("href"), paypal);
    await context.close();
    console.log("REGION_CONCURRENT_PREFERENCE_OK");
    // A first visit directly to a data page must use the same finalized locale.
    const fresh = await browser.newContext();
    await fresh.route("https://api.country.is/**", route => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"country":"JP"}' }));
    await fresh.route("https://www.googletagmanager.com/**", route => route.abort());
    await fresh.route("https://rangerbook-auth.warmycat.com/**", route => route.abort());
    await fresh.route("https://rangers.lerico.net/**", route => route.abort());
    await fresh.route("https://res.warmycat.com/**", route => route.abort());
    const comparison = await fresh.newPage();
    await comparison.goto(base + "/ranger/compare/", { waitUntil: "domcontentloaded" });
    await verifyLanguage(comparison, "jp");
    await comparison.locator("#compareLeftInput").fill("u1631e-sally");
    const suggestion = comparison.locator('#compareLeftSuggestions [data-id="u1631e-sally"]');
    await suggestion.waitFor();
    assert.equal(await suggestion.locator(".compare-suggestion-name").innerText(), "太陽のかに座 サリー");
    assert.equal(await suggestion.locator(".compare-suggestion-meta").innerText(), "星9 / 知能タイプ / 光");
    await fresh.close();
    console.log("REGION_FIRST_DATA_PAGE_OK");
    // Cookie preferences still work when localStorage is unavailable.
    const cookieContext = await browser.newContext();
    await cookieContext.addCookies([{ name: languageKey, value: "ja", url: base }]);
    await cookieContext.addInitScript(key => {
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (name) { if (name === key) throw new Error("Storage disabled"); return get.call(this, name); };
      Storage.prototype.setItem = function (name, value) { if (name === key) throw new Error("Storage disabled"); return set.call(this, name, value); };
    }, languageKey);
    let cookieLookups = 0;
    await cookieContext.route("https://api.country.is/**", route => { cookieLookups++; return route.abort(); });
    await cookieContext.route("https://www.googletagmanager.com/**", route => route.abort());
    await cookieContext.route("https://rangerbook-auth.warmycat.com/**", route => route.abort());
    const cookiePage = await cookieContext.newPage();
    await cookiePage.goto(base + "/settings/", { waitUntil: "domcontentloaded" });
    await waitReady(cookiePage);
    assert.equal(await cookiePage.locator('input[name="language"]:checked').inputValue(), "jp");
    await Promise.all([cookiePage.waitForNavigation({ waitUntil: "domcontentloaded" }), cookiePage.locator('input[name="language"][value="zh-Hant"]').click()]);
    await waitReady(cookiePage);
    assert.equal(await cookiePage.locator("html").getAttribute("lang"), "zh-Hant");
    assert.equal(cookieLookups, 0);
    await cookieContext.close();
    console.log("REGION_COOKIE_PREFERENCE_OK");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
