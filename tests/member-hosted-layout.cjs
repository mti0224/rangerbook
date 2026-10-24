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
    let matrices=0;
    for(const locale of ['zh-Hant','en','jp','th'])for(const theme of ['light','dark'])for(const width of [390,768,1440,1920]){
      phase='layout '+locale+' '+theme+' '+width;
      const context=await makeContext(locale,theme,width),page=await context.newPage();
      await go(page,'/ranger/');
      const metrics=()=>page.locator('.page-title').evaluate(el=>{
        const box=el.getBoundingClientRect(),s=getComputedStyle(el);
        const text=selector=>{const x=getComputedStyle(el.querySelector(selector));return [x.fontSize,x.fontWeight,x.lineHeight,x.letterSpacing,x.color,x.marginBottom];};
        return {x:box.x,width:box.width,padding:s.padding,border:s.border,borderLeft:s.borderLeft,radius:s.borderRadius,background:s.backgroundColor,title:text('h1'),brand:text('.eyebrow'),subtitle:text('p:last-child')};
      });
      const queryBanner=await metrics();
      for(const path of ['/login/','/register/','/forgot-password/','/account/','/two-factor/','/personal-teams/']){
        phase='layout '+locale+' '+theme+' '+width+' '+path;
        await go(page,path);
        assert.equal(await page.locator('.member-banner-brand').innerText(),'LINE RANGERS DATABASE');
        assert(await page.locator('.member-banner h1').innerText());
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No horizontal overflow');
        assert.deepEqual(await metrics(),queryBanner,'Data-query banner styles and edges');
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
    assert.equal(await page.locator('#adminPersonalResults').isVisible(),false);
    assert.equal(await page.locator('#adminPersonalResults h3').count(),0);
    const banner=await page.locator('.member-banner').boundingBox(),card=await page.locator('.personal-binding-card').boundingBox();
    assert(Math.abs(card.x-banner.x)<=1&&Math.abs(card.width-banner.width)<=1);
    // Browser-only bound data exercises the deployed HTML/iframe without changing server bindings.
    const rangerRows=await (await context.request.get(origin+'/res/Rangers_data.json')).json();
    const unit={unitCode:rangerRows.find(row=>row.ranger_id).ranger_id,level:1,equipMap:{}};
    const teams=Object.fromEntries(['team1','team2','team3','team4','team5'].map(key=>[key,{A:[unit],B:[]}]));teams.pvpteam=[unit];teams.guildwar=[unit];
    const localeRows=await (await context.request.get(origin+'/assets/locales/sitewide-overrides.json')).json();
    const cookies=await context.cookies();let boundMatrices=0;
    for(const locale of ['zh-Hant','en','jp','th'])for(const width of [390,1440]){
      phase='bound fixture '+locale+' '+width;
      const boundContext=await makeContext(locale,width===390?'dark':'light',width);await boundContext.addCookies(cookies);
      await boundContext.route('**/member/game-binding/status',route=>route.fulfill({json:{bound:true,player:{player_name:'Synthetic',last_imported_at:'2026-10-24T01:02:03Z'}}}));
      await boundContext.route('**/member/personal-teams',route=>route.fulfill({json:{bound:true,teams}}));
      await boundContext.route('**/auth/security',route=>route.fulfill({json:{totp_enabled:true,totp_required:false,google_email:null,reauth_valid_for:600}}));
      const boundPage=await boundContext.newPage();await go(boundPage,'/personal-teams/');
      const iframe=boundPage.locator('#adminPersonalViewer');await iframe.waitFor();await iframe.scrollIntoViewIfNeeded();
      const viewer=boundPage.frameLocator('#adminPersonalViewer');await viewer.locator('.pvp-player-unit-button').first().waitFor();
      const banner=await boundPage.locator('.member-banner').boundingBox();
      for(const target of [boundPage.locator('#adminPersonalAccountCard'),iframe,viewer.locator('.pvp-player-team-pane')]){
        const box=await target.boundingBox();assert(Math.abs(box.x-banner.x)<=1&&Math.abs(box.width-banner.width)<=1,'Bound content/banner edges');
      }
      const copy=key=>localeRows.find(row=>row.key==='UI:member.'+key)[locale==='zh-Hant'?'zh_TW':locale];
      assert.equal(await boundPage.locator('#adminPersonalAccountCard h2').innerText(),copy('gameAccountSettings'));
      assert.match(await boundPage.locator('#adminPersonalLastImported').innerText(),/2026\/10\/24 09:02:03/);
      assert.equal(await viewer.locator('#pvpPlayerSearchSelection').isVisible(),false);
      assert.equal(await viewer.locator('.personal-team-picker span').innerText(),copy('teamToView'));
      for(const key of Object.keys(teams))await viewer.locator('#pvpPlayerSearchTeamSelect').selectOption(key);
      await go(boundPage,'/account/');await boundPage.locator('#memberSettings:not([disabled])').waitFor();
      await boundPage.locator('#memberGoogleStart').click();await boundPage.locator('#memberConfirmDialog').waitFor();
      const input=await boundPage.locator('#memberConfirmForm input').boundingBox(),toggle=await boundPage.locator('#memberDialogRecovery').boundingBox();
      assert(toggle.y>=input.y+input.height+8&&Math.abs(toggle.x-input.x)<=1&&Math.abs(toggle.width-input.width)<=1);
      assert.equal(await boundPage.locator('#memberDialogRecovery').innerText(),copy('useRecovery'));
      await boundPage.locator('#memberDialogRecovery').click();await boundPage.locator('#memberDialogCancel').click();
      boundMatrices++;await boundContext.close();
    }
    await go(page,'/forgot-password/');await page.locator('.gt-user-navigation button[data-i18n="member.logout"]').click();
    await page.waitForFunction(()=>!window.RangerbookAuth.getUser().logged_in);
    await page.waitForFunction(()=>document.querySelector('.gt-logout-status').hidden&&document.querySelector('.gt-logout-status').textContent==='');
    assert.equal(await page.locator('.gt-logout-status').innerText(),'');await context.close();
    phase='administrator';
    const admin=await makeContext(),loggedAdmin=await signIn(admin,'admin');
    await go(loggedAdmin.page,'/admin/');await loggedAdmin.page.locator('#adminResourcesTab').waitFor();
    assert.equal(await loggedAdmin.page.locator('main a[href="../"],main a[href="../account/"],#adminLogoutBtn').count(),0);
    const adminEdges=await loggedAdmin.page.locator('#adminSessionCard').boundingBox();
    const workspaceEdges=await loggedAdmin.page.locator('#adminWorkspace').boundingBox();
    await go(loggedAdmin.page,'/ranger/');const queryEdges=await loggedAdmin.page.locator('.page-title').boundingBox();
    for(const box of [adminEdges,workspaceEdges])assert(Math.abs(box.x-queryEdges.x)<=1&&Math.abs(box.width-queryEdges.width)<=1,'Admin uses query-page width');
    assert.equal((await admin.request.get(origin+'/admin/users')).status(),403);
    await loggedAdmin.page.evaluate(()=>window.RangerbookAuth.logout());await admin.close();
    phase='super administrator MFA';
    const superContext=await makeContext(),loggedSuper=await signIn(superContext,'super_admin');
    assert.equal(await loggedSuper.page.locator('#memberLoginCard').isVisible(),false);
    assert.equal((await superContext.request.get(origin+'/admin/users')).status(),403);
    await loggedSuper.page.evaluate(()=>window.RangerbookAuth.logout());await superContext.close();
    assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
    console.log(JSON.stringify({matrices,pages:6,bound_fixture_matrices:boundMatrices,google_factor_dialog:true,admin_width_matches_query:true,ordinary_login:true,proof_600_seconds:true,unbound_card:true,quiet_logout:true,admin_main_actions_removed:true,admin_super_api_denied:true,mfa_login_card_only:true,production_requests:0,mail_sent:false,game_provider_calls:0,mfa_codes_used:0}));
  }finally{await browser.close();}
}
main().catch(error=>{
  // Playwright failures can include fill arguments; keep diagnostics host-private.
  if(process.env.RB_STAGE_FAILURE_LOG)fs.writeFileSync(process.env.RB_STAGE_FAILURE_LOG,error.stack||String(error),{mode:0o600});
  console.error(JSON.stringify({failed_phase:phase,details_saved_privately:!!process.env.RB_STAGE_FAILURE_LOG}));process.exitCode=1;
});
