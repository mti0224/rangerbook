/* Reproduce stylesheet flashes with deliberately delayed shell CSS responses. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin=process.env.WIKI_QA_ORIGIN||'http://127.0.0.1:4186';
const required=['header-responsive.css','mobile-interaction-fix.css','theme-toggle.css','game-tech.css','game-tech-controls.css','sidebar-drawer.css'];
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.WIKI_QA_CHROME?{executablePath:process.env.WIKI_QA_CHROME}:{})});
 try{
  const context=await browser.newContext();
  await context.addCookies([{name:'fixture',value:'admin',domain:'127.0.0.1',path:'/'}]);
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin)return route.abort();
   if(required.some(name=>url.pathname.endsWith('/'+name)))await new Promise(resolve=>setTimeout(resolve,600));
   return route.continue();
  });
  await context.addInitScript(()=>{
   localStorage.setItem('rangerbook-language','zh-Hant');
   new MutationObserver(()=>{
    const sidebar=document.querySelector('.gt-sidebar');
    if(!sidebar||window.wikiShellFirstMount)return;
    window.wikiShellFirstMount={styles:[...document.styleSheets].map(x=>x.href).filter(Boolean),position:getComputedStyle(sidebar).position,closeDisplay:getComputedStyle(document.querySelector('.gt-drawer-close')).display};
   }).observe(document,{subtree:true,childList:true});
  });
  let checked=0;
  for(const width of [390,1440])for(const pathname of ['/wiki/','/wiki/manage/']){
   const page=await context.newPage();await page.setViewportSize({width,height:1000});
   await page.goto(origin+pathname);
   await page.waitForFunction(()=>window.wikiShellFirstMount);
   const first=await page.evaluate(()=>window.wikiShellFirstMount);
   for(const name of required)assert(first.styles.some(url=>new URL(url).pathname.endsWith('/'+name)),name+' loaded before first sidebar mount');
   assert.equal(first.position,'fixed');
   if(width===1440)assert.equal(first.closeDisplay,'none','Desktop never flashes the mobile close button');
   assert.equal(await page.getByRole('link',{name:'遊戲大全Wiki首頁',exact:true}).count(),0);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
   if(pathname==='/wiki/')await page.locator('#wikiManageLink:not([hidden])').waitFor();
   checked++;await page.close();
  }
  console.log(JSON.stringify({result:'WIKI_SHELL_PASS',cases:checked,css_delay_ms:600,all_shell_styles_present_at_first_mount:true,home_button_removed:true}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
