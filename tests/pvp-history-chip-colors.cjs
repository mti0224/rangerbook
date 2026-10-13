/* Regression: each selected Ranger retains the corresponding chart-series
 * accent on the left edge in both light and dark mode, irrespective of the
 * site-wide Game-Tech border colors. No live API or login required. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173";
const colors = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c"];
function rgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return "rgb(" + ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ")";
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const theme of ["light", "dark"]) {
      for (const width of [390, 1440]) {
        const context = await browser.newContext({viewport:{width,height:900}});
        const page = await context.newPage();
        await require("./region-fixture.cjs").mockTaiwan(page);
        await page.addInitScript(value => { localStorage.setItem("rangerbook-theme", value); }, theme);
        await page.goto(base + "/pvp/usage-history/",{waitUntil:"domcontentloaded",timeout:20000});
        await page.waitForFunction(() => [...document.styleSheets].some(
          sheet => sheet.href?.includes("game-tech-controls.css?v=20261010b")),null,{timeout:10000});
        const chips = await page.evaluate(colors => {
          const temp = document.createElement("div");
          temp.className = "pvp-history-selected";
          document.body.append(temp);
          const data = colors.map((hex,i) => {
            const chip = document.createElement("span");
            chip.className = "pvp-history-chip";
            chip.style.borderLeft = "5px solid " + hex;
            chip.textContent = "測試角色 " + i;
            temp.append(chip);
            const style = getComputedStyle(chip);
            return { left:style.borderLeftColor, width:style.borderLeftWidth,
              top:style.borderTopColor, background:style.backgroundColor };
          });
          temp.remove();
          return {data,mode:document.documentElement.dataset.theme};
        },colors);
        assert.equal(chips.mode,theme);
        chips.data.forEach((item,i)=>{
          assert.equal(item.left,rgb(colors[i]),theme+" "+width+" "+colors[i]+" border accent");
          assert.equal(item.width,"5px",theme+" "+width+" left stripe width");
        });
        console.log("PVP_CHIP_COLORS_OK "+JSON.stringify({theme,width,colors:chips.data.map(x=>x.left)}));
        await context.close();
      }
    }
  } finally { await browser.close(); }
})().catch(err=>{console.error(err);process.exitCode=1;});
