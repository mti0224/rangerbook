/* Operator-only login/Basic-auth regression. Reads credentials only on EC2;
 * never sends mail, calls the game provider, changes accounts or consumes MFA.
 */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const origin='https://rangerbook-test.warmycat.com';
const credentials=JSON.parse(fs.readFileSync(process.env.RB_STAGE_CREDENTIALS||'/home/ubuntu/rangerbook-member-stage-20261023/acceptance/operator-credentials.json','utf8'));
let phase='launch';
async function main(){
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  const errors=[],outbound=[];
  const makeContext=async(locale='zh-Hant',theme='light',width=1440)=>{
    const context=await browser.newContext({viewport:{width,height:950},serviceWorkers:'block',httpCredentials:{origin,username:credentials.entrance_user,password:credentials.entrance_password}});
    await context.addInitScript(({locale,theme})=>{try{localStorage.setItem('rangerbook-language',locale);localStorage.setItem('rangerbook-theme',theme);}catch{}},{locale,theme});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin===origin||['data:','blob:'].includes(url.protocol))return route.continue();
      if(/rangerbook-auth|google-analytics|googletagmanager/.test(url.hostname))outbound.push(url.hostname);
      return route.abort(); // Includes CAPTCHA; registration is not submitted.
    });
    context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
    return context;
  };
  const go=async(page,path)=>{
    await page.goto(origin+path,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>Boolean(window.RangerbookI18n?.ready));
    await page.evaluate(()=>window.RangerbookI18n.ready);
    await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-rb-localizing'));
    if(path!=='/admin/')await page.locator('.page-title .eyebrow').waitFor({state:'visible'});
  };
  const signIn=async(context,role)=>{
    const account=credentials.accounts.find(row=>row.role===role);
    assert(account,'Required existing synthetic account');
    const page=await context.newPage();await go(page,'/login/');
    await page.locator('#memberLoginForm input[name=account]').fill(account.account);
    await page.locator('#memberLoginForm input[name=password]').fill(account.password);
    await page.locator('#memberLoginForm button').click();
    if(role==='super_admin')await page.locator('#memberLoginFactor').waitFor();
    else await page.waitForURL(origin+'/');
    return {page,account};
  };
  try{
    const https=require('node:https');
    const raw=path=>new Promise((resolve,reject)=>{
      const request=https.get(origin+path,response=>{response.resume();resolve({status:response.statusCode,challenge:!!response.headers['www-authenticate']});});
      request.setTimeout(20000,()=>request.destroy(new Error('Entrance probe timed out')));request.on('error',reject);
    });
    for(const path of ['/login/','/auth/me']){const response=await raw(path);assert.equal(response.status,401);assert.equal(response.challenge,true);}
    const root=credentials.accounts.find(row=>row.role==='super_admin'),member=credentials.accounts.find(row=>row.role==='user');
    assert(root&&member);
    let cases=0;
    for(const locale of ['zh-Hant','en','jp','th']){
      phase='pending login cancellation '+locale;
      const context=await makeContext(locale,'light',390),page=await context.newPage();
      const translations=await (await context.request.get(origin+'/assets/locales/sitewide-overrides.json')).json();
      const copy=key=>translations.find(row=>row.key==='UI:member.'+key)[locale==='zh-Hant'?'zh_TW':locale];
      const denied=await context.request.get(origin+'/admin/users');
      assert.equal(denied.status(),403);assert.equal(denied.headers()['x-rangerbook-auth-status'],'401');assert.equal(denied.headers()['www-authenticate'],undefined);
      await go(page,'/login/');
      if(locale==='zh-Hant'){
        await page.locator('#memberLoginForm input[name=account]').fill(root.account);
        await page.locator('#memberLoginForm input[name=password]').fill('invalid-password-for-stage-probe');
        const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/login'&&r.request().method()==='POST');
        await page.locator('#memberLoginForm button').click();const rejection=await response;
        assert.equal(rejection.status(),403);assert.equal((await rejection.allHeaders())['x-rangerbook-auth-status'],'401');assert.equal((await rejection.allHeaders())['www-authenticate'],undefined);
        await page.locator('#memberState.error').waitFor();assert.equal(await page.locator('#memberState').innerText(),copy('badProof'));
        await page.reload();await page.locator('#memberLoginCard').waitFor();
      }
      await page.locator('#memberLoginForm input[name=account]').fill(root.account);
      await page.locator('#memberLoginForm input[name=password]').fill(root.password);
      await page.locator('#memberLoginForm button').click();await page.locator('#memberLoginFactor').waitFor();
      assert.equal((await context.request.get(origin+'/admin/users')).status(),403);
      const pending=(await context.cookies()).find(cookie=>cookie.name==='__Host-rangerbook_stage_session');assert(pending);
      await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
      await page.locator('.site-menu-toggle').click();
      await page.locator('.gt-user-navigation button[data-i18n="member.logout"]').waitFor();
      await go(page,'/login/');await page.locator('#memberLoginFactor').waitFor();
      assert.equal(await page.locator('#memberCancelLogin').innerText(),copy('cancelLogin'));
      await page.locator('#memberUseRecovery').click();
      await page.locator('#memberCancelLogin').click();await page.locator('#memberLoginCard').waitFor();
      await page.waitForFunction(()=>!window.RangerbookAuth.getUser().mfa_required&&!document.querySelector('#memberLoginForm button').disabled);
      assert.equal(await page.locator('#memberLoginFactor').isVisible(),false);
      assert.equal(await page.locator('#memberLoginForm input[name=account]').inputValue(),'');
      assert.equal(await page.locator('#memberLoginFactorForm input').inputValue(),'');
      assert.equal(await page.locator('#memberLoginFactorForm input').getAttribute('inputmode'),'numeric');
      assert.equal((await context.cookies()).some(cookie=>cookie.name===pending.name),false);
      const replay=await makeContext(locale);await replay.addCookies([pending]);
      const replayDenied=await replay.request.get(origin+'/member/game-binding/status');
      assert.equal(replayDenied.status(),403);assert.equal(replayDenied.headers()['x-rangerbook-auth-status'],'401');
      assert.equal((await (await replay.request.get(origin+'/auth/me')).json()).logged_in,false);await replay.close();
      await page.locator('#memberLoginForm input[name=account]').fill(member.account);
      await page.locator('#memberLoginForm input[name=password]').fill(member.password);
      await page.locator('#memberLoginForm button').click();await page.waitForURL(origin+'/');
      const state=await (await context.request.get(origin+'/auth/me')).json();assert(state.logged_in&&state.account===member.account&&!state.mfa_required);
      await go(page,'/account/');await page.locator('#memberSecurityArea').waitFor();
      await page.evaluate(()=>window.RangerbookAuth.logout());await context.close();cases++;
    }
    assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
    console.log(JSON.stringify({login_recovery_locales:cases,entrance_still_challenges:true,application_errors_do_not_challenge:true,cancelled_pending_sessions:cases,replayed_sessions_denied:cases,switched_accounts:cases,production_requests:0,mail_sent:false,game_provider_calls:0,mfa_codes_used:0}));
  }finally{
    // A failed operator test must not leave its own pending login behind.
    for(const context of browser.contexts()){
      try{await context.request.post(origin+'/auth/logout',{headers:{Origin:origin}});}catch{}
    }
    await browser.close();
  }
}
main().catch(error=>{
  // Playwright failures can include fill arguments; keep diagnostics host-private.
  if(process.env.RB_STAGE_FAILURE_LOG)fs.writeFileSync(process.env.RB_STAGE_FAILURE_LOG,error.stack||String(error),{mode:0o600});
  console.error(JSON.stringify({failed_phase:phase,details_saved_privately:!!process.env.RB_STAGE_FAILURE_LOG}));process.exitCode=1;
});
