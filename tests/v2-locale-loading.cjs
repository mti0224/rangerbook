/* Cold-load UI must become ready independently of the 6.5 MB official catalog. */
const assert=require('node:assert/strict');const {chromium}=require('playwright');
const base=process.env.AUDIT_BASE_URL||'http://127.0.0.1:4187';
(async()=>{const browser=await chromium.launch({headless:true});try{
 for(const locale of ['en','th','jp']){
  const ctx=await browser.newContext({viewport:{width:1250,height:900}});
  await ctx.addInitScript(l=>{try{if(!localStorage.getItem('rangerbook-language'))localStorage.setItem('rangerbook-language',l)}catch(_){}},locale);
  await ctx.route('**/www.googletagmanager.com/**',r=>r.abort());
  await ctx.route('**/rangerbook-auth.warmycat.com/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{}'}));
  let releaseUi,releaseOfficial;const heldUi=new Promise(r=>releaseUi=r),heldOfficial=new Promise(r=>releaseOfficial=r);
  await ctx.route('**/res/v2/locales/ui.json',async r=>{await heldUi;await r.continue()});
  await ctx.route('**/res/v2/locales/official.json',async r=>{await heldOfficial;await r.continue()});
  const p=await ctx.newPage();
  await p.goto(base+'/settings/',{waitUntil:'commit'});
  await p.waitForFunction(()=>!!window.RangerbookI18n);
  assert.equal(await p.locator('html').getAttribute('lang'),locale==='jp'?'ja':locale);
  assert.equal(await p.locator('body').evaluate(el=>getComputedStyle(el).visibility),'hidden','Do not flash Chinese while localization is loading');
  await p.waitForFunction(()=>[...document.styleSheets].some(x=>x.href?.includes('game-tech-controls.css')));
  assert.equal(await p.locator('body').evaluate(el=>getComputedStyle(el).marginLeft),'236px','Shared CSS must be loaded in the head');
  releaseUi();
  await p.waitForFunction(()=>!document.documentElement.dataset.rbLocalizing,null,{timeout:5000});
  const row=require('../res/v2/locales/ui.json').find(x=>x.key==='UI:settings.title');
  assert.equal(await p.locator('[data-i18n="settings.title"]').innerText(),row[locale]);
  assert.equal(await p.locator('input[name="language"]:checked').inputValue(),locale);
  // A real settings change must work while the official game catalog is still held.
  const next=locale==='jp'?'en':'jp';
  await Promise.all([p.waitForNavigation({waitUntil:'domcontentloaded'}),p.locator('input[name="language"][value="'+next+'"]').click({noWaitAfter:true})]);
  await p.evaluate(()=>window.RangerbookI18n.ready);
  assert.equal(await p.locator('input[name="language"]:checked').inputValue(),next);
  releaseOfficial();
  // Cookie fallback keeps both presentation and the V2 adapter aligned if storage is unavailable.
  await ctx.addInitScript(()=>{
   const get=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key==='rangerbook-language')throw new Error('Storage temporarily unavailable');return get.call(this,key)};
  });
  await p.reload({waitUntil:'domcontentloaded'});await p.evaluate(()=>window.RangerbookI18n.ready);
  assert.equal(await p.locator('input[name="language"]:checked').inputValue(),next);
  assert.equal(await p.evaluate(()=>window.RangerbookV2.locale),next);
  // A labelled container must preserve child tables and controls.
  assert.equal(await p.evaluate(()=>{
   const e=document.createElement('section');e.dataset.i18n='settings.title';e.append(document.createTextNode('設定'));
   e.insertAdjacentHTML('beforeend','<table><tbody><tr><td>123</td></tr></tbody></table><button>456</button>');document.body.append(e);
   window.RangerbookI18n.translate(e);return e.querySelectorAll('table,button').length;
  }),2);
  console.log('LOCALE_COLD_LOAD_OK '+locale+' first paint / CSS / switching / storage fallback / nested DOM');
  await ctx.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
