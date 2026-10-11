/* Verify zh-Hant/en presentation across all major site sections and dynamic UI. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173";
const paths = [
  "/", "/settings/", "/ranger/", "/ranger/ranger/", "/ranger/stats/",
  "/ranger/compare/", "/ranger/ranking/", "/gear/", "/ability/",
  "/pvp/", "/pvp/leaderboard/", "/pvp/usage/", "/pvp/usage-history/",
  "/guildwar/", "/guildwar/ranking/", "/guildwar/usage/",
  "/mainstage/", "/mainstage/hard/", "/mainstage/extreme/",
  "/endless/", "/labyrinth/", "/admin/", "/about/"
];
(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const context = await browser.newContext({viewport:{width:1210,height:820}});
    await context.addInitScript(() => {
      localStorage.setItem("rangerbook-language","en");
    });
    const problems=[];
    for (const path of paths) {
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      await page.route("https://www.googletagmanager.com/**", r => r.abort());
      await page.route("https://rangerbook-auth.warmycat.com/**", r => r.fulfill({
        status:401,contentType:"application/json",body:'{"logged_in":false}'
      }));
      await page.route("https://res.warmycat.com/**", r => r.abort());
      try {
        await page.goto(base+path,{waitUntil:"domcontentloaded",timeout:20000});
        await page.waitForFunction(() => document.documentElement.lang === "en" &&
          window.RangerbookI18n?.t("nav.home") === "Home",null,{timeout:12000});
        const result = await page.evaluate(() => {
          const title = document.title;
          const heading = document.querySelector("main h1")?.textContent?.trim() || "";
          const intro = document.querySelector("main .page-title p:last-child")?.textContent?.trim() || "";
          const home = document.querySelector('[data-i18n="nav.home"]')?.textContent?.trim();
          return {title,heading,intro,home};
        });
        assert.equal(result.home,"Home",path+" common navigation");
        assert.ok(!/[\u3400-\u9fff]/.test(result.title),path+" document title: "+result.title);
        assert.ok(!/[\u3400-\u9fff]/.test(result.heading),path+" heading: "+result.heading);
        assert.ok(!/[\u3400-\u9fff]/.test(result.intro),path+" introduction: "+result.intro);
        if(path==="/settings/"){
          assert.equal(await page.locator('input[name="language"]:checked').inputValue(),"en");
          assert.equal(await page.locator('[data-i18n="settings.title"]').textContent(),"Settings");
        }
        if(path==="/"){
          const fixture = await page.evaluate(() => {
            const el=document.createElement("section");
            el.id="ui-translation-fixture";
            el.innerHTML='<span>使用率</span><button title="關閉詳細資料">上一頁</button><input placeholder="輸入完整或部分名稱"><select><option value="智慧型">智慧</option></select>';
            document.body.appendChild(el);
            return el.id;
          });
          await page.waitForFunction(() => document.querySelector("#ui-translation-fixture span")?.textContent === "Usage Rate");
          const translated = await page.evaluate(() => ({
            button:document.querySelector("#ui-translation-fixture button")?.textContent,
            title:document.querySelector("#ui-translation-fixture button")?.title,
            hint:document.querySelector("#ui-translation-fixture input")?.placeholder,
            option:document.querySelector("#ui-translation-fixture option")?.textContent,
            value:document.querySelector("#ui-translation-fixture option")?.value
          }));
          assert.equal(translated.button,"Previous");
          assert.equal(translated.title,"Close Details");
          assert.equal(translated.hint,"Enter a full or partial name");
          assert.equal(translated.option,"Intelligence");
          assert.equal(translated.value,"智慧型","internal filter value must not be translated");
        }
        console.log("UI_I18N_OK",path,result.heading);
      } catch (err) {
        problems.push(path+" "+String(err.message||err));
      } finally {
        await page.close();
      }
    }
    assert.deepEqual(problems,[],"Bilingual UI regression failures:\n"+problems.join("\n"));
    await context.close();
  } finally {
    await browser.close();
  }
})().catch(e => {console.error(e);process.exitCode=1;});
