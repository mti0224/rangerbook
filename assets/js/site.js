(() => {
  const mount = document.getElementById("site-header");
  if (!mount) return;

  const path = window.location.pathname.replace(/\/+$/, "");
  const isSubPage = path.endsWith("/ability") || path.endsWith("/ranger") || path.endsWith("/gear") || path.endsWith("/hsEnemy") || path.endsWith("/infEnemy");
  const depthPrefix = isSubPage ? "../" : "./";

  mount.innerHTML = `
    <header class="site-header">
      <div class="header-inner header-inner-left">
        <button class="site-menu-toggle" type="button" aria-label="開啟選單" aria-expanded="false">選單</button>
        <nav class="site-nav" aria-label="主要導覽">
          <a href="${depthPrefix}">首頁</a>
          <a href="${depthPrefix}ranger/">Rangers</a>
          <a href="${depthPrefix}gear/">裝備</a>
          <a href="${depthPrefix}hsEnemy/">主困敵人</a>
          <a href="${depthPrefix}infEnemy/">無限之塔</a>
          <a href="${depthPrefix}ability/">能力</a>
        </nav>
      </div>
    </header>
  `;

  const header = mount.querySelector(".site-header");
  const inner = mount.querySelector(".header-inner");
  const nav = mount.querySelector(".site-nav");
  const toggle = mount.querySelector(".site-menu-toggle");

  function setOpen(open) {
    header.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function updateMenuMode() {
    if (!header || !inner || !nav) return;

    header.classList.remove("nav-collapsed", "menu-open");
    toggle.setAttribute("aria-expanded", "false");

    const availableWidth = inner.clientWidth - 8;
    const neededWidth = nav.scrollWidth;
    if (neededWidth > availableWidth) {
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

  window.addEventListener("resize", updateMenuMode);
  window.addEventListener("load", updateMenuMode);
  requestAnimationFrame(updateMenuMode);
})();
