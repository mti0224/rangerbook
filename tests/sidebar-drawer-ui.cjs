/* Responsive drawer interaction regression. No real AWS credentials or API calls. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173";
(async () => {
  const browser=await chromium.launch({headless:true});
  try {
    for(const theme of ["light","dark"]){
      for(const width of [390,760,900,1120,1180]){
        const ctx=await browser.newContext({viewport:{width,height:840},reducedMotion:"reduce"});
        await ctx.addInitScript(value=>localStorage.setItem("rangerbook-theme",value),theme);
        const page=await ctx.newPage();
        await require("./region-fixture.cjs").mockTaiwan(page);
        await page.route("https://rangerbook-auth.warmycat.com/**", async route=>{
          const path=new URL(route.request().url()).pathname;
          const body=path==="/auth/me"
            ? {logged_in:true,role:"admin",account:"mock_admin",admin_application_status:"approved"}
            : {items:[],lastCheckedAt:null,resourceTimestamp:"-",totalRecordedBatches:0};
          await route.fulfill({status:200,contentType:"application/json",
            headers:{"access-control-allow-origin":base,"access-control-allow-credentials":"true"},
            body:JSON.stringify(body)});
        });
        await page.route("https://www.googletagmanager.com/**",route=>route.abort());
        await page.goto(base+"/sponsor/",{waitUntil:"domcontentloaded",timeout:20000});
        await page.waitForFunction(()=>[...document.styleSheets]
          .some(sheet=>sheet.href?.includes("sidebar-drawer.css")),null,{timeout:13000});
        await page.waitForFunction(() => window.RangerbookI18n?.ready);
        await page.evaluate(() => window.RangerbookI18n.ready);
        const nav=page.locator(".gt-sidebar-nav");
        const admin=nav.locator(".gt-sidebar-admin-entry");
        await page.waitForFunction(()=>document.querySelector(".gt-sidebar-admin-entry")?.hidden === false,
          null,{timeout:13000});
        assert.equal(await admin.getAttribute("href"),"/admin/");
        const items=await nav.locator("a").allTextContents();
        const sponsor=items.indexOf("贊助");
        assert.ok(sponsor>0,items.join(" -> "));
        assert.equal(items[sponsor+1],"管理員頁面");
        assert.equal(await page.locator(".gt-sidebar-bottom a").count(),0);
        const toggle=page.locator(".site-menu-toggle");
        const drawer=page.locator("#gt-site-drawer");
        const backdrop=page.locator(".gt-drawer-backdrop");
        if(width>1120){
          assert.equal(await toggle.isVisible(),false);
          assert.equal(await drawer.isVisible(),true);
          assert.equal(await backdrop.isVisible(),false);
          assert.equal(await admin.isVisible(),true);
        } else {
          assert.equal(await toggle.isVisible(),true,"menu button must appear at "+width);
          assert.equal(await drawer.isVisible(),false,"drawer starts closed at "+width);
          assert.equal(await backdrop.isVisible(),false);
          assert.equal(await toggle.getAttribute("aria-controls"),"gt-site-drawer");
          assert.equal(await toggle.getAttribute("aria-expanded"),"false");
          await toggle.click();
          await drawer.waitFor({state:"visible",timeout:7000});
          assert.equal(await toggle.getAttribute("aria-expanded"),"true");
          await admin.waitFor({state:"visible",timeout:5000});
          assert.equal(await page.locator(".site-header .site-nav").isVisible(),false,
            "legacy floating dropdown must stay closed");
          assert.equal(await backdrop.isVisible(),true);
          assert.equal(await page.locator("body").evaluate(el=>el.classList.contains("gt-drawer-active")),true);
          const layout=await page.evaluate(()=>{
            const d=document.querySelector("#gt-site-drawer").getBoundingClientRect();
            const css=getComputedStyle(document.querySelector("#gt-site-drawer"));
            return {left:d.left,right:d.right,width:d.width,viewport:innerWidth,zIndex:css.zIndex};
          });
          assert.ok(layout.left>=-.5 && layout.right<=width+1,JSON.stringify(layout));
          assert.ok(layout.width>=260 && layout.width<width,JSON.stringify(layout));
          await page.keyboard.press("Escape");
          await drawer.waitFor({state:"hidden"});
          assert.equal(await toggle.getAttribute("aria-expanded"),"false");
          assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains("site-menu-toggle")),true,
            "Escape returns keyboard focus to the menu button");
          await toggle.click();
          await drawer.waitFor({state:"visible"});
          await page.mouse.click(width-10,180);
          await drawer.waitFor({state:"hidden"});
          assert.equal(await backdrop.isVisible(),false);
          await toggle.click();
          await drawer.waitFor({state:"visible"});
          await page.locator(".gt-drawer-close").click();
          await drawer.waitFor({state:"hidden"});
          assert.equal(await page.evaluate(()=>document.body.classList.contains("gt-drawer-active")),false);
        }
        console.log("SIDEBAR_DRAWER_OK "+JSON.stringify({theme,width,adminPosition:sponsor+1}));
        await ctx.close();
      }
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
