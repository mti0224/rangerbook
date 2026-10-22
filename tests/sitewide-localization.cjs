/* Full-page translation regression. All account actions and remote data are mocked. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
const base = 'https://localization-test.invalid';
const read = name => fs.readFileSync(path.join(root, name));
const rows = ['res/v2/locales/ui.json','assets/locales/personal-analysis-overrides.json','assets/locales/sitewide-overrides.json']
  .flatMap(name => JSON.parse(read(name)));
const catalog = new Map(rows.map(row => [row.key.slice(3), row]));
const expected = (key,locale,...args) => catalog.get(key)[locale === 'zh-Hant' ? 'zh_TW' : locale]
  .replace(/%N(\d+)/g,(_,n) => args[Number(n)-1]);
const metadata = JSON.parse(read('pwa-data.json'));
for(const [name,entry] of Object.entries(metadata.files)) {
  if(fs.existsSync(path.join(root,name))) {
    const bytes = read(name);
    entry.hash = crypto.createHash('sha256').update(bytes).digest('hex');
    entry.size = bytes.length;
  }
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6oAAAAABJRU5ErkJggg==','base64');
async function routeFixtures(context) {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if(url.origin === base) {
      let name = decodeURIComponent(url.pathname).replace(/^\//,'');
      if(!name || name.endsWith('/')) name += 'index.html';
      if(name === 'pwa-data.json') return route.fulfill({json:metadata});
      const file = path.join(root,name);
      const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
      return route.fulfill({status:fs.existsSync(file)?200:404,contentType:types[path.extname(name)] || 'application/octet-stream',body:fs.existsSync(file)?read(name):''});
    }
    if(url.hostname === 'rangerbook-auth.warmycat.com') {
      let json = {items:[]};
      if(url.pathname === '/auth/me') json = {logged_in:true,role:'super_admin',account:'qa_admin',admin_application_status:'approved'};
      if(url.pathname === '/admin/users') json = {items:[{id:42,account:'qa_target',role:'user',admin_application_status:'approved'}]};
      if(url.pathname === '/admin/applications') json = {items:[{id:42,account:'qa_target',created_at:'2026-10-21T00:00:00Z'}]};
      if(url.pathname === '/admin/personal-game/status') json = {bound:false};
      if(url.pathname === '/admin/resource-updates') json = {items:[],totalRecordedBatches:0};
      if(url.pathname === '/qa-error') return route.fulfill({status:401,json:{detail:'帳號或密碼錯誤。'}});
      return route.fulfill({json});
    }
    if(url.hostname === 'pvp-data.warmycat.com') return route.fulfill({json:{files:[],rangers:[],players:[],guilds:[],items:[],metadata:{}}});
    if(route.request().resourceType() === 'image') return route.fulfill({contentType:'image/png',body:png});
    return route.abort();
  });
}
async function ready(page,url) {
  await page.goto(base+url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!window.RangerbookI18n);
  await page.evaluate(() => window.RangerbookI18n.ready);
}
async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function assertTranslated(page,locale,selector) {
  const source = [...catalog.values()].filter(r => r.zh_TW !== r[locale === 'zh-Hant' ? 'zh_TW' : locale]);
  const misses = await page.locator(selector).evaluateAll((els,rows) => {
    const candidates = new Set(rows.map(r => r.zh_TW));
    const misses=[];
    for(const el of els) {
      if(!el.checkVisibility())continue;
      for(const n of el.childNodes)if(n.nodeType===3 && candidates.has(n.nodeValue.trim()))misses.push(n.nodeValue.trim());
      for(const attr of ['title','aria-label','placeholder'])if(candidates.has(el.getAttribute(attr)))misses.push(attr+': '+el.getAttribute(attr));
    }
    return [...new Set(misses)];
  },source);
  assert.deepEqual(misses,[],`${locale} untranslated text at ${page.url()}`);
  if(locale === 'en' || locale === 'th') {
    const chinese=await page.locator(selector).evaluateAll(els=>els.filter(el=>el.checkVisibility()).flatMap(el=>[...el.childNodes].filter(n=>n.nodeType===3 && /[\u3400-\u9fff]/.test(n.nodeValue)).map(n=>n.nodeValue.trim())));
    assert.deepEqual(chinese,[],`${locale} Chinese residuals at ${page.url()}`);
  }
}
(async () => {
  const args = ['--no-sandbox','--disable-dev-shm-usage'];
  if(process.env.CHROMIUM_PATH?.includes('/tmp/'))args.push('--no-zygote','--disable-gpu');
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args});
  try {
    for(const locale of (process.env.QA_LOCALES || 'en,th,jp,zh-Hant').split(',')) {
      const context = await browser.newContext({serviceWorkers:'block',viewport:{width:1200,height:900}});
      await context.addInitScript(locale => {
        localStorage.setItem('rangerbook-language',locale);
        window.qaCanvasText=[];
        const fill=CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.qaCanvasText.push(text);return fill.call(this,text,...args);};
      },locale);
      await routeFixtures(context);
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      const errors=[];page.on('pageerror',error => errors.push(error.message));
      await ready(page,'/settings/');
      // Existing attributes changed after insertion must translate, without observer loops.
      await page.evaluate(() => {const button=document.createElement('button');button.id='qaAttrs';button.textContent='QA';document.body.append(button);});
      await page.locator('#qaAttrs').evaluate(el => {
        el.title='開啟選單';el.setAttribute('aria-label','關閉選單');
        el.setAttribute('data-expand-text','展開');el.setAttribute('data-collapse-text','收合');
      });
      await page.waitForFunction(want => document.querySelector('#qaAttrs').title===want,expected('site.nav.openMenu',locale));
      assert.equal(await page.locator('#qaAttrs').getAttribute('aria-label'),expected('site.nav.closeMenu',locale));
      assert.equal(await page.locator('#qaAttrs').getAttribute('data-expand-text'),expected('action.expand',locale));
      assert.equal(await page.locator('#qaAttrs').getAttribute('data-collapse-text'),expected('action.collapse',locale));
      const translated = await page.evaluate(() => [window.RangerbookI18n.uiText('攻擊力 123,456'),window.RangerbookI18n.uiText('5等，共240等'),window.RangerbookI18n.uiText('關卡 1-1'),window.RangerbookI18n.uiText('0.5秒 ~ 1秒')]);
      assert.deepEqual(translated,[expected('site.dynamic.attack',locale,'123,456'),expected('site.dynamic.levelProgress',locale,5,240),expected('site.dynamic.stageCoordinate',locale,1,1),expected('site.dynamic.secondRange',locale,'0.5',1)]);
      if(locale === 'en') assert.equal(await page.evaluate(() => window.RangerbookI18n.uiText('超進化8星')),'Hyper 8 Stars');
      assert.equal(await page.evaluate(() => window.RangerbookI18n.uiText('敏捷型')),expected('tag.agi',locale),
        'canonical tags must win over analysis labels regardless of publisher row order');
      await ready(page,'/guildwar/ranking/');
      await page.waitForFunction(() => document.querySelector('.pvp-empty-row'));
      await settle(page);
      assert.equal((await page.locator('.pvp-empty-row').innerText()).trim(),expected('site.guild.noTier',locale,await page.evaluate(() => window.RangerbookI18n.uiText('傳奇'))));
      // Talent categories must survive the V2 adapter and remain functional
      // after the fast preview is replaced by complete filter data.
      await ready(page,'/ranger/ranger/');
      await page.waitForFunction(() => !document.querySelector('#rangerAdvancedToggleBtn').disabled
        && document.querySelector('#talentConditionFilter').options.length>1);
      await page.locator('#rangerAdvancedToggleBtn').click();
      const talentWords=new Map(JSON.parse(read('res/v2/locales/custom.json')).map(row=>[row.key,row]));
      const talentRows=JSON.parse(read('res/v2/rangers.json')).rangers;
      const talentCategory=(key,lang)=>talentWords.get(key)[lang].replace(/%(?:N\d*|d\d*|s|n)/g,'N');
      for(const [selector,kind,count] of [['#talentConditionFilter','condition',12],['#talentEffectFilter','effect',16]]) {
        const keys=[...new Set(talentRows.flatMap(row=>{
          const main=row.talents?.major;if(!main)return [];
          return kind==='condition'?[main.activationConditionKey.templateKey]:main.effects.map(effect=>effect.localizedEffect.templateKey);
        }))];
        const want=keys.map(key=>({value:talentCategory(key,'zh_TW'),label:talentCategory(key,locale==='zh-Hant'?'zh_TW':locale)}));
        await page.waitForFunction(({selector,want})=>want.every(item=>[...document.querySelector(selector).options]
          .some(option=>option.value===item.value && option.textContent===item.label)),{selector,want});
        assert.equal(await page.locator(selector+' option').count(),count+1,locale+' populated talent '+kind+' categories');
      }
      for(const [condition,effect] of [
        ['TLT_CRITICAL_ATTACK',null],
        [null,'CUSTOM:TALENT_TEXT_SPEED_S'],
        ['TLT_CRITICAL_ATTACK','CUSTOM:TALENT_TEXT_PASS_PHY_DEF_S'],
        ['TLT_NO_CONDITION','CUSTOM:TALENT_TEXT_PASS_PHY_DEF_S']
      ]) {
        await page.locator('#talentConditionFilter').selectOption(condition?talentCategory('CUSTOM:TALENT_TEXT_'+condition,'zh_TW'):'');
        await page.locator('#talentEffectFilter').selectOption(effect?talentCategory(effect,'zh_TW'):'');
        const ids=talentRows.filter(row=>{
          const main=row.talents?.major;
          return main && (!condition || main.activationConditionCode===condition)
            && (!effect || main.effects.some(item=>item.localizedEffect.templateKey===effect));
        }).map(row=>row.rangerCode).sort();
        await page.waitForFunction(count=>Number(document.querySelector('#rangerResultCount').textContent)===count,ids.length);
        assert.deepEqual((await page.locator('.ranger-card').evaluateAll(cards=>cards.map(card=>card.dataset.rangerId))).sort(),ids,
          locale+' talent filter exact matches: '+condition+' / '+effect);
      }
      await page.locator('#rangerResetBtn').click();
      assert.equal(await page.locator('#talentConditionFilter').inputValue(),'');
      assert.equal(await page.locator('#talentEffectFilter').inputValue(),'');
      assert.equal(await page.locator('.ranger-card').count(),60);
      console.log('TALENT_FILTER_UI_OK',locale,'12/16 localized categories; independent, combined and empty matches; reset');
      // Detail names and IDs are explicit arguments; titles remain stable after DOM updates.
      await ready(page,'/ranger/ranger/?detail=u1626u-cony');
      await page.locator('#rangerLevelRange').waitFor();
      const evolution = page.locator('.ranger-evolution-section');
      await evolution.waitFor();
      assert.equal(await evolution.locator('h3').innerText(),expected('site.evolution.title',locale));
      assert.equal(await evolution.locator('[data-evolution-id]').count(),4);
      assert.equal(await evolution.locator('[aria-current="page"]').count(),1);
      assert.equal(await evolution.locator('.ranger-evolution-current').innerText(),expected('site.evolution.current',locale));
      assert.equal(await evolution.evaluate(el => el.previousElementSibling.querySelector('h3').dataset.i18n),'detail.basicStats');
      assert.ok(await evolution.evaluate(el => !!el.nextElementSibling.querySelector('.ranger-skill-card')));
      assert.equal(await evolution.locator('[data-evolution-id="u1626e-cony"] [data-evolution-target]').count(),2);
      assert.equal(await evolution.locator('[data-evolution-id="u1626u-cony"] [data-evolution-target="u1627e-cony"]').count(),1);
      await page.setViewportSize({width:375,height:812});
      const menuToggle = page.locator('.site-menu-toggle');
      if(await menuToggle.getAttribute('aria-expanded') === 'true') await menuToggle.click();
      assert.ok(await evolution.evaluate(el => [...el.querySelectorAll('.ranger-evolution-stage')].every(card => {
        const rect=card.getBoundingClientRect();return rect.left>=0 && rect.right<=innerWidth;
      })),locale+' mobile evolution cards fit the viewport');
      if(process.env.QA_EVOLUTION_SCREENSHOT && locale === 'en') await evolution.screenshot({path:process.env.QA_EVOLUTION_SCREENSHOT});
      await page.setViewportSize({width:1200,height:900});
      await page.waitForFunction(suffix => document.title.endsWith(suffix),expected('site.title.ranger',locale,'').replace(/^｜/,''));
      await assertTranslated(page,locale,'#rangerModalContent *, .site-menu-toggle');
      const talentDescriptions = await page.evaluate(async () => {
        const records = await (await fetch('/res/Rangers_data.json')).json();
        return ['u1598u-clark','u1626u-cony'].map(id => {
          const main = records.find(r => r.ranger_id === id)['才能']['主要才能'];
          return {raw:main['敘述'],display:window.RangerbookI18n.display(main,'descriptionKey',main['敘述'])};
        });
      });
      assert.equal(talentDescriptions[0].raw,talentDescriptions[1].raw,'canonical Chinese descriptions stay unchanged');
      if(locale === 'en') assert.notEqual(talentDescriptions[0].display,talentDescriptions[1].display,
        'identical Chinese descriptions keep their distinct official translations');
      await page.locator('#rangerLevelRange').fill('180');
      await settle(page);
      assert.ok(!/undefined|NaN/.test(await page.locator('#rangerModalContent').innerText()));
      await evolution.locator('[data-evolution-id="u1627e-cony"] .ranger-evolution-character').click();
      await page.locator('[data-evolution-id="u1627e-cony"] [aria-current="page"]').waitFor();
      await ready(page,'/ranger/ranking/');
      await page.locator('.ranking-card').first().click();
      await page.locator('.ranger-evolution-section').waitFor();
      assert.equal(await page.locator('.ranger-evolution-section h3').innerText(),expected('site.evolution.title',locale));
      await ready(page,'/gear/?detail=eq_2202_wpn_07');
      await page.locator('.gear-detail-content:not([hidden])').waitFor();
      await page.waitForFunction(suffix => document.title.endsWith(suffix),expected('site.title.gear',locale,'').replace(/^｜/,''));
      await assertTranslated(page,locale,'#gearModalContent *');
      assert.equal(await page.locator('.gear-level-select').first().getAttribute('data-gear-level-section'),'基本效果');
      await ready(page,'/pvp/usage-history/');
      await page.waitForFunction(text => window.qaCanvasText.includes(text),expected('site.history.empty',locale));
      // Native confirmation dialogs cannot be translated by a DOM observer.
      await ready(page,'/admin/');
      await page.locator('#adminAccountsTab').click();
      const account = page.locator('[data-user-id="42"]').last();
      await account.locator('[data-role-select]').selectOption('admin');
      const adminLabel=await page.evaluate(() => window.RangerbookI18n.uiText('管理員'));
      const dialog = page.waitForEvent('dialog');
      const click = account.locator('[data-action="change-role"]').click();
      const confirm = await dialog;
      assert.equal(confirm.message(),expected('site.admin.roleConfirm',locale,'qa_target',adminLabel));
      await confirm.dismiss();await click;
      assert.equal(await account.getAttribute('data-user-account'),'qa_target');
      const errorMessage=await page.evaluate(async()=>{try{await window.RangerbookAuth.api('/qa-error');}catch(e){return e.message}});
      assert.equal(errorMessage,expected('site.auth.credentials',locale));
      await assertTranslated(page,locale,'#adminWorkspace *');
      assert.deepEqual(errors,[],`${locale} browser errors`);
      console.log('SITEWIDE_LOCALIZATION_OK',locale,'attributes/detail titles/level/gear/history canvas/admin dialog/API errors');
      await page.close();await context.close();
    }
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1});
