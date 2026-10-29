/* Browser regression for UI roles; mock responses, never authenticate real accounts. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173";
const roles = ["guest","user","admin","super_admin"];
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  try {
  for (const role of roles) {
    const page = await browser.newPage({ viewport: { width: 1080, height: 800 } });
    await require("./local-static-fixture.cjs").install(page,base);
    await require("./region-fixture.cjs").mockTaiwan(page);
    const protectedPaths=[];
    let releaseAuth;
    const authGate=new Promise(resolve=>{releaseAuth=resolve;});
    await page.route("https://rangerbook-auth.warmycat.com/**", async route => {
      const pathname=new URL(route.request().url()).pathname;
      if(pathname.startsWith("/admin/"))protectedPaths.push(pathname);
      if(pathname==="/auth/me")await authGate;
      const body=pathname==="/auth/me"
        ? {logged_in:role!=="guest",role:role==="guest"?"user":role,
          account:role==="guest"?null:"test_"+role,admin_application_status:"approved"}
        : pathname==="/admin/resource-updates"
        ? {items:[],lastCheckedAt:null,resourceTimestamp:"-",totalRecordedBatches:0}
        : {items:[]};
      await route.fulfill({status:pathname==="/auth/me"&&role==="guest"?401:200,
        contentType:"application/json",
        headers:{"access-control-allow-origin":base,"access-control-allow-credentials":"true"},
        body:JSON.stringify(body)});
    });
    await page.goto(base+"/admin/",{waitUntil:"domcontentloaded"});
    await page.locator('#adminAuthLoading').waitFor({state:'visible'});
    assert.equal(await page.locator('#adminAuthCard').isVisible(),false,'No login form while session verification is pending');
    assert.equal(await page.locator('#adminSessionCard').isVisible(),false);
    assert.equal(await page.locator('#adminWorkspace').isVisible(),false);
    releaseAuth();
    await page.locator('#adminAuthLoading').waitFor({state:'hidden'});
    // Wait for mocked /auth/me to finish independently of load order.
    await page.waitForFunction(expected => {
      const a=window.RangerbookAuth;
      return a&&a.getUser().logged_in===(expected!=="guest")&&
        (expected==="guest"||a.getUser().role===expected);
    },role,{timeout:15000});
    const state=async()=>page.evaluate(()=>{
      const hidden=id=>document.getElementById(id)?.hidden ?? true;
      return {auth:hidden("adminAuthCard"),session:hidden("adminSessionCard"),
        workspace:hidden("adminWorkspace"),personal:hidden("adminPersonalPanel"),password:hidden("adminPasswordCard"),
        resources:hidden("adminResourceUpdatesCard"),accounts:hidden("superAdminPanel"),
        accountTab:hidden("adminAccountsTab"),trafficTab:hidden("adminTrafficTab"),traffic:hidden("adminTrafficPanel"),
        selected:[...document.querySelectorAll("#adminWorkspaceTabs button")].filter(x=>x.getAttribute("aria-selected")==="true").map(x=>x.dataset.adminSection),
        name:document.getElementById("adminCurrentAccount").textContent};
    });
    let s=await state();
    if(role==="guest"){assert.equal(s.auth,false);assert.equal(s.workspace,true);}
    else if(role==="user"){
      assert.equal(s.session,false);assert.equal(s.workspace,false);
      assert.deepEqual(s.selected,[]);assert.equal(s.password,true);assert.equal(s.personal,true);
      assert.equal(s.resources,true);assert.equal(s.accounts,true);assert.equal(s.accountTab,true);assert.equal(s.trafficTab,true);
    }
    else{
      assert.equal(s.session,false);assert.equal(s.workspace,false);assert.equal(s.name,"test_"+role);
      assert.deepEqual(s.selected,["resources"]);assert.equal(s.personal,true);assert.equal(s.password,true);assert.equal(s.resources,false);assert.equal(s.accounts,true);
      assert.equal(s.accountTab,role!=="super_admin");assert.equal(s.trafficTab,false);
      await page.locator("#adminResourcesTab").click();
      s=await state();
      assert.deepEqual(s.selected,["resources"]);assert.equal(s.password,true);assert.equal(s.resources,false);assert.equal(s.accounts,true);
      await page.locator("#adminTrafficTab").click();
      s=await state();assert.deepEqual(s.selected,["traffic"]);assert.equal(s.traffic,false);assert.equal(s.resources,true);
      assert.ok(protectedPaths.includes("/admin/traffic"),role+" must request admin traffic report");
      if(role==="super_admin"){
        await page.locator("#adminAccountsTab").click();
        s=await state();assert.deepEqual(s.selected,["accounts"]);assert.equal(s.accounts,false);assert.equal(s.resources,true);
        await page.locator("#adminAccountsTab").focus();
        await page.keyboard.press("Home");s=await state();assert.deepEqual(s.selected,["resources"]);
      }
    }
    if(role==="guest"||role==="user")assert.equal(protectedPaths.length,0,"non-admin must not request protected records");
    if(role==="admin")assert.ok(!protectedPaths.some(p=>p==="/admin/applications"||p==="/admin/users"),"admin must not request super-admin endpoints");
    await page.close();
    console.log("ADMIN_TABS_ROLE_OK "+role);
  }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

