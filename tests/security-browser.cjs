/* Temporary accounts and all API mutations are isolated fixtures. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),fallback=process.env.QA_FALLBACK_ROOT||root,base='https://security-ui.invalid';
const rows=JSON.parse(fs.readFileSync(path.join(root,'assets/locales/sitewide-overrides.json'),'utf8'));
const copy=(key,locale)=>rows.find(row=>row.key==='UI:'+key)[locale==='zh-Hant'?'zh_TW':locale];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6oAAAAABJRU5ErkJggg==','base64');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try {for(const locale of ['zh-Hant','en','th','jp']) {
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1200,height:1000}});
  await context.addInitScript(locale=>localStorage.setItem('rangerbook-language',locale),locale);
  let user={logged_in:true,account:'fixture_admin',role:'admin',admin_application_status:'approved',must_change_password:true};
  let failLogout=false,changed=false;const requests=[],dialogs=[],errors=[];
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='rangerbook-auth.warmycat.com') {
    requests.push(url.pathname);
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':base,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
    if(url.pathname==='/auth/logout' && failLogout)return route.abort();
    let json={items:[],totalRecordedBatches:0};
    if(url.pathname==='/auth/me')json={...user};
    if(url.pathname==='/auth/features')json={members_v2:true,google:false,registration:false};
    if(url.pathname==='/auth/security')json={totp_enabled:false,totp_required:false};
    if(url.pathname==='/auth/change-password'){changed=true;user.must_change_password=false;json={ok:true};}
    if(url.pathname==='/auth/logout'){user.logged_in=false;json={ok:true};}
    if(url.pathname==='/admin/users')json={items:[{id:'qa_target',account:'fixture_target',role:'admin',admin_application_status:'approved'}]};
    if(url.pathname.endsWith('/reset-password'))json={ok:true,account:'fixture_target',reset_password:'Only-a-fixture-temporary-password!42',must_change_password:true};
    return route.fulfill({json,headers:{'Access-Control-Allow-Origin':base,'Access-Control-Allow-Credentials':'true'}});
   }
   if(route.request().resourceType()==='image')return route.fulfill({contentType:'image/png',body:png});
   if(url.origin!==base)return route.abort();
   let name=decodeURIComponent(url.pathname).slice(1);if(name.endsWith('/')||!name)name+='index.html';
   const file=[path.join(root,name),path.join(fallback,name)].find(file=>fs.existsSync(file));
   if(!file)return route.fulfill({status:404,body:''});
   const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
   return route.fulfill({contentType:types[path.extname(name)]||'application/octet-stream',body:fs.readFileSync(file)});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept();});
  await page.goto(base+'/account/',{waitUntil:'domcontentloaded'});
  await page.locator('#memberPasswordForm').waitFor();
  assert.ok(!requests.some(name=>name.startsWith('/admin/')),'Temporary-password sessions do not load privileged data');
  await page.locator('#memberPasswordForm input[name=current_password]').fill('Temporary-test-password!');
  await page.locator('#memberPasswordForm input[name=new_password]').fill('New-test-password!42');
  await page.locator('#memberPasswordForm input[name=confirm]').fill('New-test-password!42');
  await page.locator('#memberPasswordForm button').click();
  await page.waitForFunction(()=>window.RangerbookAuth?.isAdmin());assert.ok(changed);
  await page.goto(base+'/admin/',{waitUntil:'domcontentloaded'});
  await page.locator('#adminResourcesTab').waitFor();
  const adminEdges=await page.locator('#adminSessionCard').boundingBox();
  for(const el of await page.locator('#adminWorkspace, #adminSessionCard').all()){
    const box=await el.boundingBox();assert.ok(Math.abs(box.x-adminEdges.x)<=1&&Math.abs(box.width-adminEdges.width)<=1);
  }
  assert.equal(await page.locator('main.page').count(),1);
  assert.equal(await page.locator('main a[href="../"],main a[href="../account/"],#adminLogoutBtn').count(),0,'Admin navigation actions live in the shared sidebar');
  failLogout=true;await page.locator('.gt-user-navigation button[data-i18n="member.logout"]').click();
  await page.waitForFunction(text=>document.querySelector('.gt-logout-status').textContent===text,copy('member.logoutFailed',locale));
  assert.ok(await page.locator('#adminSessionCard').isVisible(),'Failed logout keeps the authenticated state visible');
  failLogout=false;await page.locator('.gt-user-navigation button[data-i18n="member.logout"]').click();await page.waitForURL(base+'/');
  user={logged_in:true,account:'fixture_root',role:'super_admin',admin_application_status:'approved',must_change_password:false};
  await page.goto(base+'/admin/',{waitUntil:'domcontentloaded'});await page.locator('#adminAccountsTab').click();
  const row=page.locator('[data-user-id="qa_target"]');
  await row.locator('summary').click();await row.locator('[data-action="reset-password"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-user-id="qa_target"] button')?.disabled===false);
  assert.ok(dialogs.some(message=>message.includes('Only-a-fixture-temporary-password!42')),'The generated password reaches the authorized operator');
  assert.ok(dialogs.every(message=>!message.includes('qwer1234')));
  assert.deepEqual(errors,[]);
  console.log('SECURITY_BROWSER_OK',locale,'forced change, protected workspace, failed/successful logout and generated reset password');
  await context.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
