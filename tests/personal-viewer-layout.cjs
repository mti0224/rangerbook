/* Regression checks for the embedded private team viewer, with no player data. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const search = read('pvp/search/index.html');
const viewer = read('assets/css/personal-team-viewer.css');
const admin = read('assets/css/admin.css');
const personalJs = read('assets/js/pvp-player-search.js');

test('private mode is marked before its stylesheet loads', () => {
  const tag = search.indexOf('document.documentElement.classList.add("rb-personal-embed")');
  const sheet = search.indexOf('personal-team-viewer.css');
  assert.ok(tag >= 0 && tag < sheet);
});

test('embedded viewer removes independent sidebar and header offsets', () => {
  assert.match(viewer, /html\.rb-personal-embed body\.gt-app\s*\{[^}]*margin:\s*0\s*!important/s);
  assert.match(viewer, /html\.rb-personal-embed body\.gt-app\s*\{[^}]*padding:\s*0\s*!important/s);
  assert.match(viewer, /#gt-site-drawer/);
  assert.match(viewer, /#site-header/);
  assert.match(viewer, /display:\s*none\s*!important/);
});

test('existing five-slot cards and A/B headers have separate row heights', () => {
  assert.match(viewer, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(viewer, /grid-auto-rows:\s*auto\s*!important/);
  assert.match(viewer, /\.pvp-personal-side-heading/);
  assert.match(viewer, /grid-column:\s*1\s*\/\s*-1/);
});

test('personal viewer uses full-width unit detail below cards without changing standard query mode', () => {
  assert.match(viewer, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important/);
  assert.match(personalJs, /if \(personalMode\)/);
  assert.match(personalJs, /RangerbookTeamAnalysis\?\.setUnits\(units\)/);
});


test("mobile personal-team panel maintains insets on every side", () => {
  assert.match(admin, /@media\s*\(max-width:\s*650px\)\s*\{[\s\S]*?#adminPersonalPanel\s*\{\s*padding:\s*16px;/);
  assert.doesNotMatch(admin, /#adminPersonalPanel\s*\{\s*padding:\s*0(?:px)?\s*\}/);
});

test("admin workspace tabs scroll horizontally only", () => {
  const tabs = admin.match(/\.admin-workspace-tabs\s*\{([^}]+)\}/)?.[1];
  assert.ok(tabs, "workspace tabs CSS rule exists");
  assert.match(tabs, /overflow-x:\s*auto\s*;/);
  assert.match(tabs, /overflow-y:\s*hidden\s*;/);
  assert.match(tabs, /touch-action:\s*pan-x\s*;/);
});

test("all admin tabs share a 980px maximum content width", () => {
  // These specific selectors must override Game-Tech's later 1180px shell rule.
  assert.match(admin, /body\.gt-app main\.admin-page\s*\{[^}]*width:\s*min\(980px,\s*calc\(100%\s*-\s*2rem\)\)/);
  assert.match(admin, /body\.gt-app \.admin-page \.admin-shell\s*\{[^}]*width:\s*100%/);
  assert.doesNotMatch(admin, /admin-page:has\(#adminPersonalPanel/);
  assert.doesNotMatch(admin, /min\(1420px/);
});
