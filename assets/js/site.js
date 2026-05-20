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
  const mount = document.getElementById("site-header");
  if (!mount) return;

  const THEME_KEY = "rangerbook-theme";
  const basePrefix = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const rootPrefix = basePrefix;

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

  ensureSiteIcon();
  applyTheme(getStoredTheme());

  loadStylesheet("header-responsive.css", "20260429c");
  loadStylesheet("mobile-interaction-fix.css", "20260430c");
  loadStylesheet("theme-toggle.css", "20260501b");

  mount.innerHTML = `
    <header class="site-header nav-collapsed">
      <div class="header-inner header-inner-left">
        <a class="site-home-link" href="${rootPrefix}">首頁</a>
        <nav class="site-nav" aria-label="主要導覽">
          <a href="${rootPrefix}ranger/">Rangers</a>
          <a href="${rootPrefix}pvp/">PvP</a>
          <a href="${rootPrefix}gear/">裝備</a>
          <a href="${rootPrefix}hs/">困難關卡</a>
          <a href="${rootPrefix}endless/">無限之塔</a>
          <a href="${rootPrefix}eventStageEnemy/">活動關卡</a>
          <a href="${rootPrefix}adventEnemy/">降臨關卡</a>
          <a href="${rootPrefix}labyrinth/">迷宮</a>
          <a href="${rootPrefix}ability/">能力</a>
          <a href="${rootPrefix}about/">關於本站</a>
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