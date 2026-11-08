/* Real catalogs and page renderers; synthetic public usage/teams only. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base='https://unit-icons.invalid';
const catalog=JSON.parse(fs.readFileSync(path.join(root,'res/v2/fast/ranger-list.json'))).rangers;
const selected=['FIRE','WATER','TREE','LIGHT','DARK','NONE'].map(element=>catalog.find(r=>r.elementType===element && r.stats.attack.physical>0 && r.stats.attack.magical>0));
assert.ok(selected.every(Boolean));
const units=selected.map(r=>({unitCode:r.rangerCode,level:240,equipMap:{}}));
const metadata={league:'LEGEND',sampleCount:10,rankingCount:10,generatedAtUtc:'2026-11-08T00:00:00Z'};
const rows=selected.map((r,i)=>({rangerId:r.rangerCode,name:r.rangerCode,rank:i+1,usageRate:50,playerCount:5,appearanceCount:5}));
const teams={pvpteam:units,team1:units,guildwar:units};
const fixtures={'usage.json':{metadata,rangers:rows},'leaderboard.json':{metadata,players:[{rank:1,detailKey:'qa',displayName:'QA',score:100}]},'player_teams.json':{metadata,players:[{rank:1,detailKey:'qa',teams}]},'guildwar_ranking.json':{metadata,guilds:[{rank:1,uid:'qa-guild',guildName:'QA',curMemberCount:1,maxMemberCount:50,tier:'LEGEND'}]},'guildwar_data_LEGEND.json':{metadata,guilds:[{rank:1,uid:'qa-guild',guildName:'QA',members:[{displayName:'QA',guildwar:units}]}]}};
const expectNumber=v=>Number(v).toLocaleString('zh-Hant',{maximumFractionDigits:2});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try { for(const locale of ['zh-Hant','en','th','jp']) {
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:1000}}),errors=[];
  await context.addInitScript(lang=>{localStorage.setItem('rangerbook-language',lang);localStorage.setItem('rangerbook-admin-mode','true');},locale);
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin===base) {
    let name=decodeURIComponent(url.pathname).slice(1);if(name.endsWith('/'))name+='index.html';
    const file=path.join(root,name),types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
    return route.fulfill({status:fs.existsSync(file)?200:404,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.existsSync(file)?fs.readFileSync(file):''});
   }
   if(url.hostname==='pvp-data.warmycat.com')return route.fulfill({json:fixtures[url.pathname.split('/').pop()]||{}});
   if(url.hostname==='rangerbook-auth.warmycat.com')return route.fulfill({json:url.pathname.includes('player-search')?{items:[{uid:'qa',name:'QA'}],count:1}:url.pathname.includes('player-team-query')?{teams}:{logged_in:true,role:'super_admin',account:'qa'}});
   if(/rangers\.lerico\.net|res\.warmycat\.com/.test(url.hostname))return route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(root,'assets/main_icon/icon.png'))});
   return route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  async function go(url){await page.goto(base+url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.RangerbookI18n);await page.evaluate(()=>window.RangerbookI18n.ready);}
  async function geometry(host) {
   await host.locator('.ranger-element-icon').first().waitFor();
   const failures=await host.locator('.ranger-icon-portrait:has(> .ranger-element-icon)').evaluateAll(wraps=>wraps.flatMap(w=>{
    const icon=w.querySelector(':scope > .ranger-element-icon'),a=icon.getBoundingClientRect(),b=w.getBoundingClientRect(),style=getComputedStyle(w);
    return Math.abs(a.x+a.width/2-b.x)>1.1||Math.abs(a.y+a.height/2-b.bottom)>1.1||style.overflow==='hidden'||!icon.complete||icon.naturalWidth===0?[{class:w.className,icon:{x:a.x,y:a.y,width:a.width,height:a.height},portrait:{x:b.x,y:b.y,bottom:b.bottom},overflow:style.overflow}]:[];
   }));
   assert.deepEqual(failures,[],`${locale}: centered, visible, loaded badges`);
  }
  async function combat(host,r){const stats=host.locator('.ranger-mini-stats').first();assert.equal(await stats.locator(':scope > span').count(),3);const values=await stats.innerText();for(const n of [r.stats.attack.physical+r.stats.attack.magical,r.stats.hp,r.stats.mineralCost])assert.ok(values.includes(expectNumber(n)),`${r.rangerCode}: ${values} lacks ${n}`);assert.equal(await host.locator('.ranger-type-icon').count(),1);assert.equal(await host.locator('.ranger-tags,.pvp-ranger-sub,.ranking-card-meta').count(),0);}
  fs.mkdirSync(path.join(root,'artifacts/unit-icons'),{recursive:true});
  await go('/ranger/ranger/');await page.locator('.ranger-card').first().waitFor();
  for(const r of selected) {
   await page.locator('#rangerSearchInput').fill(r.rangerCode);const card=page.locator(`.ranger-card[data-ranger-id="${r.rangerCode}"]`);await card.waitFor();await combat(card,r);
   assert.equal(await card.locator('.ranger-element-icon').count(),r.elementType==='NONE'?0:1);
   if(r.elementType!=='NONE')await geometry(card);
  }
  await page.locator('#rangerSearchInput').fill(selected[0].rangerCode);
  for(const width of [1280,390,320]){await page.setViewportSize({width,height:900});await geometry(page.locator('#rangerList'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await page.locator('#rangerList').screenshot({path:path.join(root,`artifacts/unit-icons/rangers-${locale}.png`)});
  await go('/ranger/ranger/?detail='+selected[0].rangerCode);const detail=page.locator('.ranger-detail-head');await combat(detail,selected[0]);await geometry(detail);
  await detail.screenshot({path:path.join(root,`artifacts/unit-icons/detail-${locale}.png`)});
  await go('/ranger/ranking/');const ranking=page.locator('.ranking-card').first();await ranking.waitFor();assert.equal(await ranking.locator('.ranger-type-icon').count(),1);assert.equal(await ranking.locator('.ranking-card-meta').count(),0);
  await go('/pvp/usage/');await page.locator('.pvp-ranger-trigger').first().waitFor();
  for(const r of selected){const button=page.locator(`.pvp-ranger-trigger[data-ranger-id="${r.rangerCode}"]`);await combat(button,r);assert.equal(await button.locator('.ranger-element-icon').count(),r.elementType==='NONE'?0:1);}
  for(const theme of ['light','dark'])for(const width of [1280,390,320]){await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await geometry(page.locator('#pvpUsageBody'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(width===390)await page.locator('.pvp-usage-panel').screenshot({path:path.join(root,`artifacts/unit-icons/usage-${locale}-${theme}.png`)});}
  await page.locator('.pvp-ranger-trigger').first().click();const header=page.locator('.pvp-modal-ranger-header');await combat(header,selected[0]);await geometry(header);
  await page.setViewportSize({width:1280,height:1000});
  for(const route of ['search','leaderboard']) {
   await go('/pvp/'+route+'/');
   if(route==='search'){await page.locator('#pvpPlayerSearchInput').fill('QA');await page.locator('.pvp-search-suggestion').first().click();}
   else await page.locator('.pvp-player-row').first().click();
   const grid=page.locator(route==='search'?'#pvpPlayerSearchTeamGrid':'#pvpPlayerTeamGrid');await grid.locator('.ranger-element-icon').first().waitFor();await geometry(grid);assert.equal(await grid.locator('.ranger-element-icon').count(),5);assert.equal(await grid.locator('.ranger-type-icon,.ranger-mini-stats').count(),0);
   await grid.locator('.pvp-player-unit-button').first().click();await geometry(page.locator(route==='search'?'#pvpPlayerSearchUnitDetail':'#pvpPlayerUnitDetail'));
   await page.setViewportSize({width:390,height:900});await geometry(grid);await grid.screenshot({path:path.join(root,`artifacts/unit-icons/team-${route}-${locale}.png`)});
   await page.setViewportSize({width:1280,height:1000});
  }
  await go('/guildwar/ranking/');await page.locator('.guildwar-rank-row').first().click();await page.locator('.guildwar-member-team-button').first().click();await geometry(page.locator('#guildwarPlayerTeamGrid'));assert.equal(await page.locator('#guildwarPlayerTeamGrid .ranger-type-icon').count(),0);
  assert.deepEqual(errors,[],locale+' page errors');console.log('UNIT_ICONS_OK',locale);await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
