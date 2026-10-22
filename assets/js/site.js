(() => {
  const GA_MEASUREMENT_ID = "G-RPSQY1WHPP";

  if (!window.gtag) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID);
  }
})();

(() => {
  const LEGACY_RES_BASE = "https://rangers.lerico.net/res/";
  const PRIMARY_RES_BASE = "https://res.warmycat.com/";
  const OLD_PRIMARY_RES_BASE = "https://rangerbook.warmycat.com/res_from_emulator/";

  function stripLegacyPrefix(absoluteUrl) {
    if (absoluteUrl.startsWith(LEGACY_RES_BASE)) return absoluteUrl.slice(LEGACY_RES_BASE.length);
    if (absoluteUrl.startsWith(OLD_PRIMARY_RES_BASE)) return absoluteUrl.slice(OLD_PRIMARY_RES_BASE.length);
    if (absoluteUrl.startsWith(PRIMARY_RES_BASE)) return absoluteUrl.slice(PRIMARY_RES_BASE.length);
    return "";
  }

  function normalizeResourcePath(path) {
    return String(path || "").replace(/^\/+/, "").replace(/^res_from_emulator\//, "");
  }

  function normalizeResourceUrl(value) {
    if (!value || typeof value !== "string") return value;
    try {
      const absoluteUrl = new URL(value, window.location.href).href;
      const resourcePath = stripLegacyPrefix(absoluteUrl);
      if (!resourcePath) return value;
      return PRIMARY_RES_BASE + normalizeResourcePath(resourcePath);
    } catch {
      return value;
    }
  }

  function legacyResourceUrl(value) {
    if (!value || typeof value !== "string") return "";
    try {
      const absoluteUrl = new URL(value, window.location.href).href;
      if (absoluteUrl.startsWith(LEGACY_RES_BASE)) return absoluteUrl;
      const resourcePath = stripLegacyPrefix(absoluteUrl);
      if (!resourcePath) return "";
      return LEGACY_RES_BASE + normalizeResourcePath(resourcePath);
    } catch {
      return "";
    }
  }

  const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  const nativeSetAttribute = Element.prototype.setAttribute;

  function setImageSrcRaw(img, value) {
    if (srcDescriptor?.set) {
      srcDescriptor.set.call(img, value);
      return;
    }
    nativeSetAttribute.call(img, "src", value);
  }

  function patchImage(img) {
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.resourceFallbackTried === "true") return;
    const currentSrc = img.getAttribute("src");
    const fallbackSrc = legacyResourceUrl(currentSrc || img.src);
    if (!fallbackSrc) return;
    const primarySrc = normalizeResourceUrl(currentSrc || img.src);
    if (!primarySrc || primarySrc === currentSrc) return;
    img.dataset.resourceFallbackSrc = fallbackSrc;
    img.dataset.resourcePrimarySrc = primarySrc;
    nativeSetAttribute.call(img, "src", primarySrc);
  }

  if (srcDescriptor?.set && srcDescriptor?.get) {
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      configurable: true,
      enumerable: srcDescriptor.enumerable,
      get() {
        return srcDescriptor.get.call(this);
      },
      set(value) {
        if (this.dataset.resourceUseRawSrc === "true") {
          delete this.dataset.resourceUseRawSrc;
          return srcDescriptor.set.call(this, value);
        }
        const fallbackSrc = legacyResourceUrl(value);
        if (fallbackSrc) {
          this.dataset.resourceFallbackSrc = fallbackSrc;
          this.dataset.resourcePrimarySrc = normalizeResourceUrl(value);
          return srcDescriptor.set.call(this, this.dataset.resourcePrimarySrc);
        }
        return srcDescriptor.set.call(this, value);
      }
    });
  }

  Element.prototype.setAttribute = function (name, value) {
    if (this instanceof HTMLImageElement && String(name).toLowerCase() === "src") {
      if (this.dataset.resourceUseRawSrc === "true") {
        delete this.dataset.resourceUseRawSrc;
        return nativeSetAttribute.call(this, name, value);
      }
      const fallbackSrc = legacyResourceUrl(String(value));
      if (fallbackSrc) {
        this.dataset.resourceFallbackSrc = fallbackSrc;
        this.dataset.resourcePrimarySrc = normalizeResourceUrl(String(value));
        return nativeSetAttribute.call(this, name, this.dataset.resourcePrimarySrc);
      }
    }
    return nativeSetAttribute.call(this, name, value);
  };

  document.addEventListener("error", (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    const fallbackSrc = img.dataset.resourceFallbackSrc;
    if (!fallbackSrc || img.dataset.resourceFallbackTried === "true") return;
    img.dataset.resourceFallbackTried = "true";
    img.dataset.resourceUseRawSrc = "true";
    setImageSrcRaw(img, fallbackSrc);
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLImageElement) patchImage(node);
        if (node instanceof Element) node.querySelectorAll?.("img").forEach(patchImage);
      });
      if (mutation.type === "attributes" && mutation.target instanceof HTMLImageElement) {
        patchImage(mutation.target);
      }
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"]
  });

  document.querySelectorAll("img").forEach(patchImage);
})();

(() => {
  function normalizedPath() {
    return window.location.pathname.replace(/^\/rangerbook(?=\/)/, "");
  }

  function detailRequested(path, basePattern) {
    const params = new URLSearchParams(window.location.search);
    return Boolean(params.get("detail")) || basePattern.test(path);
  }

  function elementText(selector) {
    return document.querySelector(selector)?.textContent?.trim() || "";
  }

  function stageNumber(value) {
    const match = String(value || "").match(/\d+/);
    return match ? match[0] : "";
  }

  function labyrinthStageKey(value) {
    const match = String(value || "").match(/(\d+)\s*[-－–—]\s*(\d+)/);
    return match ? `${match[1]}-${match[2]}` : "";
  }

  const titleText = (key,args,fallback) => window.RangerbookI18n?.format("site.title."+key,args,fallback) || fallback;

  function desiredDetailTitle() {
    const path = normalizedPath();

    if (detailRequested(path, /^\/ranger\/ranger\/[^/]+\/?$/)) {
      const name = elementText("#rangerModalTitle");
      if (name) return titleText("ranger",[name],`${name}｜角色詳細資料`);
    }

    if (detailRequested(path, /^\/gear\/[^/]+\/?$/)) {
      const name = elementText("#gearModalTitle");
      if (name) return titleText("gear",[name],`${name}｜裝備詳細資料`);
    }

    if (path.startsWith("/mainstage/hard/stage")) {
      const detail = document.getElementById("hsStageDetail");
      const no = stageNumber(elementText("#hsStageTitle"));
      if (detail && !detail.hidden && no) return titleText("hard",[no],`第${no}關｜困難關卡資訊`);
    }

    if (path.startsWith("/mainstage/extreme/stage")) {
      const detail = document.getElementById("hsStageDetail");
      const no = stageNumber(elementText("#hsStageTitle"));
      if (detail && !detail.hidden && no) return titleText("extreme",[no],`第${no}關｜極限關卡資訊`);
    }

    if (path.startsWith("/endless/stage")) {
      const detail = document.getElementById("endlessStageDetail");
      const no = stageNumber(elementText("#endlessStageTitle"));
      if (detail && !detail.hidden && no) return titleText("endless",[no],`第${no}層｜無限之塔關卡資訊`);
    }

    if (path.startsWith("/labyrinth/stage")) {
      const detail = document.getElementById("labyrinthStageDetail");
      const key = labyrinthStageKey(elementText("#labyrinthStageTitle"));
      if (detail && !detail.hidden && key) return titleText("labyrinth",[key],`關卡${key}｜迷宮關卡資訊`);
    }

    return "";
  }

  function updateDetailTitle() {
    // The HTML title getter collapses whitespace. Official names can contain
    // newlines; compare the same normalized value to avoid an observer loop.
    const title = desiredDetailTitle().replace(/\s+/g, " ").trim();
    if (title && document.title !== title) document.title = title;
  }

  const observer = new MutationObserver(updateDetailTitle);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["hidden"]
  });

  document.addEventListener("DOMContentLoaded", updateDetailTitle);
  document.addEventListener("rangerbook:gear-rendered", updateDetailTitle);
  window.addEventListener("rangerbook:locale-ready", updateDetailTitle);
  requestAnimationFrame(updateDetailTitle);
})();

(() => {
  const mount = document.getElementById("site-header");
  if (!mount) return;

  const THEME_KEY = "rangerbook-theme";
  const basePrefix = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const rootPrefix = basePrefix;
  const SETTING_ICON_LIGHT = `${rootPrefix}assets/setting_icon/setting_light.png`;
  const SETTING_ICON_DARK = `${rootPrefix}assets/setting_icon/setting_dark.png`;

  function ensureSiteIcon() {
    const iconHref = `${rootPrefix}assets/main_icon/icon.png`;
    let icon = document.querySelector('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.appendChild(icon);
    }
    icon.type = "image/png";
    icon.href = iconHref;
  }

  function loadStylesheet(filename, version) {
    if (document.querySelector(`link[href*="${filename}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${rootPrefix}assets/css/${filename}?v=${version}`;
    document.head.appendChild(link);
  }

  function getStoredTheme() {
    let stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (_) {}
    if (stored === "light" || stored === "dark") return stored;
    return "light";
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
    const text = theme === "dark" ? "深色模式" : "淺色模式";
    document.querySelectorAll(".theme-current-mode").forEach((el) => { el.textContent = text; });
    document.querySelectorAll(".site-settings-icon").forEach((img) => {
      img.src = theme === "dark" ? SETTING_ICON_DARK : SETTING_ICON_LIGHT;
    });
  }

  ensureSiteIcon();
  applyTheme(getStoredTheme());

  loadStylesheet("header-responsive.css", "20260429c");
  loadStylesheet("mobile-interaction-fix.css", "20260430c");
  loadStylesheet("theme-toggle.css", "20260525a");
  loadStylesheet("game-tech.css", "20261013-v2.5");
  loadStylesheet("game-tech-controls.css", "20261010a");
  loadStylesheet("sidebar-drawer.css", "20261014-toggle1");

  mount.innerHTML = `
    <header class="site-header nav-collapsed">
      <div class="header-inner header-inner-left">
        <button class="site-menu-toggle" type="button" aria-label="開啟選單" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
        <a class="site-home-link" href="${rootPrefix}" data-i18n="nav.home">首頁</a>
        <nav class="site-nav" aria-label="主要導覽">
          <a href="${rootPrefix}ranger/" data-i18n="nav.rangers">Rangers</a>
          <a href="${rootPrefix}pvp/" data-i18n="nav.pvp">PvP</a>
          <a href="${rootPrefix}guildwar/" data-i18n="nav.guildwar">公會</a>
          <a href="${rootPrefix}gear/" data-i18n="nav.gear">裝備</a>
          <a href="${rootPrefix}mainstage/" data-i18n="nav.mainstage">主要關卡</a>
          <a href="${rootPrefix}endless/" data-i18n="nav.endless">無限之塔</a>
          <a href="${rootPrefix}eventStageEnemy/" data-i18n="nav.event">活動關卡</a>
          <a href="${rootPrefix}adventEnemy/" data-i18n="nav.advent">降臨關卡</a>
          <a href="${rootPrefix}labyrinth/" data-i18n="nav.labyrinth">迷宮</a>
          <a href="${rootPrefix}ability/" data-i18n="nav.ability">能力</a>
          <a href="${rootPrefix}about/" data-i18n="nav.about">關於本站</a>
          <a href="${rootPrefix}sponsor/" data-i18n="nav.sponsor">贊助</a>
        </nav>
        <div class="site-actions">
          <a class="site-settings site-settings-toggle" href="${rootPrefix}settings/" aria-label="開啟設定" data-i18n-aria-label="settings.open" title="設定">
            <img class="site-settings-icon" src="${getStoredTheme() === "dark" ? SETTING_ICON_DARK : SETTING_ICON_LIGHT}" alt="" aria-hidden="true" loading="eager">
          </a>
        </div>
      </div>
    </header>
  `;

  const header = mount.querySelector(".site-header");
  const inner = mount.querySelector(".header-inner");
  const nav = mount.querySelector(".site-nav");
  const homeLink = mount.querySelector(".site-home-link");
  const toggle = mount.querySelector(".site-menu-toggle");
  if (!window.RangerbookI18n && !document.querySelector("script[data-rangerbook-i18n]")) {
    const script = document.createElement("script");
    script.dataset.rangerbookI18n = "true";
    script.src = rootPrefix + "assets/js/i18n.js?v=20261021-sitewide1";
    document.head.appendChild(script);
  }

  // Presentation shell only: clone public links, do not touch authentication.
  // Protected shortcuts stay hidden until the existing session confirms a role.
  const gtSidebar = document.createElement("aside");
  gtSidebar.className = "gt-sidebar";
  gtSidebar.id = "gt-site-drawer";
  gtSidebar.tabIndex = -1;
  gtSidebar.setAttribute("aria-label", "資料站功能導覽");
  const gtBrand = document.createElement("a");
  gtBrand.className = "gt-brand";
  gtBrand.href = rootPrefix;
  const gtLogo = document.createElement("img");
  gtLogo.src = rootPrefix + "assets/main_icon/icon.png";
  gtLogo.alt = "";
  const gtBrandTitle = document.createElement("span");
  const gtBrandName = document.createElement("strong");
  gtBrandName.textContent = "DATABASE";
  const gtBrandDescription = document.createElement("small");
  gtBrandDescription.textContent = "LINE Rangers 資料站";
  gtBrandTitle.append(gtBrandName, gtBrandDescription);
  gtBrand.append(gtLogo, gtBrandTitle);
  const gtDrawerTop = document.createElement("div");
  gtDrawerTop.className = "gt-drawer-top";
  const gtDrawerClose = document.createElement("button");
  gtDrawerClose.className = "gt-drawer-close";
  gtDrawerClose.type = "button";
  gtDrawerClose.textContent = "×";
  gtDrawerClose.setAttribute("aria-label", "關閉選單");
  gtDrawerTop.append(gtBrand, gtDrawerClose);
  const gtLabel = document.createElement("div");
  gtLabel.className = "gt-sidebar-label";
  gtLabel.textContent = "資料查詢";
  const gtNav = nav.cloneNode(true);
  gtNav.className = "gt-sidebar-nav";
  gtNav.setAttribute("aria-label", "資料站主要連結");
  const gtPath = window.location.pathname.replace(/\/index\.html$/, "/");
  // Parent items are disclosure buttons; only their child links navigate.
  const hubChildren = {
    rangers: [
      ["ranger/ranger/", "ranger.title", "Rangers數據"],
      ["ranger/compare/", "ranger.hub.compare", "Rangers比對"],
      ["ranger/stats/", "ranger.hub.stats", "統計資料"],
      ["ranger/ranking/", "ranger.hub.rank", "數據排名"]
    ],
    pvp: [
      ["pvp/leaderboard/", "copy.leaderboard", "排行榜"],
      ["pvp/usage/", "copy.ranger.usage", "角色使用率"],
      ["pvp/usage-history/", "copy.ranger.usage.history", "角色使用率變化"],
      ["pvp/search/", "copy.player.team.search", "查詢玩家隊伍", ["super_admin"]]
    ],
    guildwar: [
      ["guildwar/ranking/", "copy.guild.rankings", "公會排名"],
      ["guildwar/usage/", "copy.ranger.usage", "角色使用率", ["admin", "super_admin"]]
    ],
    mainstage: [
      ["mainstage/hard/", "copy.hard.mode", "困難模式"],
      ["mainstage/extreme/", "copy.extreme.mode", "極限模式"]
    ],
    endless: [
      ["endless/enemy/", "copy.enemy.details", "敵人資訊"],
      ["endless/stage/", "copy.stage.details", "關卡資訊"]
    ],
    labyrinth: [
      ["labyrinth/enemy/", "copy.enemy.details", "敵人資訊"],
      ["labyrinth/stage/", "copy.stage.details", "關卡資訊"],
      ["labyrinth/artifact/", "copy.artifact.details", "遺物資訊"]
    ]
  };
  const gtGroups = [];
  const gtProtectedLinks = [];
  function expandGroup(selected) {
    gtGroups.forEach(({ group, link, panel }) => {
      const open = group === selected;
      group.classList.toggle("gt-nav-expanded", open);
      link.setAttribute("aria-expanded", String(open));
      panel.inert = !open;
      panel.setAttribute("aria-hidden", String(!open));
    });
  }
  [...gtNav.children].forEach(sourceLink => {
    const key = sourceLink.dataset.i18n?.replace(/^nav\./, "");
    const children = hubChildren[key];
    if (!children) return;
    const link = document.createElement("button");
    link.type = "button";
    link.className = sourceLink.className;
    link.dataset.i18n = sourceLink.dataset.i18n;
    link.append(...sourceLink.childNodes);
    const hubPath = new URL(sourceLink.href, window.location.href).pathname;
    const group = document.createElement("div");
    group.className = "gt-nav-group";
    const panel = document.createElement("div");
    panel.className = "gt-nav-submenu";
    panel.id = `gt-submenu-${key}`;
    panel.inert = true;
    panel.setAttribute("aria-hidden", "true");
    const content = document.createElement("div");
    content.className = "gt-nav-submenu-content";
    children.forEach(([path, translationKey, label, roles]) => {
      const child = document.createElement("a");
      child.href = rootPrefix + path;
      child.dataset.i18n = translationKey;
      child.textContent = label;
      if (roles) {
        child.hidden = true;
        gtProtectedLinks.push({ link: child, roles });
      }
      content.append(child);
    });
    panel.append(content);
    link.classList.add("gt-nav-hub");
    link.setAttribute("aria-expanded", "false");
    link.setAttribute("aria-controls", panel.id);
    sourceLink.replaceWith(group);
    group.append(link, panel);
    gtGroups.push({ group, link, panel });
    if (gtPath.startsWith(hubPath)) {
      link.setAttribute("aria-current", gtPath === hubPath ? "page" : "location");
    }
    link.addEventListener("click", () => {
      expandGroup(group.classList.contains("gt-nav-expanded") ? null : group);
    });
  });
  gtNav.querySelectorAll("a").forEach((a) => {
    const target = new URL(a.href, window.location.href).pathname;
    const targetPath = target.endsWith("/") ? target : target + "/";
    const isCurrent = targetPath === rootPrefix
      ? gtPath === rootPrefix
      : gtPath.startsWith(targetPath);
    if (isCurrent) {
      a.setAttribute("aria-current", gtPath === targetPath ? "page" : "location");
      const group = a.closest(".gt-nav-group");
      // Restore context on a child page, but a hub itself starts collapsed.
      if (group && !a.classList.contains("gt-nav-hub")) expandGroup(group);
    }
  });
  const gtFoot = document.createElement("div");
  gtFoot.className = "gt-sidebar-bottom";
  const gtFootCaption = document.createElement("span");
  gtFootCaption.textContent = "GAME DATA / RANGERBOOK";
  const gtAdminLink = document.createElement("a");
  gtAdminLink.className = "gt-sidebar-admin-entry";
  gtAdminLink.href = rootPrefix + "admin/";
  gtAdminLink.textContent = "管理員頁面";
  gtAdminLink.dataset.i18n = "nav.admin";
  gtAdminLink.hidden = true;
  if (gtPath.startsWith(rootPrefix + "admin/")) {
    gtAdminLink.setAttribute("aria-current", "page");
  }
  const gtUserGroup = document.createElement("div");
  gtUserGroup.className = "gt-user-navigation";
  gtUserGroup.hidden = true;
  const gtUserLabel = document.createElement("div");
  gtUserLabel.className = "gt-sidebar-label";
  gtUserLabel.dataset.i18n = "member.user";
  gtUserLabel.textContent = "使用者";
  gtUserGroup.append(gtUserLabel);
  for (const [path,key,label] of [["personal-teams/","admin.personal.heading","個人隊伍"],["account/","member.security","隱私權與密碼"]]) {
    const link = document.createElement("a");
    link.href = rootPrefix + path; link.dataset.i18n = key; link.textContent = label;
    if(gtPath.startsWith(rootPrefix + path)) link.setAttribute("aria-current","page");
    gtUserGroup.append(link);
  }
  gtUserGroup.append(gtAdminLink);
  gtNav.append(gtUserGroup);
  let gtMemberNavigation = false;
  let gtLastUser = null;
  fetch("https://rangerbook-auth.warmycat.com/auth/features", {cache:"no-store",credentials:"include"})
    .then(r=>r.ok?r.json():null).then(features=>{
      gtMemberNavigation = Boolean(features?.member_navigation);
      setAdminLinkVisibility(gtLastUser);
    }).catch(()=>{});
  gtFoot.append(gtFootCaption);
  gtSidebar.append(gtDrawerTop, gtLabel, gtNav, gtFoot);

  // The admin link is a navigation convenience, never an authorization check.
  // Verify the existing server-side session. Protected APIs still enforce roles.
  function setAdminLinkVisibility(user) {
    gtLastUser = user;
    const complete = user?.logged_in && !user.must_change_password && !user.mfa_required && !user.setup_required;
    const admin = complete && ["admin","super_admin"].includes(user.role);
    gtUserGroup.hidden = !(complete && (admin || gtMemberNavigation));
    gtAdminLink.hidden = !admin;
    gtProtectedLinks.forEach(({ link, roles }) => {
      link.hidden = !(complete && roles.includes(user.role));
    });
  }
  window.addEventListener("rangerbook:auth-changed", event => {
    setAdminLinkVisibility(event.detail);
  });
  const sharedAuth = window.RangerbookAuth;
  if (sharedAuth) {
    setAdminLinkVisibility(sharedAuth.getUser());
    sharedAuth.ready().then(setAdminLinkVisibility).catch(() => setAdminLinkVisibility(null));
  } else if (!gtPath.startsWith(rootPrefix + "admin/") && !gtPath.startsWith(rootPrefix + "pvp/search/")) {
    // Admin and player-search pages load the existing RangerbookAuth module
    // immediately after site.js; it will emit rangerbook:auth-changed.
    fetch("https://rangerbook-auth.warmycat.com/auth/me", {
      method: "GET", credentials: "include", cache: "no-store", headers: { Accept: "application/json" }
    }).then(response => response.ok ? response.json() : null)
      .then(setAdminLinkVisibility)
      .catch(() => setAdminLinkVisibility(null));
  }
  const gtDrawerBackdrop = document.createElement("div");
  gtDrawerBackdrop.className = "gt-drawer-backdrop";
  gtDrawerBackdrop.inert = true;
  gtDrawerBackdrop.setAttribute("aria-hidden", "true");
  mount.append(gtDrawerBackdrop, gtSidebar);
  document.body.classList.add("gt-app");

  const compactSidebar = window.matchMedia("(max-width: 1120px)");
  toggle.setAttribute("aria-controls", gtSidebar.id);

  function setOpen(open, restoreFocus = false) {
    const shouldOpen = Boolean(open && compactSidebar.matches);
    gtSidebar.classList.toggle("gt-drawer-open", shouldOpen);
    document.body.classList.toggle("gt-drawer-active", shouldOpen);
    gtSidebar.inert = compactSidebar.matches && !shouldOpen;
    gtSidebar.setAttribute("aria-hidden", compactSidebar.matches && !shouldOpen ? "true" : "false");
    gtDrawerBackdrop.classList.toggle("gt-backdrop-open", shouldOpen);
    gtDrawerBackdrop.inert = !shouldOpen;
    header.classList.remove("menu-open"); // Keep the legacy dropdown closed.
    toggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    toggle.setAttribute("aria-label", shouldOpen ? "關閉選單" : "開啟選單");
    if (shouldOpen) gtDrawerClose.focus({ preventScroll: true });
    else if (restoreFocus && compactSidebar.matches) toggle.focus({ preventScroll: true });
  }

  function updateMenuMode() {
    if (!header || !inner || !nav || !homeLink) return;

    // The same left-hand sidebar becomes an off-canvas drawer on narrow screens.
    if (compactSidebar.matches) {
      header.classList.add("nav-collapsed");
      if (!gtSidebar.classList.contains("gt-drawer-open")) setOpen(false);
      return;
    }

    setOpen(false);
    header.classList.remove("nav-collapsed", "menu-open");

    const availableWidth = inner.clientWidth - homeLink.offsetWidth - 124;
    const neededWidth = nav.scrollWidth;
    const isWrapped = nav.getBoundingClientRect().height > 54;

    if (neededWidth > availableWidth || isWrapped) {
      header.classList.add("nav-collapsed");
    }
  }

  toggle.addEventListener("click", () => {
    setOpen(!gtSidebar.classList.contains("gt-drawer-open"));
  });
  gtDrawerClose.addEventListener("click", () => setOpen(false, true));
  gtDrawerBackdrop.addEventListener("click", () => setOpen(false, true));
  gtNav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", event => {
      if (!event.defaultPrevented) setOpen(false);
    });
  });
  gtBrand.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && gtSidebar.classList.contains("gt-drawer-open")) {
      event.preventDefault();
      setOpen(false, true);
    }
    if (event.key !== "Tab" || !gtSidebar.classList.contains("gt-drawer-open")) return;
    const targets = [...gtSidebar.querySelectorAll("a[href], button:not([disabled])")]
      .filter(node => !node.hidden && !node.closest("[inert]") && node.getClientRects().length);
    if (!targets.length) return;
    if (event.shiftKey && document.activeElement === targets[0]) {
      event.preventDefault();
      targets[targets.length - 1].focus();
    } else if (!event.shiftKey && document.activeElement === targets[targets.length - 1]) {
      event.preventDefault();
      targets[0].focus();
    }
  });

  document.addEventListener("click", event => {
    if (!header.contains(event.target) && !gtSidebar.contains(event.target)) setOpen(false);
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });

  applyTheme(getStoredTheme());

  window.addEventListener("resize", updateMenuMode);
  window.addEventListener("orientationchange", () => setTimeout(updateMenuMode, 150));
  window.addEventListener("load", updateMenuMode);
  requestAnimationFrame(updateMenuMode);
  setTimeout(updateMenuMode, 120);
  setTimeout(updateMenuMode, 500);
})();

