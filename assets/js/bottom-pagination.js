(() => {
  const SOURCE_IDS = ["paginationInfo", "paginationSize", "paginationPrev", "paginationNext", "paginationPages"];

  function getTopPaginationBar() {
    return document.querySelector(".pagination-bar:not(.pagination-bar-bottom)");
  }

  function findListAfter(bar) {
    let node = bar?.nextElementSibling;
    while (node) {
      if (node.querySelector?.(".ranger-list, .ability-list, .gear-list")) return node;
      node = node.nextElementSibling;
    }
    return document.querySelector(".ranger-list-layout, .layout.modal-list-layout") || bar;
  }

  function ensureBottomBar() {
    const topBar = getTopPaginationBar();
    if (!topBar || topBar.hidden) {
      const existing = document.getElementById("bottomPaginationBar");
      if (existing) existing.hidden = true;
      return null;
    }

    let bottomBar = document.getElementById("bottomPaginationBar");
    if (!bottomBar) {
      bottomBar = document.createElement("section");
      bottomBar.id = "bottomPaginationBar";
      bottomBar.className = "pagination-bar pagination-bar-bottom";
      const anchor = findListAfter(topBar);
      anchor.insertAdjacentElement("afterend", bottomBar);
    }
    bottomBar.hidden = false;
    return bottomBar;
  }

  function copyPagination() {
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

    document.getElementById("bottomPaginationSize")?.addEventListener("change", (event) => {
      const topSize = document.getElementById("paginationSize");
      if (!topSize) return;
      topSize.value = event.target.value;
      topSize.dispatchEvent(new Event("change", { bubbles: true }));
    });

    document.getElementById("bottomPaginationPrev")?.addEventListener("click", () => {
      document.getElementById("paginationPrev")?.click();
    });

    document.getElementById("bottomPaginationNext")?.addEventListener("click", () => {
      document.getElementById("paginationNext")?.click();
    });

    document.querySelectorAll("#bottomPaginationPages .pagination-page").forEach((button) => {
      button.addEventListener("click", () => {
        const page = button.dataset.page;
        const topButton = document.querySelector(`#paginationPages .pagination-page[data-page="${CSS.escape(page)}"]`);
        topButton?.click();
      });
    });
  }

  let timer = 0;
  function scheduleCopy() {
    clearTimeout(timer);
    timer = setTimeout(copyPagination, 30);
  }

  const observer = new MutationObserver(scheduleCopy);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "disabled", "class"] });
  document.addEventListener("DOMContentLoaded", scheduleCopy);
  window.addEventListener("load", scheduleCopy);
  scheduleCopy();
})();
