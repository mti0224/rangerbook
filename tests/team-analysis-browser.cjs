/* Browser acceptance: A–F, all seven teams, four locales, themes, mobile and races. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {fixture}=require('./team-analysis-fixture.cjs');
const root=path.join(__dirname,'..'),base='https://analysis-test.invalid';
const {units,catalogs}=fixture();
const expected={WEAPON:{FIRE:[1,2],WATER:[2,2],TREE:[1,1],LIGHT:[1,1],DARK:[0,0],INT:[1,2],AGI:[2,2],STR:[2,2]},ARMOR:{FIRE:[2,2],WATER:[2,2],TREE:[1,1],LIGHT:[1,1],DARK:[0,0],INT:[2,2],AGI:[2,2],STR:[2,2]},ACC:{FIRE:[1,2],WATER:[2,2],TREE:[1,1],LIGHT:[1,1],DARK:[0,0],INT:[2,2],AGI:[2,2],STR:[1,2]},surehit:{INT:[2,2],AGI:[2,2],STR:[1,2]},element:{FIRE:[1,1],WATER:[1,1],TREE:[0,1],LIGHT:[0,1],DARK:[0,0]}};
const teamKeys=['pvpteam','team1','team2','team3','team4','team5','guildwar'];
const teams=Object.fromEntries(teamKeys.map(k=>[k,units]));teams.team5=[];
// Use official translated Ranger names for realistic wrapping in the synthetic data.
const realRangers=JSON.parse(fs.readFileSync(path.join(root,'res/v2/rangers.json'))).rangers;
catalogs.rangers.forEach((r,i)=>r.nameKey=realRangers.filter(x=>x.starGrade===9)[i].nameKey);
catalogs.abilities=JSON.parse(fs.readFileSync(path.join(root,'res/v2/abilities.json'))).abilities;
for(const g of catalogs.equipment) {
 g.skillPlus=[];g.specPlus=null;g.nameKey='EQUIP:eq_2202_wpn_07_nm';
 for(const o of [g.highLevelOptions.defaultOption,...g.highLevelOptions.switchOptions]) {o.range={min:10,max:10,unit:'PERCENT'};o.upgradeStep=0;}
}
(async()=>{
 for(const locale of (process.env.QA_LOCALE ? [process.env.QA_LOCALE] : ['zh-Hant','en','th','jp'])) {
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME||undefined,args:process.env.QA_CHROME?['--no-sandbox','--single-process','--no-zygote','--disable-gpu','--disable-software-rasterizer']:[]});
 try {
  const context=await browser.newContext(process.env.QA_TOUCH
    ? {viewport:{width:390,height:844},isMobile:true,hasTouch:true}
    : {viewport:{width:1280,height:1000}});
  await context.addInitScript(l=>{localStorage.setItem('rangerbook-language',l);localStorage.setItem('rangerbook-theme','light');},locale);
  const errors=[];let playerCalls=0;
  await context.route(base+'/**',r=>{
   let filename=decodeURIComponent(new URL(r.request().url()).pathname);if(filename.endsWith('/'))filename+='index.html';
   for(const [name,field] of [['rangers','rangers'],['equipment','equipment'],['abilities','abilities'],['equipment-effects','effects']]) {
    if(filename===`/res/v2/${name}.json`) return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({schemaVersion:2,[field]:catalogs[field]})});
   }
   const file=path.join(root,filename),types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
   return r.fulfill({status:fs.existsSync(file)?200:404,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.existsSync(file)?fs.readFileSync(file):''});
  });
  await context.route('**/www.googletagmanager.com/**',r=>r.abort());
  await context.route('**/rangers.lerico.net/**',r=>r.fulfill({status:200,contentType:'image/png',body:fs.readFileSync(path.join(root,'assets/main_icon/icon.png'))}));
  await context.route('**/rangerbook-auth.warmycat.com/**',async r=>{
   const pathname=new URL(r.request().url()).pathname;
   if(pathname.includes('player-search')) return r.fulfill({json:{items:[{uid:'qa',name:'QA'},{uid:'qb',name:'QB'}],count:2}});
   if(pathname.includes('player-team-query')) {
    const uid=JSON.parse(r.request().postData()).uid;playerCalls++;
    if(uid==='qa'&&playerCalls>1) await new Promise(resolve=>setTimeout(resolve,800));
    return r.fulfill({json:{teams:uid==='qb'?{pvpteam:[units[0]]}:teams}});
   }
   return r.fulfill({json:{logged_in:true,role:'super_admin',account:'qa-admin'}});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error' && m.text().includes('V2 view failed')) errors.push(m.text());});page.setDefaultTimeout(15000);
  await page.goto(base+'/pvp/search/',{waitUntil:'domcontentloaded'});
  if(process.env.QA_FONT_DIR) {
   await context.route(base+'/qa-fonts/**',r=>r.fulfill({path:path.join(process.env.QA_FONT_DIR,new URL(r.request().url()).pathname.replace('/qa-fonts/',''))}));
   const css=fs.readFileSync(path.join(process.env.QA_FONT_DIR,'400.css'),'utf8').replaceAll('./files/',base+'/qa-fonts/files/');
   await page.addStyleTag({content:css+"body,button,svg text {font-family:'Noto Sans TC',sans-serif !important;}"});
  }
  await page.locator('#pvpPlayerSearchInput').fill('QA');await page.locator('.pvp-search-suggestion').first().click();
  await page.locator('.ta-bar').first().waitFor();
  if(process.env.QA_TOUCH) {
   assert.ok(await page.evaluate(()=>matchMedia('(hover: none) and (pointer: coarse)').matches));
   for(const theme of ['light','dark']) for(const width of [390,320]) {
    await page.evaluate(v=>document.documentElement.dataset.theme=v,theme);
    await page.setViewportSize({width,height:844});
    for(const tab of Object.keys(expected)) {
     await page.locator(`[data-analysis-tab="${tab}"]`).tap();
     await page.locator('.ta-bar').first().tap();
     const contrast=await page.evaluate(()=>{
      const luminance=color=>{
       const rgb=color.match(/[\d.]+/g).slice(0,3).map(v=>Number(v)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
       return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
      };
      const ratio=(a,b)=>{a=luminance(a);b=luminance(b);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
      const row=document.querySelector('.ta-bar[aria-pressed=true]'),tab=document.querySelector('[data-analysis-tab][aria-selected=true]');
      const background=getComputedStyle(row).backgroundColor;
      return {
       label:ratio(getComputedStyle(row.querySelector('strong')).color,background),
       count:ratio(getComputedStyle(row.querySelector('.ta-bar-heading > span')).color,background),
       tab:ratio(getComputedStyle(tab).color,getComputedStyle(tab).backgroundColor),
       bar:ratio(getComputedStyle(row.querySelector('.ta-bar-track > span')).backgroundColor,background)
      };
     });
     for(const part of ['label','count','tab']) assert.ok(contrast[part]>=4.5,`${locale} ${theme} ${width} ${tab} ${part}: ${contrast[part]}`);
     assert.ok(contrast.bar>=3,`${locale} ${theme} ${width} ${tab} bar: ${contrast.bar}`);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    if(width===390) await page.locator('#pvpPlayerTeamAnalysis').screenshot({path:`/tmp/team-analysis-touch-${theme}.png`});
   }
   assert.equal(errors.length,0,errors.join('\n'));
   await context.close();console.log('TEAM_ANALYSIS_TOUCH_CONTRAST_OK',locale);continue;
  }
  assert.equal(await page.locator('.ta-metric-list dd').nth(4).innerText(),'4%');
  assert.equal(await page.locator('.ta-metric-list dd').nth(5).innerText(),'125%');
  for(const [tab,counts] of Object.entries(expected)) {
   await page.locator(`[data-analysis-tab="${tab}"]`).click();
   for(const [category,[pass,total]] of Object.entries(counts)) {
    const row=page.locator(`[data-category="${category}"]`);
    assert.ok((await row.innerText()).includes(`${pass}/${total}`));
    await row.click();
    assert.equal(await page.locator('.ta-member.ta-pass').count(),pass,locale+' '+tab+' '+category);
    assert.equal(await page.locator('.ta-member.ta-fail').count(),total-pass,`${locale} ${tab} ${category}: ${await page.locator('.ta-members').innerText()} selected=${await page.locator('[data-category][aria-pressed=true]').getAttribute('data-category')}`);
    if(!total) assert.ok((await row.innerText()).includes('—'));
   }
  }
  await page.locator('[data-analysis-tab="WEAPON"]').click();
  await page.locator('[data-category="FIRE"]').click();
  const selectedCategory=()=>page.locator('.ta-bar[aria-pressed=true]').getAttribute('data-category');
  assert.equal(await selectedCategory(),'FIRE');
  const originalMembers=await page.locator('.ta-members').innerText();
  await page.locator('[data-category="TREE"]').hover();
  assert.equal(await selectedCategory(),'FIRE','hover must not switch categories');
  assert.equal(await page.locator('.ta-members').innerText(),originalMembers);
  await page.locator('[data-category="TREE"]').focus();
  assert.equal(await selectedCategory(),'FIRE','focus alone must not switch categories');
  await page.locator('[data-category="TREE"]').click();
  assert.equal(await selectedCategory(),'TREE');
  assert.equal(await page.locator('.ta-member').count(),1);
  await page.locator('[data-category="WATER"]').hover();
  assert.equal(await selectedCategory(),'TREE','hover must preserve the clicked selection');
  await page.locator('[data-category="FIRE"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await selectedCategory(),'FIRE','keyboard activation selects a category');
  assert.equal(await page.locator('.ta-member').count(),2);
  await page.locator('.ta-radar-target[data-metric="4"] .ta-radar-hit').hover();
  assert.ok((await page.locator('.ta-radar-tooltip').innerText()).includes('4%'));
  await page.locator('.ta-member').first().click();
  assert.equal(await page.locator('#pvpPlayerSearchUnitDetail .pvp-player-unit-detail-card').count(),1);
  await page.locator('.ta-metric-list > div').nth(4).focus();
  assert.ok((await page.locator('.ta-radar-tooltip').innerText()).includes('4%'));
  await page.locator('[data-analysis-tab="WEAPON"]').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[data-analysis-tab="ARMOR"]').getAttribute('aria-selected'),'true');
  for(const key of teamKeys) {
   await page.locator('#pvpPlayerSearchTeamSelect').selectOption(key);
   await page.locator('.ta-bar').first().waitFor();
   if(key==='team5') {
    assert.ok((await page.locator('.ta-bar').allInnerTexts()).every(t=>t.includes('0/0')&&t.includes('—')));
    assert.equal(await page.locator('.ta-member').count(),0);
   } else assert.equal(await page.locator('.ta-metric-list dd').nth(4).innerText(),'4%');
  }
  // The outer wrapper is transparent; each rounded panel owns its background.
  assert.equal(await page.locator('#pvpPlayerSearchResult').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
  assert.equal(await page.locator('.ta-panel').first().evaluate(e=>getComputedStyle(e).overflow),'clip');
  // Equal-width panels on desktop, stacked on narrow devices, and both theme colors.
  const panels=page.locator('.ta-panel');let p=await panels.evaluateAll(a=>a.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width})));
  assert.ok(Math.abs(p[0].width-p[1].width)<1);assert.equal(p[0].y,p[1].y);
  for(const theme of ['light','dark']) {
   await page.evaluate(v=>document.documentElement.dataset.theme=v,theme);
   for(const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    await page.locator('[data-analysis-tab="WEAPON"]').click();await page.locator('[data-category="FIRE"]').click();
    p=await panels.evaluateAll(a=>a.map(e=>({y:e.getBoundingClientRect().y})));
    assert.ok(p[1].y>p[0].y);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${locale} ${theme} ${width} overflow`);
    assert.equal(await page.locator('#pvpPlayerSearchResult').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
    assert.notEqual(await page.locator('.ta-pass').first().evaluate(e=>getComputedStyle(e).backgroundColor),await page.locator('.ta-fail').first().evaluate(e=>getComputedStyle(e).backgroundColor));
   }
  }
  await page.setViewportSize({width:1280,height:1000});
  if(locale==='zh-Hant') {await page.locator('#pvpPlayerTeamAnalysis').screenshot({path:'/tmp/team-analysis-desktop.png'});await page.setViewportSize({width:390,height:844});await page.locator('#pvpPlayerTeamAnalysis').screenshot({path:'/tmp/team-analysis-mobile.png'});}
  // Query another player clears old analysis immediately and updates both charts.
  await page.locator('#pvpPlayerSearchInput').fill('QB');assert.equal(await page.locator('#pvpPlayerTeamAnalysis').isVisible(),false);
  await page.locator('.pvp-search-suggestion').nth(1).click();await page.locator('.ta-bar').first().waitFor();
  assert.ok((await page.locator('[data-category="FIRE"]').innerText()).includes('0/1'));
  assert.equal(await page.locator('.ta-metric-list dd').nth(5).innerText(),'250%');
  if(locale==='zh-Hant') {
   const oldResponse=page.waitForResponse(r=>r.url().includes('player-team-query') && r.request().postDataJSON().uid==='qa');
   await page.locator('#pvpPlayerSearchInput').fill('QA');await page.locator('.pvp-search-suggestion').first().click();
   await page.locator('#pvpPlayerSearchInput').fill('QB');await page.locator('.pvp-search-suggestion').nth(1).click();
   await page.locator('.ta-bar').first().waitFor();await oldResponse;
   assert.ok((await page.locator('[data-category="FIRE"]').innerText()).includes('0/1'));
   assert.equal(await page.locator('.ta-metric-list dd').nth(5).innerText(),'250%');
  }
  assert.equal(errors.length,0,errors.join('\n'));
  await context.close();console.log('TEAM_ANALYSIS_BROWSER_OK',locale);
 } finally {await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
