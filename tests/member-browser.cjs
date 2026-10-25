/* Browser interaction tests with explicit provider/API fixtures; no production traffic. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base='https://member-ui.invalid';
const rows=JSON.parse(fs.readFileSync(path.join(root,'assets/locales/sitewide-overrides.json'),'utf8'));
const copy=(key,locale)=>rows.find(row=>row.key==='UI:member.'+key)?.[locale==='zh-Hant'?'zh_TW':locale];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6oAAAAABJRU5ErkJggg==','base64');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||chromium.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage']});
 try{for(const locale of (process.env.QA_ONE?['zh-Hant']:['zh-Hant','en','jp','th']))for(const theme of (process.env.QA_ONE?['dark']:['light','dark']))for(const width of (process.env.QA_ONE?[390]:[390,768,1440,1920])){
  const context=await browser.newContext({viewport:{width,height:950},serviceWorkers:'block'});
  await context.addInitScript(({locale,theme})=>{localStorage.setItem('rangerbook-language',locale);localStorage.setItem('rangerbook-theme',theme);},{locale,theme});
  let user={logged_in:true,account:'fixture-user',role:'user'},factor=false,email=null,proof=0,reauthRate=false,offline=false,hold=false,release;
  let accountRace=false,accountOffline=false;
  let loginMfa=false,loginPasswordChange=false,invalidLink=false,failCancel=false,expireFactor=false,mailPaused=false;
  let gameChallenge=null,gameBound=false,swapAttempts=0,searchMode="results";
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
      if(url.pathname==='/auth/logout'&&failCancel)return route.abort();
      if(url.pathname==='/auth/login'){
        if(body.password==='wrong')return route.fulfill({status:401,json:{detail:'member.badProof'},headers});
        user={account:body.account,role:'user',logged_in:!loginMfa&&!loginPasswordChange,mfa_required:loginMfa,must_change_password:loginPasswordChange};
      }
      if(url.pathname==='/auth/2fa/verify'){
        if(expireFactor){user={logged_in:false,role:'user'};return route.fulfill({status:401,json:{detail:'member.loginRequired'},headers});}
        if(body.code==='999999')return route.fulfill({status:429,json:{detail:'member.rateLimited'},headers:{...headers,'Retry-After':'900'}});
        if(body.code==='000000')return route.fulfill({status:401,json:{detail:'member.badProof'},headers});
        user.logged_in=!user.must_change_password;user.mfa_required=false;
      }
      if(url.pathname==='/auth/change-password'){user.must_change_password=false;user.logged_in=true;}
      if(url.pathname==='/auth/2fa/disable'){factor=false;user={logged_in:false,role:'user'};proof=0;}
      if(url.pathname==='/auth/2fa/enable'){factor=true;user.logged_in=true;user.setup_required=false;proof=0;}
      if(url.pathname==='/auth/google/unlink')email=null;
      if(url.pathname==='/auth/logout')user={logged_in:false,role:'user'};
      if(url.pathname==='/auth/password/reset'){user={logged_in:false,role:'user'};}
      if(invalidLink&&['/auth/password/reset/check','/auth/email/verify'].includes(url.pathname))return route.fulfill({status:400,json:{detail:'member.invalidLink'},headers});
      let data={ok:true};
      if(url.pathname==='/auth/login'||url.pathname==='/auth/me')data=user;
      if(url.pathname==='/auth/account/availability'){
        if(accountOffline)return route.abort();
        data={available:body.account!=='fixture-used'};
      }
      if(url.pathname==='/auth/register'&&accountRace)return route.fulfill({status:409,json:{detail:'member.accountTaken'},headers});
      if(url.pathname==='/auth/features')data={members_v2:true,google:true,registration:true,mail:!mailPaused,turnstile_site_key:'fixture-key',member_navigation:false};
      if(url.pathname==='/auth/security')data={totp_enabled:factor,totp_required:user.role==='super_admin',google_email:email,reauth_valid_for:proof};
      if(url.pathname==='/auth/2fa/setup')data={manual_key:'FIXTUREONLY',qr:'data:image/png;base64,'+png.toString('base64')};
      if(url.pathname==='/auth/2fa/enable'||url.pathname==='/auth/2fa/recovery-codes')data={recovery_codes:['FIXTURE-CODE-ONE']};
      if(url.pathname==='/auth/google/start')data={url:'https://accounts.google.com/o/oauth2/v2/auth?state=fixture'};
      if(url.pathname==='/member/game-binding/status')data={bound:gameBound,challenge:gameChallenge,player:{player_name:'Fixture',guild_name:'Fixture Guild',last_imported_at:'2026-10-24T01:02:03Z'}};
      if(url.pathname==='/member/game-players/search'){
        if(searchMode==='error')return route.fulfill({status:503,json:{detail:'搜尋暫時不可用'},headers});
        data={items:searchMode==='empty'?[]:[{candidateId:'fixture-candidate',name:'Fixture <img src=x>',guildName:'Fixture Guild'}]};
      }
      if(url.pathname==='/member/game-binding/start'){
        if(body.medal==='0')return route.fulfill({status:400,json:{detail:'公會獎牌數量不符，請確認後重試。'},headers});
        gameChallenge={challengeId:'fixture-challenge',team:3,side:'A',firstPosition:2,secondPosition:5,expiresAt:new Date(Date.now()+600000).toISOString()};data=gameChallenge;
      }
      if(url.pathname==='/member/game-binding/verify'){
        if(++swapAttempts===1)data={verified:false,message:'尚未偵測到指定的正確位置交換，請確認遊戲已儲存隊伍。'};
        else {gameBound=true;gameChallenge=null;data={verified:true};}
      }
      if(url.pathname==='/member/personal-teams')data={bound:gameBound,teams:{pvpteam:[],guildwar:[]}};
      if(url.pathname.startsWith('/admin/'))data={items:[]};
      return route.fulfill({json:data,headers});
    }
    if(url.hostname==='challenges.cloudflare.com')return route.fulfill({contentType:'text/javascript',body:'window.turnstile={render:(mount,options)=>{options.callback("fixture-captcha");return 1},reset:()=>{}};window.rbTurnstileReady();'});
    if(url.hostname==='accounts.google.com')return route.fulfill({contentType:'text/html',body:'<h1>Fixture OAuth provider</h1>'});
    if(url.origin!==base){outbound.push({url:url.href,frame:req.frame().url()});return route.abort();}
    let name=decodeURIComponent(url.pathname).slice(1);if(name.endsWith('/')||!name)name+='index.html';
    const file=path.join(root,name);
    if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
    return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const go=async route=>{await page.goto(base+route);try{await page.evaluate(()=>window.RangerbookI18n?.ready);}catch(error){if(!/Execution context was destroyed/.test(error.message))throw error;await page.waitForLoadState('load');await page.evaluate(()=>window.RangerbookI18n?.ready);}};
  const menu=async()=>{if(width<1000&&!await page.locator('.gt-sidebar').isVisible())await page.locator('.site-menu-toggle').click();};
  const bannerMetrics=()=>page.locator('.page-title').evaluate(el=>{
    const box=el.getBoundingClientRect(),style=getComputedStyle(el);
    const keys=['fontSize','fontWeight','lineHeight','letterSpacing','color','marginTop','marginBottom'];
    const text=selector=>Object.fromEntries(keys.map(key=>[key,getComputedStyle(el.querySelector(selector))[key]]));
    return {x:box.x,width:box.width,padding:style.padding,border:style.border,borderLeft:style.borderLeft,borderRadius:style.borderRadius,background:style.backgroundColor,title:text('h1'),brand:text('.eyebrow'),subtitle:text('p:last-child')};
  });
  await go('/ranger/');
  const queryBanner=await bannerMetrics();
  const assertPage=async()=>{
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No horizontal overflow');
    assert.equal(await page.locator('.member-banner').count(),1);
    assert.ok((await page.locator('.member-banner h1').innerText()).trim());
    assert.equal(await page.locator('.member-banner-brand').innerText(),'LINE RANGERS DATABASE');
    assert.deepEqual(await bannerMetrics(),queryBanner,'Uses the actual data-query page width and banner styles');
    const banner=await page.locator('.member-banner').boundingBox();
    for(const card of await page.locator('.admin-card:visible').all()){
      const box=await card.boundingBox();
      assert.ok(Math.abs(box.x-banner.x)<=1&&Math.abs(box.width-banner.width)<=1,'Card edges match banner');
    }
    const contrast=await page.evaluate(()=>{
      const button=[...document.querySelectorAll('button[type=submit]')].find(x=>!x.disabled&&x.getBoundingClientRect().height);
      if(!button)return 100;
      const luminance=value=>{const rgb=value.match(/[0-9.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
      const style=getComputedStyle(button),a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
    assert.ok(contrast>=4.5,'Submit text contrast '+contrast);

  };
  await go('/account/');await page.locator('#memberSecurityArea').waitFor();
  assert.equal(await page.locator('.member-banner h1').innerText(),copy('security',locale));
  assert.equal(await page.locator('#memberSettings').evaluate(el=>el.disabled),true);
  await menu();assert.equal(await page.locator('.gt-user-navigation a[href$="/personal-teams/"]').isVisible(),true);
  assert.equal(await page.locator('.gt-sidebar-admin-entry').isVisible(),false);
  if(width<1000)await page.keyboard.press('Escape');
  hold=true;
  await page.locator('#memberReauthForm input').fill('fixture-password');await page.locator('#memberReauthForm button').click();
  await page.waitForFunction(()=>document.querySelector('#memberReauthForm').getAttribute('aria-busy')==='true');
  await page.evaluate(()=>document.querySelector('#memberReauthForm').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true})));
  assert.equal(calls.filter(x=>x.path==='/auth/reauth'&&x.method==='POST').length,1);
  hold=false;release();
  await page.waitForFunction(()=>!document.querySelector('#memberReauthForm').hasAttribute('aria-busy')&&document.querySelector('#memberReauthForm input').disabled);
  assert.match(await page.locator('#memberProofStatus').innerText(),/10:00|09:59/);
  assert.equal(await page.locator('#memberReauthForm input').inputValue(),'');
  assert.equal(await page.locator('#memberSettings').evaluate(el=>el.disabled),false);
  await assertPage();
  assert.equal(await page.locator('[data-i18n="member.passwordGuide"],#memberGoogleNext').count(),0);
  if(process.env.QA_SCREENSHOTS&&locale==='zh-Hant')await page.screenshot({path:process.env.QA_SCREENSHOTS+`/security-${width}-${theme}.png`,fullPage:true});
  // Rehydrate a server-expired proof; settings stay locked on reload.
  proof=1;await page.reload();await page.waitForFunction(()=>document.querySelector('#memberSettings').disabled);
  await page.waitForFunction(()=>document.querySelector('#memberState').textContent.length>0);
  assert.match(await page.locator('#memberState').innerText(),new RegExp(copy('proofExpired',locale).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  proof=0;reauthRate=true;await page.reload();await page.locator('#memberReauthForm input').fill('fixture-password');await page.locator('#memberReauthForm button').click();
  await page.waitForFunction(()=>document.querySelector('#memberReauthForm button').disabled);
  await page.waitForFunction(()=>!document.querySelector('#memberReauthForm button').disabled);reauthRate=false;
  await page.locator('#memberReauthForm input').fill('fixture-password');await page.locator('#memberReauthForm button').click();await page.waitForFunction(()=>document.querySelector('#memberSettings').disabled===false);
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
  assert.equal(await page.locator('#memberFactorStatus').innerText(),copy('factorConfigured',locale));
  assert.equal(await page.locator('#memberGoogleStart').innerText(),copy('replaceGoogle',locale));
  await page.locator('#memberGoogleUnlink').click();await page.locator('#memberConfirmDialog').waitFor();
  await page.locator('#memberConfirmForm input').fill('123456');await page.locator('#memberConfirmForm button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#memberGoogleUnlink').hidden);
  assert.equal(calls.filter(x=>x.path==='/auth/google/unlink'&&x.method==='POST').length,1);
  await page.locator('#memberGoogleStart').click();await page.locator('#memberConfirmDialog').waitFor();
  const factorBox=await page.locator('#memberConfirmForm input').boundingBox(),recoveryBox=await page.locator('#memberDialogRecovery').boundingBox();
  assert.ok(recoveryBox.y>=factorBox.y+factorBox.height+8,'Recovery toggle is below the factor input');
  assert.ok(Math.abs(recoveryBox.x-factorBox.x)<=1&&Math.abs(recoveryBox.width-factorBox.width)<=1,'Recovery toggle aligns with the input');
  assert.equal(await page.locator('#memberDialogRecovery').innerText(),copy('useRecovery',locale));
  await page.locator('#memberDialogRecovery').click();assert.equal(await page.locator('#memberConfirmForm input').getAttribute('inputmode'),'text');
  await page.locator('#memberDialogRecovery').click();assert.equal(await page.locator('#memberConfirmForm input').getAttribute('inputmode'),'numeric');
  if(process.env.QA_SCREENSHOTS&&locale==='zh-Hant')await page.screenshot({path:process.env.QA_SCREENSHOTS+`/google-factor-${width}-${theme}.png`,fullPage:true});
  await page.locator('#memberConfirmForm input').fill('234567');await page.locator('#memberConfirmForm button[type=submit]').click();
  await page.waitForURL('https://accounts.google.com/**');
  assert.equal(JSON.parse(calls.findLast(x=>x.path==='/auth/google/start'&&x.method==='POST').body).code,'234567');
  proof=600;await go('/account/');await page.locator('#memberDisable').click();await page.locator('#memberConfirmForm input').fill('345678');await page.locator('#memberConfirmForm button[type=submit]').click();
  await page.locator('#memberLoginGate').waitFor();
  // Login is independent and always finishes at the homepage, including recovery-code MFA.
  await go('/login/');await assertPage();
  assert.deepEqual(await page.locator('.member-login-links a').evaluateAll(nodes=>nodes.map(a=>new URL(a.href).pathname)),['/forgot-password/','/register/']);
  const baselines=await page.evaluate(()=>{
    const textBox=el=>{const r=document.createRange();r.selectNodeContents(el);const box=r.getBoundingClientRect();return box.bottom;};
    const link=document.querySelector('.member-login-links a:last-child'),button=document.querySelector('.member-login-actions button');
    return [textBox(link),textBox(button),getComputedStyle(link).borderWidth,getComputedStyle(link).backgroundColor];
  });
  assert.ok(Math.abs(baselines[0]-baselines[1])<=1,'Login and last link text baseline');
  assert.equal(baselines[2],'0px');assert.equal(baselines[3],'rgba(0, 0, 0, 0)');
  if(process.env.QA_SCREENSHOTS&&locale==='zh-Hant')await page.screenshot({path:process.env.QA_SCREENSHOTS+`/login-${width}-${theme}.png`,fullPage:true});
  await page.locator('#memberLoginForm input[name=account]').fill('fixture-user');await page.locator('#memberLoginForm input[name=password]').fill('wrong');await page.locator('#memberLoginForm button').click();
  await page.locator('#memberState.error').waitFor();
  await page.locator('#memberLoginForm input[name=password]').fill('fixture-password');await page.locator('#memberLoginForm button').click();await page.waitForURL(base+'/');
  user={logged_in:false,role:'user'};loginMfa=true;await go('/login/');
  await page.locator('#memberLoginForm input[name=account]').fill('fixture-user');await page.locator('#memberLoginForm input[name=password]').fill('fixture-password');await page.locator('#memberLoginForm button').click();await page.locator('#memberLoginFactor').waitFor();
  assert.equal(await page.locator('#memberLoginCard').isVisible(),false);await assertPage();
  await page.locator('#memberLoginFactorForm input').fill('000000');await page.locator('#memberLoginFactorForm button[type=submit]').click();await page.locator('#memberState.error').waitFor();
  await page.reload();await page.locator('#memberLoginFactor').waitFor();
  await page.locator('#memberLoginFactorForm input').fill('999999');await page.locator('#memberLoginFactorForm button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#memberLoginFactorForm button[type=submit]').disabled);
  await page.locator('#memberUseRecovery').click();
  failCancel=true;await page.locator('#memberCancelLogin').click();await page.locator('#memberState.error').waitFor();
  assert.equal(await page.locator('#memberLoginFactor').isVisible(),true,'Failed logout retains pending state');
  failCancel=false;await page.locator('#memberCancelLogin').click();await page.locator('#memberLoginCard').waitFor();
  assert.equal(user.logged_in,false);assert.equal(user.mfa_required,undefined);
  assert.equal(await page.locator('#memberLoginFactor').isVisible(),false);
  assert.equal(await page.locator('#memberLoginForm input[name=account]').inputValue(),'');
  assert.equal(await page.locator('#memberLoginFactorForm input').inputValue(),'');
  assert.equal(await page.locator('#memberUseRecovery').innerText(),copy('useRecovery',locale));
  assert.equal(await page.locator('#memberLoginFactorForm button[type=submit]').isDisabled(),false,'Old factor cooldown is not inherited by another account');
  loginMfa=false;await page.locator('#memberLoginForm input[name=account]').fill('fixture-other');await page.locator('#memberLoginForm input[name=password]').fill('fixture-password');await page.locator('#memberLoginForm button').click();await page.waitForURL(base+'/');
  assert.equal(user.account,'fixture-other');
  user={logged_in:false,role:'user',mfa_required:true};await go('/login/');await page.locator('#memberLoginFactor').waitFor();
  expireFactor=true;await page.locator('#memberLoginFactorForm input').fill('123456');await page.locator('#memberLoginFactorForm button[type=submit]').click();
  await page.locator('#memberLoginCard').waitFor();await page.locator('#memberState.error').waitFor();
  assert.equal(await page.locator('#memberState').innerText(),copy('loginExpired',locale));expireFactor=false;loginMfa=true;
  // Rehydrated pending sessions also expose a sidebar logout on other pages.
  user={logged_in:false,role:'user',mfa_required:true};await go('/');await menu();
  await page.locator('.gt-user-navigation button[data-i18n="member.logout"]').click();
  await page.waitForFunction(()=>document.querySelector('.gt-logout-status').hidden&&document.querySelector('.gt-logout-status').textContent==='');
  await go('/login/');assert.equal(await page.locator('#memberLoginCard').isVisible(),true);
  await page.locator('#memberLoginForm input[name=account]').fill('fixture-user');await page.locator('#memberLoginForm input[name=password]').fill('fixture-password');await page.locator('#memberLoginForm button').click();await page.locator('#memberLoginFactor').waitFor();
  await page.locator('#memberUseRecovery').click();await page.locator('#memberLoginFactorForm input').fill('FIXTURE-RECOVERY');await page.locator('#memberLoginFactorForm button[type=submit]').click();await page.waitForURL(base+'/');
  // A required password replacement follows a successful factor; it is not a second MFA challenge.
  for(const required of [false,true]){
    user={logged_in:false,role:'user'};loginPasswordChange=required;loginMfa=true;await go('/login/');
    await page.locator('#memberLoginForm input[name=account]').fill('fixture-user');await page.locator('#memberLoginForm input[name=password]').fill('fixture-password');await page.locator('#memberLoginForm button').click();await page.locator('#memberLoginFactor').waitFor();
    const verifies=calls.filter(x=>x.path==='/auth/2fa/verify').length;
    await page.locator('#memberLoginFactorForm input').fill('123456');await page.locator('#memberLoginFactorForm button[type=submit]').click();
    if(required){
      await page.waitForURL(base+'/account/');await page.locator('#memberPasswordForm').waitFor();
      assert.equal(await page.locator('#memberState').innerText(),copy('passwordRequired',locale));
      assert.equal(await page.locator('#memberProof').isVisible(),false);
      assert.equal(await page.locator('#memberGoogle').isVisible(),false);
      await page.reload();await page.locator('#memberPasswordForm').waitFor();
      assert.equal(await page.locator('#memberProof').isVisible(),false);
      await page.locator('#memberPasswordForm input[name=current_password]').fill('fixture-password');
      await page.locator('#memberPasswordForm input[name=new_password]').fill('fixture-new-password');
      await page.locator('#memberPasswordForm input[name=confirm]').fill('fixture-new-password');
      await page.locator('#memberPasswordForm button').click();
    }
    await page.waitForURL(base+'/');assert.equal(user.logged_in,true);assert.equal(user.mfa_required,false);
    assert.equal(calls.filter(x=>x.path==='/auth/2fa/verify').length,verifies+1,'Exactly one accepted factor, no MFA loop');
    await menu();await page.locator('.gt-user-navigation a[href="/personal-teams/"]').waitFor();
  }
  loginPasswordChange=false;
  user={logged_in:false,role:'user'};await go('/register/');
  const accountInput=page.locator('#adminRegisterForm input[name=account]');
  await accountInput.fill('fixture-used');await accountInput.blur();
  await page.waitForFunction(()=>document.querySelector('[name=account]').validity.customError);
  assert.equal(await accountInput.getAttribute('aria-invalid'),'true');
  assert.equal(await page.locator('#memberAccountStatus').innerText(),copy('accountTaken',locale));
  await accountInput.fill('fixture-new');await accountInput.blur();
  await page.waitForFunction(()=>document.querySelector('#memberAccountStatus').classList.contains('success'));
  assert.equal(await accountInput.getAttribute('aria-invalid'),null);
  assert.equal(await page.locator('#memberAccountStatus').innerText(),copy('accountAvailable',locale));await page.locator('#adminRegisterForm input[name=email]').fill('fixture@outlook.test');
  await page.locator('#adminRegisterForm input[name=password]').fill('fixture-password');await page.locator('#adminRegisterForm input[name=confirm]').fill('fixture-password');
  const registerCount=()=>calls.filter(x=>x.path==='/auth/register').length;
  const beforeRegister=registerCount();accountOffline=true;
  await page.locator('#adminRegisterForm button').click();await page.locator('#memberState.error').waitFor();
  assert.equal(registerCount(),beforeRegister,'Network failure blocks registration');accountOffline=false;
  accountRace=true;await page.locator('#adminRegisterForm button').click();
  await page.waitForFunction(()=>document.querySelector('[name=account]').validity.customError);
  assert.equal(await page.locator('#memberRegistrationSent').isVisible(),false,'409 never shows mail sent');
  assert.equal(await page.locator('#memberAccountStatus').innerText(),copy('accountTaken',locale));
  accountRace=false;await accountInput.fill('fixture-final');
  await page.evaluate(()=>window.rbTurnstileReady());
  await page.locator('#adminRegisterForm input[name=password]').fill('fixture-password');
  await page.locator('#adminRegisterForm input[name=confirm]').fill('fixture-password');
  await page.locator('#adminRegisterForm button').click();await page.locator('#memberRegistrationSent').waitFor();
  assert.equal(await page.locator('#memberRegistrationResend').isDisabled(),true);await assertPage();
  assert.equal(JSON.parse(calls.findLast(x=>x.path==='/auth/register').body).locale,locale);
  await go('/forgot-password/');await page.locator('#memberForgotForm input').fill('missing-account');
  assert.equal(await page.locator('#memberForgotForm select option').count(),2);
  const confirmWidth=(await page.locator('#memberForgotConfirm').boundingBox()).width;
  mailPaused=true;const beforePaused=calls.filter(x=>x.path==='/auth/password/forgot').length;
  await page.locator('#memberForgotConfirm').click();await page.locator('#memberState.error').waitFor();
  assert.equal(await page.locator('#memberState').innerText(),copy('mailPaused',locale));
  assert.equal(calls.filter(x=>x.path==='/auth/password/forgot').length,beforePaused);
  mailPaused=false;
  await page.locator('#memberForgotForm select').selectOption('google');await page.locator('#memberForgotConfirm').click();await page.locator('#memberMailSent').waitFor();
  assert.equal(JSON.parse(calls.findLast(x=>x.path==='/auth/password/forgot').body).locale,locale);
  assert.equal(await page.locator('#memberForgotResend').isDisabled(),true);assert.ok(!(await page.locator('#memberMailSent').innerText()).includes('fixture@'));
  assert.equal(await page.locator('main .admin-card').count(),1);
  assert.equal(await page.getByText(copy('resetSent',locale),{exact:true}).count(),1,'One generic success message');
  for(const control of ['#memberForgotResend','#memberMailSent a'])assert.ok(Math.abs((await page.locator(control).boundingBox()).width-confirmWidth)<=1,'Resend and home use full confirm width');
  const rescueCalls=calls.filter(x=>x.path==='/auth/password/forgot').length;
  await page.locator('#memberForgotForm input').press('Enter');
  assert.equal(calls.filter(x=>x.path==='/auth/password/forgot').length,rescueCalls,'Enter respects resend cooldown');
  await assertPage();
  await go('/account-action/#reset='+'x'.repeat(64));await page.locator('#memberResetForm').waitFor();assert.equal(new URL(page.url()).hash,'');
  await page.locator('#memberResetForm input[name=password]').fill('fixture-password');await page.locator('#memberResetForm input[name=confirm]').fill('fixture-password');await page.locator('#memberResetForm button').click();
  await page.waitForFunction(()=>document.querySelector('#memberResetForm').hidden);assert.equal(await page.locator('.member-banner h1').innerText(),copy('resetSuccess',locale));
  await go('/account-action/#verify='+'y'.repeat(64));await page.waitForFunction(()=>document.querySelector('.member-banner h1')?.dataset.i18n==='member.emailSuccess');
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
  offline=true;await page.locator('#memberForgotForm input').fill('fixture-user');await page.locator('#memberForgotConfirm').click();await page.locator('#memberState.error').waitFor();assert.equal(await page.locator('#memberState').innerText(),copy('networkError',locale));offline=false;
  // Unbound ownership verification uses one focused step at a time, with server state on reload.
  user={logged_in:true,role:'user',account:'fixture-user'};
  await go('/personal-teams/');await page.locator('#adminPersonalPanel:not([hidden])').waitFor();await assertPage();
  assert.equal(await page.locator('#adminPersonalStatus').evaluate(el=>el.parentElement.id),'adminPersonalUnbound');
  assert.equal(await page.locator('#adminPersonalStepGuide').innerText(),copy('teamSearchGuide',locale));
  assert.equal(await page.locator('#adminPersonalResults').isVisible(),false,'No empty candidate frame before search');
  assert.equal(await page.locator('#adminPersonalResults h3').count(),0,'No candidate heading');
  if(process.env.QA_SCREENSHOTS&&locale==='zh-Hant')await page.screenshot({path:process.env.QA_SCREENSHOTS+`/team-search-${width}-${theme}.png`,fullPage:true});
  await page.locator('#adminPersonalSearch').fill('Fixture');
  searchMode='empty';await page.locator('#adminPersonalSearchForm button').click();
  await page.waitForFunction(()=>document.querySelector('#adminPersonalStatus').textContent&&!document.querySelector('#adminPersonalSearchForm button').disabled);
  assert.equal(await page.locator('#adminPersonalResults').isVisible(),false,'No empty frame for zero matches');
  searchMode='error';await page.locator('#adminPersonalSearchForm button').click();await page.locator('#adminPersonalStatus.error').waitFor();
  assert.equal(await page.locator('#adminPersonalResults').isVisible(),false,'No empty frame after search error');
  searchMode='results';await page.locator('#adminPersonalSearchForm button').click();
  await page.locator('.personal-candidate').waitFor();
  assert.equal(await page.locator('#adminPersonalResults').isVisible(),true);
  assert.equal(await page.locator('.personal-candidate img').count(),0,'Candidate names render as text');
  await page.locator('.personal-candidate').click();await page.locator('#adminPersonalMedal').waitFor();
  assert.equal(await page.locator('#adminPersonalSearchForm').isVisible(),false);
  assert.equal(await page.locator('#adminPersonalResults').isVisible(),false);
  assert.equal(await page.locator('#adminPersonalStepGuide').innerText(),copy('teamMedalGuide',locale));
  await page.locator('#adminPersonalChooseAgain').click();await page.locator('.personal-candidate').click();
  await page.locator('#adminPersonalMedal').fill('0');await page.locator('#adminPersonalMedalForm button').click();await page.locator('#adminPersonalStatus.error').waitFor();
  assert.equal(await page.locator('#adminPersonalMedalForm').isVisible(),true);
  await page.locator('#adminPersonalMedal').fill('123');await page.locator('#adminPersonalMedalForm button').click();await page.locator('#adminPersonalChallenge').waitFor();
  await page.reload();await page.locator('#adminPersonalChallenge').waitFor();
  assert.equal(await page.locator('#adminPersonalMedalForm').isVisible(),false);
  const instruction=await page.locator('#adminPersonalChallengeInstruction').innerText();
  for(const value of ['3','A','2','5'])assert.ok(instruction.includes(value),'Complete server-assigned challenge');
  if(process.env.QA_SCREENSHOTS&&locale==='zh-Hant')await page.screenshot({path:process.env.QA_SCREENSHOTS+`/team-challenge-${width}-${theme}.png`,fullPage:true});
  await page.locator('#adminPersonalVerify').click();await page.locator('#adminPersonalStatus.error').waitFor();
  assert.equal(await page.locator('#adminPersonalChallenge').isVisible(),true);
  await page.locator('#adminPersonalVerify').click();await page.locator('#adminPersonalBound').waitFor();
  assert.equal(await page.locator('#adminPersonalUnbound').isVisible(),false);
  assert.equal(await page.locator('#adminPersonalBoundIntro').count(),0);
  await assertPage();
  assert.equal(await page.locator('#adminPersonalAccountCard h2').innerText(),copy('gameAccountSettings',locale));
  assert.equal(await page.locator('#adminPersonalBoundLabel').innerText(),'Fixture');
  assert.match(await page.locator('#adminPersonalLastImported').innerText(),/2026\/10\/24 09:02:03/);
  assert.equal(await page.locator('#adminPersonalStatus').evaluate(el=>el.parentElement.id),'adminPersonalAccountCard');
  // Sidebar logout is quiet on success; failure behavior is covered by security-browser.
  await go('/forgot-password/');await menu();await page.locator('.gt-user-navigation button[data-i18n="member.logout"]').click();
  await page.waitForFunction(()=>!window.RangerbookAuth.getUser().logged_in);
  await page.waitForFunction(()=>document.querySelector('.gt-logout-status').hidden&&document.querySelector('.gt-logout-status').textContent==='');
  assert.equal(await page.locator('.gt-logout-status').innerText(),'');
  assert.ok(!outbound.some(item=>/google-analytics|googletagmanager/.test(item.url)&&/\/(?:account|login|register|two-factor|forgot-password|account-action)\//.test(new URL(item.frame).pathname)),'Private pages never request analytics');
  assert.deepEqual(errors,[]);
  console.log('MEMBER_BROWSER_OK',locale,theme,width);
  await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
