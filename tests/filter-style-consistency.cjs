/* Compare the live styles on both pages and retain Gear filter behavior. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base='https://filter-style.invalid';
const read=name=>fs.readFileSync(path.join(root,name));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6oAAAAABJRU5ErkJggg==','base64');
async function style(page,selector,properties) {
 return page.locator(selector).first().evaluate((el,keys)=>Object.fromEntries(keys.map(key=>[key,getComputedStyle(el)[key]])),properties);
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try {for(const locale of ['zh-Hant','en','th','jp']) {
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1200,height:900}});
  await context.addInitScript(lang=>localStorage.setItem('rangerbook-language',lang),locale);
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(route.request().resourceType()==='image')return route.fulfill({contentType:'image/png',body:png});
   if(url.origin!==base)return route.abort();
   let name=decodeURIComponent(url.pathname).slice(1);if(name.endsWith('/'))name+='index.html';
   if(!fs.existsSync(path.join(root,name)))return route.fulfill({status:404,body:''});
   const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
   return route.fulfill({contentType:types[path.extname(name)]||'application/octet-stream',body:read(name)});
  });
  const ranger=await context.newPage(),gear=await context.newPage(),errors=[];
  for(const page of [ranger,gear])page.setDefaultTimeout(10000);
  for(const page of [ranger,gear])page.on('pageerror',error=>errors.push(error.message));
  await ranger.goto(base+'/ranger/ranger/',{waitUntil:'domcontentloaded'});
  await ranger.waitForFunction(()=>!document.querySelector('#rangerAdvancedToggleBtn').disabled);
  await gear.goto(base+'/gear/',{waitUntil:'domcontentloaded'});
  await gear.locator('#gearStarFilter input').first().waitFor({state:'attached'});
  const panel=gear.locator('#gearAdvancedFilters'),toggle=gear.locator('#gearAdvancedToggleBtn');
  assert.equal(await panel.isVisible(),false);
  await toggle.click();await ranger.locator('#rangerAdvancedToggleBtn').click();
  assert.equal(await gear.locator('#gearAdvancedFilters fieldset.gear-filter-panel > legend').count(),6,'Every Gear group, including dynamic Skill+, has a visible legend');
  assert.equal(await gear.locator('#gearAdvancedFilters select, #gearAdvancedFilters details').count(),0);
  const count=async()=>Number((await gear.locator('#gearResultCount').innerText()).replace(/,/g,''));
  const baseline=await count();assert.ok(baseline>0);
  const stars=gear.locator('#gearStarFilter input');
  await stars.nth(0).check();const first=await count();await stars.nth(0).uncheck();
  await stars.nth(1).check();const second=await count();await stars.nth(0).check();
  assert.equal(await count(),first+second,'Multiple stars form a union');
  await gear.locator('#gearTypeFilter input').first().check();
  assert.ok(await count()<=first+second,'Type combines with the star selection');
  const filtered=await count();
  await toggle.click();assert.equal(await panel.isVisible(),false);
  assert.equal(await gear.locator('#gearAdvancedFilters input:checked').count(),4,'Checkbox choices and display level survive collapsing');
  await toggle.press('Enter');assert.equal(await count(),filtered);
  await gear.locator('#gearResetBtn').click();assert.equal(await count(),baseline);
  const effects=gear.locator('#gearBasicEffectFilter input');
  await effects.nth(0).check();const a=await count();await effects.nth(0).uncheck();
  await effects.nth(1).check();const b=await count();await effects.nth(0).check();const union=await count();
  await gear.locator('#gearBasicModeAnd').click();
  assert.equal(await count(),a+b-union,'AND preserves the intersection of the selected basic effects');
  await gear.locator('#gearResetBtn').click();
  assert.ok(await gear.locator('#gearBasicModeOr').evaluate(el=>el.classList.contains('active')));
  await gear.locator('#gearBasicDisplayLevel label:has(input[value="5"])').click();
  await gear.locator('#gearSkillPlusFilter input').first().check();assert.ok(await count()<baseline);
  await gear.locator('#gearTriggerAttrFilter input').first().check();
  await gear.locator('#gearResetBtn').click();
  assert.equal(await gear.locator('#gearAdvancedFilters input[type=checkbox]:checked').count(),0);
  assert.ok(await gear.locator('#gearBasicDisplayLevel input[value="0"]').isChecked());
  assert.equal(await count(),baseline);
  await stars.nth(0).check();await ranger.locator('#starFilter input').first().check();
  for(const theme of ['light','dark'])for(const width of [1200,768,375]) {
   for(const page of [ranger,gear]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    const drawer=page.locator('.site-menu-toggle');
    if(await drawer.isVisible() && await drawer.getAttribute('aria-expanded')==='true')await drawer.click();
   }
   for(const [rangerSelector,gearSelector,properties] of [
    ['#rangerAdvancedToggleBtn','#gearAdvancedToggleBtn',['padding','fontWeight','borderRadius','backgroundColor','color']],
    ['#rangerAdvancedFilters','#gearAdvancedFilters',['padding','borderRadius','backgroundColor','gap']],
    ['#starFilter','fieldset:has(> #gearStarFilter)',['padding','borderRadius','backgroundColor','gap']],
    ['#starFilter .ranger-filter-option','#gearStarFilter .ranger-filter-option',['padding','gap','minHeight','fontSize','fontWeight','backgroundColor','color']],
    ['#starFilter input','#gearStarFilter input',['width','height','accentColor']]
   ]) {
    // Both pages share the same group/option CSS, including checked states.
    assert.deepEqual(await style(gear,gearSelector,properties),await style(ranger,rangerSelector,properties),`${locale} ${theme} ${width}: ${gearSelector} matches Ranger styles`);
   }
   for(const page of [ranger,gear])assert.ok(await page.locator('.ranger-controls').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Controls fit the viewport');
   assert.ok(await panel.locator('.ranger-filter-option').evaluateAll(labels=>labels.every(el=>{
    const rect=el.getBoundingClientRect();return rect.left>=0 && rect.right<=innerWidth && el.scrollWidth<=el.clientWidth+1;
   })),'All translated Gear choices fit without clipping');
  }
  assert.deepEqual(errors,[]);
  console.log('FILTER_STYLE_OK',locale,'shared light/dark desktop/mobile styles; star union, type intersection, effect OR/AND, Skill+, trigger, level, collapse and reset');
  await context.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
