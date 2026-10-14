/* Exercise hub disclosures, navigation, focus and real animation frames. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173";
const ui = JSON.parse(fs.readFileSync(path.join(__dirname, "../res/v2/locales/ui.json")));
(async () => {
  let browser;
  try {
    for (const [width, theme, language] of [
      [360, "light", "zh-Hant"], [760, "dark", "en"],
      [1120, "light", "th"], [1440, "dark", "jp"]
    ]) {
      browser = await chromium.launch({headless:true,executablePath:process.env.QA_CHROME,
        args:process.env.QA_CHROME ? ['--single-process','--no-zygote'] : []});
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addInitScript(({ theme, language }) => {
        localStorage.setItem("rangerbook-theme", theme);
        localStorage.setItem("rangerbook-language", language);
      }, { theme, language });
      if (process.env.QA_LOCAL_FILES) await context.route(base + '/**', r => {
        let name = decodeURIComponent(new URL(r.request().url()).pathname);
        if (name.endsWith('/')) name += 'index.html';
        const file = path.join(__dirname, '..', name);
        const types = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
        return r.fulfill({status:fs.existsSync(file)?200:404,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.existsSync(file)?fs.readFileSync(file):''});
      });
      const page = await context.newPage();
      await page.route("https://**/*", route => {
        if (route.request().url().includes("rangerbook-auth.warmycat.com/auth/me")) {
          return route.fulfill({ status: 200, contentType: "application/json",
            headers: { "access-control-allow-origin": base, "access-control-allow-credentials": "true" },
            body: JSON.stringify({ logged_in: false }) });
        }
        return route.abort();
      });
      await page.goto(base + "/sponsor/", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.RangerbookI18n && !document.documentElement.dataset.rbLocalizing);
      await page.evaluate(() => window.RangerbookI18n.ready);
      const drawer = page.locator("#gt-site-drawer");
      const toggle = page.locator(".site-menu-toggle");
      if (width <= 1120) {
        const menuBox = await toggle.boundingBox();
        const homeBox = await page.locator(".site-home-link").boundingBox();
        const settingsBox = await page.locator(".site-settings-toggle").boundingBox();
        assert.ok(menuBox.x < homeBox.x && homeBox.x < settingsBox.x);
        assert.ok(menuBox.width >= 44 && settingsBox.width >= 44);
        await toggle.click();
        const frames = await drawer.evaluate(async element => {
          const positions = [];
          for (let frame = 0; frame < 24; frame++) {
            await new Promise(requestAnimationFrame);
            positions.push(element.getBoundingClientRect().left);
          }
          return positions;
        });
        assert.ok(frames.some(x => x < -1 && x > -292), "drawer must interpolate on opening");
        assert.ok(Math.abs(frames.at(-1)) < 1);
      } else {
        assert.equal(await toggle.isVisible(), false);
      }
      const main = page.locator('.gt-nav-hub[data-i18n="nav.mainstage"]');
      const hard = page.locator('#gt-submenu-mainstage a[href$="/hard/"]');
      assert.equal(await hard.isVisible(), false);
      await main.click();
      assert.equal(new URL(page.url()).pathname, "/sponsor/", "first click expands without navigation");
      assert.equal(await main.getAttribute("aria-expanded"), "true");
      if (width <= 1120) assert.equal(await toggle.getAttribute("aria-expanded"), "true");
      const heights = await page.locator("#gt-submenu-mainstage").evaluate(async element => {
        const values = [];
        for (let frame = 0; frame < 22; frame++) {
          await new Promise(requestAnimationFrame);
          values.push(element.getBoundingClientRect().height);
        }
        return values;
      });
      assert.ok(heights.some(x => x > 0 && x < heights.at(-1) - 1), "submenu must animate height");
      const locale = language === "zh-Hant" ? "zh_TW" : language;
      const expectedHard = ui.find(row => row.key === "UI:copy.hard.mode")[locale];
      assert.equal((await hard.innerText()).trim(), expectedHard);
      await page.locator('.gt-nav-hub[data-i18n="nav.endless"]').click();
      await hard.waitFor({ state: "hidden" });
      assert.equal(await main.getAttribute("aria-expanded"), "false");
      assert.equal(await page.locator("#gt-submenu-mainstage").evaluate(el => el.inert), true);
      await main.click();
      await hard.click();
      await page.waitForURL("**/mainstage/hard/");
      if (width <= 1120) await toggle.click();
      await page.locator('.gt-nav-hub[data-i18n="nav.mainstage"]').click();
      assert.equal(new URL(page.url()).pathname, "/mainstage/hard/");
      assert.equal(await main.getAttribute("aria-expanded"), "false");
      // Repeated clicks and keyboard activation only toggle, never navigate.
      await page.goto(base + "/sponsor/");
      if (width <= 1120) await toggle.click();
      await main.click();
      await main.press("Enter");
      assert.equal(await main.getAttribute("aria-expanded"), "false");
      await main.press("Space");
      assert.equal(await main.getAttribute("aria-expanded"), "true");
      await main.dblclick();
      assert.equal(new URL(page.url()).pathname, "/sponsor/");
      assert.equal(await main.getAttribute("aria-expanded"), "true");
      assert.equal(await main.evaluate(el => el.tagName), "BUTTON");
      assert.equal(await main.getAttribute("href"), null);
      if (width <= 1120) assert.equal(await toggle.getAttribute("aria-expanded"), "true");
      if (width <= 1120) {
        await page.locator(".gt-drawer-close").click();
        const positions = await drawer.evaluate(async element => {
          const values = [];
          for (let frame = 0; frame < 24; frame++) {
            await new Promise(requestAnimationFrame);
            values.push(element.getBoundingClientRect().left);
          }
          return values;
        });
        assert.ok(positions.some(x => x < -1 && x > -292), "drawer must interpolate on closing");
        assert.equal(await drawer.isVisible(), false);
        assert.equal(await toggle.evaluate(el => el === document.activeElement), true);
      }
      // All submenu destinations exist; hidden children follow live role changes.
      const destinations = await page.locator(".gt-nav-submenu a").evaluateAll(links => links.map(link => link.pathname));
      for (const destination of destinations) {
        assert.ok(fs.existsSync(path.join(__dirname, "..", destination, "index.html")), destination);
      }
      for (const role of ["user", "admin", "super_admin", null]) {
        await page.evaluate(role => window.dispatchEvent(new CustomEvent("rangerbook:auth-changed", {
          detail: { logged_in: Boolean(role), role }
        })), role);
        assert.equal(await page.locator('#gt-submenu-pvp a[href$="/search/"]').evaluate(el => el.hidden), role !== "super_admin");
        assert.equal(await page.locator('#gt-submenu-guildwar a[href$="/usage/"]').evaluate(el => el.hidden), !["admin", "super_admin"].includes(role));
      }
      console.log("NAV_UX_OK", JSON.stringify({ width, theme, language }));
      await context.close();
      await browser.close();
    }
  } finally { await browser?.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
