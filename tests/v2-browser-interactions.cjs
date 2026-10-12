const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.AUDIT_BASE_URL||'http://127.0.0.1:4187';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 try {
  for(const locale of ['zh-Hant','en','th','jp']) {
   const context=await browser.newContext({viewport:{width:1200,height:900}});
   await context.addInitScript(l=>localStorage.setItem('rangerbook-language',l),locale);
   await context.route('**/rangerbook-auth.warmycat.com/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{"logged_in":false}'}));
   await context.route('**/www.googletagmanager.com/**',r=>r.abort());
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
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
   await range.evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));});
   await page.waitForFunction(v=>document.querySelector('[data-raw-stat="體力"]').textContent!==v,before);
   assert.ok(!/NaN|Infinity|%(?:N\d*|d)/.test(await page.locator('#rangerModalContent').innerText()));
   await page.goto(base+'/gear/',{waitUntil:'domcontentloaded'});
   await page.locator('.gear-card').first().waitFor();await page.evaluate(()=>window.RangerbookI18n.readyGame());
   const gid=await page.locator('.gear-card').first().getAttribute('data-gear-id');
   const gearName=await page.locator('.gear-card h2').first().innerText();
   await page.locator('#gearSearchInput').fill(gearName);
   await page.locator('.gear-card[data-gear-id="'+gid+'"]').waitFor();
   await page.locator('.gear-card[data-gear-id="'+gid+'"]').click();
   await page.locator('#gearModal:not([hidden])').waitFor();
   const selects=page.locator('#gearModalContent .gear-level-select');
   assert.ok(await selects.count()>0);
   const section=selects.first();const values=await section.locator('option').evaluateAll(xs=>xs.map(x=>x.value));
   await section.selectOption(values.at(-1));
   assert.ok(!/NaN|Infinity|%(?:N\d*|d)/.test(await page.locator('#gearModalContent').innerText()));
   assert.deepEqual(errors,[]);console.log('V2_INTERACTIONS_OK '+locale+' localized search, Ranger level, equipment upgrade');
   await context.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
