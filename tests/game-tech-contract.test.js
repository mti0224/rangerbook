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
  assert.match(shell,/loadStylesheet\("game-tech\.css", "20261013-v2\.5"\)/);
  assert.match(shell,/nav\.cloneNode\(true\)/);
  assert.match(theme,/html\[data-theme="dark"\] body\.gt-app/);
  assert.match(theme,/max-width: 1120px/);
});
test("home tool cards retain left-image/right-text structure and original image assets",()=>{
  assert.match(homepage,/class="home-tool-image-wrap"/);
  assert.match(homepage,/class="home-tool-content"/);
  assert.match(homepage,/assets\/main_icon\/pvpicon\.png/);
  assert.doesNotMatch(homepage,/class="gt-home-characters"/);
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
test("all 41 HTML entrypoints continue to load shared site.js",()=>{
  const paths=[
    "404.html","index.html","ability/index.html","about/index.html","sponsor/index.html","admin/index.html",
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
  assert.equal(paths.length,41);
  paths.forEach((file)=>assert.match(read(file),/assets\/js\/site\.js/,file));
});

test("compare suggestions are hidden until typed and hidden again when cleared",()=>{
  const compare = read("assets/js/ranger-compare.js");
  const page = read("ranger/compare/index.html");
  assert.match(compare,/if \(!requestedQuery\)/);
  assert.match(compare,/container\.hidden = !rows\.length/);
  assert.equal((page.match(/class="compare-suggestions" hidden/g)||[]).length,2);
});
test("ranking header removed without removing metric selection or pagination",()=>{
  const page=read("ranger/ranking/index.html");
  const rank=read("assets/js/ranger-ranking.js");
  assert.doesNotMatch(page,/id="rankingTitle"/);
  assert.match(page,/class="ranking-metric-tabs"/);
  assert.match(page,/id="rankingPaginationBar"/);
  assert.match(rank,/if \(els\.title\) els\.title\.textContent/);
});
test("dark interactions are scoped to components rather than every button",()=>{
  const css=read("assets/css/game-tech.css");
  assert.doesNotMatch(css,/body\.gt-app :is\(button:hover\)/);
  assert.match(css,/\.pvp-usage-stable-table \.pvp-ranger-trigger/);
  assert.match(css,/\.theme-toggle-row:hover/);
  assert.match(css,/\.endless-detail-btn/);
  assert.match(css,/\.ranger-category-box/);
  assert.match(css,/#resetBtn/);
});

test("site-wide control layer loads after Game-Tech and preserves thematic reset",()=>{
 const shell=read("assets/js/site.js"),theme=read("assets/css/theme-toggle.css");
 const ctrl=read("assets/css/game-tech-controls.css");
 assert.match(shell,/loadStylesheet\("game-tech-controls\.css", "20261010a"\)/);
 assert.ok(shell.indexOf('game-tech.css", "20261013-v2.5"') < shell.indexOf('game-tech-controls.css", "20261010a"'));
 assert.doesNotMatch(theme,/html\[data-theme="dark"\] button:hover\s*\{/);
 assert.match(ctrl,/\.gear-mode-switch button\.active/);
 assert.match(ctrl,/\.pvp-player-unit-button/);
 assert.match(ctrl,/\.stats-trend-panel summary/);
 assert.match(ctrl,/\.admin-overflow-menu button/);
 assert.match(ctrl,/\.pvp-history-chip/);
 assert.match(ctrl,/\.labyrinth-stage-card/);
});
test("previously unresolved ability style reference is now provided",()=>{
 const page=read("ability/index.html");
 assert.match(page,/ranger-ability-effect-merge\.css/);
 assert.match(read("assets/css/ranger-ability-effect-merge.css"),/\.ability-effect-table/);
});

test("admin workspace displays a single role-gated tab panel",()=>{
  const html=read("admin/index.html"),js=read("assets/js/admin-page.js");
  const password=read("assets/js/admin-password.js"),css=read("assets/css/admin.css");
  assert.match(html,/id="adminWorkspaceTabs"/);
  for(const id of ["adminPasswordTab","adminResourcesTab","adminAccountsTab"])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/id="adminAccountsTab"[^>]*hidden/);
  assert.match(html,/id="adminCurrentAccount"/);
  assert.match(html,/id="superAdminPanel"[^>]*role="tabpanel"/);
  assert.match(js,/accounts: auth.isSuperAdmin\(\)/);
  assert.match(js,/resources: auth.isAdmin\(\)/);
  assert.match(js,/superAdminPanel.hidden = !auth.isSuperAdmin\(\)/);
  assert.match(js,/panel.hidden = !selected/);
  assert.match(js,/button.hidden = !accessible/);
  assert.doesNotMatch(password,/card.hidden = !visible/);
  assert.match(css,/\.admin-workspace-tabs/);
});

test("all routes bootstrap theme and blocking Game-Tech CSS before first paint",()=>{
  const pages=[
    "404.html","index.html","ability/index.html","about/index.html","sponsor/index.html","admin/index.html",
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
    "pvp/usage-history/index.html","pvp/usage/index.html","ranger/compare/index.html",
    "ranger/index.html","ranger/ranger/index.html","ranger/ranking/index.html",
    "ranger/stats/index.html","ranger/stats/marks/index.html","update/index.html"
  ];
  assert.equal(pages.length,41);
  for(const route of pages){
    const html=read(route);
    assert.match(html,/<body\b[^>]*\bclass="[^"]*\bgt-app\b[^"]*"[^>]*>/,route);
    assert.match(html,/document\.documentElement\.dataset\.theme = theme === "dark"/,route);
    assert.ok(html.indexOf('document.documentElement.dataset.theme') < html.indexOf('style.css'),route+" theme must predate CSS");
    for(const file of ["header-responsive.css","mobile-interaction-fix.css","theme-toggle.css","game-tech.css","game-tech-controls.css"]){
      assert.ok(html.includes(file),route+" missing "+file);
    }
    if(route==="404.html" || route==="ranger/ranger/index.html"){
      assert.match(html,/document\.write\('<link rel="stylesheet"/);
      assert.ok(html.includes("game-tech-controls.css?v=20261010a"));
    }else{
      const controlsVersion = route==="pvp/usage-history/index.html" ? "20261010b" : "20261010a";
      assert.ok(html.includes('game-tech-controls.css?v='+controlsVersion),route+" controls cache version");
      assert.match(html,/<link rel="stylesheet" href="[^"]+game-tech-controls\.css\?v=20261010[ab]">/,route);
      assert.ok(html.indexOf('game-tech-controls.css') < html.indexOf('</head>'),route);
    }
  }
});

test("PvP usage-history keeps series-colored chip left borders",()=>{
  const controls=read("assets/css/game-tech-controls.css");
  const page=read("pvp/usage-history/index.html");
  const renderer=read("assets/js/pvp-usage-history.js");
  assert.match(renderer,/style="border-left:5px solid \$\{SERIES_COLORS\[index\]\}"/);
  assert.match(page,/game-tech-controls\.css\?v=20261010b/);
  assert.doesNotMatch(controls,/:is\(\.pvp-history-chip,[\s\S]{0,200}border-color:\s*var\(--line\)\s*!important/);
  assert.match(controls,/\.pvp-history-chip button:hover/);
});

test("site traffic is admin-accessible with private backend cache",()=>{
 const html=read("admin/index.html"),js=read("assets/js/admin-page.js");
 const api=read("backend/rangerbook_auth/app.py");
 const collector=read("backend/rangerbook_auth/traffic_collector.py");
 assert.match(html,/id="adminTrafficTab"[^>]*hidden/);
 assert.match(html,/id="adminTrafficPanel"[^>]*hidden/);
 assert.ok(js.includes("traffic: auth.isAdmin()"));
 assert.ok(js.includes("auth.api(\"/admin/traffic?days=\""));
 assert.ok(api.includes('@app.get("/admin/traffic")'));
 assert.ok(api.includes('@app.get("/super-admin/traffic", include_in_schema=False)'));
 assert.match(api,/def traffic_report\([\s\S]{0,160}Depends\(require_admin\)/);
 assert.match(api,/TRAFFIC_CACHE_DIR/);
 assert.match(collector,/BetaAnalyticsDataClient/);
 assert.match(collector,/os\.replace\(/);
 assert.ok(!html.includes("僅限最大管理者查看"));
 assert.ok(!html.includes("尚未設定時不顯示虛構數據"));
});
test("GA4 Workload Identity Federation is scoped to the single EC2 and keyless",()=>{
 const script=read("backend/rangerbook_auth/setup_google_wif.sh");
 const guide=read("backend/rangerbook_auth/TRAFFIC_DEPLOY.md");
 assert.match(script,/PROJECT_ID="rangerbook-ga4-reader"/);
 assert.match(script,/SERVICE_ACCOUNT="rangerbook-ga4-reader@rangerbook-ga4-reader\.iam\.gserviceaccount\.com"/);
 assert.match(script,/AWS_ACCOUNT="010421869571"/);
 assert.match(script,/EC2_INSTANCE="i-05cb332634cb5d0a9"/);
 assert.match(script,/attribute\.aws_ec2_instance/);
 assert.match(script,/--enable-imdsv2/);
 assert.doesNotMatch(script,/--key-file\s|service-accounts keys create/);
 assert.match(guide,/540346392/);
});

test("GA4 traffic charts have no CDN dependencies and preserve role-protected data",()=>{
  const html=read("admin/index.html");
  const js=read("assets/js/admin-page.js");
  const charts=read("assets/js/admin-traffic-charts.js");
  const css=read("assets/css/admin.css");
  assert.match(html,/class="traffic-toolbar"/);
  assert.match(html,/id="trafficDaily" class="traffic-chart-scroll"/);
  assert.match(html,/id="trafficPages" class="traffic-scroll-list"/);
  assert.match(html,/id="trafficSources" class="traffic-source-chart"/);
  assert.match(html,/admin-traffic-charts\.js\?v=20261013-v2\.5/);
  assert.match(js,/RangerbookTrafficCharts\.renderDaily/);
  assert.match(js,/RangerbookTrafficCharts\.renderSources/);
  assert.ok(js.includes("traffic: auth.isAdmin()"));
  assert.ok(js.includes('timeZone: "Asia/Taipei"'));
  assert.match(charts,/document\.createElementNS/);
  assert.match(charts,/aria-label/);
  assert.match(charts,/traffic-pie-slice/);
  assert.match(charts,/traffic-chart-point/);
  assert.match(charts,/traffic-line-tooltip/);
  assert.match(charts,/pointermove/);
  assert.match(charts,/traffic-chart-crosshair/);
  assert.ok(charts.includes('marker.addEventListener("focus"'));
  assert.match(css,/\.traffic-line-tooltip\s*\{/);
  assert.doesNotMatch(html,/chart\.js|cdn\.jsdelivr\.net/i);
  assert.match(css,/scrollbar-gutter:\s*stable/);
  assert.match(css,/\.traffic-toolbar\s*\{[^}]*display:\s*flex/);
});


test("About and Sponsor copy, payment and contributor links match approved content",()=>{
  const about=read("about/index.html");
  const sponsor=read("sponsor/index.html");
  for(const phrase of [
    "LINE Rangers 資料站是整合及分析遊戲資料的網站",
    "Ranger、裝備、能力的完整數據",
    "各式關卡敵人生產線及機關數據",
    "當前PvP環境的角色使用率及其細項分析",
    "關於作者：蚯蚓貓",
    "Discord: warmycat",
    "Gmail: warmycat123@gmail.com",
    "LINE: tykjh6706",
    "Instagram: warmycatyt",
    "FAILdows", "NAViK3069", "nekotan",
    "Kirai, 無尾熊, 培根蛋餅, 余東東, 貓神, 小惡魔, 昕冰樂, 艾茵, 喬",
    "前端使用Github Page，UI由ChatGPT生成",
    "後端使用Amazon Web Service"
  ])assert.ok(about.includes(phrase),"Missing about content: "+phrase);
  assert.match(about,/<a href="https:\/\/rangers\.lerico\.net\/"[^>]*>LINE Ranger手冊<\/a>/);
  assert.match(about,/<a href="https:\/\/line-ranger-kiwi\.vercel\.app\/"[^>]*>LINE Rangers Kiwi<\/a>/);
  assert.match(sponsor,/這個網站不會放送任何廣告/);
  assert.match(sponsor,/支持本站維護與資料整理/);
  assert.match(sponsor,/<a\b[^>]*data-region-sponsor[^>]*href="https:\/\/www\.paypal\.com\/ncp\/payment\/SPHZE8H6CQYXW"[^>]*>贊助蚯蚓貓<\/a>/);
  assert.ok(read("assets/js/visitor-region.js").includes("https://payment.ecpay.com.tw/QuickCollect/PayData?Fd%2bEMYTkwnRiExHKdQxQGH9fNPwDXXGr5xI6v5pYOuo%3d"));
  assert.doesNotMatch(about,/https:\/\/p\.ecpay\.com\.tw\/CF7F86A/);
});

test("shared navigation puts admin after Sponsor and gates it by AWS session",()=>{
  const shell=read("assets/js/site.js");
  const aboutPos=shell.indexOf('href="\${rootPrefix}about/"');
  const sponsorPos=shell.indexOf('href="\${rootPrefix}sponsor/"');
  assert.ok(aboutPos>0 && sponsorPos>aboutPos);
  assert.match(shell,/gtAdminLink\.href = rootPrefix \+ "admin\/"/);
  assert.match(shell,/gtAdminLink\.hidden = true/);
  assert.match(shell,/user\?\.logged_in/);
  assert.match(shell,/user\.role === "admin" \|\| user\.role === "super_admin"/);
  assert.match(shell,/credentials: "include"/);
  assert.match(shell,/rangerbook:auth-changed/);
  assert.match(shell,/gtFoot\.className = "gt-sidebar-bottom"/);
  assert.match(shell,/gtNav\.append\(gtAdminLink\)/);
  assert.doesNotMatch(shell,/gtFoot\.append\(gtFootCaption, gtAdminLink\)/);
});

test("responsive sidebar uses a single accessible drawer, not a second dropdown",()=>{
 const shell=read("assets/js/site.js");
 const css=read("assets/css/sidebar-drawer.css");
 assert.match(shell,/loadStylesheet\("sidebar-drawer\.css", "20261013b"\)/);
 assert.match(shell,/gtSidebar\.id = "gt-site-drawer"/);
 assert.match(shell,/toggle\.setAttribute\("aria-controls", gtSidebar\.id\)/);
 assert.match(shell,/gtSidebar\.inert = compactSidebar\.matches && !shouldOpen/);
 assert.match(shell,/gtDrawerBackdrop\.classList\.toggle\("gt-backdrop-open", shouldOpen\)/);
 assert.match(shell,/gtDrawerClose\.addEventListener\("click"/);
 assert.match(shell,/gtDrawerBackdrop\.addEventListener\("click"/);
 assert.match(shell,/event\.key === "Escape"/);
 assert.match(css,/@media \(max-width: 1120px\)/);
 assert.match(css,/translateX\(-105%\)/);
 assert.match(css,/\.gt-sidebar\.gt-drawer-open/);
 assert.match(css,/\.site-header\.nav-collapsed\.menu-open \.site-nav/);
});
