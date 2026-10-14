const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4173';
const root = path.join(__dirname, '..');
const rows = JSON.parse(fs.readFileSync(path.join(root, 'deploy/aws/v2/locales/ui.json')));
const t = (key, locale) => rows.find(r => r.key === 'UI:' + key)[locale === 'zh-Hant' ? 'zh_TW' : locale];
const fill = (key, locale, value) => t(key, locale).replace('%N1', value);
const report = {status:'ready',days:7,updatedAt:'2026-10-13T10:00:00Z',pages:[
  {path:'/pvp/usage/',views:11414}, {path:'/ranger/ranger/',views:1382}, {path:'/pvp/leaderboard/',views:1229}
]};
const ranger=JSON.parse(fs.readFileSync(path.join(root,'res/v2/ranger-index.json'))).rangers[0];
const gear=JSON.parse(fs.readFileSync(path.join(root,'res/v2/equipment-name-index.json'))).equipment[0];
const details={...report,pages:[
  {path:`/ranger/ranger/${ranger.rangerCode}/`,views:2000},
  {path:`/gear/${gear.equipCode}/`,views:1000},
  {path:'/endless/stage/end1/',views:500}
]};
(async () => {
  let browser;
  try {
    for (const locale of ['zh-Hant','en','jp','th']) for (const theme of ['light','dark']) {
      browser = await chromium.launch({headless:true, executablePath:process.env.QA_CHROME,
        args:process.env.QA_CHROME ? ['--single-process','--no-zygote'] : []});
      const context = await browser.newContext({viewport:{width:1366,height:1000}});
      if (process.env.QA_LOCAL_FILES) await context.route(base + '/**', r => {
        let name = decodeURIComponent(new URL(r.request().url()).pathname);
        if(name.endsWith('/')) name += 'index.html';
        const file=path.join(root,name === '/res/v2/locales/ui.json' ? 'deploy/aws/v2/locales/ui.json' : name);
        const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
        return r.fulfill({status:fs.existsSync(file)?200:404,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.existsSync(file)?fs.readFileSync(file):''});
      });
      await context.addInitScript(({locale,theme}) => {
        localStorage.setItem('rangerbook-language',locale);
        localStorage.setItem('rangerbook-theme',theme);
      }, {locale,theme});
      await context.route('**/www.googletagmanager.com/**',r=>r.abort());
      let mode = 'ready';
      await context.route('**/rangerbook-auth.warmycat.com/**',r=>r.fulfill({
        status:r.request().url().endsWith('/public/popular-pages') ? (mode === 'error' ? 503 : 200) : 401,
        contentType:'application/json',body:JSON.stringify(mode === 'empty' ? {...report,pages:[]} : mode === 'unconfigured' ? {status:'unconfigured',pages:[]} : mode === 'details' ? details : report)
      }));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base + '/', {waitUntil:'domcontentloaded'});
      await page.evaluate(()=>window.RangerbookI18n.ready);
      await page.locator('.home-popular-link').nth(2).waitFor();
      assert.equal(await page.locator('#homePopularTitle').textContent(),t('home.popular.title',locale));
      assert.equal(await page.locator('#homeAllPagesTitle').textContent(),t('home.allPages',locale));
      assert.equal(await page.locator('.home-popular-card #homePopularTitle, .home-update-card #homeUpdateTitle').count(),0);
      const allPagesStyle=await page.locator('.home-all-pages').evaluate(el=>{
        const css=getComputedStyle(el);return {background:css.backgroundColor,border:css.borderTopWidth};
      });
      assert.deepEqual(allPagesStyle,{background:'rgba(0, 0, 0, 0)',border:'0px'});
      assert.equal(await page.locator('.home-popular-name').first().textContent(),t('home.popular.pvpUsage',locale));
      assert.equal(await page.locator('.home-popular-rank').first().textContent(),fill('home.popular.rank',locale,1));
      assert.equal(await page.locator('.home-popular-views').first().textContent(),fill('home.popular.views',locale,(11414).toLocaleString(locale==='jp'?'ja':locale)));
      assert.deepEqual(await page.locator('.home-popular-link').evaluateAll(links=>links.map(a=>new URL(a.href).pathname)),report.pages.map(p=>p.path));
      for (const width of [1366,961,960,768,390,320]) {
        await page.setViewportSize({width,height:1000});
        const popular = await page.locator('.home-popular-card').boundingBox();
        const updates = await page.locator('.home-update-card').boundingBox();
        const tools = await page.locator('.home-tool-grid').boundingBox();
        for(const [titleId,card] of [['homePopularTitle',popular],['homeUpdateTitle',updates],['homeAllPagesTitle',tools]]) {
          const title=await page.locator('#'+titleId).boundingBox();
          assert.ok(title.y+title.height<=card.y+1,'Section title must sit outside and above its card');
          assert.ok(Math.abs(title.x-card.x)<1,'Section title must align with the left edge');
          assert.equal(await page.locator('#'+titleId).evaluate(el=>getComputedStyle(el).textAlign),'left');
        }
        const boxes = await page.locator('.home-popular-link').evaluateAll(links=>links.map(a=>{
          const b=a.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};
        }));
        assert.ok(Math.abs(boxes[1].y-boxes[2].y)<1);
        assert.ok(boxes[0].y+boxes[0].height <= boxes[1].y+1);
        assert.ok(Math.abs(boxes[0].height-boxes[1].height)<1,'Top and bottom halves must match');
        assert.ok(boxes[1].x < boxes[2].x);
        if (width>960) assert.ok(Math.abs(popular.y-updates.y)<1);
        else {
          assert.ok(popular.y+popular.height <= updates.y+1);
          assert.ok(updates.y+updates.height <= tools.y+1);
          const cards=await page.locator('.home-tool-card').evaluateAll(a=>a.map(x=>x.getBoundingClientRect().x));
          assert.ok(cards.every(x=>Math.abs(x-cards[0])<1));
        }
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
        const clipped=await page.locator('.home-popular-link').evaluateAll(a=>a.filter(x=>x.scrollWidth>x.clientWidth+1).length);
        assert.equal(clipped,0,'Translated cards must fit');
      }
      if(locale==='zh-Hant') {
        fs.mkdirSync(path.join(root,'artifacts/home-popular'),{recursive:true});
        for(const width of [1366,390]) {
          await page.setViewportSize({width,height:1000});
          await page.locator('.gt-sidebar').evaluate(async el => {
            await Promise.all(el.getAnimations().map(animation => animation.finished.catch(()=>{})));
          });
          await page.screenshot({path:path.join(root,`artifacts/home-popular/${theme}-${width}.png`),fullPage:true});
        }
      }
      for(const state of ['empty','error','unconfigured']) {
        mode=state;
        await page.reload({waitUntil:'domcontentloaded'});
        await page.locator('#homePopularPages[aria-busy="false"]').waitFor();
        assert.equal(await page.locator('#homePopularPages').innerText(),t(state==='error'?'home.popular.error':'home.popular.empty',locale));
      }
      mode='details';
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('.home-popular-link').nth(2).waitFor();
      assert.equal(await page.locator('.home-popular-name').first().textContent(),
        await page.evaluate(key=>window.RangerbookV2.render(key,window.RangerbookV2.locale),ranger.nameKey));
      assert.deepEqual(await page.locator('.home-popular-link').evaluateAll(a=>a.map(x=>new URL(x.href).pathname+new URL(x.href).search)),[
        `/ranger/ranger/?detail=${ranger.rangerCode}`,`/gear/?detail=${gear.equipCode}`,'/endless/stage/end1/'
      ]);
      assert.equal(await page.locator('.home-popular-name').nth(2).textContent(),fill('home.popular.endlessStage',locale,'1'));
      assert.deepEqual(errors,[]);
      await context.close();
      await browser.close();
      console.log(locale,theme,'layout, links, translations, fallback states passed');
    }
  } finally {await browser?.close();}
})().catch(e=>{console.error(e);process.exit(1);});
