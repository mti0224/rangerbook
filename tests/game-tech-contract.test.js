const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (file) => fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const shell = read("assets/js/site.js");
const theme = read("assets/css/game-tech.css");
const homepage = read("index.html");

test("shared shell preserves light/dark choice and public nav", () => {
  assert.match(shell,/const THEME_KEY = "rangerbook-theme"/);
  assert.match(shell,/document\.documentElement\.dataset\.theme = theme/);
  assert.match(shell,/loadStylesheet\("game-tech\.css", "20261010a"\)/);
  assert.match(shell,/nav\.cloneNode\(true\)/);
  assert.match(theme,/html\[data-theme="dark"\] body\.gt-app/);
  assert.match(theme,/max-width: 1120px/);
});
test("home tool cards retain left-image/right-text structure and original image assets",()=>{
  assert.match(homepage,/class="home-tool-image-wrap"/);
  assert.match(homepage,/class="home-tool-content"/);
  assert.match(homepage,/assets\/main_icon\/pvpicon\.png/);
  assert.match(homepage,/rangerbook_res\/main\/u1134e-brown/);
  assert.match(theme,/\.home-tool-card\s*\{[\s\S]*grid-template-columns:/);
});
test("ranger and equipment retain modal-to-detail links",()=>{
  assert.match(read("assets/js/ranger.js"),/ranger-detail-link/);
  assert.match(read("assets/js/ranger.js"),/function detailUrl\(id\)/);
  assert.match(read("assets/js/gear-page-mode.js"),/gear-detail-link/);
  assert.match(read("assets/js/gear-page-mode.js"),/function addDetailLink\(id\)/);
});
test("role gates are still owned by existing auth code",()=>{
  assert.match(read("assets/js/admin-auth.js"),/function isAdmin\(\)/);
  assert.match(read("assets/js/admin-auth.js"),/function isSuperAdmin\(\)/);
  assert.match(read("assets/js/admin-page.js"),/superAdminPanel\.hidden = !auth\.isSuperAdmin\(\)/);
  assert.match(read("assets/js/pvp-player-search.js"),/!auth\.isSuperAdmin\(\)/);
  assert.match(theme,/\.admin-only-entry\[hidden\]/);
});
test("all 40 HTML entrypoints continue to load shared site.js",()=>{
  const paths=[
    "404.html","index.html","ability/index.html","about/index.html","admin/index.html",
    "adventEnemy/index.html","endless/enemy/index.html","endless/index.html",
    "endless/stage/index.html","eventStageEnemy/index.html","gear/index.html",
    "guildwar/index.html","guildwar/ranking/index.html","guildwar/usage/index.html",
    "hsEnemy/index.html","infEnemy/index.html","labyrinth/artifact/index.html",
    "labyrinth/enemy/index.html","labyrinth/index.html",
    "labyrinth/stage/how_to_find_stage/index.html","labyrinth/stage/index.html",
    "mainstage/extreme/enemy/index.html","mainstage/extreme/index.html",
    "mainstage/extreme/stage/index.html","mainstage/hard/enemy/index.html",
    "mainstage/hard/index.html","mainstage/hard/stage/index.html","mainstage/index.html",
    "pvp/index.html","pvp/leaderboard/index.html","pvp/search/index.html",
    "pvp/usage-history/index.html","pvp/usage/index.html",
    "ranger/compare/index.html","ranger/index.html","ranger/ranger/index.html",
    "ranger/ranking/index.html","ranger/stats/index.html",
    "ranger/stats/marks/index.html","update/index.html"
  ];
  assert.equal(paths.length,40);
  paths.forEach((file)=>assert.match(read(file),/assets\/js\/site\.js/,file));
});
