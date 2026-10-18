const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const json = p => JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const zh = json("assets/locales/zh-Hant.json");
const keys = Object.keys(zh);
for (const locale of ["en"]) {
  const words = json("assets/locales/" + locale + ".json");
  assert.deepEqual(Object.keys(words).sort(), keys.slice().sort());
  assert.ok(Object.values(words).every(x => typeof x === "string" && x.length));
  const official = json("res/i18n/" + locale + ".json");
  assert.equal(official.locale, locale);
  assert.ok(official.official.UNIT["u1134e-brown_nm"]);
  assert.ok(official.custom && typeof official.custom === "object");
}
const shared = fs.readFileSync(path.join(root,"assets/js/site.js"),"utf8");
const runtime = fs.readFileSync(path.join(root,"assets/js/i18n.js"),"utf8");
assert.match(shared,/href="\$\{rootPrefix\}settings\//);
assert.doesNotMatch(shared,/site-settings-menu" role="menu"/);
assert.match(shared,/nav\.admin/);
assert.match(runtime,/rangerbook-language/);
assert.match(runtime,/unitDescription/);
assert.match(runtime,/matchOfficial/);
const gear = fs.readFileSync(path.join(root,"assets/js/gear.js"),"utf8");
assert.match(gear,/id \+ "_nm"/);
assert.match(runtime,/custom\(key, original\)/);
const review = json("docs/custom-en-pending-review.json");
assert.equal(review._meta.count, 38);
assert.equal(Object.keys(review.entries).length, 38);
for (const [key, value] of Object.entries(review.entries)) {
  assert.ok(key && value.zh && value.en && value.reviewed === false);
  const placeholders = text => (text.match(/%[A-Za-z0-9]+%?/g) || []).sort();
  assert.deepEqual(placeholders(value.zh), placeholders(value.en), "placeholder mismatch: " + key);
}
const settings = fs.readFileSync(path.join(root,"settings/index.html"),"utf8");
const logic = fs.readFileSync(path.join(root,"assets/js/settings.js"),"utf8");
for (const part of ['name="theme" value="light"','name="theme" value="dark"','name="language" value="zh-Hant"','name="language" value="en"']) assert.ok(settings.includes(part), part);
assert.match(logic, /rangerbook-theme/);
assert.match(logic, /setLocale/);
const ui = json("assets/locales/ui.json");
assert.deepEqual(Object.keys(ui).sort(),["en","jp","th","zh-Hant"]);
for (const locale of ["en","th","jp"]) {
  assert.deepEqual(Object.keys(ui[locale]).sort(),Object.keys(ui["zh-Hant"]).sort(),locale+" UI key parity");
  assert.ok(Object.values(ui[locale]).every(x=>typeof x==="string"&&x.trim()),locale+" UI text coverage");
}
assert.ok(Object.keys(ui.en).length >= 550);
assert.equal(ui.en["nav.home"],"Home");
assert.match(runtime,/assets\/locales\/ui\.json/);
assert.match(runtime,/MutationObserver/);
assert.match(runtime,/uiText/);
console.log("LOCALIZATION_CONTRACT_OK");
