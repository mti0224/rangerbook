/* Settings page bilingual/theme interaction; reuses existing Playwright visual-audit runtime. */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const base = process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173";

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1400, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({viewport});
      const page = await context.newPage();
      await page.route("https://rangerbook-auth.warmycat.com/**", route => route.fulfill({
        status:401,contentType:"application/json",body:'{"logged_in":false}'
      }));
      await page.route("https://www.googletagmanager.com/**", route => route.abort());
      await page.goto(base + "/settings/", {waitUntil:"domcontentloaded"});
      await page.waitForSelector('.rb-choice input[name="theme"]');
      assert.equal(await page.locator('input[name="theme"]').count(), 2);
      assert.equal(await page.locator('input[name="language"]').count(), 2);
      assert.equal(await page.locator('input[name="theme"]:checked').inputValue(), "light");
      assert.equal(await page.locator('input[name="language"]:checked').inputValue(), "zh-Hant");
      assert.equal(await page.locator('.site-settings-toggle').getAttribute('href'), '/settings/');
      assert.equal(await page.locator('.site-settings-menu').count(), 0);
      await page.getByRole("radio",{name:"深色模式"}).check();
      assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
      assert.equal(await page.evaluate(()=>localStorage.getItem("rangerbook-theme")), "dark");
      await page.locator('input[name="language"][value="en"]').check();
      await page.waitForFunction(() => document.documentElement.lang === "en" && document.querySelector('input[name="language"][value="en"]').checked);
      await page.waitForFunction(() => document.querySelector('[data-i18n="settings.title"]')?.textContent === "Settings");
      assert.equal(await page.locator('input[name="theme"]:checked').inputValue(), "dark");
      assert.equal(await page.locator('input[name="language"]:checked').inputValue(), "en");
      assert.equal(await page.locator(".site-settings-menu").count(),0);
      assert.equal(await page.locator(".site-settings-toggle").isVisible(),true);
      await page.locator('input[name="theme"][value="light"]').check();
      assert.equal(await page.locator("html").getAttribute("data-theme"),"light");
      await page.goto(base+"/");
      await page.waitForFunction(() => document.querySelector('[data-i18n="nav.home"]')?.textContent === "Home");
      assert.equal(await page.locator("html").getAttribute("lang"),"en");
      assert.equal(await page.locator("html").getAttribute("data-theme"),"light");
      await page.goto(base+"/settings/");
      await page.waitForFunction(() => document.querySelector('input[name="language"][value="en"]')?.checked);
      await page.locator('input[name="language"][value="zh-Hant"]').check();
      await page.waitForFunction(() => document.documentElement.lang === "zh-Hant" && document.querySelector('input[name="language"][value="zh-Hant"]').checked);
      console.log("SETTINGS_UI_OK "+viewport.width);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
