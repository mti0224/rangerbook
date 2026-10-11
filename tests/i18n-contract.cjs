const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const json = p => JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const zh = json("assets/locales/zh-Hant.json");
const keys = Object.keys(zh);
for (const locale of ["en","ja","ko","th"]) {
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
assert.match(shared,/site-language-select/);
assert.match(shared,/nav\.admin/);
assert.match(runtime,/rangerbook-language/);
assert.match(runtime,/unitDescription/);
const review = json("docs/custom-en-pending-review.json");
assert.equal(review._meta.count, 38);
assert.equal(Object.keys(review.entries).length, 38);
for (const [key, value] of Object.entries(review.entries)) {
  assert.ok(key && typeof value === "string" && value.trim());
}
console.log("LOCALIZATION_CONTRACT_OK");
