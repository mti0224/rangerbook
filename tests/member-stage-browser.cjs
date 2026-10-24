/* Verify the generated acceptance pages cannot contact production auth or GA. */
const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
async function main(){
  const root=path.resolve(process.argv[2]);
  const snippet=await fs.readFile(path.join(__dirname,'../membership/stage/viewer-headers.conf.in'),'utf8');
  const nginx=await fs.readFile(path.join(__dirname,'../membership/stage/nginx.conf.in'),'utf8');
  assert(nginx.includes('add_header X-Frame-Options DENY always;'));
  assert(nginx.includes('location ~ ^/pvp/search/(?:index\\.html)?$'));
  assert(nginx.includes('include /etc/nginx/snippets/rangerbook-membership-test-viewer.conf;'));
  const viewerHeaders=Object.fromEntries([...snippet.matchAll(/^add_header (\S+) (.+) always;$/gm)].map(([,name,value])=>[name,value.startsWith('"')?value.slice(1,-1):value]));
  assert.equal(viewerHeaders['X-Frame-Options'],'SAMEORIGIN');
  assert.equal(viewerHeaders['Content-Security-Policy'],"frame-ancestors 'self'");
  assert.match(viewerHeaders['Cache-Control'],/no-store/);
  const server=http.createServer(async(req,res)=>{
    try{
      const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      res.setHeader('X-Frame-Options','DENY');
      if(/^\/pvp\/search\/(?:index\.html)?$/.test(name))for(const [header,value] of Object.entries(viewerHeaders))res.setHeader(header,value);
      if(name==='/__frame_guard'){res.setHeader('Content-Type','text/html');return res.end('<iframe src="/account/"></iframe>');}
      let file=path.resolve(root,'.'+name);
      if(!file.startsWith(root+path.sep)&&file!==root)throw Error('path');
      if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');
      const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
      res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const foreign=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<iframe src="'+origin+'/pvp/search/?personal=1"></iframe>');});
  await new Promise(r=>foreign.listen(0,'127.0.0.1',r));
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext();
    let loggedIn=false;
    const rangerRows=JSON.parse(await fs.readFile(path.join(root,'res/Rangers_data.json'),'utf8'));
    const unit={unitCode:rangerRows.find(row=>row.ranger_id)?.ranger_id,level:1,equipMap:{}};
    assert(unit.unitCode);
    const teams=Object.fromEntries(['team1','team2','team3','team4','team5'].map(key=>[key,{A:[unit],B:[]}]));
    teams.pvpteam=[unit];teams.guildwar=[unit];
    const blocked=[],calls=[];
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='rangerbook-auth.warmycat.com'||/google-analytics|googletagmanager/.test(url.hostname)){
        blocked.push(url.hostname);return route.abort();
      }
      if(url.hostname==='rangerbook-test.warmycat.com'){
        calls.push(url.pathname);
        let data={logged_in:loggedIn,role:'user',account:'fixture-member'};
        if(url.pathname==='/auth/features')data={registration:false,google:false,member_navigation:false};
        if(url.pathname==='/member/game-binding/status')data={bound:true,player:{player_name:'Synthetic',guild_name:'Fixture',last_imported_at:'2026-10-24T01:02:03Z'}};
        if(url.pathname==='/member/personal-teams')data={bound:true,teams};
        return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true'},body:JSON.stringify(data)});
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
    loggedIn=true;
    const localeRows=JSON.parse(await fs.readFile(path.join(root,'assets/locales/sitewide-overrides.json'),'utf8'));
    let boundMatrices=0;
    for(const locale of (process.env.QA_ONE?['zh-Hant']:['zh-Hant','en','jp','th']))for(const theme of ['light','dark'])for(const width of (process.env.QA_ONE?[390,1440]:[390,768,1440,1920])){
      const viewport={width,height:1000};
      await page.evaluate(({locale,theme})=>{localStorage.setItem('rangerbook-language',locale);localStorage.setItem('rangerbook-theme',theme);},{locale,theme});
      await page.setViewportSize(viewport);
      await page.goto(origin+'/personal-teams/');
      const iframe=page.locator('#adminPersonalViewer');await iframe.waitFor();await iframe.scrollIntoViewIfNeeded();
      const viewer=page.frameLocator('#adminPersonalViewer');
      await viewer.locator('#pvpPlayerSearchTeamGrid .pvp-player-unit-button').first().waitFor();
      await viewer.locator('#pvpPlayerTeamAnalysis:not([hidden])').waitFor();
      const copy=key=>localeRows.find(row=>row.key==='UI:member.'+key)[locale==='zh-Hant'?'zh_TW':locale];
      assert.equal(await page.locator('#adminPersonalAccountCard h2').innerText(),copy('gameAccountSettings'));
      assert.equal(await page.locator('#adminPersonalBoundLabel').innerText(),'Synthetic');
      assert.match(await page.locator('#adminPersonalLastImported').innerText(),/2026\/10\/24 09:02:03/);
      const banner=await page.locator('.member-banner').boundingBox();
      for(const target of [page.locator('#adminPersonalAccountCard'),iframe,viewer.locator('.pvp-player-team-pane')]){
        const box=await target.boundingBox();assert.ok(Math.abs(box.x-banner.x)<=1&&Math.abs(box.width-banner.width)<=1,'Bound content matches banner edges');
      }
      assert.equal(await viewer.locator('#pvpPlayerSearchSelection').isVisible(),false,'No separate My teams card');
      assert.equal(await viewer.locator('h3#personalTeamHeading').innerText(),copy('yourTeams'));
      assert.equal(await viewer.locator('#pvpPlayerSearchTeamSelect').getAttribute('aria-labelledby'),'personalTeamHeading');
      assert.equal(await viewer.locator('.pvp-player-team-pane #pvpPlayerSearchTeamSelect').count(),1,'Picker is inside the viewer card');
      assert.equal(await viewer.locator('#pvpPlayerSearchTeamSelect option').count(),7);
      for(const key of Object.keys(teams)){
        await viewer.locator('#pvpPlayerSearchTeamSelect').selectOption(key);
        assert.equal(await viewer.locator('#pvpPlayerSearchTeamGrid .pvp-player-unit-button').count(),1);
      }
      await viewer.locator('#pvpPlayerSearchTeamSelect').selectOption('team1');
      await viewer.locator('.pvp-player-unit-button').first().click();
      assert.equal(await viewer.locator('#pvpPlayerSearchUnitDetail').isVisible(),true);
      if(process.env.QA_SCREENSHOTS&&locale==='zh-Hant'&&[390,1440].includes(width)){
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({path:process.env.QA_SCREENSHOTS+`/bound-top-${width}-${theme}.png`});
        await page.screenshot({path:process.env.QA_SCREENSHOTS+`/bound-viewer-${width}-${theme}.png`,fullPage:true});
      }
      boundMatrices++;
    }
    let refusal=page.waitForEvent('console',{predicate:msg=>/frame-ancestors|X-Frame-Options/.test(msg.text())});
    await page.goto(`http://127.0.0.1:${foreign.address().port}/`);await refusal;
    refusal=page.waitForEvent('console',{predicate:msg=>/X-Frame-Options/.test(msg.text())});
    await page.goto(origin+'/__frame_guard');await refusal;
    console.log(JSON.stringify({pages:4,production_auth_requests:0,analytics_requests:0,service_worker_registrations:0,same_origin_viewer_matrices:boundMatrices,team_modes:7,foreign_frame_blocked:true,other_pages_frame_blocked:true}));
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));await new Promise(r=>foreign.close(r));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
