(() => {
  const mount = document.getElementById("site-header");
  if (!mount) return;

  const path = window.location.pathname.replace(/\/+$/, "");
  const isSubPage = path.endsWith("/ability") || path.endsWith("/ranger") || path.endsWith("/gear") || path.endsWith("/hsEnemy") || path.endsWith("/infEnemy") || path.endsWith("/eventStageEnemy") || path.endsWith("/adventEnemy");
  const depthPrefix = isSubPage ? "../" : "./";

  function loadStylesheet(filename, version) {
    if (document.querySelector(`link[href*="${filename}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${depthPrefix}assets/css/${filename}?v=${version}`;
    document.head.appendChild(link);
  }

  loadStylesheet("header-responsive.css", "20260429c");
  loadStylesheet("mobile-interaction-fix.css", "20260430b");

  mount.innerHTML = `
    <header class="site-header nav-collapsed">
      <div class="header-inner header-inner-left">
        <a class="site-home-link" href="${depthPrefix}">首頁</a>
        <nav class="site-nav" aria-label="主要導覽">
          <a href="${depthPrefix}ranger/">Rangers</a>
          <a href="${depthPrefix}gear/">裝備</a>
          <a href="${depthPrefix}hsEnemy/">主困敵人</a>
          <a href="${depthPrefix}infEnemy/">無限之塔</a>
          <a href="${depthPrefix}eventStageEnemy/">活動關卡</a>
          <a href="${depthPrefix}adventEnemy/">降臨敵人</a>
          <a href="${depthPrefix}ability/">能力</a>
        </nav>
        <button class="site-menu-toggle" type="button" aria-label="開啟選單" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
      </div>
    </header>
  `;

  const header = mount.querySelector(".site-header");
  const inner = mount.querySelector(".header-inner");
  const nav = mount.querySelector(".site-nav");
  const homeLink = mount.querySelector(".site-home-link");
  const toggle = mount.querySelector(".site-menu-toggle");

  function setOpen(open) {
    header.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
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

    const availableWidth = inner.clientWidth - homeLink.offsetWidth - 72;
    const neededWidth = nav.scrollWidth;
    const isWrapped = nav.getBoundingClientRect().height > 54;

    if (neededWidth > availableWidth || isWrapped) {
      header.classList.add("nav-collapsed");
    }
  }

  toggle.addEventListener("click", () => {
    setOpen(!header.classList.contains("menu-open"));
  });

  document.addEventListener("click", (event) => {
    if (!header.classList.contains("nav-collapsed")) return;
    if (!header.contains(event.target)) setOpen(false);
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });

  function installTouchTapFallback() {
    const isCoarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (!isCoarsePointer) return;

    let touchMoved = false;
    let lastSyntheticClickAt = 0;

    document.addEventListener("touchmove", () => {
      touchMoved = true;
    }, { passive: true });

    document.addEventListener("touchstart", () => {
      touchMoved = false;
    }, { passive: true });

    document.addEventListener("click", (event) => {
      if (Date.now() - lastSyntheticClickAt < 500) {
        event.stopPropagation();
      }
    }, true);

    document.addEventListener("touchend", (event) => {
      if (touchMoved || event.touches.length) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest("input, select, textarea, label")) return;

      const clickable = target.closest("button, a, .ranger-card, .gear-card, .ability-card");
      if (!clickable) return;
      if (clickable.matches("a")) return;

      event.preventDefault();
      lastSyntheticClickAt = Date.now();
      clickable.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window
      }));
    }, { passive: false });
  }

  installTouchTapFallback();

  window.addEventListener("resize", updateMenuMode);
  window.addEventListener("orientationchange", () => setTimeout(updateMenuMode, 150));
  window.addEventListener("load", updateMenuMode);
  requestAnimationFrame(updateMenuMode);
  setTimeout(updateMenuMode, 120);
  setTimeout(updateMenuMode, 500);
})();
