/* Verify shared sidebar links and AWS-session-gated admin entry with mock login.
 * No real credentials or production requests.
 */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173";
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const scenarios = [
      {role:"guest", page:"/"},
      {role:"user", page:"/"},
      {role:"admin", page:"/"},
      {role:"super_admin", page:"/"},
      {role:"admin", page:"/about/"},
      {role:"super_admin", page:"/sponsor/"},
      {role:"guest", page:"/sponsor/"},
      {role:"super_admin", page:"/admin/"}
    ];
    for(const {role, page:pathname} of scenarios){
      const context=await browser.newContext({viewport:{width:1180,height:860}});
      const page=await context.newPage();
      await require("./region-fixture.cjs").mockTaiwan(page);
      let sessionChecks=0;
      await page.route("https://rangerbook-auth.warmycat.com/**", async route => {
        const path=new URL(route.request().url()).pathname;
        if(path==="/auth/me") sessionChecks++;
        const response=path==="/auth/me" ? {
          logged_in:role!=="guest",account:"mock_"+role,
          role:role==="guest"?"user":role,admin_application_status:"approved"
        } : path==="/admin/resource-updates" ? {
          items:[],lastCheckedAt:null,resourceTimestamp:"-",totalRecordedBatches:0
        } : {items:[]};
        await route.fulfill({
          status:path==="/auth/me"&&role==="guest"?401:200,
          contentType:"application/json",
          headers:{"access-control-allow-origin":base,"access-control-allow-credentials":"true"},
          body:JSON.stringify(response)
        });
      });
      await page.route("https://www.googletagmanager.com/**",route=>route.abort());
      await page.goto(base+pathname,{waitUntil:"domcontentloaded",timeout:20000});
      const sidebar=page.locator(".gt-sidebar");
      await sidebar.waitFor({state:"attached"});
      const nav=await page.locator(".gt-sidebar-nav > a, .gt-sidebar-nav > .gt-nav-group > .gt-nav-hub").allTextContents();
      // One shared sidebar nav. The admin shortcut follows Sponsor directly,
      // while the bottom footer is decorative only.
      const about=nav.indexOf("關於本站");
      assert.ok(about>=0,"missing About");
      assert.equal(nav[about+1],"贊助",pathname+" sponsor must follow About");
      const sponsor=page.locator('.gt-sidebar a[href$="/sponsor/"]');
      assert.equal(await sponsor.count(),1,pathname+" sponsor should not duplicate");
      const admin=page.locator(".gt-sidebar-admin-entry");
      await admin.waitFor({state:"attached"});
      assert.equal(await admin.getAttribute("href"),"/admin/");
      assert.equal(await page.locator(".gt-sidebar-nav > a:last-child").getAttribute("href"),"/admin/");
      assert.equal(await page.locator(".gt-sidebar-bottom a").count(),0);
      assert.equal(await page.locator(".gt-sidebar-nav > a, .gt-sidebar-nav > .gt-nav-group > .gt-nav-hub").nth(about+2).innerText(),"管理員頁面");
      if(["admin","super_admin"].includes(role)){
        await admin.waitFor({state:"visible",timeout:10000});
        assert.equal(await admin.isVisible(),true,pathname+" "+role);
        // Revoking the session must hide the shortcut immediately.
        await page.evaluate(()=>window.dispatchEvent(new CustomEvent("rangerbook:auth-changed",{
          detail:{logged_in:false,role:"user"}
        })));
        assert.equal(await admin.isVisible(),false);
      }else{
        if(pathname==="/")await page.waitForFunction(()=>document.querySelector(".gt-sidebar-admin-entry")?.hidden);
        assert.equal(await admin.isVisible(),false,pathname+" "+role);
      }
      assert.ok(sessionChecks>=1,pathname+" should use auth/me rather than a local flag");
      console.log("SIDEBAR_ROLE_OK "+JSON.stringify({role,path:pathname,authCalls:sessionChecks}));
      await context.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
