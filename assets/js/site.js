(() => {
  const mount = document.getElementById("site-header");
  if (!mount) return;

  const THEME_KEY = "rangerbook-theme";
  const path = window.location.pathname.replace(/\/+$/, "");
  const baseMatch = window.location.pathname.match(/^(.*\/rangerbook\/)/);
  const basePrefix = baseMatch ? baseMatch[1] : "/rangerbook/";
  const depth = window.location.pathname.replace(basePrefix, "").split("/").filter(Boolean).length;
  const depthPrefix = depth ? "../".repeat(depth) : "./";

  function loadStylesheet(filename, version) {
    if (document.querySelector(`link[href*="${filename}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${depthPrefix}assets/css/${filename}?v=${version}`;
    document.head.appendChild(link);
  }

  function getStoredTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return "light";
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    const text = theme === "dark" ? "深色模式" : "淺色模式";
    document.querySelectorAll(".theme-current-mode").forEach((el) => { el.textContent = text; });
    const toggle = document.querySelector(".theme-toggle-row");
    toggle?.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  }

  applyTheme(getStoredTheme());

  loadStylesheet("header-responsive.css", "20260429c");
  loadStylesheet("mobile-interaction-fix.css", "20260430c");
  loadStylesheet("theme-toggle.css", "20260501a");

  mount.innerHTML = `
    <header class="site-header nav-collapsed">
      <div class="header-inner header-inner-left">
        <a class="site-home-link" href="${depthPrefix}">首頁</a>
        <nav class="site-nav" aria-label="主要導覽">
          <a href="${depthPrefix}ranger/">Rangers</a>
          <a href="${depthPrefix}gear/">裝備</a>
          <a href="${depthPrefix}hsEnemy/">困難關卡</a>
          <a href="${depthPrefix}endless/">無限之塔</a>
          <a href="${depthPrefix}eventStageEnemy/">活動關卡</a>
          <a href="${depthPrefix}adventEnemy/">降臨關卡</a>
          <a href="${depthPrefix}labyrinthEnemy/">迷宮</a>
          <a href="${depthPrefix}ability/">能力</a>
        </nav>
        <div class="site-actions">
          <div class="site-settings">
            <button class="site-settings-toggle" type="button" aria-label="開啟設定" aria-expanded="false">⚙</button>
            <div class="site-settings-menu" role="menu">
              <button class="theme-toggle-row" type="button" role="menuitem" aria-pressed="false">
                <span class="theme-toggle-label">
                  <span>深淺色模式</span>
                  <small class="theme-current-mode">淺色模式</small>
                </span>
                <span class="theme-toggle-pill" aria-hidden="true"></span>
              </button>
            </div>
          </div>
          <button class="site-menu-toggle" type="button" aria-label="開啟選單" aria-expanded="false">
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>
    </header>
  `;

  const header = mount.querySelector(".site-header");
  const inner = mount.querySelector(".header-inner");
  const nav = mount.querySelector(".site-nav");
  const homeLink = mount.querySelector(".site-home-link");
  const toggle = mount.querySelector(".site-menu-toggle");
  const settings = mount.querySelector(".site-settings");
  const settingsToggle = mount.querySelector(".site-settings-toggle");
  const themeToggle = mount.querySelector(".theme-toggle-row");

  function setOpen(open) {
    header.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function setSettingsOpen(open) {
    settings.classList.toggle("open", open);
    settingsToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function updateMenuMode() {
    if (!header || !inner || !nav || !homeLink) return;

    const forceCollapsed = window.matchMedia("(max-width: 760px)").matches;

    if (forceCollapsed) {
      header.classList.add("nav-collapsed");
      return;
    }

    header.classList.remove("nav-collapsed", "menu-open");
    toggle.setAttribute("aria-expanded", "false");

    const availableWidth = inner.clientWidth - homeLink.offsetWidth - 124;
    const neededWidth = nav.scrollWidth;
    const isWrapped = nav.getBoundingClientRect().height > 54;

    if (neededWidth > availableWidth || isWrapped) {
      header.classList.add("nav-collapsed");
    }
  }

  toggle.addEventListener("click", () => {
    setSettingsOpen(false);
    setOpen(!header.classList.contains("menu-open"));
  });

  settingsToggle.addEventListener("click", () => {
    setOpen(false);
    setSettingsOpen(!settings.classList.contains("open"));
  });

  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
  });

  document.addEventListener("click", (event) => {
    if (!header.contains(event.target)) {
      setOpen(false);
      setSettingsOpen(false);
    }
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