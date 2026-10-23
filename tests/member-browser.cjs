/* Browser interaction tests with explicit provider/API fixtures; no production traffic. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base='https://member-ui.invalid';
const rows=JSON.parse(fs.readFileSync(path.join(root,'assets/locales/sitewide-overrides.json'),'utf8'));
const copy=(key,locale)=>rows.find(row=>row.key==='UI:member.'+key)?.[locale==='zh-Hant'?'zh_TW':locale];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6oAAAAABJRU5ErkJggg==','base64');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||chromium.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage']});
 try{for(const locale of (process.env.QA_ONE?['zh-Hant']:['zh-Hant','en','jp','th']))for(const theme of (process.env.QA_ONE?['dark']:['light','dark']))for(const width of (process.env.QA_ONE?[390]:[390,1440])){
  const context=await browser.newContext({viewport:{width,height:950},serviceWorkers:'block'});
  await context.addInitScript(({locale,theme})=>{localStorage.setItem('rangerbook-language',locale);localStorage.setItem('rangerbook-theme',theme);},{locale,theme});
  let user={logged_in:true,account:'fixture-user',role:'user'},factor=false,email=null,proof=0,reauthRate=false,offline=false,hold=false,release;
  let loginMfa=false,invalidLink=false;
  const calls=[],errors=[],outbound=[];
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.hostname==='rangerbook-auth.warmycat.com'){
      calls.push({path:url.pathname,method:req.method(),body:req.postData()});
      const headers={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Expose-Headers':'Retry-After'};
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
      const body=req.postData()?JSON.parse(req.postData()):{};
      if(offline)return route.abort();
      if(url.pathname==='/auth/reauth'){
        if(hold)await new Promise(resolve=>{release=resolve;});
        if(reauthRate)return route.fulfill({status:429,json:{detail:'member.rateLimited'},headers:{...headers,'Retry-After':'1'}});
        proof=600;
      }
      if(url.pathname==='/auth/login'){
        if(body.password==='wrong')return route.fulfill({status:401,json:{detail:'member.badProof'},headers});
        user={account:'fixture-user',role:'user',logged_in:!loginMfa,mfa_required:loginMfa};
      }
      if(url.pathname==='/auth/2fa/verify'){
        if(body.code==='000000')return route.fulfill({status:401,json:{detail:'member.badProof'},headers});
        user.logged_in=true;user.mfa_required=false;
      }
      if(url.pathname==='/auth/2fa/disable'){factor=false;user={logged_in:false,role:'user'};proof=0;}
      if(url.pathname==='/auth/2fa/enable'){factor=true;user.logged_in=true;user.setup_required=false;proof=0;}
      if(url.pathname==='/auth/google/unlink')email=null;
      if(url.pathname==='/auth/logout')user={logged_in:false,role:'user'};
      if(url.pathname==='/auth/password/reset'){user={logged_in:false,role:'user'};}
      if(invalidLink&&['/auth/password/reset/check','/auth/email/verify'].includes(url.pathname))return route.fulfill({status:400,json:{detail:'member.invalidLink'},headers});
      let data={ok:true};
      if(url.pathname==='/auth/login'||url.pathname==='/auth/me')data=user;
      if(url.pathname==='/auth/features')data={members_v2:true,google:true,registration:true,turnstile_site_key:'fixture-key',member_navigation:false};
      if(url.pathname==='/auth/security')data={totp_enabled:factor,totp_required:user.role==='super_admin',google_email:email,reauth_valid_for:proof};
      if(url.pathname==='/auth/2fa/setup')data={manual_key:'FIXTUREONLY',qr:'data:image/png;base64,'+png.toString('base64')};
      if(url.pathname==='/auth/2fa/enable'||url.pathname==='/auth/2fa/recovery-codes')data={recovery_codes:['FIXTURE-CODE-ONE']};
      if(url.pathname==='/auth/google/start')data={url:'https://accounts.google.com/o/oauth2/v2/auth?state=fixture'};
      if(url.pathname==='/member/game-binding/status')data={bound:false};
      if(url.pathname.startsWith('/admin/'))data={items:[]};
      return route.fulfill({json:data,headers});
    }
    if(url.hostname==='challenges.cloudflare.com')return route.fulfill({contentType:'text/javascript',body:'window.turnstile={render:(mount,options)=>{options.callback("fixture-captcha");return 1},reset:()=>{}};window.rbTurnstileReady();'});
    if(url.hostname==='accounts.google.com')return route.fulfill({contentType:'text/html',body:'<h1>Fixture OAuth provider</h1>'});
    if(url.origin!==base){outbound.push(url.href);return route.abort();}
    let name=decodeURIComponent(url.pathname).slice(1);if(name.endsWith('/')||!name)name+='index.html';
    const file=path.join(root,name);
    if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
    return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const go=async route=>{await page.goto(base+route);await page.evaluate(()=>window.RangerbookI18n?.ready);};
  const menu=async()=>{if(width<1000&&!await page.locator('.gt-sidebar').isVisible())await page.locator('.site-menu-toggle').click();};
  const assertPage=async()=>{
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No horizontal overflow');
    assert.equal(await page.locator('.member-banner').count(),1);
    assert.ok((await page.locator('.member-banner h1').innerText()).trim());
  };
  await go('/account/');await page.locator('#memberSecurityArea').waitFor();
  assert.equal(await page.locator('.member-banner h1').innerText(),copy('security',locale));
  assert.equal(await page.locator('#memberSettings').isDisabled(),true);
  await menu();assert.equal(await page.locator('.gt-user-navigation a[href$="/personal-teams/"]').isVisible(),true);
  assert.equal(await page.locator('.gt-sidebar-admin-entry').isVisible(),false);
  if(width<1000)await page.keyboard.press('Escape');
  hold=true;
  await page.locator('#memberReauthForm input').fill('fixture-password');await page.locator('#memberReauthForm button').click();
  await page.waitForFunction(()=>document.querySelector('#memberReauthForm').getAttribute('aria-busy')==='true');
  await page.evaluate(()=>document.querySelector('#memberReauthForm').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true})));
  assert.equal(calls.filter(x=>x.path==='/auth/reauth'&&x.method==='POST').length,1);
  hold=false;release();
  await page.waitForFunction(()=>document.querySelector('#memberReauthForm input').disabled);
  assert.match(await page.locator('#memberProofStatus').innerText(),/10:00|09:59/);
  assert.equal(await page.locator('#memberReauthForm input').inputValue(),'');
  assert.equal(await page.locator('#memberSettings').isDisabled(),false);
  await assertPage();
  if(process.env.QA_SCREENSHOTS&&locale==='zh-Hant')await page.screenshot({path:process.env.QA_SCREENSHOTS+`/security-${width}-${theme}.png`,fullPage:true});
  // Rehydrate a server-expired proof; settings stay locked on reload.
  proof=1;await page.reload();await page.waitForFunction(()=>document.querySelector('#memberSettings').disabled);
  await page.waitForFunction(()=>document.querySelector('#memberState').textContent.length>0);
  assert.match(await page.locator('#memberState').innerText(),new RegExp(copy('proofExpired',locale).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  proof=0;reauthRate=true;await page.reload();await page.locator('#memberReauthForm input').fill('fixture-password');await page.locator('#memberReauthForm button').click();
  await page.waitForFunction(()=>document.querySelector('#memberReauthForm button').disabled);
  await page.waitForFunction(()=>!document.querySelector('#memberReauthForm button').disabled);reauthRate=false;
  await page.locator('#memberReauthForm button').click();await page.waitForFunction(()=>document.querySelector('#memberSettings').disabled===false);
  await page.locator('#memberSetup').click();await page.waitForURL('**/two-factor/');await page.locator('#memberSetup:not(:disabled)').waitFor();
  await page.locator('#memberSetup').click();await page.locator('#memberSetupPanel').waitFor();
  assert.equal(await page.locator('#memberManualKey').innerText(),'FIXTUREONLY');await assertPage();
  await page.locator('#memberCancelSetup').click();await page.waitForURL('**/account/');
  assert.ok(calls.some(x=>x.path==='/auth/2fa/cancel'));
  await go('/two-factor/');await page.locator('#memberSetup:not(:disabled)').waitFor();await page.locator('#memberSetup').click();
  await page.locator('#memberEnableForm input').fill('123456');await page.locator('#memberEnableForm button').click();await page.locator('#memberRecoveryPanel').waitFor();
  assert.match(await page.locator('#memberRecovery').innerText(),/FIXTURE-CODE-ONE/);
  assert.ok(!/FIXTURE|fixture-password/.test(await page.evaluate(()=>JSON.stringify({...localStorage}))));
  const download=page.waitForEvent('download');await page.locator('#memberDownloadCodes').click();assert.equal((await download).suggestedFilename(),'rangerbook-recovery-codes.txt');
  await page.locator('#memberHideCodes').click();assert.equal(await page.locator('#memberRecovery').innerText(),'');
  // Google callback updates the linked email; unlink and disable require an explicit current factor.
  proof=600;email='fixture@example.test';await go('/account/#google=ok');await page.locator('#memberGoogle .member-operation-status.success').waitFor();
  assert.equal(await page.locator('#memberGoogleStatus').innerText(),email);
  assert.equal(await page.locator('#memberGoogleStart').innerText(),copy('replaceGoogle',locale));
  await page.locator('#memberGoogleUnlink').click();await page.locator('#memberConfirmDialog').waitFor();
  await page.locator('#memberConfirmForm input').fill('123456');await page.locator('#memberConfirmForm button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#memberGoogleUnlink').hidden);
  assert.equal(calls.filter(x=>x.path==='/auth/google/unlink'&&x.method==='POST').length,1);
  await page.locator('#memberGoogleStart').click();await page.locator('#memberConfirmForm input').fill('234567');await page.locator('#memberConfirmForm button[type=submit]').click();
  await page.waitForURL('https://accounts.google.com/**');
  assert.equal(JSON.parse(calls.findLast(x=>x.path==='/auth/google/start'&&x.method==='POST').body).code,'234567');
  proof=600;await go('/account/');await page.locator('#memberDisable').click();await page.locator('#memberConfirmForm input').fill('345678');await page.locator('#memberConfirmForm button[type=submit]').click();
  await page.locator('#memberLoginGate').waitFor();
  // Login is independent and always finishes at the homepage, including recovery-code MFA.
  await go('/login/');await page.locator('#memberLoginForm input[name=account]').fill('fixture-user');await page.locator('#memberLoginForm input[name=password]').fill('wrong');await page.locator('#memberLoginForm button').click();
  await page.locator('#memberState.error').waitFor();
  await page.locator('#memberLoginForm input[name=password]').fill('fixture-password');await page.locator('#memberLoginForm button').click();await page.waitForURL(base+'/');
  user={logged_in:false,role:'user'};loginMfa=true;await go('/login/');
  await page.locator('#memberLoginForm input[name=account]').fill('fixture-user');await page.locator('#memberLoginForm input[name=password]').fill('fixture-password');await page.locator('#memberLoginForm button').click();await page.locator('#memberLoginFactor').waitFor();
  await page.locator('#memberLoginFactorForm input').fill('000000');await page.locator('#memberLoginFactorForm button[type=submit]').click();await page.locator('#memberState.error').waitFor();
  await page.locator('#memberUseRecovery').click();await page.locator('#memberLoginFactorForm input').fill('FIXTURE-RECOVERY');await page.locator('#memberLoginFactorForm button[type=submit]').click();await page.waitForURL(base+'/');
  user={logged_in:false,role:'user'};await go('/register/');await page.locator('#adminRegisterForm input[name=account]').fill('fixture-new');await page.locator('#adminRegisterForm input[name=email]').fill('fixture@outlook.test');
  await page.locator('#adminRegisterForm input[name=password]').fill('fixture-password');await page.locator('#adminRegisterForm input[name=confirm]').fill('fixture-password');await page.locator('#adminRegisterForm button').click();await page.locator('#memberRegistrationSent').waitFor();
  assert.equal(await page.locator('#memberRegistrationResend').isDisabled(),true);await assertPage();
  await go('/forgot-password/');await page.locator('#memberForgotForm input').fill('missing-account');
  assert.equal(await page.locator('#memberForgotForm select option').count(),2);
  await page.locator('#memberForgotForm select').selectOption('google');await page.locator('#memberForgotForm button').click();await page.locator('#memberMailSent').waitFor();
  assert.equal(await page.locator('#memberForgotResend').isDisabled(),true);assert.ok(!(await page.locator('#memberMailSent').innerText()).includes('fixture@'));
  await assertPage();
  await go('/account-action/#reset='+'x'.repeat(64));await page.locator('#memberResetForm').waitFor();assert.equal(new URL(page.url()).hash,'');
  await page.locator('#memberResetForm input[name=password]').fill('fixture-password');await page.locator('#memberResetForm input[name=confirm]').fill('fixture-password');await page.locator('#memberResetForm button').click();
  await page.waitForFunction(()=>document.querySelector('#memberResetForm').hidden);assert.equal(await page.locator('.member-banner h1').innerText(),copy('resetSuccess',locale));
  await go('/account-action/#verify='+'y'.repeat(64));await page.waitForFunction(()=>document.querySelector('.member-banner h1').dataset.i18n==='member.emailSuccess');
  assert.equal(new URL(page.url()).hash,'');assert.equal(await page.locator('#memberActionLogin').isVisible(),true);
  invalidLink=true;await go('/account-action/#reset='+'z'.repeat(64));await page.locator('#memberActionStatus.error').waitFor();assert.equal(await page.locator('#memberResetForm').isVisible(),false);assert.equal(await page.locator('#memberActionAgain').isVisible(),true);invalidLink=false;
  // Guest, member, administrator and super-admin sidebar states, including immediate auth events.
  await go('/forgot-password/');await menu();
  for(const role of ['user','admin','super_admin']){
    await page.evaluate(role=>window.dispatchEvent(new CustomEvent('rangerbook:auth-changed',{detail:{logged_in:true,role}})),role);
    assert.equal(await page.locator('.gt-sidebar-admin-entry').isVisible(),role!=='user');
    assert.equal(await page.locator('.gt-user-navigation a[href$="/personal-teams/"]').isVisible(),true);
  }
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('rangerbook:auth-changed',{detail:{logged_in:false,role:'user'}})));
  assert.equal(await page.locator('.gt-user-navigation a[href$="/login/"]').isVisible(),true);
  if(width<1000)await page.keyboard.press('Escape');
  offline=true;await page.locator('#memberForgotForm input').fill('fixture-user');await page.locator('#memberForgotForm button').click();await page.locator('#memberState.error').waitFor();assert.equal(await page.locator('#memberState').innerText(),copy('networkError',locale));offline=false;
  assert.ok(!outbound.some(url=>/google-analytics|googletagmanager/.test(url)),'Private pages never request analytics');
  assert.deepEqual(errors,[]);
  console.log('MEMBER_BROWSER_OK',locale,theme,width);
  await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
