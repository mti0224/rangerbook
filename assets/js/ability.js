(() => {
  const ICON_BASE = "https://rangers.lerico.net/res/ability_icon/";
  const DATA_URL = "../res/%E8%83%BD%E5%8A%9B.json";
  const ADMIN_MODE_KEY = "rangerbook-admin-mode";

  const state = {
    raw: {},
    rows: [],
    filtered: [],
    selectedCode: null
  };

  const $ = (id) => document.getElementById(id);

  const searchInput = $("searchInput");
  const categoryFilter = $("categoryFilter");
  const timingFilter = $("timingFilter");
  const modeFilter = $("modeFilter");
  const conditionFilter = $("conditionFilter");
  const resetBtn = $("resetBtn");
  const abilityList = $("abilityList");
  const resultCount = $("resultCount");
  const modal = $("abilityModal");
  const modalContent = $("modalContent");
  const modalCloseBtn = $("modalCloseBtn");

  function isAdminMode() {
    return localStorage.getItem(ADMIN_MODE_KEY) === "true";
  }

  function normalizeText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    return JSON.stringify(value, null, 2);
  }

  function formatText(value) {
    return normalizeText(value).replaceAll("\\n", "\n").trim();
  }

  function isNoneText(value) {
    return formatText(value) === "(無)";
  }

  function isEnabled(value) {
    if (value === true || value === 1) return true;
    const text = formatText(value).toLowerCase();
    return ["是", "true", "1", "yes", "y"].includes(text);
  }

  function getAbilityTag(item, detail = false) {
    if (isEnabled(item["覺醒能力"])) {
      return { label: detail ? "覺醒能力" : "覺醒", filterValue: "覺醒", className: "tag-wake" };
    }
    if (isEnabled(item["一般敵人能力"])) {
      return { label: "敵人", filterValue: "敵人", className: "tag-enemy" };
    }
    if (isEnabled(item["迷宮敵人能力"])) {
      return { label: "迷宮", filterValue: "迷宮", className: "tag-maze" };
    }
    if (isEnabled(item["小隊"])) {
      return { label: "小隊", filterValue: "小隊", className: "tag-team" };
    }
    return { label: detail ? "一般能力" : "一般", filterValue: "一般", className: "" };
  }

  function shouldHideAbility(item) {
    return isNoneText(item["名稱"]) || isNoneText(item["敘述"]);
  }

  function displayText(value) {
    const text = formatText(value);
    return text === "(無)" ? "" : text;
  }

  function getAbilityName(item, code = "") {
    const name = displayText(item["名稱"]);
    if (name) return name;
    return isAdminMode() && code ? code : "未命名能力";
  }

  function getAbilityDescription(item) {
    return displayText(item["敘述"]);
  }

  function getEffects(item) {
    return Object.entries(item)
      .filter(([key, value]) => key.startsWith("觸發效果") && value && typeof value === "object")
      .sort(([a], [b]) => {
        const na = a === "觸發效果" ? 1 : Number(a.replace("觸發效果", "")) || 999;
        const nb = b === "觸發效果" ? 1 : Number(b.replace("觸發效果", "")) || 999;
        return na - nb;
      })
      .map(([key, value], index) => ({ label: `效果 ${index + 1}`, ...value }));
  }

  function toRows(raw) {
    const adminMode = isAdminMode();
    return Object.entries(raw)
      .filter(([, item]) => adminMode || !shouldHideAbility(item))
      .map(([code, item]) => {
        const effects = getEffects(item);
        const tag = getAbilityTag(item);
        const searchBlob = [
          code,
          item["覺醒能力"],
          item["一般敵人能力"],
          item["迷宮敵人能力"],
          item["小隊"],
          tag.label,
          getAbilityName(item, code),
          getAbilityDescription(item),
          ...effects.flatMap(effect => [
            effect.label,
            effect["機率"],
            effect["發動時機"],
            effect["場合"],
            effect["條件"],
            effect["效果"]
          ])
        ].map(normalizeText).join(" ").toLowerCase();

        return { code, item, effects, tag, searchBlob };
      });
  }

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }

  function fillSelect(select, values) {
    const current = select.value;
    select.innerHTML = `<option value="">全部</option>` + values
      .map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
      .join("");
    if (values.includes(current)) select.value = current;
  }

  function buildFilters() {
    const allEffects = state.rows.flatMap(row => row.effects);
    fillSelect(timingFilter, uniqueSorted(allEffects.map(effect => effect["發動時機"])));
    fillSelect(modeFilter, uniqueSorted(allEffects.map(effect => effect["場合"])));
    fillSelect(conditionFilter, uniqueSorted(allEffects.map(effect => effect["條件"])));
  }

  function applyFilters() {
    const q = searchInput.value.trim().toLowerCase();
    const category = categoryFilter.value;
    const timing = timingFilter.value;
    const mode = modeFilter.value;
    const condition = conditionFilter.value;

    state.filtered = state.rows.filter(row => {
      const effects = row.effects;

      if (q && !row.searchBlob.includes(q)) return false;
      if (category && row.tag.filterValue !== category) return false;
      if (timing && !effects.some(effect => effect["發動時機"] === timing)) return false;
      if (mode && !effects.some(effect => effect["場合"] === mode)) return false;
      if (condition && !effects.some(effect => effect["條件"] === condition)) return false;

      return true;
    });

    renderList();
  }

  function renderList() {
    resultCount.textContent = state.filtered.length.toLocaleString("zh-Hant");

    if (!state.filtered.length) {
      abilityList.innerHTML = `<div class="empty-state">找不到符合條件的能力。</div>`;
      return;
    }

    abilityList.innerHTML = state.filtered.map(row => {
      const item = row.item;
      const title = getAbilityName(item, row.code);
      const description = getAbilityDescription(item);
      const iconUrl = item.icon ? ICON_BASE + encodeURIComponent(item.icon) : "";
      const firstEffect = row.effects[0] || {};
      const active = row.code === state.selectedCode ? " active" : "";
      const tag = row.tag;

      return `
        <button class="ability-card${active}" type="button" data-code="${escapeHtml(row.code)}">
          <div class="ability-icon-wrap">
            ${iconUrl ? `<img class="ability-icon" src="${iconUrl}" alt="" loading="lazy" onerror="this.closest('.ability-icon-wrap').classList.add('missing-icon'); this.remove();">` : `<span class="no-icon">無圖</span>`}
          </div>
          <div class="ability-main">
            <div class="ability-title-row">
              <h2>${escapeHtml(title)}</h2>
              <span class="tag ${tag.className}">${escapeHtml(tag.label)}</span>
            </div>
            ${description ? `<p class="desc">${escapeHtml(description)}</p>` : ""}
            <div class="mini-meta">
              <span>${escapeHtml(firstEffect["機率"] || "-")}</span>
              <span>${escapeHtml(firstEffect["發動時機"] || "-")}</span>
              <span>${escapeHtml(firstEffect["場合"] || "-")}</span>
            </div>
          </div>
        </button>
      `;
    }).join("");

    abilityList.querySelectorAll(".ability-card").forEach(card => {
      card.addEventListener("click", () => selectAbility(card.dataset.code));
    });
  }

  function selectAbility(code) {
    state.selectedCode = code;
    const row = state.rows.find(row => row.code === code);
    if (!row) return;

    renderList();
    openModal(renderAbilityDetail(row));
  }

  function renderAbilityDetail(row) {
    const item = row.item;
    const title = getAbilityName(item, row.code);
    const description = getAbilityDescription(item);
    const iconUrl = item.icon ? ICON_BASE + encodeURIComponent(item.icon) : "";
    const tag = getAbilityTag(item, true);

    return `
      <div class="detail-head ability-detail-head">
        <div class="ability-icon-wrap large">
          ${iconUrl ? `<img class="ability-icon" src="${iconUrl}" alt="" onerror="this.closest('.ability-icon-wrap').classList.add('missing-icon'); this.remove();">` : `<span class="no-icon">無圖</span>`}
        </div>
        <div>
          <h2 id="abilityModalTitle">${escapeHtml(title)}</h2>
          <span class="tag ${tag.className}">${escapeHtml(tag.label)}</span>
        </div>
      </div>

      ${description ? `
      <section class="detail-section ability-detail-section">
        <h3>能力敘述</h3>
        <p class="preline">${escapeHtml(description)}</p>
      </section>` : ""}

      <section class="detail-section ability-detail-section">
        <h3>效果資料</h3>
        ${renderEffects(row.effects)}
      </section>
    `;
  }

  function openModal(html) {
    modalContent.innerHTML = html;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    modalCloseBtn.focus();
  }

  function closeModal() {
    modal.hidden = true;
    modalContent.innerHTML = "";
    document.body.classList.remove("modal-open");
  }

  function renderEffects(effects) {
    if (!effects.length) return `<div class="empty-state small">沒有可顯示的效果資料。</div>`;

    return `
      <div class="table-scroll ability-detail-table-scroll">
        <table class="ability-detail-effect-table">
          <thead>
            <tr>
              <th>機率</th>
              <th>時機</th>
              <th>場合</th>
              <th>條件</th>
              <th>效果</th>
            </tr>
          </thead>
          <tbody>
            ${effects.map(effect => `
              <tr>
                <td>${escapeHtml(effect["機率"] || "-")}</td>
                <td>${escapeHtml(effect["發動時機"] || "-")}</td>
                <td>${escapeHtml(effect["場合"] || "-")}</td>
                <td>${escapeHtml(effect["條件"] || "-")}</td>
                <td>${escapeHtml(effect["效果"] || "-")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function escapeHtml(value) {
    return normalizeText(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function init() {
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.raw = await res.json();
      state.rows = toRows(state.raw);
      state.filtered = [...state.rows];

      buildFilters();
      applyFilters();
    } catch (error) {
      abilityList.innerHTML = `<div class="empty-state">資料載入失敗，請稍後再試。</div>`;
      console.error(error);
    }
  }

  [searchInput, categoryFilter, timingFilter, modeFilter, conditionFilter].forEach(el => {
    el.addEventListener("input", applyFilters);
    el.addEventListener("change", applyFilters);
  });

  resetBtn.addEventListener("click", () => {
    searchInput.value = "";
    categoryFilter.value = "";
    timingFilter.value = "";
    modeFilter.value = "";
    conditionFilter.value = "";
    applyFilters();
  });

  modalCloseBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", event => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  init();
})();
