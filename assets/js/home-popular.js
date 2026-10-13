(() => {
  "use strict";
  const mount = document.getElementById("homePopularPages");
  if (!mount) return;
  const root = location.pathname.startsWith("/rangerbook/") ? "/rangerbook/" : "/";
  const apiBase = String(window.RANGERBOOK_AUTH_API_BASE || "https://rangerbook-auth.warmycat.com").replace(/\/+$/, "");
  const i18n = window.RangerbookI18n;
  const t = (key, fallback) => i18n?.t(key, fallback) || fallback;
  const format = (key, value, fallback) => i18n?.format(key, [value], fallback) || fallback;

  async function resolveDetails(catalog, pages) {
    const v2 = window.RangerbookV2;
    if (!v2) return;
    for (const page of pages) {
      if (!page || typeof page.path !== "string") continue;
      if (Object.hasOwn(catalog, page.path)) continue;
      const match = page.path?.match(/^\/(ranger\/ranger|gear)\/([A-Za-z0-9_-]+)\/$/);
      if (match) {
        const ranger = match[1] === "ranger/ranger";
        const data = await v2.data(ranger ? "ranger-index" : "equipment-name-index");
        const record = data[ranger ? "rangers" : "equipment"].find(r => r[ranger ? "rangerCode" : "equipCode"] === match[2]);
        if (record) catalog[page.path] = {
          label: v2.render(record.nameKey, v2.locale),
          icon: ranger ? "rangerIcon.png" : "gearIcon.png",
          href: "/" + match[1] + "/?detail=" + encodeURIComponent(match[2])
        };
      }
      const stage = page.path?.match(/^\/(mainstage\/(hard|extreme)\/stage\/(?:hs|es)|endless\/stage\/end)(\d+)\/$/);
      if (stage) {
        const mode = stage[2] || "endless";
        const data = await v2.data("stages/" + mode);
        if (data.stages.some(row => row.stageId === mode + "-" + stage[3])) catalog[page.path] = {
          label: format("home.popular." + mode + "Stage", stage[3], stage[3]),
          icon: mode === "endless" ? "infIcon.png" : "hsIcon.png"
        };
      }
    }
  }

  function status(key, fallback) {
    const p = document.createElement("p");
    p.className = "home-popular-status";
    p.dataset.i18n = key;
    p.textContent = t(key, fallback);
    mount.replaceChildren(p);
  }

  async function init() {
    try {
      await i18n?.ready;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let catalog, report;
      try {
        [catalog, report] = await Promise.all([
          fetch(root + "assets/data/popular-pages.json?v=20261013-popular1", {signal: controller.signal}),
          fetch(apiBase + "/public/popular-pages", {credentials: "omit", signal: controller.signal})
        ]).then(async responses => {
          if (responses.some(response => !response.ok)) throw new Error("Popular pages unavailable");
          return Promise.all(responses.map(response => response.json()));
        });
      } finally { clearTimeout(timeout); }
      if (report.status !== "ready") {
        status("home.popular.empty", "目前沒有熱門頁面資料。");
        return;
      }
      await resolveDetails(catalog, Array.isArray(report.pages) ? report.pages : []);
      const seen = new Set();
      const pages = (Array.isArray(report.pages) ? report.pages : []).filter(page => {
        if (!page || typeof page.path !== "string" || !Object.hasOwn(catalog, page.path) || seen.has(page.path)
            || !Number.isSafeInteger(page.views) || page.views <= 0) return false;
        seen.add(page.path);
        return true;
      }).slice(0, 3);
      if (!pages.length) {
        status("home.popular.empty", "目前沒有熱門頁面資料。");
        return;
      }
      mount.replaceChildren(...pages.map((page, index) => {
        const info = catalog[page.path];
        const link = document.createElement("a");
        link.className = "home-popular-link";
        link.dataset.rank = index + 1;
        link.href = root + (info.href || page.path).slice(1);
        const rank = document.createElement("span");
        rank.className = "home-popular-rank";
        rank.textContent = format("home.popular.rank", index + 1, `第 ${index + 1} 名`);
        const image = document.createElement("img");
        image.src = root + "assets/main_icon/" + info.icon;
        image.alt = "";
        image.width = 72;
        image.height = 72;
        const title = document.createElement("span");
        title.className = "home-popular-name";
        if (info.titleKey) title.dataset.i18n = info.titleKey;
        title.textContent = info.titleKey ? t(info.titleKey, info.label) : info.label;
        const views = document.createElement("span");
        views.className = "home-popular-views";
        const number = page.views.toLocaleString(i18n?.locale === "jp" ? "ja" : i18n?.locale);
        views.textContent = format("home.popular.views", number, `${number} 次瀏覽`);
        const content = document.createElement("span");
        content.className = "home-popular-content";
        content.append(rank, title, views);
        link.append(image, content);
        return link;
      }));
    } catch (_) {
      status("home.popular.error", "熱門頁面暫時無法載入。");
    } finally {
      mount.setAttribute("aria-busy", "false");
    }
  }
  init();
})();
