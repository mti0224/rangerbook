/* Rendering must not depend on full databases or an unavailable animation host. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base='https://speed-test.invalid';
const read=n=>fs.readFileSync(path.join(root,n));
const blocked=new Set(['res/v2/rangers.json','res/v2/abilities.json','res/v2/locales/official.json','res/v2/projectiles.json']);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try {for(const locale of ['zh-Hant','en','th','jp']) {
  const context=await browser.newContext({serviceWorkers:'block'}),requests=[];
  await context.addInitScript(lang=>localStorage.setItem('rangerbook-language',lang),locale);
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='res.warmycat.com' && url.pathname==='/animation_meta/index.json')
     return new Promise(resolve=>setTimeout(()=>route.fulfill({json:{units:{}}}).catch(()=>{}).finally(resolve),5000));
   if(url.origin!==base)return route.abort();
   let name=decodeURIComponent(url.pathname).replace(/^\//,'');if(name.endsWith('/'))name+='index.html';
   requests.push(name);
   if(blocked.has(name))return route.fulfill({status:503,body:'large data deliberately unavailable'});
   if(!fs.existsSync(path.join(root,name)))return route.fulfill({status:404,body:''});
   const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
   return route.fulfill({contentType:types[path.extname(name)]||'application/octet-stream',body:read(name)});
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const start=Date.now();await page.goto(base+'/ranger/ranger/?detail=u1626u-cony',{waitUntil:'domcontentloaded'});
  await page.locator('#rangerLevelRange').waitFor({timeout:10000});
  assert.ok(Date.now()-start<4000,'Data must render before the deliberately delayed 5-second animation response');
  assert.equal(await page.locator('.ranger-evolution-stage').count(),4);
  assert.ok(!requests.some(name=>blocked.has(name)),'Detail must never request any full dataset: '+locale);
  assert.ok(requests.includes('res/v2/fast/ranger/u1626u-cony.json'));
  assert.equal(requests.filter(n=>n==='res/v2/fast/ranger/u1626u-cony.json').length,1,'Detail bundle is coalesced');
  assert.deepEqual(errors,[]);
  console.log(`FAST_DETAIL_OK ${locale} ${Date.now()-start}ms without full data or animation host`);
  requests.length=0;
  await page.goto(base+'/ranger/ranger/',{waitUntil:'domcontentloaded'});
  await page.locator('.ranger-card').first().waitFor({timeout:10000});
  assert.equal(await page.locator('.ranger-card').count(),60,'Preview displays the real page of characters');
  assert.ok(requests.includes('res/v2/fast/ranger-list.json'));
  await context.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
