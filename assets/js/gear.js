(() => {
  const DATA_URL = "../res/%E8%A3%9D%E5%82%99%E8%B3%87%E6%96%99%E5%BA%AB.json";
  const GEAR_ICON = (id) => `https://rangers.lerico.net/res/gear_icon/${encodeURIComponent(id)}_icon.png`;

  const state = { rows: [], filtered: [], selectedId: "", page: 1, pageSize: 60 };
  const $ = (id) => document.getElementById(id);
  const searchInput = $("gearSearchInput");
  const starFilter = $("gearStarFilter");
  const typeFilter = $("gearTypeFilter");
  const resetBtn = $("gearResetBtn");
  const resultCount = $("gearResultCount");
  const gearList = $("gearList");
  const modal = $("gearModal");
  const modalPanel = modal?.querySelector(".modal-panel");
  const modalContent = $("gearModalContent");
  const modalCloseBtn = $("gearModalCloseBtn");

  function text(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value).replaceAll("\\n", "\n").trim();
  }

  function escapeHtml(value) {
    return text(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isEmptyObject(value) {
    return !value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length === 0;
  }

  function getId(gear) {
    return text(gear.id || gear.gear_id || gear.code || "");
  }

  function getName(gear) {
    return text(gear["裝備名稱"] || gear.name || getId(gear));
  }

  function numberFrom(value) {
    const matched = text(value).match(/\d+/g);
    return matched ? Number(matched.join("")) : 0;
  }

  function getStarNumber(gear) {
    return numberFrom(gear["裝備星級"]);
  }

  function getGearNumber(gear) {
    return numberFrom(gear["編號"] || gear.number || gear.no || getId(gear));
  }

  function sortGearRows(a, b) {
    const starDiff = getStarNumber(b.gear) - getStarNumber(a.gear);
    if (starDiff) return starDiff;

    const numberDiff = getGearNumber(a.gear) - getGearNumber(b.gear);
    if (numberDiff) return numberDiff;

    return getId(a.gear).localeCompare(getId(b.gear), "zh-Hant", { numeric: true }) || a.index - b.index;
  }

  function effectText(obj, limit = 3) {
    if (isEmptyObject(obj)) return [];
    return Object.entries(obj).slice(0, limit).map(([key, value]) => `${key} ${value}`);
  }

  function searchBlob(gear) {
    return [
      getId(gear),
      getName(gear),
      gear["裝備星級"],
      gear["裝備種類"],
      gear["基本效果"],
      gear["高級效果"],
      gear["Skill+"]
    ].map(text).join(" ").toLowerCase();
  }

  function uniqueSorted(values) {
    return [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant", { numeric: true }));
  }

  function fillSelect(select, values) {
    select.innerHTML = `<option value="">全部</option>` + uniqueSorted(values)
      .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
      .join("");
  }

  function ensurePaginationBar() {
    if ($("gearPaginationBar")) return;
    const summaryBar = document.querySelector(".summary-bar");
    const bar = document.createElement("section");
    bar.id = "gearPaginationBar";
    bar.className = "pagination-bar";
    bar.innerHTML = `
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
    summaryBar?.insertAdjacentElement("afterend", bar);
    $("paginationSize")?.addEventListener("change", (event) => {
      state.pageSize = Number(event.target.value) || 60;
      state.page = 1;
      renderList();
    });
    $("paginationPrev")?.addEventListener("click", () => {
      state.page -= 1;
      renderList();
    });
    $("paginationNext")?.addEventListener("click", () => {
      state.page += 1;
      renderList();
    });
  }

  function renderPagination(total) {
    ensurePaginationBar();
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const start = (state.page - 1) * state.pageSize;
    const end = Math.min(start + state.pageSize, total);
    $("paginationInfo").textContent = total ? `第 ${state.page} / ${totalPages} 頁，顯示第 ${start + 1}–${end} 筆，共 ${total} 筆` : "";
    $("paginationPrev").disabled = state.page <= 1;
    $("paginationNext").disabled = state.page >= totalPages;

    const pages = [...new Set([1, totalPages, state.page - 1, state.page, state.page + 1])]
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((a, b) => a - b);
    let last = 0;
    $("paginationPages").innerHTML = totalPages <= 1 ? "" : pages.map((page) => {
      const gap = page - last > 1 ? `<span class="pagination-ellipsis">…</span>` : "";
      last = page;
      return `${gap}<button class="pagination-page ${page === state.page ? "active" : ""}" type="button" data-page="${page}">${page}</button>`;
    }).join("");
    $("paginationPages").querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        state.page = Number(button.dataset.page) || 1;
        renderList();
      });
    });
  }

  function applyFilters() {
    const q = searchInput.value.trim().toLowerCase();
    const star = starFilter.value;
    const type = typeFilter.value;
    state.filtered = state.rows.filter((row) => {
      const gear = row.gear;
      if (q && !row.search.includes(q)) return false;
      if (star && text(gear["裝備星級"]) !== star) return false;
      if (type && text(gear["裝備種類"]) !== type) return false;
      return true;
    });
    state.page = 1;
    renderList();
  }

  function renderList() {
    const total = state.filtered.length;
    resultCount.textContent = total.toLocaleString("zh-Hant");
    renderPagination(total);
    if (!total) {
      gearList.innerHTML = `<div class="empty-state">找不到符合條件的裝備。</div>`;
      return;
    }

    const rows = state.filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
    gearList.innerHTML = rows.map(({ gear }) => {
      const id = getId(gear);
      const tags = [gear["裝備星級"] ? `${gear["裝備星級"]}星` : "", gear["裝備種類"]].filter(Boolean);
      const mini = effectText(gear["基本效果"], 3);
      return `
        <button class="ranger-card gear-card ${state.selectedId === id ? "active" : ""}" type="button" data-gear-id="${escapeHtml(id)}">
          <div class="ranger-thumb-wrap gear-thumb-wrap">
            <img class="ranger-thumb gear-thumb" src="${GEAR_ICON(id)}" alt="" loading="lazy" onerror="this.closest('.gear-thumb-wrap').classList.add('missing-icon'); this.remove();">
          </div>
          <div class="ranger-card-main">
            <div class="ranger-title-row"><h2>${escapeHtml(getName(gear))}</h2></div>
            <div class="ranger-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
            <div class="ranger-mini-stats gear-mini-stats">${mini.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
          </div>
        </button>
      `;
    }).join("");

    gearList.querySelectorAll(".gear-card").forEach((card) => {
      card.addEventListener("click", () => openGear(card.dataset.gearId));
    });
  }

  function renderEffectTable(title, effects, extraHeader = "") {
    if (isEmptyObject(effects)) return `<div class="empty-state small">沒有${escapeHtml(title)}資料。</div>`;
    return `
      ${extraHeader}
      <div class="table-scroll gear-effect-table-wrap">
        <table class="gear-effect-table">
          <thead><tr><th>效果</th><th>數值</th></tr></thead>
          <tbody>
            ${Object.entries(effects).map(([key, value]) => `
              <tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderAdvanced(advanced) {
    if (isEmptyObject(advanced)) return `<div class="empty-state small">沒有高級效果資料。</div>`;
    const condition = advanced["觸發條件"];
    const switchable = advanced["可切換的效果"];
    const header = condition ? `<p class="gear-condition">觸發條件：${escapeHtml(condition)}</p>` : "";
    if (switchable && typeof switchable === "object") {
      return renderEffectTable("高級效果", switchable, header);
    }
    return renderEffectTable("高級效果", advanced);
  }

  function openGear(id) {
    state.selectedId = id;
    const row = state.rows.find(({ gear }) => getId(gear) === id);
    if (!row) return;
    const gear = row.gear;
    renderList();
    modalContent.innerHTML = `
      <div class="ranger-detail-head gear-detail-head">
        <div class="ranger-detail-image-wrap gear-detail-image-wrap">
          <img class="ranger-detail-image gear-detail-image" src="${GEAR_ICON(id)}" alt="" onerror="this.closest('.gear-detail-image-wrap').classList.add('missing-icon'); this.remove();">
        </div>
        <div>
          <h2 id="gearModalTitle">${escapeHtml(getName(gear))}</h2>
          <div class="ranger-tags detail-tags">
            ${[gear["裝備星級"] ? `${gear["裝備星級"]}星` : "", gear["裝備種類"]].filter(Boolean).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
          </div>
        </div>
      </div>
      <section class="detail-section"><h3>基本效果</h3>${renderEffectTable("基本效果", gear["基本效果"])}</section>
      <section class="detail-section"><h3>高級效果</h3>${renderAdvanced(gear["高級效果"])}</section>
      <section class="detail-section"><h3>Skill+</h3>${renderEffectTable("Skill+", gear["Skill+"])}</section>
    `;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    modal.scrollTop = 0;
    modalPanel.scrollTop = 0;
    modalContent.scrollTop = 0;
  }

  function closeModal() {
    modal.hidden = true;
    modalContent.innerHTML = "";
    document.body.classList.remove("modal-open");
  }

  async function init() {
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      state.rows = (Array.isArray(raw) ? raw : [])
        .map((gear, index) => ({ gear, index, search: searchBlob(gear) }))
        .sort(sortGearRows);
      state.filtered = [...state.rows];
      fillSelect(starFilter, state.rows.map(({ gear }) => gear["裝備星級"]));
      fillSelect(typeFilter, state.rows.map(({ gear }) => gear["裝備種類"]));
      renderList();
    } catch (error) {
      gearList.innerHTML = `<div class="empty-state">資料載入失敗，請確認裝備資料庫.json是否已放在 /res 資料夾。</div>`;
      console.error(error);
    }
  }

  [searchInput, starFilter, typeFilter].forEach((el) => {
    el.addEventListener("input", applyFilters);
    el.addEventListener("change", applyFilters);
  });
  resetBtn.addEventListener("click", () => {
    searchInput.value = "";
    starFilter.value = "";
    typeFilter.value = "";
    applyFilters();
  });
  modalCloseBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modal.hidden) closeModal(); });

  init();
})();
