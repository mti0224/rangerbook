/* Synthetic role, rendering, filtering and revocation checks. No real accounts. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.AUDIT_BASE_URL||'http://127.0.0.1:4173';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 try {
  for(const role of ['guest','user','admin','super_admin']) {
   for(const width of role==='super_admin'?[390,1180]:[1080]) {
    for(const theme of role==='super_admin'?['light','dark']:['light']) {
     const page=await browser.newPage({viewport:{width,height:900}});
     await require('./local-static-fixture.cjs').install(page,base);
     await require('./region-fixture.cjs').mockTaiwan(page);
     await page.addInitScript(t=>{localStorage.setItem('rangerbook-theme',t);localStorage.setItem('rangerbook-language','zh-Hant')},theme);
     let currentRole=role, mode='ready', calls=[];
     const errors=[];page.on('pageerror',e=>errors.push(e.message));
     await page.route('https://rangerbook-auth.warmycat.com/**',async route=>{
      const url=new URL(route.request().url());let body={items:[]},status=200;
      if(url.pathname==='/auth/me')body={logged_in:currentRole!=='guest',role:currentRole,account:'synthetic',admin_application_status:'approved'};
      if(url.pathname==='/admin/backend-logs'){
       calls.push(url.searchParams);
       if(mode==='forbidden'){status=403;currentRole='admin';body={detail:'member.superRequired'}}
       else if(mode==='error'){status=503;body={detail:'logs.unavailable'}}
       else body={limit:200,rawCount:41,items:mode==='empty'?[]:[
        {time:'2026-10-28T00:00:00Z',service:'rangerbook-auth.service',priority:3,message:'119801 <img src=x onerror="window.LOG_XSS=true">\n'+'x'.repeat(500)},
        {time:'2026-10-27T23:24:23Z',service:'rangerbook-v2-update.service',priority:6,lineCount:38,partial:false,message:JSON.stringify({locales:{zh_TW:0,en:0,th:0,jp:0},summary:Array.from({length:10},(_,i)=>({key:'field_'+i,count:i}))},null,2)},
        {time:'2026-10-27T23:24:22Z',service:'rangerbook-v2-update.service',priority:6,lineCount:1,partial:true,message:'[REDACTED: incomplete multiline entry]'}
       ]};
      }
      await route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':base,'access-control-allow-credentials':'true'},body:JSON.stringify(body)});
     });
     await page.goto(base+'/admin/',{waitUntil:'domcontentloaded'});
     await page.waitForFunction(r=>window.RangerbookAuth?.getUser().role===r,role);
     if(role!=='super_admin'){
      assert.equal(await page.locator('#adminLogsTab').isVisible(),false);
      assert.equal(calls.length,0);
     }else{
      await page.locator('#adminLogsTab').click();
      await page.locator('.backend-log-entry').waitFor();
      assert.equal(await page.locator('#backendLogsList img').count(),0);
      assert.equal(await page.evaluate(()=>window.LOG_XSS),undefined);
      assert.match(await page.locator('#backendLogsList').innerText(),/08:00:00/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      assert.equal(await page.locator('.backend-log-entry').count(),3);
      assert.equal(await page.locator('.backend-log-entry time').count(),3);
      assert.equal(await page.locator('.backend-log-content').count(),2);
      const jsonDetails=page.locator('.backend-log-content').nth(1);
      assert.equal(await jsonDetails.getAttribute('open'),null);
      assert.equal(await jsonDetails.locator('pre').isVisible(),false);
      await jsonDetails.locator('summary').click();
      assert.equal(await jsonDetails.locator('pre').isVisible(),true);
      assert.equal(JSON.parse(await jsonDetails.locator('pre').innerText()).locales.jp,0);
      await jsonDetails.locator('summary').click();
      assert.equal(await jsonDetails.locator('pre').isVisible(),false);
      assert.match(await page.locator('#backendLogsStatus').innerText(),/3.*41/);
      assert.match(await page.locator('.backend-log-partial').innerText(),/可能不完整/);

      await page.selectOption('#backendLogsSource','pvp');
      await page.waitForFunction(()=>document.querySelector('#backendLogsRefresh').disabled===false);
      assert.equal(calls.at(-1).get('source'),'pvp');
      await page.fill('#backendLogsKeyword','119801');
      await page.click('#backendLogsRefresh');
      await page.waitForFunction(()=>document.querySelector('#backendLogsRefresh').disabled===false);
      assert.equal(calls.at(-1).get('keyword'),'119801');
      mode='error';await page.click('#backendLogsRefresh');
      await page.waitForFunction(()=>document.querySelector('#backendLogsStatus').textContent.includes('無法讀取'));
      assert.equal(await page.locator('.backend-log-entry').count(),0);
      mode='empty';await page.click('#backendLogsRefresh');
      await page.waitForFunction(()=>document.querySelector('#backendLogsStatus').textContent.includes('沒有符合'));
      mode='ready';await page.click('#backendLogsRefresh');await page.locator('.backend-log-entry').waitFor();
      await page.click('#adminResourcesTab');
      await page.waitForFunction(()=>document.querySelector('#backendLogsList').children.length===0);
      await page.click('#adminLogsTab');await page.locator('.backend-log-entry').waitFor();
      mode='forbidden';await page.click('#backendLogsRefresh');
      await page.waitForFunction(()=>window.RangerbookAuth.getUser().role==='admin');
      assert.equal(await page.locator('#adminLogsTab').isVisible(),false);
      assert.equal(await page.locator('.backend-log-entry').count(),0);
     }
     assert.deepEqual(errors,[]);
     if(process.env.QA_SCREENSHOTS && role==='super_admin') {
      // Re-open with a synthetic super-admin session for the review image.
      currentRole='super_admin';mode='ready';await page.evaluate(()=>window.RangerbookAuth.refresh());
      await page.click('#adminLogsTab');await page.locator('.backend-log-entry').waitFor();
      await page.screenshot({path:process.env.QA_SCREENSHOTS+`/backend-logs-${width}-${theme}.png`,fullPage:true});
     }
     await page.close();console.log(`BACKEND_LOGS_UI_OK ${role} ${width} ${theme}`);
    }
   }
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
