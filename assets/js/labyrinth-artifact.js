(() => {
  const ROOT = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const DATA_URL = `${ROOT}res/%E8%BF%B7%E5%AE%AE%E9%81%BA%E7%89%A9.json`;

  const state = {
    rows: [],
    filtered: [],
    selectedName: null
  };

  const $ = (id) => document.getElementById(id);
  const searchInput = $("artifactSearchInput");
  const categoryFilter = $("artifactCategoryFilter");
  const resetBtn = $("artifactResetBtn");
  const resultCount = $("artifactResultCount");
  const artifactList = $("artifactList");
  const modal = $("artifactModal");
  const modalContent = $("artifactModalContent");
  const modalCloseBtn = $("artifactModalCloseBtn");

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

  function formatValue(value) {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "number") return value.toLocaleString("zh-Hant");
    return escapeHtml(value);
  }

  function normalizeIconPath(path) {
    const clean = text(path).replace(/^\/+/, "");
    return clean ? `${ROOT}assets/${clean}` : "";
  }

  function getGrade(name) {
    const match = text(name).match(/\[([^\]]+)\]$/);
    return match ? match[1] : "";
  }

  function categoryClass(category) {
    if (category === "增益") return "tag-buff";
    if (category === "負面") return "tag-debuff";
    return "";
  }

  function toRows(raw) {
    return Object.entries(raw || {}).map(([name, item]) => {
      const scores = item?.["分數"] && typeof item["分數"] === "object" ? item["分數"] : {};
      const searchBlob = [
        name,
        getGrade(name),
        item?.["分類"],
        item?.["效果"],
        ...Object.keys(scores),
        ...Object.values(scores)
      ].map(text).join(" ").toLowerCase();
      return { name, item, scores, searchBlob };
    });
  }

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }

  function fillCategoryFilter() {
    const current = categoryFilter.value;
    const values = uniqueSorted(state.rows.map((row) => text(row.item?.["分類"])));
    categoryFilter.innerHTML = `<option value="">全部</option>` + values
      .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
      .join("");
    if (values.includes(current)) categoryFilter.value = current;
  }

  function applyFilters() {
    const q = searchInput.value.trim().toLowerCase();
    const category = categoryFilter.value;
    state.filtered = state.rows.filter((row) => {
      if (q && !row.searchBlob.includes(q)) return false;
      if (category && text(row.item?.["分類"]) !== category) return false;
      return true;
    });
    renderList();
  }

  function renderList() {
    resultCount.textContent = state.filtered.length.toLocaleString("zh-Hant");
    if (!state.filtered.length) {
      artifactList.innerHTML = `<div class="empty-state">找不到符合條件的迷宮遺物。</div>`;
      return;
    }

    artifactList.innerHTML = state.filtered.map((row) => {
      const item = row.item || {};
      const category = text(item["分類"]);
      const iconUrl = normalizeIconPath(item.icon_path);
      const active = row.name === state.selectedName ? " active" : "";
      return `
        <button class="ability-card labyrinth-artifact-card${active}" type="button" data-name="${escapeHtml(row.name)}">
          <div class="ability-icon-wrap labyrinth-artifact-icon-wrap">
            ${iconUrl ? `<img class="ability-icon labyrinth-artifact-icon" src="${iconUrl}" alt="" loading="lazy" onerror="this.closest('.ability-icon-wrap').classList.add('missing-icon'); this.remove();">` : `<span class="no-icon">無圖</span>`}
          </div>
          <div class="ability-main">
            <div class="ability-title-row">
              <h2>${escapeHtml(row.name)}</h2>
              ${category ? `<span class="tag ${categoryClass(category)}">${escapeHtml(category)}</span>` : ""}
            </div>
            ${item["效果"] ? `<p class="desc">${escapeHtml(item["效果"])}</p>` : ""}
            <div class="mini-meta">
              ${getGrade(row.name) ? `<span>${escapeHtml(getGrade(row.name))}級</span>` : ""}
              <span>${Object.keys(row.scores).length.toLocaleString("zh-Hant")} 種分數</span>
            </div>
          </div>
        </button>
      `;
    }).join("");

    artifactList.querySelectorAll(".labyrinth-artifact-card").forEach((card) => {
      card.addEventListener("click", () => selectArtifact(card.dataset.name));
    });
  }

  function selectArtifact(name) {
    state.selectedName = name;
    const row = state.rows.find((item) => item.name === name);
    if (!row) return;
    renderList();
    openModal(renderArtifactDetail(row));
  }

  function renderScoreTable(scores) {
    const entries = Object.entries(scores || {});
    if (!entries.length) return `<div class="empty-state small">沒有分數資料。</div>`;
    return `
      <div class="table-scroll labyrinth-score-table-wrap">
        <table class="labyrinth-score-table">
          <thead>
            <tr>
              <th>類型／屬性</th>
              <th>可獲得分數</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(([label, value]) => `
              <tr>
                <th>${escapeHtml(label)}</th>
                <td>${formatValue(value)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderArtifactDetail(row) {
    const item = row.item || {};
    const iconUrl = normalizeIconPath(item.icon_path);
    return `
      <div class="detail-head ability-detail-head labyrinth-artifact-detail-head">
        <div class="ability-icon-wrap large labyrinth-artifact-icon-wrap large">
          ${iconUrl ? `<img class="ability-icon labyrinth-artifact-icon" src="${iconUrl}" alt="" onerror="this.closest('.ability-icon-wrap').classList.add('missing-icon'); this.remove();">` : `<span class="no-icon">無圖</span>`}
        </div>
        <div>
          <h2 id="artifactModalTitle">${escapeHtml(row.name)}</h2>
        </div>
      </div>

      ${item["效果"] ? `
      <section class="detail-section ability-detail-section">
        <h3>敘述</h3>
        <p class="preline">${escapeHtml(item["效果"])}</p>
      </section>` : ""}

      <section class="detail-section ability-detail-section">
        <h3>各類型／屬性可獲得的分數</h3>
        ${renderScoreTable(row.scores)}
      </section>
    `;
  }

  function openModal(html) {
    modalContent.innerHTML = html;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    modal.scrollTop = 0;
    modalContent.scrollTop = 0;
    modalCloseBtn.focus();
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
      state.rows = toRows(await res.json());
      state.filtered = [...state.rows];
      fillCategoryFilter();
      renderList();
    } catch (error) {
      artifactList.innerHTML = `<div class="empty-state">資料載入失敗，請確認「迷宮遺物.json」是否已放在 /res 資料夾。</div>`;
      console.error(error);
    }
  }

  searchInput?.addEventListener("input", applyFilters);
  categoryFilter?.addEventListener("change", applyFilters);
  resetBtn?.addEventListener("click", () => {
    searchInput.value = "";
    categoryFilter.value = "";
    applyFilters();
  });
  modalCloseBtn?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  init();
})();
