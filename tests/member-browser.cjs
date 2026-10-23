/* Isolated browser fixtures; no requests or emails reach production. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base='https://member-ui.invalid';
const rows=JSON.parse(fs.readFileSync(path.join(root,'assets/locales/sitewide-overrides.json'),'utf8'));
const copy=(key,locale)=>rows.find(row=>row.key==='UI:'+key)?.[locale==='zh-Hant'?'zh_TW':locale];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6oAAAAABJRU5ErkJggg==','base64');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{for(const locale of ['zh-Hant','en','jp','th'])for(const theme of ['light','dark'])for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:950},serviceWorkers:'block'});
  await context.addInitScript(({locale,theme})=>{localStorage.setItem('rangerbook-language',locale);localStorage.setItem('rangerbook-theme',theme);},{locale,theme});
  let user={logged_in:true,account:'fixture-admin',role:'admin',must_change_password:false};
  let factor=false, email=null, reauthSeconds=0, reauthCooldown=0, rejectReauth=false, holdReauth=true, releaseReauth;
  const calls=[],errors=[],outbound=[];
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.hostname==='rangerbook-auth.warmycat.com'){
      calls.push({path:url.pathname,method:req.method(),body:req.postData()});
      const headers={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Expose-Headers':'Retry-After'};
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
      let data={ok:true};
      if(url.pathname==='/auth/features')data={members_v2:true,google:false,registration:false,member_navigation:false};
      if(url.pathname==='/auth/me')data=user;
      if(url.pathname==='/auth/security')data={totp_enabled:factor,totp_required:user.role==='super_admin',google_email:email,reauth_valid_for:reauthSeconds,reauth_retry_after:reauthCooldown};
      if(url.pathname==='/auth/reauth'){
        if(holdReauth)await new Promise(resolve=>{releaseReauth=resolve;});
        if(rejectReauth)return route.fulfill({status:429,json:{detail:'member.rateLimited'},headers:{...headers,'Retry-After':'1'}});
        reauthSeconds=300;data={ok:true,reauth_valid_for:300};
      }
      if(url.pathname==='/auth/2fa/setup')data={manual_key:'FIXTUREONLY',qr:'data:image/png;base64,'+png.toString('base64')};
      if(url.pathname==='/auth/2fa/enable'){factor=true;user.logged_in=true;user.setup_required=false;data={recovery_codes:['FIXTURE-CODE-ONE']};}
      if(url.pathname==='/auth/2fa/verify'){user.logged_in=true;user.mfa_required=false;}
      if(url.pathname==='/auth/change-password')user.must_change_password=false;
      if(url.pathname==='/auth/logout')user={logged_in:false,role:'user'};
      if(url.pathname==='/member/game-binding/status')data={bound:false};
      if(url.pathname==='/member/game-players/search')data={items:[{candidateId:'fixture',name:'<img src=x onerror=alert(1)>',guildName:'Synthetic'}],count:1};
      if(url.pathname==='/admin/users')data={items:[]};
      if(url.pathname==='/admin/applications')data={items:[]};
      if(url.pathname==='/admin/resource-updates')data={items:[]};
      return route.fulfill({json:data,headers});
    }
    if(url.origin!==base){outbound.push(url.href);return route.abort();}
    let name=decodeURIComponent(url.pathname).slice(1);if(name.endsWith('/'))name+='index.html';
    const file=path.join(root,name);
    if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
    return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/account/');await page.evaluate(()=>window.RangerbookI18n.ready);
  await page.locator('#memberSecurityArea').waitFor();
  assert.equal(await page.locator('h1[data-i18n="member.security"]').innerText(),copy('member.security',locale));
  assert.equal(await page.locator('.gt-user-navigation').evaluate(el=>el.hidden),false);
  assert.equal(await page.locator('#memberGoogleStart').isDisabled(),true);
  assert.equal(await page.locator('#memberReauthForm input[name=code]').isVisible(),false);
  await page.locator('#memberReauthForm input[name=password]').fill('fixture-password');
  const reauthRequest=page.waitForRequest(req=>new URL(req.url()).pathname==='/auth/reauth');
  await page.locator('#memberReauthForm button').click();
  await reauthRequest;
  assert.equal(await page.locator('#memberProof .member-operation-status').innerText(),copy('member.processing',locale));
  assert.equal(await page.locator('#memberReauthForm').getAttribute('aria-busy'),'true');
  await page.evaluate(()=>document.querySelector('#memberReauthForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(calls.filter(x=>x.path==='/auth/reauth').length,1,'Pending submissions cannot be duplicated');
  holdReauth=false;releaseReauth();
  await page.waitForFunction(()=>document.querySelector('#memberReauthForm input').value==='');
  await page.waitForFunction(()=>!document.querySelector('#memberReauthForm').hasAttribute('aria-busy'));
  assert.equal(await page.locator('#memberProof .member-operation-status').innerText(),copy('member.reauthDone',locale));
  assert.match(await page.locator('#memberProofStatus').innerText(),/4:|5:/);
  assert.equal(await page.locator('#memberReauthForm button').isDisabled(),true,'An active proof does not need another submission');
  reauthSeconds=0;reauthCooldown=40;await page.reload();await page.locator('#memberSecurityArea').waitFor();
  await page.waitForFunction(()=>document.querySelector('#memberProofStatus')?.textContent.includes('0:40'));
  assert.equal(await page.locator('#memberReauthForm button').isDisabled(),true);
  reauthCooldown=0;rejectReauth=true;await page.reload();await page.locator('#memberSecurityArea').waitFor();
  await page.locator('#memberReauthForm input[name=password]').fill('fixture-password');
  await page.locator('#memberReauthForm button').click();
  await page.locator('#memberProof .member-operation-status.error').waitFor();
  assert.equal(await page.locator('#memberReauthForm button').isDisabled(),true);
  await page.waitForFunction(()=>!document.querySelector('#memberReauthForm button').disabled);
  assert.equal(await page.locator('#memberProof .member-operation-status').innerText(),copy('member.retryReady',locale));
  rejectReauth=false;
  await page.locator('#memberReauthForm input[name=password]').fill('fixture-password');
  await page.locator('#memberReauthForm button').click();
  await page.waitForFunction(()=>!document.querySelector('#memberReauthForm').hasAttribute('aria-busy'));
  await page.locator('#memberSetup').click();await page.locator('#memberSetupPanel').waitFor();
  await page.locator('#memberEnableForm input').fill('123456');await page.locator('#memberEnableForm button').click();
  await page.locator('#memberRecoveryPanel').waitFor();
  assert.match(await page.locator('#memberRecovery').innerText(),/FIXTURE-CODE-ONE/);
  await page.waitForFunction(()=>!document.querySelector('#memberEnableForm').hasAttribute('aria-busy'));
  assert.equal(await page.locator('#memberSetup').evaluate(el=>el.closest('.admin-card').querySelector('.member-operation-status').textContent),copy('member.factorEnabled',locale));
  if(process.env.QA_SCREENSHOTS && locale==='zh-Hant' && ((width===390&&theme==='dark')||(width===1440&&theme==='light')))await page.screenshot({path:process.env.QA_SCREENSHOTS+'/member-'+width+'-'+theme+'.png',fullPage:true});
  const storage=await page.evaluate(()=>JSON.stringify({...localStorage}));assert.ok(!/FIXTURE|password|123456/.test(storage));
  await page.locator('#memberHideCodes').click();assert.equal(await page.locator('#memberRecovery').innerText(),'');
  email='fixture@gmail.com';await page.goto(base+'/account/?callback=ok#google=ok');
  await page.locator('#memberGoogle .member-operation-status.success').waitFor();
  assert.equal(await page.locator('#memberGoogleStatus').innerText(),email);
  assert.equal(await page.locator('#memberGoogle .member-operation-status').innerText(),copy('member.bound',locale));
  email=null;await page.goto(base+'/account/?callback=failed#google=failed');
  await page.locator('#memberGoogle .member-operation-status.error').waitFor();
  assert.equal(await page.locator('#memberGoogle .member-operation-status').innerText(),copy('member.googleFailed',locale));
  await page.goto(base+'/admin/');await page.locator('#adminWorkspace').waitFor();
  assert.equal(await page.locator('#adminPersonalTab,#adminPasswordTab,#adminPersonalPanel,#adminPasswordCard').count(),0);
  assert.equal(await page.locator('#adminResourcesTab').getAttribute('aria-selected'),'true');
  const personalRequest=page.waitForResponse(r=>r.url().includes('/member/game-binding/status'));
  await page.goto(base+'/personal-teams/');await personalRequest;await page.locator('#adminPersonalPanel').waitFor();
  assert.ok(calls.some(x=>x.path==='/member/game-binding/status'));
  await page.locator('#adminPersonalSearch').fill('fixture');await page.locator('#adminPersonalSearchForm button').click();
  await page.waitForFunction(()=>document.querySelector('#adminPersonalSearchForm button').disabled===false);
  assert.ok(calls.some(x=>x.path==='/member/game-players/search'));
  assert.equal(await page.locator('#adminPersonalCandidates img').count(),0,'Candidate names are rendered as text');
  // User navigation remains a presentation flag: ordinary users can load their page directly.
  user={logged_in:true,account:'fixture-user',role:'user'};
  await page.reload();await page.locator('#adminPersonalPanel').waitFor();
  assert.equal(await page.locator('.gt-user-navigation').evaluate(el=>el.hidden),true);
  assert.ok(await page.locator('#adminPersonalSearch').isVisible());
  // Mandatory enrollment and pending challenges expose only security actions.
  user={logged_in:false,account:'fixture-root',role:'user',setup_required:true};factor=false;
  await page.goto(base+'/account/');await page.locator('#memberSecurityArea').waitFor();
  assert.equal(await page.locator('#memberGoogle').isVisible(),false);
  assert.equal(await page.locator('#memberPassword').isVisible(),false);
  assert.equal(await page.locator('#memberSetup').isVisible(),true);
  // Token is removed before subresources, stays out of analytics, and is sent only in POST body.
  const before=outbound.length;
  await page.goto(base+'/account-action/#reset='+'x'.repeat(64));
  await page.locator('#memberResetForm').waitFor();
  assert.equal(new URL(page.url()).hash,'');
  await page.locator('#memberResetForm input[name=password]').fill('New-fixture-password');
  await page.locator('#memberResetForm input[name=confirm]').fill('New-fixture-password');
  await page.locator('#memberResetForm button').click();
  await page.waitForFunction(()=>document.querySelector('#memberResetForm').hidden);
  assert.equal(outbound.length,before,'No third-party requests from token page');
  assert.ok(calls.some(x=>x.path==='/auth/password/reset'&&x.method==='POST'&&JSON.parse(x.body).token==='x'.repeat(64)));
  await page.goto(base+'/account-action/#verify='+'y'.repeat(64));await page.locator('#memberVerifyEmail').waitFor();
  assert.equal(new URL(page.url()).hash,'');
  await page.locator('#memberVerifyEmail').click();
  await page.waitForFunction(()=>document.querySelector('#memberVerifyEmail').hidden);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  assert.equal(overflow,false,'No horizontal overflow');
  assert.deepEqual(errors,[]);
  console.log('MEMBER_BROWSER_OK',locale,theme,width);
  await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
