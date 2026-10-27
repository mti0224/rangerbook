"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "assets/js/gear-detail.js"), "utf8");
const legacy = JSON.parse(fs.readFileSync(path.join(root, "res/裝備資料庫.json"), "utf8"));

function renderer(window) {
  const handlers = {};
  const section = {outerHTML: ""};
  const element = {innerHTML: "", dataset: {}, querySelector: () => section};
  vm.runInNewContext(source, {window, document: {addEventListener: (name, fn) => handlers[name] = fn},
    CSS: {escape: x => x}, HTMLImageElement: class {}});
  return async (gear, level) => {
    await window.RangerbookGearDetail.render({root: element, gear, id: gear.id});
    const target = {value: String(level), dataset: {gearId: gear.id, gearLevelSection: "Spec+"},
      closest: () => target};
    handlers.change({target});
    const table = section.outerHTML.match(/gear-specplus-basic-table.*?<tbody>(.*?)<\/tbody>/s);
    assert.ok(table, gear.id + " must render a Spec+ basic table");
    return [...table[1].matchAll(/<tr><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/g)].map(m => m[2]);
  };
}

async function main() {
  const render = renderer({location: {pathname: "/gear/"}});
  const zero = legacy.find(x => x.id === "eq_2610_amr_09");
  // Exercise the real level-change handler with the legacy catalog that
  // previously rendered 107..110 at +1 and 507..510 at +Max.
  for (let level = 0; level <= 5; level++) {
    assert.deepEqual(await render(zero, level), [`${7 + level}.0 ~ ${10 + level}.0`]);
  }
  for (const [id, expected] of [["eq_2607_acc_39", "15.0% ~ 20.0%"],
    ["eq_2607_acc_29", "80.0% ~ 90.0%"]]) {
    assert.deepEqual(await render(legacy.find(x => x.id === id), 5), [expected],
      "legacy percentage points must retain their units");
  }
  assert.deepEqual(await render({id: "numeric-strings", "Spec+": {"基本效果": {
    "移動速度 (+)": {"係數": "5", "每次升級增加": "10"}}}}, 1), ["15"],
    "numeric strings must be added numerically");

  for (const locale of ["zh-Hant", "en", "th", "jp"]) {
    const window = {location: {pathname: "/gear/"}, fetch: async url => {
      const filename = decodeURIComponent(new URL(url, "https://gear-test.invalid").pathname);
      return new Response(fs.readFileSync(path.join(root, filename)));
    }};
    const location = {pathname: "/gear/", href: "https://gear-test.invalid/gear/",
      origin: "https://gear-test.invalid"};
    vm.runInNewContext(fs.readFileSync(path.join(root, "assets/js/v2-data.js"), "utf8"),
      {window, location, localStorage: {getItem: () => locale}, URL, Response, console});
    await window.RangerbookV2.ready;
    const gears = await (await window.fetch("https://gear-test.invalid/res/裝備資料庫.json")).json();
    const renderV2 = renderer(window);
    for (let level = 0; level <= 5; level++) {
      assert.deepEqual(await renderV2(gears.find(x => x.id === zero.id), level),
        [`${7 + level} ~ ${10 + level}`], "typed V2 steps must not be converted twice: " + locale);
    }
    console.log("PASS V2 Zero Spec+ +0..+Max", locale);
  }
  console.log("PASS legacy Zero +0..+Max, percentage options, numeric string addition");
}
main().catch(error => {console.error(error); process.exitCode = 1;});
