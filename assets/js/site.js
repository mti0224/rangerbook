(() => {
  const mount = document.getElementById("site-header");
  if (!mount) return;

  const path = window.location.pathname.replace(/\/+$/, "");
  const isSubPage = path.endsWith("/ability") || path.endsWith("/ranger") || path.endsWith("/hsEnemy");
  const depthPrefix = isSubPage ? "../" : "./";

  mount.innerHTML = `
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="${depthPrefix}">
          <span class="brand-mark">LR</span>
          <span>LINE Rangers 資料查詢</span>
        </a>
        <nav class="site-nav" aria-label="主要導覽">
          <a href="${depthPrefix}">首頁</a>
          <a href="${depthPrefix}ability/">能力查詢</a>
          <a href="${depthPrefix}ranger/">角色查詢</a>
          <a href="${depthPrefix}hsEnemy/">困難敵人</a>
        </nav>
      </div>
    </header>
  `;
})();
