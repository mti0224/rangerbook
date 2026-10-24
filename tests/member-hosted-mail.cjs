/* HTTPS assets with explicit API fixtures. No mail or account mutations. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const origin='https://rangerbook-test.warmycat.com';
const credentials=JSON.parse(fs.readFileSync('/home/ubuntu/rangerbook-member-stage-20261023/acceptance/operator-credentials.json','utf8'));
async function main(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const errors=[];let cases=0,realApi=0;
 try{for(const locale of ['zh-Hant','en','jp','th']){
  const context=await browser.newContext({viewport:{width:390,height:950},serviceWorkers:'block',httpCredentials:{origin,username:credentials.entrance_user,password:credentials.entrance_password}});
  await context.addInitScript(locale=>localStorage.setItem('rangerbook-language',locale),locale);
  let paused=true;const requests=[];
  await context.route('**/*',route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==origin)return route.abort();
   if(!url.pathname.startsWith('/auth/'))return route.continue();
   let data={ok:true};
   if(url.pathname==='/auth/me')data={logged_in:false,role:'user'};
   if(url.pathname==='/auth/features')data={mail:!paused,registration:false,google:false,member_navigation:false};
   if(url.pathname==='/auth/password/forgot')requests.push(JSON.parse(req.postData()));
   return route.fulfill({json:data,headers:{'Cache-Control':'no-store','X-Rangerbook-QA-Fixture':'1'}});
  });
  context.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/auth/')&&response.headers()['x-rangerbook-qa-fixture']!=='1')realApi++;});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/forgot-password/',{waitUntil:'domcontentloaded'});
  await page.locator('#memberForgotForm input').fill('fixture-account');
  await page.locator('#memberForgotConfirm').click();await page.locator('#memberState.error').waitFor();
  assert.equal(requests.length,0);
  assert.equal(await page.locator('#memberState').innerText(),await page.evaluate(()=>window.RangerbookI18n.t('member.mailPaused')));
  paused=false;await page.locator('#memberForgotConfirm').click();await page.locator('#memberMailSent').waitFor();
  assert.equal(requests.length,1);assert.equal(requests[0].locale,locale);assert.equal(requests[0].identifier,'fixture-account');
  await context.close();cases++;
 }
 assert.deepEqual(errors,[]);assert.equal(realApi,0);
 console.log(JSON.stringify({hosted_mail_locales:cases,paused_requests_sent:0,fixture_forgot_requests:cases,real_member_api_requests:realApi,mail_sent:false}));
 }finally{await browser.close();}
}
main().catch(error=>{
 if(process.env.RB_STAGE_FAILURE_LOG)fs.writeFileSync(process.env.RB_STAGE_FAILURE_LOG,error.stack||String(error),{mode:0o600});
 console.error(JSON.stringify({hosted_mail_failed:true,details_saved_privately:!!process.env.RB_STAGE_FAILURE_LOG}));process.exitCode=1;
});
