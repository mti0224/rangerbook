/* Operator-only protected test-site checks. Reads credentials only on EC2;
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
    if(path!=='/admin/')await page.locator('.member-banner-brand').waitFor({state:'visible'});
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
    let matrices=0;
    for(const locale of ['zh-Hant','en','jp','th'])for(const theme of ['light','dark'])for(const width of [390,1440]){
      phase='layout '+locale+' '+theme+' '+width;
      const context=await makeContext(locale,theme,width),page=await context.newPage();
      for(const path of ['/login/','/register/','/forgot-password/','/account/','/two-factor/','/personal-teams/']){
        phase='layout '+locale+' '+theme+' '+width+' '+path;
        await go(page,path);
        assert.equal(await page.locator('.member-banner-brand').innerText(),'LINE RANGERS DATABASE');
        assert(await page.locator('.member-banner h1').innerText());
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No horizontal overflow');
        const banner=await page.locator('.member-banner').boundingBox();
        for(const card of await page.locator('main .admin-card:visible').all()){
          const box=await card.boundingBox();assert(Math.abs(box.x-banner.x)<=1&&Math.abs(box.width-banner.width)<=1,'Card/banner edges');
        }
      }
      await go(page,'/login/');
      assert.deepEqual(await page.locator('.member-login-links a').evaluateAll(nodes=>nodes.map(a=>new URL(a.href).pathname)),['/forgot-password/','/register/']);
      await go(page,'/forgot-password/');assert.equal(await page.locator('main .admin-card').count(),1);
      assert.equal(await page.locator('#memberForgotForm select option').count(),2);
      assert.equal(await page.evaluate(async()=> (await navigator.serviceWorker.getRegistrations()).length),0);
      matrices++;await context.close();
    }
    phase='ordinary member';
    const context=await makeContext(),{page,account}=await signIn(context,'user');
    await go(page,'/account/');await page.locator('#memberSecurityArea:not([hidden])').waitFor();
    assert.equal(await page.locator('[data-i18n="member.passwordGuide"],#memberGoogleNext').count(),0);
    await page.locator('#memberReauthForm input').fill(account.password);await page.locator('#memberReauthForm button').click();
    await page.waitForFunction(()=>!document.querySelector('#memberSettings').disabled);
    const status=await page.evaluate(()=>window.RangerbookAuth.api('/auth/security'));
    assert(status.reauth_valid_for>0&&status.reauth_valid_for<=600);
    await go(page,'/personal-teams/');await page.locator('#adminPersonalPanel:not([hidden])').waitFor();
    await page.locator('#adminPersonalUnbound:not([hidden])').waitFor();
    const banner=await page.locator('.member-banner').boundingBox(),card=await page.locator('.personal-binding-card').boundingBox();
    assert(Math.abs(card.x-banner.x)<=1&&Math.abs(card.width-banner.width)<=1);
    await go(page,'/forgot-password/');await page.locator('.gt-user-navigation button[data-i18n="member.logout"]').click();
    await page.waitForFunction(()=>!window.RangerbookAuth.getUser().logged_in);
    await page.waitForFunction(()=>document.querySelector('.gt-logout-status').hidden&&document.querySelector('.gt-logout-status').textContent==='');
    assert.equal(await page.locator('.gt-logout-status').innerText(),'');await context.close();
    phase='administrator';
    const admin=await makeContext(),loggedAdmin=await signIn(admin,'admin');
    await go(loggedAdmin.page,'/admin/');await loggedAdmin.page.locator('#adminResourcesTab').waitFor();
    assert.equal(await loggedAdmin.page.locator('main a[href="../"],main a[href="../account/"],#adminLogoutBtn').count(),0);
    assert.equal((await admin.request.get(origin+'/admin/users')).status(),403);
    await loggedAdmin.page.evaluate(()=>window.RangerbookAuth.logout());await admin.close();
    phase='super administrator MFA';
    const superContext=await makeContext(),loggedSuper=await signIn(superContext,'super_admin');
    assert.equal(await loggedSuper.page.locator('#memberLoginCard').isVisible(),false);
    assert.equal((await superContext.request.get(origin+'/admin/users')).status(),403);
    await loggedSuper.page.evaluate(()=>window.RangerbookAuth.logout());await superContext.close();
    assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
    console.log(JSON.stringify({matrices,pages:6,ordinary_login:true,proof_600_seconds:true,unbound_card:true,quiet_logout:true,admin_main_actions_removed:true,admin_super_api_denied:true,mfa_login_card_only:true,production_requests:0,mail_sent:false,game_provider_calls:0,mfa_codes_used:0}));
  }finally{await browser.close();}
}
main().catch(error=>{
  // Playwright failures can include fill arguments; keep diagnostics host-private.
  if(process.env.RB_STAGE_FAILURE_LOG)fs.writeFileSync(process.env.RB_STAGE_FAILURE_LOG,error.stack||String(error),{mode:0o600});
  console.error(JSON.stringify({failed_phase:phase,details_saved_privately:!!process.env.RB_STAGE_FAILURE_LOG}));process.exitCode=1;
});
