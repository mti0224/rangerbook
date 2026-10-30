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
     let currentRole=role, mode='ready', calls=[],detailCalls=0;
     const run={kind:'run',runId:'a'.repeat(32),service:'rangerbook-v2-update.service',status:'success',priority:6,
       startedAt:'2026-10-27T23:44:00Z',endedAt:'2026-10-27T23:44:42Z',time:'2026-10-27T23:44:42Z',durationSeconds:42,message:'',
       summary:{reason:'completed',httpCodes:[],apiCodes:[],warning:false}};
     const runText='[V2] Begin\n採用既有 DB：0\nDB 未變更：29\nJSON 轉換：0\nJSON 無需轉換：29\n[V2] Complete';
     const errors=[];page.on('pageerror',e=>errors.push(e.message));
     await page.route('https://rangerbook-auth.warmycat.com/**',async route=>{
      const url=new URL(route.request().url());let body={items:[]},status=200;
      if(url.pathname==='/auth/me')body={logged_in:currentRole!=='guest',role:currentRole,account:'synthetic',admin_application_status:'approved'};
      if(url.pathname.startsWith('/admin/backend-logs/runs/')) {
       detailCalls++;body={...run,message:runText,lineCount:6,truncated:false,partial:false,summary:{reason:'unchanged',httpCodes:[],apiCodes:[],warning:false}};
      }
      if(url.pathname==='/admin/backend-logs'){
       calls.push(url.searchParams);
       if(mode==='forbidden'){status=403;currentRole='admin';body={detail:'member.superRequired'}}
       else if(mode==='error'){status=503;body={detail:'logs.unavailable'}}
       else body={limit:200,mode:'mixed',items:mode==='empty'?[]:[
        {time:'2026-10-28T00:00:00Z',service:'rangerbook-auth.service',priority:3,message:'119801 <img src=x onerror="window.LOG_XSS=true">\n'+'x'.repeat(500)},
        {time:'2026-10-27T23:24:23Z',service:'rangerbook-auth.service',priority:6,lineCount:38,partial:false,message:JSON.stringify({locales:{zh_TW:0,en:0,th:0,jp:0},summary:Array.from({length:10},(_,i)=>({key:'field_'+i,count:i}))},null,2)},
        {time:'2026-10-27T23:24:22Z',service:'rangerbook-auth.service',priority:6,lineCount:1,partial:true,message:'[REDACTED: incomplete multiline entry]'},run
       ]};
       if(status===200&&mode!=='empty'&&url.searchParams.get('source')==='updates')body={limit:200,mode:'runs',items:[run]};
       if(mode==='maintenance')body={mode:'runs',items:[{...run,status:'failed',priority:3,
        summary:{reason:'maintenance',httpCodes:['512'],apiCodes:['512'],warning:false}}]};
       if(mode==='partial')body={mode:'runs',items:[{...run,
        summary:{reason:'unavailableData',httpCodes:[],apiCodes:['112004'],warning:true}}]};
       if(mode==='unknown')body={mode:'runs',items:[{...run,status:'failed',priority:3,summary:undefined}]};
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
      await page.locator('.backend-log-entry').first().waitFor();
      assert.equal(await page.locator('#backendLogsList img').count(),0);
      assert.equal(await page.evaluate(()=>window.LOG_XSS),undefined);
      assert.match(await page.locator('#backendLogsList').innerText(),/08:00:00/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      assert.equal(await page.locator('.backend-log-entry').count(),4);
      assert.equal(await page.locator('.backend-log-entry time').count(),4);
      assert.equal(await page.locator('.backend-log-content').count(),4);
      assert.equal(await page.locator('.backend-log-description').count(),4);
      assert.equal(await page.locator('.backend-log-entry pre:visible').count(),0,'raw text is initially collapsed');
      assert.match(await page.locator('.backend-log-meta code').last().innerText(),/遊戲資料更新（V2）/);
      assert.match(await page.locator('.backend-log-description').last().innerText(),/執行完成/);
      const jsonDetails=page.locator('.backend-log-content').nth(1);
      assert.equal(await jsonDetails.getAttribute('open'),null);
      assert.equal(await jsonDetails.locator('pre').isVisible(),false);
      await jsonDetails.locator('summary').click();
      assert.equal(await jsonDetails.locator('pre').isVisible(),true);
      assert.equal(JSON.parse(await jsonDetails.locator('pre').innerText()).locales.jp,0);
      await jsonDetails.locator('summary').click();
      assert.equal(await jsonDetails.locator('pre').isVisible(),false);
      assert.match(await page.locator('#backendLogsStatus').innerText(),/4.*筆紀錄/);
      assert.match(await page.locator('.backend-log-partial').innerText(),/可能不完整/);
      const runDetails=page.locator('.backend-log-run');
      assert.equal(detailCalls,0,'run output is not fetched until expanded');
      assert.equal(await runDetails.locator('pre').isVisible(),false);
      await runDetails.locator('summary').click();
      await page.waitForFunction(()=>document.querySelector('.backend-log-run pre')?.textContent.includes('[V2] Complete'));
      assert.equal(detailCalls,1);
      assert.equal(await runDetails.locator('pre').innerText(),runText);
      assert.match(await page.locator('.backend-log-description').last().innerText(),/資料沒有變動/);
      assert.match(await page.locator('.backend-log-run-timing').innerText(),/07:44:00.*42.0/);
      await runDetails.locator('summary').click();
      await runDetails.locator('summary').click();
      assert.equal(detailCalls,1,'reopening a loaded run reuses its in-memory output');


      await page.selectOption('#backendLogsSource','updates');
      await page.waitForFunction(()=>document.querySelector('#backendLogsRefresh').disabled===false);
      assert.equal(calls.at(-1).get('source'),'updates');
      assert.equal(await page.locator('.backend-log-entry').count(),1,'one completed job is one card');
      await page.fill('#backendLogsKeyword','JSON');
      await page.click('#backendLogsRefresh');
      await page.waitForFunction(()=>document.querySelector('#backendLogsRefresh').disabled===false);
      assert.equal(calls.at(-1).get('keyword'),'JSON');
      mode='maintenance';await page.click('#backendLogsRefresh');
      await page.waitForFunction(()=>document.querySelector('.backend-log-description')?.textContent.includes('遊戲維護中'));
      const maintenance=await page.locator('.backend-log-description').innerText();
      assert.ok(maintenance.length<65,'summary stays concise');
      assert.equal((maintenance.match(/512/g)||[]).length,1,'duplicate HTTP/API codes are merged');
      assert.match(maintenance,/HTTP 512/);
      assert.equal(await page.locator('.backend-log-entry.is-error').count(),1);
      if(process.env.QA_SCREENSHOTS)await page.screenshot({path:process.env.QA_SCREENSHOTS+`/log-summary-${width}-${theme}.png`,fullPage:true});
      mode='partial';await page.click('#backendLogsRefresh');
      await page.waitForFunction(()=>document.querySelector('.backend-log-description')?.textContent.includes('112004'));
      assert.match(await page.locator('.backend-log-description').innerText(),/執行完成，部分遊戲資料無法取得/);
      assert.equal(await page.locator('.backend-log-entry.is-warning').count(),1);
      assert.match(await page.locator('.backend-log-meta').innerText(),/完成（有警告）/);
      mode='unknown';await page.click('#backendLogsRefresh');
      await page.waitForFunction(()=>document.querySelector('.backend-log-description')?.textContent.includes('原因請查看'));
      mode='error';await page.click('#backendLogsRefresh');
      await page.waitForFunction(()=>document.querySelector('#backendLogsStatus').textContent.includes('無法讀取'));
      assert.equal(await page.locator('.backend-log-entry').count(),0);
      mode='empty';await page.click('#backendLogsRefresh');
      await page.waitForFunction(()=>document.querySelector('#backendLogsStatus').textContent.includes('沒有符合'));
      mode='ready';await page.click('#backendLogsRefresh');await page.locator('.backend-log-entry').first().waitFor();
      await page.click('#adminResourcesTab');
      await page.waitForFunction(()=>document.querySelector('#backendLogsList').children.length===0);
      await page.click('#adminLogsTab');await page.locator('.backend-log-entry').first().waitFor();
      mode='forbidden';await page.click('#backendLogsRefresh');
      await page.waitForFunction(()=>window.RangerbookAuth.getUser().role==='admin');
      assert.equal(await page.locator('#adminLogsTab').isVisible(),false);
      assert.equal(await page.locator('.backend-log-entry').count(),0);
     }
     assert.deepEqual(errors,[]);
     if(process.env.QA_SCREENSHOTS && role==='super_admin') {
      // Re-open with a synthetic super-admin session for the review image.
      currentRole='super_admin';mode='ready';await page.evaluate(()=>window.RangerbookAuth.refresh());
      await page.click('#adminLogsTab');await page.locator('.backend-log-entry').first().waitFor();
      await page.locator('.backend-log-run summary').click();
      await page.waitForFunction(()=>document.querySelector('.backend-log-run pre')?.textContent.includes('[V2] Complete'));
      await page.screenshot({path:process.env.QA_SCREENSHOTS+`/backend-logs-${width}-${theme}.png`,fullPage:true});
     }
     await page.close();console.log(`BACKEND_LOGS_UI_OK ${role} ${width} ${theme}`);
    }
   }
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
