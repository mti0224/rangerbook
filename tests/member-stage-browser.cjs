/* Verify the generated acceptance pages cannot contact production auth or GA. */
const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
async function main(){
  const root=path.resolve(process.argv[2]);
  const server=http.createServer(async(req,res)=>{
    try{
      const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      let file=path.resolve(root,'.'+name);
      if(!file.startsWith(root+path.sep)&&file!==root)throw Error('path');
      if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');
      const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
      res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext();
    const blocked=[],calls=[];
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='rangerbook-auth.warmycat.com'||/google-analytics|googletagmanager/.test(url.hostname)){
        blocked.push(url.hostname);return route.abort();
      }
      if(url.hostname==='rangerbook-test.warmycat.com'){
        calls.push(url.pathname);
        return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':`http://127.0.0.1:${server.address().port}`,'Access-Control-Allow-Credentials':'true'},body:JSON.stringify(url.pathname==='/auth/features'?{registration:false,google:false,member_navigation:false}:{logged_in:false,role:'user'})});
      }
      if(url.hostname==='127.0.0.1')return route.continue();
      return route.abort();
    });
    const page=await context.newPage();
    for(const pathname of ['/admin/','/account/','/personal-teams/','/account-action/']){
      await page.goto(`http://127.0.0.1:${server.address().port}${pathname}`);
      await page.waitForTimeout(500);
      assert.match(await page.title(),/^\[TEST\]/);
      assert.equal(await page.evaluate(()=>window.RANGERBOOK_AUTH_API_BASE),'https://rangerbook-test.warmycat.com');
      assert.equal(await page.evaluate(async()=> (await navigator.serviceWorker.getRegistrations()).length),0);
      assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'noindex,nofollow,noarchive');
    }
    assert.deepEqual(blocked,[]);
    assert(calls.includes('/auth/me')&&calls.includes('/auth/features'));
    console.log(JSON.stringify({pages:4,production_auth_requests:0,analytics_requests:0,service_worker_registrations:0}));
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
