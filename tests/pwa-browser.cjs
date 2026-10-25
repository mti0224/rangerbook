/* Real Chromium SW tests over HTTP, not route.fulfill (which bypasses SW). */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createHash}=require('node:crypto');const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n));
const worker=read('sw.js').toString(),meta=JSON.parse(read('pwa-data.json'));
const release=JSON.parse(worker.match(/const RELEASE = (.*);/)[1]);
let generation='base',requests=[],networkDown=false;
const nextRelease=structuredClone(release);nextRelease.appVersion='upgrade-browser-fixture';
// A separate data-only upgrade verifies that program and data versions are independent.
const dataRelease=structuredClone(nextRelease);
const nextData=JSON.parse(read('res/v2/abilities.json'));nextData.pwaFixture='next-data-release';
const nextDataBody=Buffer.from(JSON.stringify(nextData));
dataRelease.data['res/v2/abilities.json']={hash:createHash('sha256').update(nextDataBody).digest('hex'),size:nextDataBody.length};
dataRelease.dataVersion=createHash('sha256').update(JSON.stringify(dataRelease.data)).digest('hex');
const nextMetadata=Buffer.from(JSON.stringify({...meta,dataVersion:dataRelease.dataVersion,files:dataRelease.data}));
dataRelease.core['pwa-data.json']={hash:createHash('sha256').update(nextMetadata).digest('hex'),size:nextMetadata.length};
const types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=http.createServer((req,res)=>{
 if(networkDown){req.socket.destroy();return;}
 if(/\/auth\/me(?:\?|$)/.test(req.url)) {
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({privateFixture:true}));return;
 }
 requests.push(req.url);let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/rangerbook(?=\/)/,'');
 if(name==='')name='/';if(name.endsWith('/'))name+='index.html';
 let file=path.join(root,name);
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory()){res.writeHead(302,{location:req.url+'/'});res.end();return;}
 let status=200;
 if(!fs.existsSync(file)){file=path.join(root,'404.html');status=404;}
 let body=fs.readFileSync(file);
 if(name==='/sw.js' && generation!=='base')body=worker.replace(JSON.stringify(release),JSON.stringify(generation==='app'?nextRelease:dataRelease));
 if(generation==='data' && name==='/pwa-data.json')body=nextMetadata;
 if(generation==='data' && name==='/res/v2/abilities.json')body=nextDataBody;
 res.writeHead(status,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
});
const waitControlled=p=>p.waitForFunction(()=>!!navigator.serviceWorker.controller);
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME||undefined});
 try {
 for(const prefix of ['', '/rangerbook']) {
  generation='base';requests=[];networkDown=false;
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await ctx.addInitScript(()=>{localStorage.setItem('rangerbook-language','en');localStorage.setItem('rangerbook-theme','dark');});
  await ctx.route('https://**',r=>r.abort());
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=origin+prefix;
  await page.goto(base+'/settings/');await page.evaluate(()=>navigator.serviceWorker.ready);
  assert.ok(!requests.some(x=>/rangers.json|projectiles.json|official.json/.test(x)),'Settings/install is not a full database download');
  await page.reload();await waitControlled(page);await page.evaluate(()=>window.RangerbookI18n.ready);
  // Opening/focusing a current release and transient failures are not updates.
  const noUpdateAction=async()=>assert.ok(!(await page.locator('.rb-pwa-status button').allTextContents()).includes('Update and reload'));
  await noUpdateAction();
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.evaluate(()=>window.RangerbookPwa.checkUpdate());await noUpdateAction();
  for(const kind of ['update-required','data-unavailable','network-required']) {
   await page.evaluate(kind=>window.dispatchEvent(new CustomEvent('rangerbook:pwa-status',{detail:{kind}})),kind);
   await page.evaluate(()=>window.RangerbookPwa.checkUpdate());await noUpdateAction();
   assert.ok(!(await page.locator('.rb-pwa-status button').allTextContents()).includes('Reload'));
  }
  assert.equal(await page.evaluate(async base=>(await fetch(base+'/auth/me').then(r=>r.json())).privateFixture,base),true);
  assert.equal(await page.locator('link[rel=manifest]').getAttribute('href'),base+'/manifest.webmanifest');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  // A browser event is required before an Android install button exists.
  await page.evaluate(()=>{
   const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{window.installCalls=(window.installCalls||0)+1;};e.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(e);
  });
  await page.locator('[data-pwa-install]').click();assert.equal(await page.evaluate(()=>window.installCalls),1);
  assert.ok(await page.locator('[data-pwa-install]').isHidden());
  // Warm a real dataset and 404 shell; never prime all game JSONs.
  await page.evaluate(async()=>{await fetch(new URL('res/v2/abilities.json',document.querySelector('link[rel=manifest]').href)).then(r=>r.json());});
  await page.goto(base+'/mainstage/hard/stage/hs1/');await page.waitForSelector('#hsRoute:not([hidden])');
  await page.goto(base+'/settings/');networkDown=true;await ctx.setOffline(true);
  await page.reload();await page.evaluate(()=>window.RangerbookI18n.ready);
  assert.equal(await page.locator('#pwaTitle').innerText(),'Install Rangerbook');
  assert.ok(await page.locator('.rb-pwa-status').isVisible());
  await noUpdateAction();
  assert.ok(!(await page.locator('.rb-pwa-status button').allTextContents()).includes('Reload'));
  assert.equal(await page.evaluate(async base=>fetch(base+'/auth/me').then(()=>false).catch(()=>true),base),true,'Private API has no offline fallback or stored response');
  const availability=await page.evaluate(async(base)=>({cached:(await fetch(base+'/res/v2/abilities.json')).status,missing:await fetch(base+'/res/v2/projectiles.json').then(r=>r.status).catch(()=>503)}),base);
  assert.equal(availability.cached,200);assert.equal(availability.missing,503);
  await page.goto(base+'/mainstage/hard/stage/hs1/');await page.waitForSelector('#hsRoute:not([hidden])');
  await page.goto(base+'/about/');assert.equal(await page.locator('h1').innerText(),'Unable to connect');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  networkDown=false;await ctx.setOffline(false);await page.goto(base+'/settings/');await page.evaluate(()=>window.RangerbookI18n.ready);
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.evaluate(()=>window.RangerbookPwa.checkUpdate());await noUpdateAction();
  assert.ok(!(await page.locator('.rb-pwa-status button').allTextContents()).includes('Reload'));
  // An update must wait; a second window blocks user-triggered activation.
  const previous=await page.evaluate(()=>navigator.serviceWorker.controller.scriptURL);
  generation='app';await page.evaluate(()=>window.RangerbookPwa.checkUpdate());
  await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
  await page.waitForFunction(()=>document.querySelector('.rb-pwa-status button')?.textContent==='Update and reload');
  // Choosing Later remains respected after reconnecting to the same release.
  await page.locator('.rb-pwa-status button').last().click();
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.evaluate(()=>window.RangerbookPwa.checkUpdate());
  assert.ok(await page.locator('.rb-pwa-status').isHidden());
  await page.reload();await waitControlled(page);
  await page.waitForFunction(()=>document.querySelector('.rb-pwa-status button')?.textContent==='Update and reload');
  const second=await ctx.newPage();await second.goto(base+'/settings/');
  await page.locator('.rb-pwa-status button').first().click();
  await page.waitForFunction(()=>document.querySelector('.rb-pwa-status').textContent.includes('Close other'));
  // Background update checks must not erase the close-other-windows guidance.
  await page.evaluate(()=>window.RangerbookPwa.checkUpdate());
  assert.match(await page.locator('.rb-pwa-status').innerText(),/Close other/);
  await second.close();await page.reload();await waitControlled(page);
  await page.waitForFunction(()=>document.querySelector('.rb-pwa-status button')?.textContent==='Update and reload');
  await Promise.all([page.waitForNavigation(),page.locator('.rb-pwa-status button').first().click()]);await waitControlled(page);
  const keys=await page.evaluate(()=>caches.keys());assert.ok(keys.some(x=>x.includes('upgrade-browser-fixture')));assert.ok(!keys.some(x=>x.includes(release.appVersion)));
  const urls=await page.evaluate(async()=>{const out=[];for(const n of await caches.keys())for(const r of await (await caches.open(n)).keys())out.push(r.url);return out;});
  assert.ok(!urls.some(x=>/auth|admin|session|payment/.test(x)));assert.ok(urls.every(x=>x.startsWith(base+'/')));
  assert.equal(await page.evaluate(()=>localStorage.getItem('rangerbook-theme')),'dark');
  // During a data-only release, the old page keeps its compatible snapshot.
  generation='data';await page.evaluate(()=>window.RangerbookPwa.checkUpdate());
  await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
  const oldData=await page.evaluate(async base=>fetch(base+'/res/v2/abilities.json').then(r=>r.json()),base);
  assert.ok(!oldData.pwaFixture,'Old page must not see a newer dataset');
  await page.waitForFunction(()=>document.querySelector('.rb-pwa-status button')?.textContent==='Update and reload');
  await Promise.all([page.waitForNavigation(),page.locator('.rb-pwa-status button').first().click()]);await waitControlled(page);
  const upgraded=await page.evaluate(async base=>fetch(base+'/res/v2/abilities.json').then(r=>r.json()),base);
  assert.equal(upgraded.pwaFixture,'next-data-release');
  const newKeys=await page.evaluate(()=>caches.keys());
  assert.ok(newKeys.some(x=>x.includes(dataRelease.dataVersion)));assert.ok(!newKeys.some(x=>x.includes(release.dataVersion)));
  assert.equal(previous,base+'/sw.js');assert.ok(!errors.length,errors.join('\n'));
  await page.screenshot({path:'/tmp/rangerbook-pwa-'+(prefix?'subpath':'root')+'.png',fullPage:true});
  await ctx.close();console.log('PWA_BROWSER_OK '+(prefix||'/')+' install/lifecycle/private exclusions/offline/deep routes/reconnect/update consent/multi-window/preferences');
 }
 // Offline fallback uses the saved locale and theme, without the game adapter.
 for(const locale of ['zh-Hant','en','jp','th'])for(const theme of ['light','dark']) {
  generation='base';const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await ctx.addInitScript(({locale,theme})=>{localStorage.setItem('rangerbook-language',locale);localStorage.setItem('rangerbook-theme',theme);},{locale,theme});
  await ctx.route('https://**',r=>r.abort());const p=await ctx.newPage();await p.goto(origin+'/settings/');await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();await waitControlled(p);networkDown=true;await ctx.setOffline(true);
  await p.goto(origin+'/about/');await p.evaluate(()=>window.RangerbookI18n.ready);
  assert.equal(await p.locator('h1').innerText(),JSON.parse(read('assets/locales/pwa.json'))[locale]['pwa.offlineTitle']);assert.equal(await p.locator('html').getAttribute('data-theme'),theme);
  networkDown=false;await ctx.close();
 }
 console.log('PWA_BROWSER_LOCALES_OK four languages × two themes offline');
 for(const installed of [false,true]) {
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  await ctx.addInitScript(installed=>{localStorage.setItem('rangerbook-language','en');Object.defineProperty(navigator,'standalone',{value:installed});},installed);
  await ctx.route('https://**',r=>r.abort());const p=await ctx.newPage();await p.goto(origin+'/settings/');await p.evaluate(()=>window.RangerbookI18n.ready);
  assert.equal(await p.locator('[data-pwa-ios]').isHidden(),installed);assert.ok(await p.locator('[data-pwa-install]').isHidden());
  if(installed)assert.match(await p.locator('[data-pwa-availability]').innerText(),/installed/);
  await ctx.close();
 }
 console.log('PWA_BROWSER_INSTALL_GATES_OK simulated iOS browser / installed standalone');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
