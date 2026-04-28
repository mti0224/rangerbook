(() => {
  const state = {
    page: 1,
    pageSize: 60,
    lastSignature: ""
  };

  const list = document.getElementById("rangerList");
  const summaryBar = document.querySelector(".summary-bar");
  if (!list || !summaryBar) return;

  const controls = document.createElement("section");
  controls.className = "pagination-bar";
  controls.innerHTML = `
    <div class="pagination-info" id="paginationInfo"></div>
    <div class="pagination-actions">
      <label class="pagination-size">
        <span>每頁顯示</span>
        <select id="paginationSize">
          <option value="30">30</option>
          <option value="60" selected>60</option>
          <option value="120">120</option>
        </select>
      </label>
      <button id="paginationPrev" type="button">上一頁</button>
      <div id="paginationPages" class="pagination-pages"></div>
      <button id="paginationNext" type="button">下一頁</button>
    </div>
  `;
  summaryBar.insertAdjacentElement("afterend", controls);

  const info = document.getElementById("paginationInfo");
  const sizeSelect = document.getElementById("paginationSize");
  const prevBtn = document.getElementById("paginationPrev");
  const nextBtn = document.getElementById("paginationNext");
  const pagesBox = document.getElementById("paginationPages");

  function getCards() {
    return [...list.querySelectorAll(":scope > .ranger-card")];
  }

  function makeSignature(cards) {
    return cards.map((card) => card.dataset.rangerId || "").join("|");
  }

  function makePageButtons(totalPages) {
    if (totalPages <= 1) {
      pagesBox.innerHTML = "";
      return;
    }

    const pages = new Set([1, totalPages, state.page - 1, state.page, state.page + 1]);
    const ordered = [...pages]
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((a, b) => a - b);

    const parts = [];
    let last = 0;
    ordered.forEach((page) => {
      if (page - last > 1) parts.push(`<span class="pagination-ellipsis">…</span>`);
      parts.push(`<button class="pagination-page ${page === state.page ? "active" : ""}" type="button" data-page="${page}">${page}</button>`);
      last = page;
    });

    pagesBox.innerHTML = parts.join("");
    pagesBox.querySelectorAll(".pagination-page").forEach((button) => {
      button.addEventListener("click", () => {
        state.page = Number(button.dataset.page) || 1;
        applyPagination(false);
        scrollToListTop();
      });
    });
  }

  function scrollToListTop() {
    const top = Math.max(0, list.getBoundingClientRect().top + window.scrollY - 120);
    window.scrollTo({ top, behavior: "smooth" });
  }

  function applyPagination(resetIfChanged = true) {
    const cards = getCards();

    if (!cards.length) {
      controls.hidden = true;
      return;
    }

    controls.hidden = false;

    const signature = makeSignature(cards);
    if (resetIfChanged && signature !== state.lastSignature) {
      state.page = 1;
      state.lastSignature = signature;
    }

    state.pageSize = Number(sizeSelect.value) || 60;
    const total = cards.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), totalPages);

    const start = (state.page - 1) * state.pageSize;
    const end = start + state.pageSize;

    cards.forEach((card, index) => {
      card.hidden = index < start || index >= end;
    });

    info.textContent = `第 ${state.page} / ${totalPages} 頁，顯示第 ${start + 1}–${Math.min(end, total)} 筆，共 ${total} 筆`;
    prevBtn.disabled = state.page <= 1;
    nextBtn.disabled = state.page >= totalPages;
    makePageButtons(totalPages);
  }

  sizeSelect.addEventListener("change", () => {
    state.page = 1;
    applyPagination(false);
    scrollToListTop();
  });

  prevBtn.addEventListener("click", () => {
    state.page -= 1;
    applyPagination(false);
    scrollToListTop();
  });

  nextBtn.addEventListener("click", () => {
    state.page += 1;
    applyPagination(false);
    scrollToListTop();
  });

  let timer = 0;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => applyPagination(true), 0);
  });

  observer.observe(list, { childList: true });
  document.addEventListener("DOMContentLoaded", () => applyPagination(true));
})();