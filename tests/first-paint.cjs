/**
 * Verify theme, layout and CSS BEFORE site.js is allowed to run.
 * Delays the shared runtime deliberately, in Chromium.
 */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173";
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for(const pathname of ["", "admin/", "sponsor/", "ranger/ranger/", "gear/", "pvp/usage/", "labyrinth/stage/"]){
      for(const mode of ["dark", "light"]){
        const ctx = await browser.newContext({ viewport: {width:1440,height:900} });
        await ctx.addInitScript(value => { localStorage.setItem("rangerbook-theme",value); },mode);
        const page = await ctx.newPage();
        let siteAllowed = false;
        const pending = [];
        await page.route("**/assets/js/site.js",async route=>{
          // Parser waits for the footer script; theme and new layout must exist already.
          await new Promise(resolve=>pending.push(resolve));
          siteAllowed = true;
          await route.continue();
        });
        await page.goto(base+"/"+pathname,{waitUntil:"commit",timeout:20000});
        await page.locator("body.gt-app").waitFor({state:"attached",timeout:15000});
        await page.waitForFunction(() => [...document.styleSheets]
          .some(x=>x.href?.includes("game-tech-controls.css")),null,{timeout:15000});
        const initial=await page.evaluate(()=>{
          const css=getComputedStyle(document.body);
          return {
            theme:document.documentElement.dataset.theme,
            bg:css.backgroundColor,
            layout:css.marginLeft,
            style:[...document.styleSheets].some(x=>x.href?.includes("game-tech.css")),
            controls:[...document.styleSheets].some(x=>x.href?.includes("game-tech-controls.css")),
            headerEmpty:document.getElementById("site-header")?.childElementCount===0
          };
        });
        assert.equal(siteAllowed,false,pathname+":"+mode+" site.js ran too early");
        assert.equal(initial.headerEmpty,true);
        assert.equal(initial.theme,mode,pathname+":"+mode+" theme init");
        assert.equal(initial.layout,"236px",pathname+":"+mode+" reserve sidebar");
        assert.ok(initial.style&&initial.controls,pathname+":"+mode+" blocking CSS");
        assert.equal(initial.bg,mode==="dark"?"rgb(12, 21, 28)":"rgb(242, 246, 246)",
          pathname+":"+mode+" background should match Game-Tech before site.js");
        for(const resume of pending)resume();
        await ctx.close();
        console.log("FIRST_PAINT_OK "+JSON.stringify({path:pathname||"/",mode,theme:initial.theme,background:initial.bg}));
      }
    }
  } finally { await browser.close(); }
})().catch(error=>{ console.error(error);process.exitCode=1; });
