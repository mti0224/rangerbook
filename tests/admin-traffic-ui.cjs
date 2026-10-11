/* Browser regression for GA4 chart rendering (mocked API, no credentials). */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173";

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    for (const theme of ["light", "dark"]) {
      for (const width of [390, 1180]) {
        const context = await browser.newContext({viewport:{width,height:900}});
        await context.addInitScript(value => localStorage.setItem("rangerbook-theme",value),theme);
        const page = await context.newPage();
        let mode = "ready";
        const ranges = [];
        await page.route("https://rangerbook-auth.warmycat.com/**", async route => {
          const url = new URL(route.request().url()), pathname = url.pathname;
          let body;
          if (pathname === "/auth/me") {
            body = {logged_in:true,role:"super_admin",account:"traffic_test",admin_application_status:"approved"};
          } else if (pathname === "/super-admin/traffic") {
            const days = Number(url.searchParams.get("days"));
            ranges.push(days);
            if(mode === "unconfigured") {
              body={status:"unconfigured",days,message:"GA4 尚未設定"};
            } else {
              const dates = Array.from({length:days},(_,i)=>{
                const date = new Date(Date.UTC(2026,9,11-days+1+i));
                return {date:date.toISOString().slice(0,10),views:1000+i*17,users:100+i};
              });
              const labels = ["直接", "自然搜尋", "社群", "推薦連結", "電子郵件", "付費搜尋", "影片", "其他社群", "其他合作"];
              body={
                status:"ready",days,updatedAt:"2026-10-11T02:28:00+00:00",
                summary:{users:2654,views:30840,sessions:3456,engagedSessions:1234},
                daily:dates,
                pages:[{path:"/ranger/ranger/",views:2890},{path:"/pvp/usage/",views:1840}],
                sources:labels.map((source,i)=>({source,sessions:9-i}))
              };
            }
          } else if(pathname === "/admin/resource-updates") {
            body={items:[],lastCheckedAt:null,resourceTimestamp:"-",totalRecordedBatches:0};
          } else {
            body={items:[]};
          }
          await route.fulfill({status:200,contentType:"application/json",
            headers:{"access-control-allow-origin":base,"access-control-allow-credentials":"true"},
            body:JSON.stringify(body)});
        });
        await page.goto(base+"/admin/",{waitUntil:"domcontentloaded"});
        await page.waitForFunction(()=>window.RangerbookAuth?.isSuperAdmin(),null,{timeout:15000});
        await page.locator("#adminTrafficTab").click();
        await page.locator("#trafficDaily svg.traffic-line-svg").waitFor();
        await page.locator("#trafficSources svg.traffic-pie-svg").waitFor();
        assert.equal(await page.locator("#trafficDaily .traffic-chart-point").count(),30);
        assert.equal(await page.locator("#trafficSources .traffic-pie-slice").count(),8);
        assert.equal(await page.locator("#trafficSources .traffic-pie-legend li").count(),8);
        assert.match(await page.locator("#trafficSources").innerText(),/其他/);
        assert.match(await page.locator("#trafficSources").innerText(),/工作階段/);
        assert.match(await page.locator("#trafficDaily svg").getAttribute("aria-label"),/30 天/);
        assert.match(await page.locator("#trafficSummary").innerText(),/30,840/);
        assert.equal(await page.locator("#trafficPages .traffic-row").count(),2);

        const dimensions=await page.evaluate(()=>{
          const range=document.getElementById("trafficDays").getBoundingClientRect();
          const refresh=document.getElementById("trafficRefresh").getBoundingClientRect();
          const toolbar=getComputedStyle(document.querySelector(".traffic-toolbar"));
          const list=getComputedStyle(document.querySelector(".traffic-scroll-list"));
          const chart=document.querySelector("#trafficDaily svg");
          return {sameRow:Math.abs((range.y+range.height/2)-(refresh.y+refresh.height/2))<26,
            toolbar:toolbar.flexDirection,scrollGap:parseFloat(list.paddingRight),
            chartWidth:chart.getBoundingClientRect().width,
            theme:document.documentElement.dataset.theme,
            pieCount:document.querySelectorAll(".traffic-pie-slice").length};
        });
        assert.equal(dimensions.theme,theme);
        assert.equal(dimensions.toolbar,"row");
        assert.ok(dimensions.sameRow,JSON.stringify({theme,width,dimensions}));
        assert.ok(dimensions.scrollGap>=14);
        assert.ok(dimensions.chartWidth>500);
        for(const days of [7,90]) {
          await page.locator("#trafficDays").selectOption(String(days));
          await page.waitForFunction(expected=>
            document.querySelectorAll("#trafficDaily .traffic-chart-point").length === expected,
          days,{timeout:15000});
          assert.match(await page.locator("#trafficDaily svg").getAttribute("aria-label"),
            new RegExp(days+" 天"));
          assert.equal(await page.locator("#trafficPages .traffic-row").count(),2);
        }
        assert.deepEqual(ranges.slice(0,3),[30,7,90]);
        // API unconfigured status must clear earlier chart data rather than show stale values.
        mode = "unconfigured";
        await page.locator("#trafficRefresh").click();
        await page.waitForFunction(()=>
          document.getElementById("trafficStatus").textContent.includes("GA4 尚未設定"));
        assert.equal(await page.locator("#trafficDaily svg").count(),0);
        assert.equal(await page.locator("#trafficSources svg").count(),0);
        assert.equal(await page.locator("#trafficPages .traffic-row").count(),0);
        console.log("ADMIN_TRAFFIC_CHART_OK "+JSON.stringify({theme,width,ranges,scrollGap:dimensions.scrollGap}));
        await context.close();
      }
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
