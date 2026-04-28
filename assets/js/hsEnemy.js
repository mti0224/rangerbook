(() => {
  const DATA_URL = "../res/hsEnemy_data.json";
  const ABILITY_DATA_URL = "../res/%E8%83%BD%E5%8A%9B.json";
  const ENEMY_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum-140.png`;
  const ABILITY_ICON = (icon) => `https://rangers.lerico.net/res/ability_icon/${encodeURIComponent(icon)}`;
  const SKILL_ICON = (icon) => `https://rangers.lerico.net/res/skill_icon/${encodeURIComponent(icon)}`;

  const state = {
    rows: [],
    filtered: [],
    selectedId: null,
    abilityMap: {},
    page: 1,
    pageSize: 60
  };

  const $ = (id) => document.getElementById(id);
  const searchInput = $("enemySearchInput");
  const starFilter = $("starFilter");
  const typeFilter = $("typeFilter");
  const elementFilter = $("elementFilter");
  const resetBtn = $("enemyResetBtn");
  const resultCount = $("enemyResultCount");
  const enemyList = $("enemyList");
  const modal = $("enemyModal");
  const modalPanel = modal?.querySelector(".modal-panel");
  const modalContent = $("enemyModalContent");
  const modalCloseBtn = $("enemyModalCloseBtn");

  function normalizeText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  }

  function text(value) {
    return normalizeText(value).replaceAll("\\n", "\n").trim();
  }

  function isNone(value) {
    const v = text(value);
    return !v || v === "無" || v === "(無)";
  }

  function escapeHtml(value) {
    return normalizeText(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toNumber(value) {
    if (typeof value === "number") return value;
    const number = Number(String(value ?? "").replaceAll(",", ""));
    return Number.isFinite(number) ? number : 0;
  }

  function formatNumber(value) {
    if (typeof value === "number") return value.toLocaleString("zh-Hant");
    const number = toNumber(value);
    return number ? number.toLocaleString("zh-Hant") : escapeHtml(value || "-");
  }

  function getEnemyId(enemy) {
    return text(enemy.ranger_id || enemy.enemy_id || enemy.unitCode || enemy.id || "");
  }

  function getDisplayTitle(enemy) {
    return getEnemyId(enemy) || "未命名敵人";
  }

  function getAttackValue(enemy) {
    return Math.max(toNumber(enemy["物理攻擊力"]), toNumber(enemy["魔法攻擊力"]));
  }

  function getSkill(enemy, key) {
    const value = enemy[key];
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  }

  function getAbilityDetail(code) {
    return code ? state.abilityMap[code] : null;
  }

  function getAbilityEffects(ability) {
    if (!ability || typeof ability !== "object") return [];
    return Object.entries(ability)
      .filter(([key, value]) => key.startsWith("觸發效果") && value && typeof value === "object")
      .sort(([a], [b]) => {
        const na = a === "觸發效果" ? 1 : Number(a.replace("觸發效果", "")) || 999;
        const nb = b === "觸發效果" ? 1 : Number(b.replace("觸發效果", "")) || 999;
        return na - nb;
      })
      .map(([, value], index) => ({ label: `效果 ${index + 1}`, ...value }));
  }

  function abilityNameFromValue(value) {
    if (typeof value === "string") return text(value);
    if (value && typeof value === "object") return text(value["能力"] || value["名稱"] || value["能力名稱"] || value.name);
    return "";
  }

  function abilityCodeFromValue(value, fallback = "") {
    if (value && typeof value === "object") {
      return text(value.abilityCode || value["abilityCode"] || value["能力代碼"] || value.code || fallback);
    }
    return text(fallback);
  }

  function abilityIconFromValue(value, abilityDetail) {
    if (value && typeof value === "object" && value.icon) return text(value.icon);
    if (abilityDetail && abilityDetail.icon) return text(abilityDetail.icon);
    return "";
  }

  function parseAbilityField(value, fallbackCode = "") {
    if (Array.isArray(value)) return value.flatMap((entry) => parseAbilityField(entry, fallbackCode));
    if (isNone(value)) return [];

    const code = abilityCodeFromValue(value, fallbackCode);
    const detail = getAbilityDetail(code);
    const name = abilityNameFromValue(value) || text(detail?.["名稱"] || detail?.name) || code;
    const icon = abilityIconFromValue(value, detail);

    if (!name || name === "無" || name === "(無)") return [];
    return [{ name, code, icon, detail }];
  }

  function getAbilities(enemy) {
    return [
      ...parseAbilityField(enemy["能力1"], enemy["abilityCode"]),
      ...parseAbilityField(enemy["能力2"], enemy["abilityCode2"]),
      ...parseAbilityField(enemy["能力3"], enemy["abilityCode3"])
    ];
  }

  function getSearchBlob(enemy) {
    const skillParts = ["技能1", "技能2", "技能3"].flatMap((key) => {
      const skill = getSkill(enemy, key);
      if (!skill) return [enemy[key]];
      return [
        skill["技能名稱"],
        skill["發動機率"],
        skill["觸發基準"],
        skill["技能冷卻時間"],
        ...(Array.isArray(skill["技能組"]) ? skill["技能組"].flatMap((effect) => Object.values(effect)) : [])
      ];
    });

    const abilityParts = getAbilities(enemy).flatMap((ability) => [
      ability.name,
      ability.code,
      ability.detail?.["名稱"],
      ability.detail?.["敘述"],
      ...getAbilityEffects(ability.detail).flatMap((effect) => Object.values(effect))
    ]);

    return [
      getEnemyId(enemy), enemy["Ranger星數"], enemy["類型"], enemy["屬性"],
      enemy["移動速度"], enemy["攻擊速度"], enemy["命中率"], enemy["技能命中率"],
      ...abilityParts, ...skillParts
    ].map(normalizeText).join(" ").toLowerCase();
  }

  function toRows(raw) {
    return raw.map((enemy, index) => ({ enemy, index, searchBlob: getSearchBlob(enemy) }));
  }

  function uniqueSorted(values) {
    return [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }

  function fillSelect(select, values) {
    select.innerHTML = `<option value="">全部</option>` + values
      .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
      .join("");
  }

  function buildFilters() {
    fillSelect(starFilter, uniqueSorted(state.rows.map((row) => row.enemy["Ranger星數"])));
    fillSelect(typeFilter, uniqueSorted(state.rows.map((row) => row.enemy["類型"])));
    fillSelect(elementFilter, uniqueSorted(state.rows.map((row) => row.enemy["屬性"])));
  }

  function ensurePaginationBar() {
    if ($("enemyPaginationBar")) return;
    const summaryBar = document.querySelector(".summary-bar");
    const bar = document.createElement("section");
    bar.id = "enemyPaginationBar";
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
      scrollToListTop();
    });
    $("paginationPrev")?.addEventListener("click", () => {
      state.page -= 1;
      renderList();
      scrollToListTop();
    });
    $("paginationNext")?.addEventListener("click", () => {
      state.page += 1;
      renderList();
      scrollToListTop();
    });
  }

  function scrollToListTop() {
    const top = Math.max(0, enemyList.getBoundingClientRect().top + window.scrollY - 120);
    window.scrollTo({ top, behavior: "smooth" });
  }

  function renderPagination(total) {
    ensurePaginationBar();
    const bar = $("enemyPaginationBar");
    if (!bar) return;
    if (!total) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;

    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const start = (state.page - 1) * state.pageSize;
    const end = Math.min(start + state.pageSize, total);

    $("paginationInfo").textContent = `第 ${state.page} / ${totalPages} 頁，顯示第 ${start + 1}–${end} 筆，共 ${total} 筆`;
    $("paginationPrev").disabled = state.page <= 1;
    $("paginationNext").disabled = state.page >= totalPages;

    const pages = new Set([1, totalPages, state.page - 1, state.page, state.page + 1]);
    const ordered = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
    const parts = [];
    let last = 0;
    ordered.forEach((page) => {
      if (page - last > 1) parts.push(`<span class="pagination-ellipsis">…</span>`);
      parts.push(`<button class="pagination-page ${page === state.page ? "active" : ""}" type="button" data-page="${page}">${page}</button>`);
      last = page;
    });
    $("paginationPages").innerHTML = totalPages > 1 ? parts.join("") : "";
    $("paginationPages").querySelectorAll(".pagination-page").forEach((button) => {
      button.addEventListener("click", () => {
        state.page = Number(button.dataset.page) || 1;
        renderList();
        scrollToListTop();
      });
    });
  }

  function applyFilters() {
    const q = searchInput.value.trim().toLowerCase();
    const star = starFilter.value;
    const type = typeFilter.value;
    const element = elementFilter.value;

    state.filtered = state.rows.filter((row) => {
      const enemy = row.enemy;
      if (q && !row.searchBlob.includes(q)) return false;
      if (star && enemy["Ranger星數"] !== star) return false;
      if (type && enemy["類型"] !== type) return false;
      if (element && enemy["屬性"] !== element) return false;
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
      enemyList.innerHTML = `<div class="empty-state">找不到符合條件的敵人。</div>`;
      return;
    }

    const start = (state.page - 1) * state.pageSize;
    const pageRows = state.filtered.slice(start, start + state.pageSize);

    enemyList.innerHTML = pageRows.map(({ enemy }) => {
      const id = getEnemyId(enemy);
      const active = state.selectedId === id ? " active" : "";
      return `
        <button class="ranger-card enemy-card${active}" type="button" data-enemy-id="${escapeHtml(id)}">
          <div class="ranger-thumb-wrap">
            <img class="ranger-thumb" src="${ENEMY_IMAGE(id)}" alt="" loading="lazy" onerror="this.closest('.ranger-thumb-wrap').classList.add('missing-icon'); this.remove();">
          </div>
          <div class="ranger-card-main">
            <div class="ranger-title-row">
              <h2>${escapeHtml(getDisplayTitle(enemy))}</h2>
              <span class="tag">${escapeHtml(enemy["屬性"] || "-")}</span>
            </div>
            <div class="ranger-tags">
              ${[enemy["Ranger星數"], enemy["類型"], enemy["屬性"]].filter(Boolean).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
            </div>
            <div class="ranger-mini-stats">
              <span>攻擊力 ${formatNumber(getAttackValue(enemy))}</span>
              <span>體力 ${formatNumber(enemy["體力"])}</span>
            </div>
          </div>
        </button>
      `;
    }).join("");

    enemyList.querySelectorAll(".enemy-card").forEach((card) => {
      card.addEventListener("click", () => selectEnemy(card.dataset.enemyId));
    });
  }

  function selectEnemy(id) {
    state.selectedId = id;
    const row = state.rows.find(({ enemy }) => getEnemyId(enemy) === id);
    if (!row) return;
    renderList();
    openModal(renderEnemyDetail(row.enemy));
  }

  function renderEnemyDetail(enemy) {
    const id = getEnemyId(enemy);
    return `
      <div class="ranger-detail-head">
        <div class="ranger-detail-image-wrap">
          <img class="ranger-detail-image" src="${ENEMY_IMAGE(id)}" alt="" onerror="this.closest('.ranger-detail-image-wrap').classList.add('missing-icon'); this.remove();">
        </div>
        <div>
          <h2 id="enemyModalTitle">${escapeHtml(getDisplayTitle(enemy))}</h2>
          <div class="ranger-tags detail-tags">
            ${[enemy["Ranger星數"], enemy["類型"], enemy["屬性"]].filter(Boolean).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
          </div>
        </div>
      </div>

      <section class="detail-section">
        <h3>基本數值</h3>
        <div class="ranger-stat-grid">
          ${renderStat("體力", enemy["體力"])}
          ${renderStat("物理攻擊力", enemy["物理攻擊力"])}
          ${renderStat("魔法攻擊力", enemy["魔法攻擊力"])}
          ${renderStat("物理防禦力", enemy["物理防禦力"])}
          ${renderStat("魔法防禦力", enemy["魔法防禦力"])}
          ${renderStat("攻擊範圍", enemy["攻擊範圍"])}
          ${renderStat("濺射範圍", enemy["濺射範圍"])}
          ${renderStat("移動速度", enemy["移動速度"])}
          ${renderStat("攻擊速度", enemy["攻擊速度"])}
          ${renderStat("技能抗性", enemy["技能抗性"])}
          ${renderStat("爆擊機率", enemy["爆擊機率"])}
          ${renderStat("爆擊傷害", enemy["爆擊傷害"])}
          ${renderStat("閃避機率", enemy["閃避機率"])}
          ${renderStat("技能閃避機率", enemy["技能閃避機率"])}
          ${renderStat("命中率", enemy["命中率"])}
          ${renderStat("技能命中率", enemy["技能命中率"])}
        </div>
      </section>

      <section class="detail-section"><h3>技能</h3>${renderSkills(enemy)}</section>
      <section class="detail-section"><h3>能力</h3>${renderAbilityGroup(getAbilities(enemy), "沒有能力資料。")}</section>
    `;
  }

  function renderStat(label, value) {
    return `<div class="ranger-stat"><span>${escapeHtml(label)}</span><strong>${formatNumber(value)}</strong></div>`;
  }

  function renderSkills(enemy) {
    const skills = [getSkill(enemy, "技能1"), getSkill(enemy, "技能2"), getSkill(enemy, "技能3")].filter(Boolean);
    if (!skills.length) return `<div class="empty-state small">沒有技能資料。</div>`;
    return skills.map((skill, index) => `
      <article class="ranger-skill-card">
        <div class="ranger-icon-title">
          ${skill.icon ? `<img class="small-icon" src="${SKILL_ICON(skill.icon)}" alt="" onerror="this.remove();">` : ""}
          <div>
            <h4>技能 ${index + 1}：${escapeHtml(skill["技能名稱"] || "未命名技能")}</h4>
            <p>發動率：${escapeHtml(skill["發動機率"] || "-")}・技能冷卻時間：${escapeHtml(skill["技能冷卻時間"] || "-")}・觸發基準：${escapeHtml(skill["觸發基準"] || "-")}</p>
          </div>
        </div>
        ${renderSkillTable(skill)}
      </article>
    `).join("");
  }

  function renderSkillTable(skill) {
    const effects = Array.isArray(skill["技能組"]) ? skill["技能組"] : [];
    if (!effects.length) return `<div class="empty-state small">沒有技能效果資料。</div>`;
    return `
      <div class="table-scroll">
        <table class="enemy-skill-effect-table">
          <thead><tr><th>技能效果</th><th>係數</th><th>時間</th><th>範圍</th></tr></thead>
          <tbody>
            ${effects.map((effect) => `
              <tr>
                <th>${escapeHtml(effect["效果"] || "-")}</th>
                <td>${escapeHtml(effect["係數"] || "-")}</td>
                <td>${escapeHtml(effect["有效時間"] || "-")}</td>
                <td>${escapeHtml(effect["範圍"] || "-")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderAbilityGroup(abilities, emptyText) {
    if (!abilities.length) return `<div class="empty-state small">${escapeHtml(emptyText)}</div>`;
    return `<div class="ranger-ability-list">${abilities.map(renderAbilityCard).join("")}</div>`;
  }

  function renderAbilityCard(ability) {
    const detail = ability.detail;
    const description = text(detail?.["敘述"] || "");
    const icon = ability.icon || detail?.icon || "";
    return `
      <article class="ranger-ability-card">
        <div class="ranger-icon-title">
          ${icon ? `<img class="small-icon" src="${ABILITY_ICON(icon)}" alt="" onerror="this.remove();">` : ""}
          <div>
            <h4>${escapeHtml(ability.name)}</h4>
            ${description && description !== "無" && description !== "(無)" ? `<p class="preline">${escapeHtml(description)}</p>` : ""}
          </div>
        </div>
        ${renderAbilityEffectTable(getAbilityEffects(detail))}
      </article>
    `;
  }

  function renderAbilityEffectTable(effects) {
    if (!effects.length) return "";
    const cols = ["機率", "時機", "場合", "條件", "效果"];
    return `
      <div class="ability-effect-list">
        <div class="table-scroll ability-effect-table-wrap">
          <table class="ability-effect-table">
            <thead><tr>${cols.map((col) => `<th>${escapeHtml(col)}</th>`).join("")}</tr></thead>
            <tbody>
              ${effects.map((effect) => `
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
      </div>
    `;
  }

  function openModal(html) {
    modalContent.innerHTML = html;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    modal.scrollTop = 0;
    modalPanel.scrollTop = 0;
    modalContent.scrollTop = 0;
    modalCloseBtn.focus();
    requestAnimationFrame(() => {
      modal.scrollTop = 0;
      modalPanel.scrollTop = 0;
      modalContent.scrollTop = 0;
    });
  }

  function closeModal() {
    modal.hidden = true;
    modalContent.innerHTML = "";
    document.body.classList.remove("modal-open");
  }

  async function init() {
    try {
      const [enemyRes, abilityRes] = await Promise.all([fetch(DATA_URL), fetch(ABILITY_DATA_URL).catch(() => null)]);
      if (!enemyRes.ok) throw new Error(`HTTP ${enemyRes.status}`);
      const raw = await enemyRes.json();
      if (abilityRes && abilityRes.ok) state.abilityMap = await abilityRes.json();
      state.rows = toRows(Array.isArray(raw) ? raw : []);
      state.filtered = [...state.rows];
      buildFilters();
      ensurePaginationBar();
      renderList();
    } catch (error) {
      enemyList.innerHTML = `<div class="empty-state">資料載入失敗，請確認 hsEnemy_data.json 是否已放在 /res 資料夾。</div>`;
      console.error(error);
    }
  }

  [searchInput, starFilter, typeFilter, elementFilter].forEach((el) => {
    el.addEventListener("input", applyFilters);
    el.addEventListener("change", applyFilters);
  });

  resetBtn.addEventListener("click", () => {
    searchInput.value = "";
    starFilter.value = "";
    typeFilter.value = "";
    elementFilter.value = "";
    applyFilters();
  });

  modalCloseBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  init();
})();
