/**
 * Rangerbook visual audit
 * Runs against a local preview of the current checkout: no credentials,
 * no mutations, no admin impersonation, no external services required.
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const pages = ["404.html","ability/index.html","about/index.html","admin/index.html","adventEnemy/index.html","endless/enemy/index.html","endless/index.html","endless/stage/index.html","eventStageEnemy/index.html","gear/index.html","guildwar/index.html","guildwar/ranking/index.html","guildwar/usage/index.html","hsEnemy/index.html","index.html","infEnemy/index.html","labyrinth/artifact/index.html","labyrinth/enemy/index.html","labyrinth/index.html","labyrinth/stage/how_to_find_stage/index.html","labyrinth/stage/index.html","mainstage/extreme/enemy/index.html","mainstage/extreme/index.html","mainstage/extreme/stage/index.html","mainstage/hard/enemy/index.html","mainstage/hard/index.html","mainstage/hard/stage/index.html","mainstage/index.html","pvp/index.html","pvp/leaderboard/index.html","pvp/search/index.html","pvp/usage-history/index.html","pvp/usage/index.html","ranger/compare/index.html","ranger/index.html","ranger/ranger/index.html","ranger/ranking/index.html","ranger/stats/index.html","ranger/stats/marks/index.html","update/index.html"];
const base = process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173";
const output = path.resolve(process.env.AUDIT_OUTPUT || "artifacts/visual-audit");
const viewports = [
  { key: "desktop", width: 1440, height: 900 },
  { key: "mobile", width: 390, height: 844 }
];
const modes = ["dark", "light"];
const all = [];
const issues = [];
const failures = [];
fs.mkdirSync(path.join(output, "screenshots"), { recursive: true });

const toID = (p) => p === "index.html" ? "home" : p.replace(/\/index\.html$/, "").replace(/\.html$/, "").replaceAll("/", "__");
function logIssue(entry) {
  if (issues.length < 1200) issues.push(entry);
}
async function recordOne(browser, pathname, mode, viewport) {
  const id = toID(pathname);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: mode
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", err => errors.push(String(err.message).slice(0, 180)));
  page.on("response", response => {
    const url = response.url();
    if (url.includes("/assets/css/") && response.status() >= 400) {
      errors.push("stylesheet HTTP " + response.status() + " " + url.split("/").pop());
    }
  });
  try {
    const url = base + "/" + (pathname === "index.html" ? "" : pathname);
    await page.addInitScript(theme => {
      try { localStorage.setItem("rangerbook-theme", theme); } catch (_) {}
    }, mode);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 16000 });
    await page.waitForFunction(() => document.body.classList.contains("gt-app"), { timeout: 6500 });
    await page.waitForFunction(() => [...document.styleSheets].some(sheet => sheet.href?.includes("game-tech-controls.css")), { timeout: 6500 });
    await page.waitForTimeout(350);
    const details = await page.evaluate(() => {
      const props = element => getComputedStyle(element);
      const body = document.body;
      const nodes = [...document.querySelectorAll("button,select,summary,input[type=submit],input[type=button]")];
      const visible = nodes.filter(el => {
        const st = props(el), bounds = el.getBoundingClientRect();
        return st.display !== "none" && st.visibility !== "hidden"
          && Number(st.opacity) > .04 && bounds.width > 1 && bounds.height > 1;
      });
      const rgb = value => {
        const m = String(value).match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
        return m ? [Number(m[1]),Number(m[2]),Number(m[3]),m[4]===undefined?1:Number(m[4])] : null;
      };
      // Restrict light-background detection to dark mode; vivid semantic badges are untouched.
      const whiteish = visible.filter(el => {
        const c = rgb(props(el).backgroundColor);
        return c && c[3] > .9 && c[0] >= 180 && c[1] >= 180 && c[2] >= 180;
      }).map(el => ({
        type: el.tagName.toLowerCase(),
        id: el.id || "",
        class: String(el.className || "").slice(0,110),
        bg: props(el).backgroundColor,
        text: el.textContent?.trim().slice(0,55) || "",
      })).slice(0,30);
      const dropdowns = [...document.querySelectorAll(".compare-suggestions,.pvp-search-suggestions")]
        .filter(el => !el.textContent.trim() && props(el).display !== "none")
        .map(el => ({id:el.id,class:el.className}));
      return {
        theme: document.documentElement.dataset.theme,
        width: window.innerWidth, documentWidth: document.documentElement.scrollWidth,
        controls: visible.length,
        lightControls: whiteish,
        emptyDropdowns: dropdowns,
        styleLoaded: [...document.styleSheets].some(s => s.href?.includes("game-tech-controls.css")),
        headerLoaded: !!document.querySelector(".site-header"),
        darkBackground: props(body).backgroundColor
      };
    });
    const screenshot = path.join(output, "screenshots", id + "__" + mode + "__" + viewport.key + ".png");
    await page.screenshot({ path:screenshot, fullPage:false, animations:"disabled", timeout: 16000 });
    const rec = {page:pathname,mode,viewport:viewport.key,...details,errors,screenshot:path.relative(output,screenshot)};
    all.push(rec);
    if (details.theme !== mode) logIssue({ page:pathname,mode,viewport:viewport.key,type:"wrong-theme" });
    if (!details.headerLoaded || !details.styleLoaded) logIssue({page:pathname,mode,viewport:viewport.key,type:"stylesheet-or-header-missing"});
    if (details.documentWidth > details.width + 8) logIssue({page:pathname,mode,viewport:viewport.key,type:"horizontal-overflow",size:details.documentWidth-details.width});
    if (mode === "dark") for(const item of details.lightControls) logIssue({page:pathname,mode,viewport:viewport.key,type:"bright-control",...item});
    for(const item of details.emptyDropdowns) logIssue({page:pathname,mode,viewport:viewport.key,type:"empty-visible-dropdown",...item});
    for(const err of errors) logIssue({page:pathname,mode,viewport:viewport.key,type:"browser-error",description:err});
  } catch (err) {
    const failure = {page:pathname,mode,viewport:viewport.key,error:String(err).slice(0,450)};
    failures.push(failure);
    logIssue({...failure,type:"navigation-failure"});
  } finally {
    await page.close();
    await context.close();
  }
}
(async () => {
  const browser = await chromium.launch({headless:true});
  const queue = pages.flatMap(page => modes.flatMap(mode => viewports.map(viewport=>({page,mode,viewport}))));
  const workers = 3;
  let idx = 0;
  await Promise.all(Array.from({length:workers},async ()=>{
    while(idx<queue.length) {
      const job = queue[idx++];
      await recordOne(browser,job.page,job.mode,job.viewport);
    }
  }));
  await browser.close();
  const summary = {
    pages:pages.length,scenarios:queue.length,successful:all.length,
    failures:failures.length,issueCount:issues.length,
    issueTypes:issues.reduce((acc,item)=>{acc[item.type]=(acc[item.type]||0)+1;return acc;},{}),
    generatedAt:new Date().toISOString()
  };
  const report = {summary,issues,scenarios:all,failures};
  fs.writeFileSync(path.join(output,"results.json"),JSON.stringify(report,null,2));
  const md = [
    "# Rangerbook visual audit",
    "This report is generated by Chromium from a local checkout, not just a CSS text scan.",
    "No account logins or privileged API calls are performed.",
    "",
    "| Metric | Count |","|---|---:|",
    "| Pages | "+summary.pages+" |",
    "| Scenarios | "+summary.scenarios+" |",
    "| Screenshots | "+summary.successful+" |",
    "| Navigation failures | "+summary.failures+" |",
    "| Flags (require human review) | "+summary.issueCount+" |",
    "",
    "## Flag categories",
    ...Object.entries(summary.issueTypes).map(([kind,n])=>"- "+kind+": "+n),
    "",
    "## Example flags",
    ...issues.slice(0,120).map(i=>"- "+[i.page,i.mode,i.viewport,i.type,i.id||i.class||i.description||i.error||""].join(" / ")),
    "",
    "Full structured data in results.json; screenshots in screenshots/."
  ].join("\n");
  fs.writeFileSync(path.join(output,"README.md"),md);
  console.log("RANGERBOOK_VISUAL_AUDIT_SUMMARY "+JSON.stringify(summary));
  for(const flag of issues.slice(0,45)) console.log("RANGERBOOK_VISUAL_FLAG "+JSON.stringify(flag));
  // Informational audit; no snapshot baseline has been approved yet.
  if (all.length === 0) process.exitCode = 1;
})().catch(e=>{console.error(e);process.exitCode=1;});
