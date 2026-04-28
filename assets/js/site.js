(() => {
  const mount = document.getElementById("site-header");
  if (!mount) return;

  const path = window.location.pathname.replace(/\/+$/, "");
  const isSubPage = path.endsWith("/ability") || path.endsWith("/ranger") || path.endsWith("/hsEnemy");
  const depthPrefix = isSubPage ? "../" : "./";

  mount.innerHTML = `
    <header class="site-header">
      <div class="header-inner header-inner-left">
        <nav class="site-nav" aria-label="主要導覽">
          <a href="${depthPrefix}">首頁</a>
          <a href="${depthPrefix}ranger/">Rangers</a>
          <a href="${depthPrefix}hsEnemy/">主困敵人</a>
          <a href="${depthPrefix}ability/">能力</a>
        </nav>
      </div>
    </header>
  `;
})();
