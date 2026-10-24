/* Browser regression with synthetic accounts. No real membership API writes. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.AUDIT_BASE_URL||'https://account-ui.invalid';
const root=path.resolve(__dirname,'..'),hosted=!!process.env.RB_HOSTED;
const credentials=hosted?JSON.parse(fs.readFileSync(process.env.RB_STAGE_CREDENTIALS,'utf8')):null;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 let cases=0,actions=0,evolutionCases=0;
 try{
 for(const locale of ['zh-Hant','en','jp','th'])for(const theme of ['light','dark'])for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',...(credentials?{httpCredentials:{origin:base,username:credentials.entrance_user,password:credentials.entrance_password}}:{})});
  await context.addInitScript(({locale,theme})=>{localStorage.setItem('rangerbook-language',locale);localStorage.setItem('rangerbook-theme',theme);},{locale,theme});
  let role='super_admin',fail=false,hold=false,release,gate,gets=0; const writes=[],calls=[],errors=[];
  let users=[{id:'boss',account:'owner',role:'super_admin'},...Array.from({length:25},(_,i)=>({id:'usr_'+i,account:i===24?'evil<img src=x onerror=alert(1)>':'member_'+String(i).padStart(2,'0'),role:i<5?'admin':'user',must_change_password:i===5,created_at:new Date(Date.UTC(2026,0,i+1)).toISOString()}))];
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   const api=url.hostname==='rangerbook-auth.warmycat.com'||(url.origin===base&&/^\/(auth|admin)\//.test(url.pathname)&&url.pathname!=='/admin/');
   if(api){
    calls.push(url.pathname);const headers={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
    if(url.pathname==='/auth/me')return route.fulfill({headers,json:{logged_in:true,role,account:'owner'}});
    if(url.pathname==='/admin/users'&&req.method()==='GET'){gets++;if(hold)await gate;if(fail)return route.fulfill({headers,status:500,json:{detail:'fixture failure'}});return route.fulfill({headers,json:{items:users}});}
    if(req.method()==='POST'){
     writes.push({path:url.pathname,body:req.postDataJSON()});
     if(url.pathname.endsWith('/role'))users=users.map(x=>x.id==='usr_5'?{...x,role:req.postDataJSON().role}:x);
     if(url.pathname.endsWith('/delete'))users=users.filter(x=>x.id!=='usr_5');
     return route.fulfill({headers,json:{ok:true,reset_password:'fixture-temporary-password'}});
    }
    return route.fulfill({headers,json:{items:[]}});
   }
   if(url.origin===base){
    if(hosted)return route.continue();
    let name=decodeURIComponent(url.pathname);if(name.endsWith('/'))name+='index.html';
    const file=path.join(root,name),types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
    return route.fulfill({status:fs.existsSync(file)?200:404,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.existsSync(file)?fs.readFileSync(file):''});
   }
   return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/admin/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.RangerbookI18n?.ready));
  await page.evaluate(()=>window.RangerbookI18n.ready);
  await page.locator('#adminAccountsTab').click();
  await page.waitForFunction(()=>document.querySelectorAll('#adminUsersList article').length===12);
  assert.equal(await page.locator('#adminApplicationsList').count(),0);
  assert.ok(!calls.some(x=>x.includes('applications')));
  assert.equal(await page.locator('[data-user-id=boss] button').count(),0);
  await page.locator('#adminAccountNext').click();assert.equal(await page.locator('#adminUsersList article').count(),12);
  await page.locator('#adminAccountNext').click();assert.equal(await page.locator('#adminUsersList article').count(),2);
  await page.locator('#adminAccountSearch').fill('MeMbEr_05');
  assert.equal(await page.locator('#adminUsersList article').count(),1);
  await page.locator('#adminAccountRole').selectOption('admin');assert.equal(await page.locator('#adminUsersList article').count(),0);
  await page.locator('#adminAccountClear').click();
  await page.locator('#adminAccountPassword').selectOption('required');assert.equal(await page.locator('#adminUsersList article').count(),1);
  assert.equal(await page.locator('[data-action=change-role]').isDisabled(),true);
  await page.locator('[data-role-select]').selectOption('admin');assert.equal(await page.locator('[data-action=change-role]').isEnabled(),true);
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-action=change-role]').click();assert.equal(writes.length,0);
  const dialogs=[];page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
  await page.locator('[data-action=change-role]').click();await page.waitForFunction(()=>document.querySelector('[data-user-id=usr_5]').dataset.userRole==='admin');
  assert.equal(writes[0].path,'/admin/users/usr_5/role');assert.equal(writes[0].body.role,'admin');
  assert.equal(await page.locator('[data-action=change-role]').isDisabled(),true);
  await page.locator('.admin-overflow summary').click();await page.keyboard.press('Escape');assert.equal(await page.locator('.admin-overflow[open]').count(),0);
  await page.locator('.admin-overflow summary').click();await page.locator('[data-action=reset-password]').click();
  await page.waitForFunction(()=>!document.querySelector('#adminRefreshBtn').disabled);
  assert.equal(writes[1].path,'/admin/users/usr_5/reset-password');assert.ok(dialogs.some(x=>x.includes('fixture-temporary-password')));
  await page.locator('.admin-overflow summary').click();await page.locator('[data-action=delete-user]').click();await page.waitForFunction(()=>!document.querySelector('[data-user-id=usr_5]'));
  assert.equal(writes[2].path,'/admin/users/usr_5/delete');actions+=3;
  await page.locator('#adminAccountClear').click();await page.locator('#adminAccountSearch').fill('evil');
  assert.equal(await page.locator('#adminUsersList img').count(),0);assert.ok((await page.locator('#adminUsersList').innerText()).includes('<img'));
  await page.locator('#adminAccountClear').click();await page.locator('#adminAccountSort').selectOption('newest');assert.ok((await page.locator('#adminUsersList article').first().innerText()).includes('evil'));
  assert.ok(!/[{}%]/.test(await page.locator('#adminAccountResults').innerText()),'resolved result counts');
  assert.ok(!/[{}%]/.test(await page.locator('#adminAccountPage').innerText()),'resolved pagination');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,locale+' '+width+' page overflow');
  if(locale!=='zh-Hant'){
   const text=await page.locator('#superAdminPanel').innerText();assert.ok(!/[一-鿿]/.test(locale==='jp'?text.replace(/[\u3000-\u9fff]/g,''):text),'untranslated panel: '+text);
   assert.ok(!(await page.locator('#adminAccountResults').innerText()).includes('符合'));
  }
  if(process.env.QA_SCREENSHOTS){fs.mkdirSync(process.env.QA_SCREENSHOTS,{recursive:true});await page.locator('#superAdminPanel').screenshot({path:path.join(process.env.QA_SCREENSHOTS,`${locale}-${theme}-${width}.png`)});}
  fail=true;await page.locator('#adminRefreshBtn').click();await page.locator('#adminUsersList [role=alert]').waitFor();assert.equal(await page.locator('#adminUsersList article').count(),0);assert.equal(await page.locator('#adminRefreshBtn').isEnabled(),true);
  fail=false;hold=true;gate=new Promise(resolve=>{release=resolve;});await page.locator('#adminRefreshBtn').click();await page.waitForFunction(()=>document.querySelector('#adminUsersList').getAttribute('aria-busy')==='true');
  role='user';await page.evaluate(()=>window.RangerbookAuth.refresh());
  release();await page.waitForTimeout(100);assert.equal(await page.locator('#adminUsersList article').count(),0);assert.equal(await page.locator('#adminAccountSummary').innerText(),'');
  await page.goto(base+'/ranger/ranger/?detail=u1626u-cony',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('.ranger-evolution-character');
  assert.equal(await page.locator('.ranger-evolution-stage > :not(a)').count(),0);
  assert.equal(await page.locator('.ranger-evolution-stage a[aria-current=page]').count(),1);
  assert.equal(await page.locator('.ranger-evolution-stage').count(),4);
  assert.ok(await page.locator('.ranger-evolution-character[href*="u1627e-cony"]').count());
  assert.equal(await page.locator('.ranger-evolution-list').evaluate(el=>el.scrollWidth>el.clientWidth),false);
  evolutionCases++;
  assert.deepEqual(errors,[]);cases++;await context.close();
 }
 console.log(JSON.stringify({account_directory_cases:cases,evolution_cases:evolutionCases,fixture_actions:actions,real_member_api_requests:0}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
