(() => {
  function getTopPaginationBar() {
    return document.querySelector(".pagination-bar:not(.pagination-bar-bottom)");
  }

  function getListAnchor(topBar) {
    let node = topBar?.nextElementSibling;
    while (node) {
      if (
        node.matches?.(".ranger-list-layout, .layout.modal-list-layout, .ranger-list, .ability-list, .gear-list, .ranking-list") ||
        node.querySelector?.(".ranger-list, .ability-list, .gear-list, .ranking-list")
      ) return node;
      node = node.nextElementSibling;
    }
    return document.querySelector(".ranger-list-layout, .layout.modal-list-layout, .ranking-list") || topBar;
  }

  function ensureBottomBar() {
    const topBar = getTopPaginationBar();
    const existing = document.getElementById("bottomPaginationBar");
    if (!topBar || topBar.hidden) {
      if (existing) existing.hidden = true;
      return null;
    }

    let bottomBar = existing;
    if (!bottomBar) {
      bottomBar = document.createElement("section");
      bottomBar.id = "bottomPaginationBar";
      bottomBar.className = "pagination-bar pagination-bar-bottom";
      getListAnchor(topBar).insertAdjacentElement("afterend", bottomBar);
    }
    bottomBar.hidden = false;
    return bottomBar;
  }

  function syncBottomPagination() {
    const topBar = getTopPaginationBar();
    const bottomBar = ensureBottomBar();
    if (!topBar || !bottomBar) return;

    const info = document.getElementById("paginationInfo")?.textContent || "";
    const size = document.getElementById("paginationSize")?.value || "60";
    const prevDisabled = document.getElementById("paginationPrev")?.disabled ? "disabled" : "";
    const nextDisabled = document.getElementById("paginationNext")?.disabled ? "disabled" : "";
    const pagesHtml = document.getElementById("paginationPages")?.innerHTML || "";

    bottomBar.innerHTML = `
      <div class="pagination-info bottom-pagination-info">${info}</div>
      <div class="pagination-actions">
        <label class="pagination-size">
          <span>每頁顯示</span>
          <select id="bottomPaginationSize">
            <option value="30" ${size === "30" ? "selected" : ""}>30</option>
            <option value="60" ${size === "60" ? "selected" : ""}>60</option>
            <option value="120" ${size === "120" ? "selected" : ""}>120</option>
          </select>
        </label>
        <button id="bottomPaginationPrev" type="button" ${prevDisabled}>上一頁</button>
        <div id="bottomPaginationPages" class="pagination-pages">${pagesHtml}</div>
        <button id="bottomPaginationNext" type="button" ${nextDisabled}>下一頁</button>
      </div>
    `;
  }

  function clickTopPage(page) {
    const selector = `#paginationPages .pagination-page[data-page="${CSS.escape(page)}"]`;
    const topButton = document.querySelector(selector);
    if (topButton) topButton.click();
  }

  document.addEventListener("change", (event) => {
    if (event.target?.id !== "bottomPaginationSize") return;
    const topSize = document.getElementById("paginationSize");
    if (!topSize) return;
    topSize.value = event.target.value;
    topSize.dispatchEvent(new Event("change", { bubbles: true }));
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.id === "bottomPaginationPrev") {
      event.preventDefault();
      document.getElementById("paginationPrev")?.click();
      return;
    }

    if (target.id === "bottomPaginationNext") {
      event.preventDefault();
      document.getElementById("paginationNext")?.click();
      return;
    }

    const pageButton = target.closest("#bottomPaginationPages .pagination-page");
    if (pageButton) {
      event.preventDefault();
      clickTopPage(pageButton.dataset.page || "1");
    }
  });

  let timer = 0;
  function scheduleSync() {
    clearTimeout(timer);
    timer = setTimeout(syncBottomPagination, 60);
  }

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.target?.closest?.("#bottomPaginationBar"))) return;
    scheduleSync();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "disabled", "class", "data-page"]
  });

  document.addEventListener("DOMContentLoaded", scheduleSync);
  window.addEventListener("load", scheduleSync);
  scheduleSync();
})();
