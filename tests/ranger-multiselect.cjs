/* Multi-choice filters: union within a group, intersection across groups. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base='https://filters.invalid';
const read=name=>fs.readFileSync(path.join(root,name));
const source=JSON.parse(read('res/v2/rangers.json')).rangers;
const stars=row=>(row.evolution==='HYPER'?'超進化':row.evolution==='ULTRA'?'終極進化':'')+row.starGrade+'星';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try {for(const locale of ['zh_TW','en','th','jp']) {
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1200,height:900}});
  await context.addInitScript(lang=>localStorage.setItem('rangerbook-language',lang),locale==='zh_TW'?'zh-Hant':locale);
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
   let name=decodeURIComponent(url.pathname).slice(1);if(name.endsWith('/'))name+='index.html';
   if(!fs.existsSync(path.join(root,name)))return route.fulfill({status:404,body:''});
   const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
   return route.fulfill({contentType:types[path.extname(name)]||'application/octet-stream',body:read(name)});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/ranger/ranger/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.querySelector('#rangerAdvancedToggleBtn').disabled);
  const panel=page.locator('#rangerAdvancedFilters'),toggle=page.locator('#rangerAdvancedToggleBtn');
  assert.equal(await panel.isVisible(),false,'All advanced filters start collapsed');
  assert.equal(await page.locator('.ranger-filter-menu, .ranger-basic-filters select, .ranger-basic-filters summary').count(),0,'Basic filters have no dropdown controls');
  assert.equal(await panel.locator('.ranger-filter-options').count(),3,'All three checkbox groups belong to advanced filters');
  assert.equal(await page.locator('#typeFilter input[type=checkbox]').count(),3);
  assert.equal(await page.locator('#elementFilter input[type=checkbox]').count(),6,'Include the real NONE element');
  if(locale==='zh_TW')assert.ok(!(await page.locator('#starFilter').innerText()).includes('究極進化'));
  async function open() {if(!await panel.isVisible())await toggle.click();}
  async function check(id,value) {await open();await page.locator('#'+id+' input[value="'+value+'"]').check();}
  async function expectRows(predicate,exact=false) {
   const rows=source.filter(predicate),ids=rows.map(row=>row.rangerCode);
   const count=Number((await page.locator('#rangerResultCount').innerText()).replace(/,/g,''));
   assert.equal(count,ids.length);
   const shown=await page.locator('.ranger-card').evaluateAll(cards=>cards.map(card=>card.dataset.rangerId));
   assert.ok(shown.every(id=>ids.includes(id)),'Every displayed card satisfies all selected groups');
   if(exact)assert.deepEqual(shown.sort(),ids.sort());
  }
  await check('typeFilter','敏捷型');await check('typeFilter','智慧型');
  await expectRows(row=>['AGI','INT'].includes(row.roleType));
  assert.equal(await page.locator('#typeFilter input:checked').count(),2);
  await check('starFilter','9星');await check('starFilter','超進化8星');
  await check('elementFilter','光');await check('elementFilter','暗');
  for(const id of ['starFilter','typeFilter','elementFilter'])assert.ok(await page.locator('#'+id).isVisible(),'All checkbox groups show together');
  await page.locator('#paginationSize').selectOption('120');
  await expectRows(row=>['AGI','INT'].includes(row.roleType) && ['9星','超進化8星'].includes(stars(row)) && ['LIGHT','DARK'].includes(row.elementType),true);
  await toggle.click();
  assert.equal(await panel.isVisible(),false,'One button collapses every filter group');
  assert.equal(await page.locator('#elementFilter input:checked').count(),2);
  await expectRows(row=>['AGI','INT'].includes(row.roleType) && ['9星','超進化8星'].includes(stars(row)) && ['LIGHT','DARK'].includes(row.elementType),true);
  await toggle.press('Enter');
  assert.ok(await panel.isVisible(),'Keyboard can expand the whole panel');
  await page.locator('#elementFilter input[value="暗"]').press('Space');
  await expectRows(row=>['AGI','INT'].includes(row.roleType) && ['9星','超進化8星'].includes(stars(row)) && row.elementType==='LIGHT',true);
  await page.locator('h1').click();
  assert.ok(await panel.isVisible(),'Inline filters stay open until explicitly collapsed');
  for(const theme of ['light','dark'])for(const width of [1200,1024,768,375]) {
   await page.setViewportSize({width,height:900});
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   const mobileToggle=page.locator('.site-menu-toggle');
   if(width<=1024 && await mobileToggle.isVisible() && await mobileToggle.getAttribute('aria-expanded')==='true')await mobileToggle.click();
   await open();
   for(const id of ['starFilter','typeFilter','elementFilter']) {
    const geometry=await page.locator('#'+id).evaluate(el=>{
     const r=el.getBoundingClientRect(),box=el.querySelector('input').getBoundingClientRect(),style=getComputedStyle(el);
     return {left:r.left,right:r.right,width:innerWidth,checkbox:box.width,ink:style.color,panel:style.backgroundColor,position:style.position};
    });
    assert.ok(geometry.left>=0 && geometry.right<=geometry.width,`${locale} ${theme} ${width}: ${id} fits viewport`);
    assert.equal(geometry.position,'static','Checkbox groups flow inside the panel');
    assert.ok(geometry.checkbox>=16 && geometry.checkbox<=24,'Native checkbox stays a usable compact size');
    assert.notEqual(geometry.ink,geometry.panel,'Text remains visible in both themes');
   }
   assert.ok(await page.locator('.ranger-controls').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Filter controls do not overflow their panel');
   await toggle.click();
   const collapsedHeight=await page.locator('.ranger-controls').evaluate(el=>el.getBoundingClientRect().height);
   assert.ok(collapsedHeight<240,`${locale} ${theme} ${width}: collapsed controls stay compact with translated button text (${collapsedHeight}px)`);
   assert.equal(await toggle.getAttribute('aria-expanded'),'false');
   await open();
   assert.equal(await page.locator('#typeFilter input:checked').count(),2,'Selections survive collapsing and resizing');
  }
  await page.locator('body').press('Escape');
  await page.locator('#rangerResetBtn').click();
  assert.equal(await page.locator('.ranger-filter-options input:checked').count(),0);
  await expectRows(()=>true);
  await check('elementFilter','無');await expectRows(row=>row.elementType==='NONE');
  await page.locator('body').press('Escape');
  await page.locator('#rangerResetBtn').click();
  await page.locator('#paginationSize').selectOption('60');
  await check('starFilter','終極進化8星');
  await expectRows(row=>row.evolution==='ULTRA' && row.starGrade===8);
  if(locale==='zh_TW')assert.ok((await page.locator('#rangerList').innerText()).includes('終極進化8星'));
  await page.locator('body').press('Escape');
  await page.locator('#rangerResetBtn').click();
  await open();
  await page.locator('#talentConditionFilter').selectOption('當普通攻擊發生爆擊時');
  await check('typeFilter','敏捷型');await check('typeFilter','智慧型');
  await expectRows(row=>['AGI','INT'].includes(row.roleType) && row.talents?.major?.activationConditionCode==='TLT_CRITICAL_ATTACK',true);
  await page.locator('body').press('Escape');
  await page.locator('#rangerResetBtn').click();
  assert.equal(await page.locator('#talentConditionFilter').inputValue(),'');
  assert.deepEqual(errors,[]);
  console.log('MULTISELECT_OK',locale,'union/intersection, no-element, pagination, talent composition, keyboard, reset, dark/light mobile/desktop');
  await context.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
