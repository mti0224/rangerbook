const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.AUDIT_BASE_URL||'http://127.0.0.1:4187';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 try {
  for(const locale of (process.env.V2_QA_LOCALES||'zh-Hant,en,th,jp').split(',')) {
   const context=await browser.newContext({viewport:{width:1200,height:900}});
   await context.addInitScript(l=>localStorage.setItem('rangerbook-language',l),locale);
   await context.route('**/rangerbook-auth.warmycat.com/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{"logged_in":false}'}));
   await context.route('**/www.googletagmanager.com/**',r=>r.abort());
   const page=await context.newPage();page.setDefaultNavigationTimeout(60000);page.setDefaultTimeout(60000);console.log('V2_INTERACTIONS_START '+locale);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE_ERROR '+e.message)});
   await page.goto(base+'/ranger/ranger/',{waitUntil:'domcontentloaded'});
   await page.locator('.ranger-card').first().waitFor();
   await page.evaluate(()=>window.RangerbookI18n.readyGame());
   const id=await page.locator('.ranger-card').first().getAttribute('data-ranger-id');
   const name=await page.locator('.ranger-card h2').first().innerText();
   await page.locator('#rangerSearchInput').fill(name);
   await page.locator('.ranger-card[data-ranger-id="'+id+'"]').waitFor();
   await page.goto(base+'/ranger/ranger/?detail='+encodeURIComponent(id),{waitUntil:'domcontentloaded'});
   const range=page.locator('#rangerLevelRange');await range.waitFor();
   const hp=page.locator('[data-raw-stat="體力"]');const before=await hp.innerText();
   await range.evaluate(el=>{el.value=el.max;el.dispatchEvent(new Event('input',{bubbles:true}));});
   await page.waitForFunction(v=>document.querySelector('[data-raw-stat="體力"]').textContent!==v,before);
   assert.ok(!/NaN|Infinity|%(?:N\d*|d)/.test(await page.locator('#rangerModalContent').innerText()));
   await page.goto(base+'/gear/',{waitUntil:'domcontentloaded'});
   await page.locator('.gear-card').first().waitFor();await page.evaluate(()=>window.RangerbookI18n.readyGame());
   const gid=await page.locator('.gear-card').first().getAttribute('data-gear-id');
   const gearName=await page.locator('.gear-card h2').first().innerText();
   console.log('V2_SEARCH_DIAGNOSTIC '+JSON.stringify({locale,gid,gearName,...await page.evaluate(()=>({url:location.href,bodyClass:document.body.className,searchPresent:!!document.getElementById('gearSearchInput'),searchDisplay:document.getElementById('gearSearchInput')?getComputedStyle(document.getElementById('gearSearchInput')).display:null}))}));
   await page.locator('#gearSearchInput').fill(gearName);
   await page.locator('.gear-card[data-gear-id="'+gid+'"]').waitFor();
   await page.locator('.gear-card[data-gear-id="'+gid+'"]').click();
   await page.locator('#gearModal:not([hidden])').waitFor();
   await page.goto(base+'/gear/?detail='+encodeURIComponent(gid),{waitUntil:'domcontentloaded'});
   try {await page.locator('.gear-detail-content:not([hidden])').waitFor();}catch(e){console.log('DETAIL_DIAGNOSTIC '+JSON.stringify(await page.evaluate(()=>({url:location.href,body:document.body.className,status:document.querySelector('.gear-detail-loading')?.textContent,search:document.getElementById('gearSearchInput')?.value,cards:[...document.querySelectorAll('.gear-card')].slice(0,3).map(x=>x.dataset.gearId),rendered:document.getElementById('gearModalContent')?.dataset.renderedGearId,html:document.getElementById('gearModalContent')?.innerText.slice(0,900)}))));throw e}
   const selects=page.locator('#gearModalContent .gear-level-select');
   assert.ok(await selects.count()>0);
   const section=selects.first();const values=await section.locator('option').evaluateAll(xs=>xs.map(x=>x.value));
   const beforeUpgrade=await page.locator('#gearModalContent [data-gear-section="基本效果"]').innerText();
   await section.selectOption(values.at(-1));
   await page.waitForFunction(v=>document.querySelector('#gearModalContent [data-gear-section="基本效果"]').innerText!==v,beforeUpgrade);
   assert.ok(!/NaN|Infinity|%(?:N\d*|d)/.test(await page.locator('#gearModalContent').innerText()));
   assert.deepEqual(errors,[]);console.log('V2_INTERACTIONS_OK '+locale+' localized search, Ranger level, equipment upgrade');
   await context.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
