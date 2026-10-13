/* Four-language interaction regression for the 2026-10-13 interface requests.
 * Private admin/statistics APIs are fixtures; no real accounts or writes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const base=process.env.AUDIT_BASE_URL||'http://127.0.0.1:4187';
const root=path.join(__dirname,'..');
const uiRows=JSON.parse(fs.readFileSync(path.join(root,'res/v2/locales/ui.json')));
const custom=JSON.parse(fs.readFileSync(path.join(root,'res/v2/locales/custom.json')));
const rangers=JSON.parse(fs.readFileSync(path.join(root,'res/v2/rangers.json'))).rangers;
const actor=rangers.find(r=>r.category==='STR'&&r.element==='FIRE')||rangers[0];
const get=(key,l)=>uiRows.find(r=>r.key==='UI:'+key)[l==='zh-Hant'?'zh_TW':l];
const fill=(key,l,...args)=>get(key,l).replace(/%N(\d+)/g,(_,n)=>args[Number(n)-1]);
const traffic={status:'ready',updatedAt:'2026-10-13T00:00:00Z',summary:{users:30,views:1234,sessions:12,engagedSessions:8},
 daily:[{date:'2026-10-12',views:1234},{date:'2026-10-13',views:1800}],sources:[{source:'直接',sessions:12}],pages:[{path:'/ranger/',views:1234}]};
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const locale of ['zh-Hant','en','jp','th']){
   console.log('OCT13_START '+locale);
   const ctx=await browser.newContext({viewport:{width:1400,height:1000}});
   await ctx.addInitScript(l=>localStorage.setItem('rangerbook-language',l),locale);
   await ctx.route('**/www.googletagmanager.com/**',r=>r.abort());
   await ctx.route('**/rangerbook-auth.warmycat.com/**',r=>{
    const p=new URL(r.request().url()).pathname;
    const body=p==='/auth/me'?{logged_in:true,role:'admin',account:'qa_admin',admin_application_status:'approved'}:
     p==='/admin/traffic'?traffic:p==='/admin/resource-updates'?{items:[{count:12,items:[{path:'sample.db'}],detectedAt:'2026-10-13T00:00:00Z'}]}:{items:[]};
    return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':base,'access-control-allow-credentials':'true'},body:JSON.stringify(body)});
   });
   await ctx.route('**/pvp-data.warmycat.com/**',r=>{
    const n=new URL(r.request().url()).pathname;
    const body=n.includes('usage_index')?{metadata:{guildCount:5,sampleCount:10,generatedAtUtc:'2026-10-13T00:00:00Z'},rangers:[{unitCode:actor.rangerCode,playerCount:3,guildCount:2,usageRate:30}]}:{metadata:{},guilds:[]};
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   });
   const p=await ctx.newPage();p.setDefaultTimeout(60000);const errors=[],legacy=[];
   p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{const u=new URL(r.url());if(u.origin===new URL(base).origin&&/\/res\//.test(u.pathname)&&!u.pathname.includes('/res/v2/')&&!['/res/更新日誌.json','/res/ranger_stats_config.json'].includes(decodeURIComponent(u.pathname)))legacy.push(u.pathname)});
   async function go(url){await p.goto(base+url,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>!!window.RangerbookI18n);await p.evaluate(()=>window.RangerbookI18n.ready)}
   await go('/ranger/ranger/');await p.locator('.ranger-card').first().click();
   assert.equal(await p.locator('.ranger-detail-link').innerText(),get('action.viewDetails',locale));
   await go('/mainstage/hard/stage/?stage=hs1');await p.locator('.hs-stage-info-wrap tbody').waitFor();
   const stageLabels=await p.locator('.hs-stage-info-wrap tbody th').allTextContents();
   for(const key of ['stage.unitExp','stage.playerExp','stage.coins'])assert.ok(stageLabels.includes(get(key,locale)),key+' '+stageLabels);
   const rewards=await p.locator('.hs-stage-info-wrap tbody td').allTextContents();assert.ok(rewards.filter(x=>/\d/.test(x)).length>=3);
   await p.locator('.hs-line-detail-btn').first().click();await p.locator('#hsEnemyLineModal:not([hidden])').waitFor();
   const caps=await p.locator('#hsEnemyLineModalContent .ranger-stat > span').allTextContents();assert.ok(caps.includes(get('stage.spawnLimit',locale)),JSON.stringify(caps));
   await go('/ranger/stats/');await p.locator('#statsTrendMetricSelect option').first().waitFor({state:'attached'});
   await p.locator('#statsTrendPanel summary').click();
   assert.equal(await p.locator('#statsTrendMetricSelect option').count(),8);
   const opts=await p.locator('#statsTrendMetricSelect option').evaluateAll(xs=>xs.map(x=>({value:x.value,text:x.textContent})));
   assert.ok(opts.every(x=>x.value.includes('::')));
   if(locale!=='zh-Hant')assert.ok(opts.every(x=>!x.text.includes('九星')&&!x.text.includes('總攻擊力')&&!x.text.includes('生產礦物費用')),JSON.stringify(opts));
   await p.locator('#statsTrendMetricSelect').selectOption(opts.at(-1).value);
   await p.locator('.stats-type-button[data-type="敏捷"]').click();
   const range=await p.locator('#statsTrendRangeText').innerText();
   assert.ok(range.includes('30')&&/\d{4}-\d{2}/.test(range),range);
   if(locale!=='zh-Hant')assert.ok(!range.includes('每月資料集')&&!range.includes('該月往前'),range);
   await go('/admin/');await p.locator('#adminResourcesTab').click();
   const summary=p.locator('.admin-update-batch summary').first();await summary.waitFor();
   assert.ok((await summary.innerText()).includes(fill('dynamic.files',locale,12)));
   assert.equal(await summary.evaluate(x=>getComputedStyle(x,'::after').content),JSON.stringify(get('action.expand',locale)));
   await summary.click();assert.equal(await summary.evaluate(x=>getComputedStyle(x,'::after').content),JSON.stringify(get('action.collapse',locale)));
   assert.equal(await p.locator('.admin-update-paths').innerText(),'sample.db');
   await p.locator('#adminTrafficTab').click();await p.locator('.traffic-chart-point').first().waitFor();
   const labels=await p.locator('#trafficSummary span').allTextContents();
   for(const key of ['traffic.users','traffic.views','traffic.sessions','traffic.engagedSessions'])assert.ok(labels.includes(get(key,locale)),key+' '+labels);
   assert.equal(await p.locator('#trafficStatus').innerText(),fill('traffic.latestUpdated',locale,'2026-10-13 [08:00:00]'));
   await p.locator('.traffic-chart-point').first().focus();
   assert.equal(await p.locator('.traffic-line-tooltip-value').innerText(),fill('traffic.viewCount',locale,'1,234'));
   assert.equal(await p.locator('.traffic-pie-legend small').innerText(),fill('traffic.sessionCount',locale,12));
   await go('/guildwar/usage/');await p.locator('#guildUsageBody .pvp-ranger-sub').first().waitFor();
   const meta=await p.locator('#guildUsageBody .pvp-ranger-sub').innerText();
   if(locale!=='zh-Hant')assert.ok(!meta.includes('力量型')&&!meta.includes('力量')&&!meta.includes('火'),meta);
   assert.ok((await p.locator('#guildUsageBody .pvp-rank-delta').innerText()).includes(fill('dynamic.guildCount',locale,2)));
   await p.locator('#guildUsageType').selectOption({index:1});assert.equal(await p.locator('#guildUsageBody .pvp-ranger-trigger').count(),1);
   await go('/about/');const spaces=await p.locator('.about-link-space').evaluateAll(xs=>xs.map(x=>({text:x.textContent,display:getComputedStyle(x).display})));
   assert.equal(spaces.length,2);assert.ok(spaces.every(x=>x.text===' '&&(locale==='zh-Hant'?x.display==='none':x.display!=='none')));
   await go('/labyrinth/');const grid=await p.locator('.labyrinth-entry-grid').evaluate(x=>getComputedStyle(x).gridTemplateColumns.split(' ').length);assert.equal(grid,2);
   const tops=await p.locator('.labyrinth-entry-card').evaluateAll(xs=>xs.map(x=>x.getBoundingClientRect().top));assert.equal(tops[0],tops[1]);assert.ok(tops[2]>tops[0]);
   await go('/');await p.locator('.home-update-list li').first().waitFor();assert.equal(await p.locator('.gt-home-characters img').count(),0);
   assert.equal(await p.locator('.home-update-date').innerText(),'2026-10-13');
   assert.deepEqual(await p.locator('.home-update-list li').allTextContents(),[get('update.log.2026-10-13.1',locale),get('update.log.2026-10-13.2',locale)]);
   const fonts=await p.locator('.home-tool-content').first().evaluate(x=>({title:parseFloat(getComputedStyle(x.querySelector('h2')).fontSize),description:parseFloat(getComputedStyle(x.querySelector('p')).fontSize)}));assert.ok(fonts.title>=20&&fonts.description>=16,JSON.stringify(fonts));
   await go('/update/');await p.locator('.update-log-card').first().waitFor();assert.equal(await p.locator('.update-log-card h2').first().innerText(),'2026-10-13');
   assert.deepEqual(await p.locator('.update-log-card').first().locator('li').allTextContents(),[get('update.log.2026-10-13.1',locale),get('update.log.2026-10-13.2',locale)]);
   for(const width of [1400,390]){
    await p.setViewportSize({width,height:900});await go('/settings/');
    const icon=p.locator('.rb-settings-language-icon');assert.equal(await icon.innerText(),get('copy.language',locale));
    const size=await icon.evaluate(x=>({width:x.clientWidth,scroll:x.scrollWidth,font:parseFloat(getComputedStyle(x).fontSize)}));assert.ok(size.scroll<=size.width+1,JSON.stringify(size));if(['en','th'].includes(locale))assert.ok(size.font<16);
   }
   const tokens=await p.evaluate(()=>{
    const holder=document.createElement('p');holder.id='qa-escaped-text';holder.textContent='a\\n b/n c';document.body.append(holder);
    window.RangerbookI18n.translate(holder);return holder.textContent;
   });assert.ok(!/\\n|\/n/.test(tokens),tokens);
   assert.deepEqual(legacy,[]);assert.deepEqual(errors,[]);console.log('OCT13_OK '+locale+' all requested UI, controls, dates, counts, layout and escaping');
   await ctx.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
