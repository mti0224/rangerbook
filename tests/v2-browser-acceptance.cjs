/* Public UI acceptance against an isolated checkout, never production writes. */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const base=process.env.AUDIT_BASE_URL||'http://127.0.0.1:4187';
const artifacts=process.env.QA_OUTPUT||path.join(root,'artifacts/v2-acceptance');
fs.mkdirSync(artifacts,{recursive:true});
function pages(dir='') {
 let result=[];
 for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})) {
  if(['.git','node_modules','res','assets','tests','docs','backend','deploy','artifacts'].includes(e.name))continue;
  const rel=path.join(dir,e.name);
  if(e.isDirectory())result.push(...pages(rel));
  else if(e.name.endsWith('.html') && rel!=='404.html' && !rel.startsWith('v2/'))result.push('/'+rel.replace(/index\.html$/,''));
 }return result;
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 const result={pages:[],interactions:[],fatal:[]};
 try {
  const routes=pages();
  for(const locale of ['zh-Hant','en','th','jp']) {
   const context=await browser.newContext({viewport:locale==='th'||locale==='jp'?{width:390,height:844}:{width:1400,height:900}});
   await context.addInitScript(({locale})=>{if(!localStorage.getItem('rangerbook-language'))localStorage.setItem('rangerbook-language',locale);if(!localStorage.getItem('rangerbook-theme'))localStorage.setItem('rangerbook-theme',locale==='jp'||locale==='en'?'dark':'light');},{locale});
   await context.route('**/rangerbook-auth.warmycat.com/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{"logged_in":false}'}));
   await context.route('**/www.googletagmanager.com/**',r=>r.abort());
   const page=await context.newPage();
   let errors=[],legacy=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{const u=new URL(r.url());if(u.origin===new URL(base).origin && /\/res\//.test(u.pathname) && !u.pathname.includes('/res/v2/') && !u.pathname.includes('ranger_stats_config') && !decodeURIComponent(u.pathname).includes('更新日誌'))legacy.push(u.pathname);});
   for(const route of routes) {
    errors=[];legacy=[];
    try {
     await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:30000});
     await page.waitForFunction(l=>window.RangerbookI18n?.locale===l,locale,{timeout:20000});
     await page.evaluate(()=>window.RangerbookI18n.ready);
     await page.waitForTimeout(500);
     const visible=await page.evaluate(()=>{
      const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),chinese=[];let n;
      while(n=walker.nextNode()) {
       const el=n.parentElement,s=n.nodeValue.trim();
       if(!el||el.closest('script,style,[hidden],.rb-choice-body small,[data-i18n-ignore]')||!el.getClientRects().length)continue;
       if(/[\u3400-\u9fff]/.test(s))chinese.push(s.slice(0,160));
      }
      return {lang:document.documentElement.lang,heading:document.querySelector('h1')?.innerText,
       chinese:[...new Set(chinese)].slice(0,25),source:window.RangerbookV2?.source,
       counts:{rangers:document.querySelectorAll('.ranger-card').length,gear:document.querySelectorAll('.gear-card').length,
       abilities:document.querySelectorAll('.ability-card').length}};
     });
     assert.equal(visible.source,'v2');assert.equal(visible.lang,locale==='jp'?'ja':locale);
     assert.equal(legacy.length,0,'Unexpected V1 game network request');
     assert.equal(errors.length,0,errors.join('; '));
     result.pages.push({route,locale,...visible});
     if(['/settings/','/ranger/ranger/','/gear/','/ability/','/mainstage/extreme/stage/','/labyrinth/stage/'].includes(route))
       await page.screenshot({path:path.join(artifacts,locale+'-'+route.replaceAll('/','_')+'.png'),fullPage:false});
    }catch(e){result.fatal.push({route,locale,error:e.message,errors,legacy});}
   }
   await page.goto(base+'/settings/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.RangerbookI18n?.ready);
   assert.equal(await page.locator('input[name="language"]').count(),4);
   for(const selected of ['en','jp','th','zh-Hant']) {
    await page.locator('input[name="language"][value="'+selected+'"]').check();
    await page.waitForFunction(l=>document.documentElement.lang===(l==='jp'?'ja':l) && document.querySelector('input[name="language"][value="'+l+'"]').checked,selected);
   }
   result.interactions.push({locale,settingsFourLanguages:true});
   await context.close();console.log('V2_BROWSER_PROGRESS '+locale+' '+result.pages.length+' pages '+result.fatal.length+' errors');
   fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify(result,null,2));
  }
  assert.equal(result.fatal.length,0,JSON.stringify(result.fatal.slice(0,8)));
 }finally {fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify(result,null,2));await browser.close();}
 console.log('V2_BROWSER_ACCEPTANCE '+result.pages.length+' page-language combinations');
})().catch(e=>{console.error(e);process.exitCode=1;});
