/* Operator-only HTTPS UI regression. Membership replies are explicit fixtures;
 * only the entrance credentials are read on-host. No real factors or writes. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const origin='https://rangerbook-test.warmycat.com';
const credentials=JSON.parse(fs.readFileSync(process.env.RB_STAGE_CREDENTIALS||'/home/ubuntu/rangerbook-member-stage-20261023/acceptance/operator-credentials.json','utf8'));
let phase='launch';
async function main(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 let cases=0,realApi=0;const errors=[],outbound=[];
 try{
  for(const locale of ['zh-Hant','en','jp','th'])for(const theme of ['light','dark'])for(const width of [390,1440])for(const required of [false,true]){
   phase=`${locale} ${theme} ${width} password=${required}`;
   const context=await browser.newContext({viewport:{width,height:950},serviceWorkers:'block',httpCredentials:{origin,username:credentials.entrance_user,password:credentials.entrance_password}});
   await context.addInitScript(({locale,theme})=>{localStorage.setItem('rangerbook-language',locale);localStorage.setItem('rangerbook-theme',theme);},{locale,theme});
   let user={logged_in:false,role:'user'},verified=0;
   await context.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin){if(!['data:','blob:'].includes(url.protocol))outbound.push(url.hostname);return route.abort();}
    if(!url.pathname.startsWith('/auth/')&&!url.pathname.startsWith('/member/'))return route.continue();
    const body=request.postData()?JSON.parse(request.postData()):{};
    let data={ok:true};
    if(url.pathname==='/auth/login')user={account:'fixture-mfa',role:'user',logged_in:false,mfa_required:true,must_change_password:required};
    else if(url.pathname==='/auth/2fa/verify'){
     assert.equal(body.code,'123456');verified++;user={...user,mfa_required:false,logged_in:!required};
    }else if(url.pathname==='/auth/change-password'){
     assert.equal(body.current_password,'fixture-password');assert.equal(body.new_password,'fixture-new-password');
     user={...user,must_change_password:false,logged_in:true};
    }else if(url.pathname==='/auth/logout')user={logged_in:false,role:'user'};
    if(['/auth/me','/auth/login'].includes(url.pathname))data=user;
    if(url.pathname==='/auth/features')data={members_v2:true,member_navigation:true,google:false,registration:false};
    if(url.pathname==='/auth/security')data={totp_enabled:true,totp_required:false,reauth_valid_for:0};
    return route.fulfill({json:data,headers:{'Cache-Control':'no-store','X-Rangerbook-QA-Fixture':'1'}});
   });
   context.on('response',response=>{
    const url=new URL(response.url());
    if((url.pathname.startsWith('/auth/')||url.pathname.startsWith('/member/'))&&response.headers()['x-rangerbook-qa-fixture']!=='1')realApi++;
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/login/',{waitUntil:'domcontentloaded'});
   await page.locator('#memberLoginCard').waitFor();
   await page.locator('#memberLoginForm input[name=account]').fill('fixture-mfa');
   await page.locator('#memberLoginForm input[name=password]').fill('fixture-password');
   await page.locator('#memberLoginForm button').click();await page.locator('#memberLoginFactor').waitFor();
   await page.locator('#memberLoginFactorForm input').fill('123456');await page.locator('#memberLoginFactorForm button[type=submit]').click();
   if(required){
    await page.waitForURL(origin+'/account/');await page.locator('#memberPasswordForm').waitFor();
    assert.equal(await page.locator('#memberProof').isVisible(),false);assert.equal(await page.locator('#memberGoogle').isVisible(),false);
    await page.waitForFunction(()=>window.RangerbookI18n?.ready);await page.evaluate(()=>window.RangerbookI18n.ready);
    assert.equal(await page.locator('#memberState').innerText(),await page.evaluate(()=>window.RangerbookI18n.t('member.passwordRequired')));
    await page.reload();await page.locator('#memberPasswordForm').waitFor();
    await page.locator('#memberPasswordForm input[name=current_password]').fill('fixture-password');
    await page.locator('#memberPasswordForm input[name=new_password]').fill('fixture-new-password');
    await page.locator('#memberPasswordForm input[name=confirm]').fill('fixture-new-password');
    await page.locator('#memberPasswordForm button').click();
   }
   await page.waitForURL(origin+'/');assert.equal(verified,1);assert.equal(user.logged_in,true);assert.equal(user.mfa_required,false);
   if(width<1000)await page.locator('.site-menu-toggle').click();
   await page.locator('.gt-user-navigation a[href="/personal-teams/"]').waitFor();
   await page.locator('.gt-user-navigation a[href="/account/"]').waitFor();
   await page.locator('.gt-user-navigation button[data-i18n="member.logout"]').waitFor();
   assert.equal(await page.locator('.gt-user-navigation a[href="/login/"]').isVisible(),false);
   await context.close();cases++;
  }
  assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);assert.equal(realApi,0);
  console.log(JSON.stringify({login_completion_cases:cases,normal_mfa_home:16,required_password_home:16,real_member_api_requests:realApi,mfa_codes_used:0,mail_sent:false,production_requests:0}));
 }finally{await browser.close();}
}
main().catch(error=>{
 if(process.env.RB_STAGE_FAILURE_LOG)fs.writeFileSync(process.env.RB_STAGE_FAILURE_LOG,error.stack||String(error),{mode:0o600});
 console.error(JSON.stringify({failed_phase:phase,details_saved_privately:!!process.env.RB_STAGE_FAILURE_LOG}));process.exitCode=1;
});
