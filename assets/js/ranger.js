(() => {
  const DATA_URL = "../res/Rangers_data.json";
  const ABILITY_DATA_URL = "../res/%E8%83%BD%E5%8A%9B.json";
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum-140.png`;
  const ABILITY_ICON = (icon) => `https://rangers.lerico.net/res/ability_icon/${encodeURIComponent(icon)}`;
  const SKILL_ICON = (icon) => `https://rangers.lerico.net/res/skill_icon/${encodeURIComponent(icon)}`;

  const state = {
    rows: [],
    filtered: [],
    selectedId: null,
    abilityMap: {}
  };

  const $ = (id) => document.getElementById(id);
  const searchInput = $("rangerSearchInput");
  const starFilter = $("starFilter");
  const typeFilter = $("typeFilter");
  const elementFilter = $("elementFilter");
  const specialFilter = $("specialFilter");
  const resetBtn = $("rangerResetBtn");
  const resultCount = $("rangerResultCount");
  const rangerList = $("rangerList");
  const modal = $("rangerModal");
  const modalContent = $("rangerModalContent");
  const modalCloseBtn = $("rangerModalCloseBtn");

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

  function isYes(value) {
    return ["是", "true", "1", "yes", "y"].includes(text(value).toLowerCase()) || value === true || value === 1;
  }

  function escapeHtml(value) {
    return normalizeText(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatNumber(value) {
    if (typeof value === "number") return value.toLocaleString("zh-Hant");
    return escapeHtml(value || "-");
  }

  function getSkill(ranger, key) {
    const value = ranger[key];
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
      .map(([key, value], index) => ({ label: `效果 ${index + 1}`, ...value }));
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

  function getNormalAbilities(ranger) {
    return [
      ...parseAbilityField(ranger["能力1"], ranger["abilityCode"]),
      ...parseAbilityField(ranger["能力2"], ranger["abilityCode2"])
    ];
  }

  function getAwakeAbilities(ranger) {
    return parseAbilityField(ranger["覺醒能力"], ranger["awakeAbilityCode"] || ranger["覺醒能力Code"] || "");
  }

  function getAllAbilities(ranger) {
    return [...getNormalAbilities(ranger), ...getAwakeAbilities(ranger)];
  }

  function getSearchBlob(ranger) {
    const skillParts = ["技能1", "技能2"].flatMap((key) => {
      const skill = getSkill(ranger, key);
      if (!skill) return [ranger[key]];
      return [
        skill["技能名稱"],
        skill["發動機率"],
        skill["觸發基準"],
        skill["技能冷卻時間"],
        ...(Array.isArray(skill["技能組"]) ? skill["技能組"].flatMap((effect) => Object.values(effect)) : [])
      ];
    });

    const abilityParts = getAllAbilities(ranger).flatMap((ability) => [
      ability.name,
      ability.code,
      ability.detail?.["名稱"],
      ability.detail?.["敘述"],
      ...getAbilityEffects(ability.detail).flatMap((effect) => Object.values(effect))
    ]);

    return [
      ranger["Ranger名稱"],
      ranger["ranger_id"],
      ranger["登場時間"],
      ranger["Ranger星數"],
      ranger["類型"],
      ranger["屬性"],
      ranger["Ranger再生產時間"],
      ranger["生產礦物費用"],
      ranger["移動速度"],
      ranger["攻擊速度"],
      ranger["才能"],
      ...abilityParts,
      ...skillParts
    ].map(normalizeText).join(" ").toLowerCase();
  }

  function toRows(raw) {
    return raw.map((ranger) => ({
      ranger,
      searchBlob: getSearchBlob(ranger)
    }));
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
    fillSelect(starFilter, uniqueSorted(state.rows.map((row) => row.ranger["Ranger星數"])));
    fillSelect(typeFilter, uniqueSorted(state.rows.map((row) => row.ranger["類型"])));
    fillSelect(elementFilter, uniqueSorted(state.rows.map((row) => row.ranger["屬性"])));
  }

  function applyFilters() {
    const q = searchInput.value.trim().toLowerCase();
    const star = starFilter.value;
    const type = typeFilter.value;
    const element = elementFilter.value;
    const special = specialFilter.value;

    state.filtered = state.rows.filter((row) => {
      const r = row.ranger;
      if (q && !row.searchBlob.includes(q)) return false;
      if (star && r["Ranger星數"] !== star) return false;
      if (type && r["類型"] !== type) return false;
      if (element && r["屬性"] !== element) return false;
      if (special === "nft" && !isYes(r["nft角色"])) return false;
      if (special === "event" && !isYes(r["降臨關卡角色"])) return false;
      if (special === "talent" && isNone(r["才能"])) return false;
      return true;
    });

    renderList();
  }

  function renderList() {
    resultCount.textContent = state.filtered.length.toLocaleString("zh-Hant");

    if (!state.filtered.length) {
      rangerList.innerHTML = `<div class="empty-state">找不到符合條件的角色。</div>`;
      return;
    }

    rangerList.innerHTML = state.filtered.map(({ ranger }) => {
      const id = ranger.ranger_id;
      const active = state.selectedId === id ? " active" : "";
      const tags = [ranger["Ranger星數"], ranger["類型"], ranger["屬性"]].filter(Boolean);
      return `
        <button class="ranger-card${active}" type="button" data-ranger-id="${escapeHtml(id)}">
          <div class="ranger-thumb-wrap">
            <img class="ranger-thumb" src="${RANGER_IMAGE(id)}" alt="" loading="lazy" onerror="this.closest('.ranger-thumb-wrap').classList.add('missing-icon'); this.remove();">
          </div>
          <div class="ranger-card-main">
            <div class="ranger-title-row">
              <h2>${escapeHtml(ranger["Ranger名稱"] || "未命名角色")}</h2>
              <span class="tag">${escapeHtml(ranger["屬性"] || "-")}</span>
            </div>
            <div class="ranger-tags">
              ${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
            </div>
            <div class="ranger-mini-stats">
              <span>體力 ${formatNumber(ranger["體力"])}</span>
              <span>礦物 ${formatNumber(ranger["生產礦物費用"])}</span>
              <span>再生產 ${escapeHtml(ranger["Ranger再生產時間"] || "-")}</span>
            </div>
          </div>
        </button>
      `;
    }).join("");

    rangerList.querySelectorAll(".ranger-card").forEach((card) => {
      card.addEventListener("click", () => selectRanger(card.dataset.rangerId));
    });
  }

  function selectRanger(id) {
    state.selectedId = id;
    const row = state.rows.find(({ ranger }) => ranger.ranger_id === id);
    if (!row) return;
    renderList();
    openModal(renderRangerDetail(row.ranger));
  }

  function renderRangerDetail(ranger) {
    const id = ranger.ranger_id;
    return `
      <div class="ranger-detail-head">
        <div class="ranger-detail-image-wrap">
          <img class="ranger-detail-image" src="${RANGER_IMAGE(id)}" alt="" onerror="this.closest('.ranger-detail-image-wrap').classList.add('missing-icon'); this.remove();">
        </div>
        <div>
          <h2 id="rangerModalTitle">${escapeHtml(ranger["Ranger名稱"] || "未命名角色")}</h2>
          <div class="ranger-tags detail-tags">
            ${[ranger["Ranger星數"], ranger["類型"], ranger["屬性"], isYes(ranger["nft角色"]) ? "NFT" : "", isYes(ranger["降臨關卡角色"]) ? "降臨" : ""].filter(Boolean).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
          </div>
          <p class="ranger-date">登場時間：${escapeHtml(ranger["登場時間"] || "-")}</p>
        </div>
      </div>

      <section class="detail-section">
        <h3>基本數值</h3>
        <div class="ranger-stat-grid">
          ${renderStat("體力", ranger["體力"])}
          ${renderStat("物理攻擊力", ranger["物理攻擊力"])}
          ${renderStat("魔法攻擊力", ranger["魔法攻擊力"])}
          ${renderStat("物理防禦力", ranger["物理防禦力"])}
          ${renderStat("魔法防禦力", ranger["魔法防禦力"])}
          ${renderStat("生產礦物費用", ranger["生產礦物費用"])}
          ${renderStat("再生產時間", ranger["Ranger再生產時間"])}
          ${renderStat("攻擊範圍", ranger["攻擊範圍"])}
          ${renderStat("濺射範圍", ranger["濺射範圍"])}
          ${renderStat("移動速度", ranger["移動速度"])}
          ${renderStat("攻擊速度", ranger["攻擊速度"])}
          ${renderStat("技能抗性", ranger["技能抗性"])}
          ${renderStat("爆擊機率", ranger["爆擊機率"])}
          ${renderStat("爆擊傷害", ranger["爆擊傷害"])}
          ${renderStat("閃避機率", ranger["閃避機率"])}
          ${renderStat("技能閃避機率", ranger["技能閃避機率"])}
        </div>
      </section>

      <section class="detail-section">
        <h3>技能</h3>
        ${renderSkills(ranger)}
      </section>

      <section class="detail-section">
        <h3>能力</h3>
        ${renderAbilityGroup(getNormalAbilities(ranger), "沒有能力資料。")}
      </section>

      <section class="detail-section">
        <h3>覺醒能力</h3>
        ${renderAbilityGroup(getAwakeAbilities(ranger), "沒有覺醒能力資料。")}
      </section>

      <section class="detail-section">
        <h3>才能</h3>
        ${renderTalent(ranger["才能"]) || `<div class="empty-state small">沒有才能資料。</div>`}
      </section>
    `;
  }

  function renderStat(label, value) {
    return `<div class="ranger-stat"><span>${escapeHtml(label)}</span><strong>${formatNumber(value)}</strong></div>`;
  }

  function renderSkills(ranger) {
    const skills = [getSkill(ranger, "技能1"), getSkill(ranger, "技能2")].filter(Boolean);
    if (!skills.length) return `<div class="empty-state small">沒有技能資料。</div>`;

    return skills.map((skill, index) => `
      <article class="ranger-skill-card">
        <div class="ranger-icon-title">
          ${skill.icon ? `<img class="small-icon" src="${SKILL_ICON(skill.icon)}" alt="" onerror="this.remove();">` : ""}
          <div>
            <h4>技能 ${index + 1}：${escapeHtml(skill["技能名稱"] || "未命名技能")}</h4>
            <p>${escapeHtml(skill["發動機率"] || "-")}・${escapeHtml(skill["技能冷卻時間"] || "-")}・${escapeHtml(skill["觸發基準"] || "-")}</p>
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
        <table class="skill-effect-table">
          <thead>
            <tr>
              <th>技能效果</th>
              <th>係數</th>
              <th>時間</th>
              <th>範圍</th>
              <th>活動</th>
              <th>守護神</th>
            </tr>
          </thead>
          <tbody>
            ${effects.map((effect) => `
              <tr>
                <th>${escapeHtml(effect["效果"] || "-")}</th>
                <td>${escapeHtml(effect["係數"] || "-")}</td>
                <td>${escapeHtml(effect["有效時間"] || "-")}</td>
                <td>${escapeHtml(effect["範圍"] || "-")}</td>
                <td>${escapeHtml(effect["適用於活動關卡"] || "-")}</td>
                <td>${escapeHtml(effect["適用於守護神"] || "-")}</td>
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
    const effects = getAbilityEffects(detail);
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
        ${effects.length ? `<div class="ability-effect-list">${effects.map(renderAbilityEffect).join("")}</div>` : ""}
      </article>
    `;
  }

  function renderAbilityEffect(effect) {
    const rows = [
      ["機率", effect["機率"]],
      ["時機", effect["發動時機"]],
      ["場合", effect["場合"]],
      ["條件", effect["條件"]],
      ["效果", effect["效果"]]
    ].filter(([, value]) => !isNone(value));

    return `
      <div class="ability-effect">
        <strong>${escapeHtml(effect.label)}</strong>
        <dl>
          ${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
        </dl>
      </div>
    `;
  }

  function formatTalentTitle(title) {
    const clean = text(title);
    if (clean.includes("強化才能")) return clean.replace(/\d+$/g, "");
    return clean;
  }

  function renderTalent(value) {
    if (isNone(value)) return "";
    if (typeof value === "string") {
      return `<article class="ranger-talent-card"><p>${escapeHtml(value)}</p></article>`;
    }
    if (!value || typeof value !== "object") return "";

    const sections = Object.entries(value).map(([title, content]) => renderTalentSection(title, content)).join("");
    return sections ? `<div class="ranger-talent-list">${sections}</div>` : "";
  }

  function renderTalentSection(title, content) {
    if (isNone(content)) return "";
    const displayTitle = formatTalentTitle(title);
    if (typeof content === "string") {
      return `<article class="ranger-talent-card"><h4>${escapeHtml(displayTitle)}</h4><p>${escapeHtml(content)}</p></article>`;
    }
    if (!content || typeof content !== "object") return "";

    const simpleRows = Object.entries(content)
      .filter(([, value]) => !Array.isArray(value) && typeof value !== "object" && !isNone(value));
    const listRows = Object.entries(content)
      .filter(([, value]) => Array.isArray(value));

    return `
      <article class="ranger-talent-card">
        <h4>${escapeHtml(displayTitle)}</h4>
        ${simpleRows.length ? `<dl>${simpleRows.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>` : ""}
        ${listRows.map(([key, list]) => `
          <div class="talent-effect-list">
            <strong>${escapeHtml(formatTalentTitle(key))}</strong>
            ${list.map((entry) => renderTalentEntry(entry)).join("")}
          </div>
        `).join("")}
      </article>
    `;
  }

  function renderTalentEntry(entry) {
    if (typeof entry !== "object" || entry === null) return `<p>${escapeHtml(entry)}</p>`;
    return `<div class="talent-effect"><dl>${Object.entries(entry).filter(([, value]) => !isNone(value)).map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl></div>`;
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

  async function init() {
    try {
      const [rangerRes, abilityRes] = await Promise.all([
        fetch(DATA_URL),
        fetch(ABILITY_DATA_URL).catch(() => null)
      ]);
      if (!rangerRes.ok) throw new Error(`HTTP ${rangerRes.status}`);
      const raw = await rangerRes.json();
      if (abilityRes && abilityRes.ok) state.abilityMap = await abilityRes.json();
      state.rows = toRows(Array.isArray(raw) ? raw : []);
      state.filtered = [...state.rows];
      buildFilters();
      applyFilters();
    } catch (error) {
      rangerList.innerHTML = `<div class="empty-state">資料載入失敗，請稍後再試。</div>`;
      console.error(error);
    }
  }

  [searchInput, starFilter, typeFilter, elementFilter, specialFilter].forEach((el) => {
    el.addEventListener("input", applyFilters);
    el.addEventListener("change", applyFilters);
  });

  resetBtn.addEventListener("click", () => {
    searchInput.value = "";
    starFilter.value = "";
    typeFilter.value = "";
    elementFilter.value = "";
    specialFilter.value = "";
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
