(() => {
  const DATA_URL = "../res/Rangers_data.json";
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum-140.png`;
  const ABILITY_ICON = (icon) => `https://rangers.lerico.net/res/ability_icon/${encodeURIComponent(icon)}`;
  const SKILL_ICON = (icon) => `https://rangers.lerico.net/res/skill_icon/${encodeURIComponent(icon)}`;

  const state = {
    rows: [],
    filtered: [],
    selectedId: null
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
    return value && typeof value === "object" ? value : null;
  }

  function getAbilityNames(ranger) {
    return [ranger["能力1"], ranger["能力2"], ranger["覺醒能力"]]
      .map(text)
      .filter((v) => v && v !== "無" && v !== "(無)");
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
      ranger["能力1"],
      ranger["能力2"],
      ranger["覺醒能力"],
      ranger["才能"],
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
        <h3>能力與才能</h3>
        ${renderAbilities(ranger)}
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
        <div class="skill-effect-list">
          ${Array.isArray(skill["技能組"]) ? skill["技能組"].map(renderSkillEffect).join("") : ""}
        </div>
      </article>
    `).join("");
  }

  function renderSkillEffect(effect) {
    return `
      <div class="skill-effect">
        <strong>${escapeHtml(effect["效果"] || "-")}</strong>
        <dl>
          <div><dt>係數</dt><dd>${escapeHtml(effect["係數"] || "-")}</dd></div>
          <div><dt>時間</dt><dd>${escapeHtml(effect["有效時間"] || "-")}</dd></div>
          <div><dt>範圍</dt><dd>${escapeHtml(effect["範圍"] || "-")}</dd></div>
          <div><dt>活動</dt><dd>${escapeHtml(effect["適用於活動關卡"] || "-")}</dd></div>
          <div><dt>守護神</dt><dd>${escapeHtml(effect["適用於守護神"] || "-")}</dd></div>
        </dl>
      </div>
    `;
  }

  function renderAbilities(ranger) {
    const abilities = [
      { name: ranger["能力1"], code: ranger["abilityCode"] },
      { name: ranger["能力2"], code: ranger["abilityCode2"] },
      { name: ranger["覺醒能力"], code: ranger["awakeAbilityCode"] || ranger["覺醒能力Code"] || "" }
    ].filter((ability) => !isNone(ability.name));

    const talent = isNone(ranger["才能"]) ? "" : text(ranger["才能"]);

    if (!abilities.length && !talent) return `<div class="empty-state small">沒有能力或才能資料。</div>`;

    return `
      <div class="ranger-ability-list">
        ${abilities.map((ability) => `
          <div class="ranger-ability-item">
            ${ability.code ? `<img class="small-icon" src="${ABILITY_ICON(`${ability.code}_icon.png`)}" alt="" onerror="this.remove();">` : ""}
            <span>${escapeHtml(ability.name)}</span>
          </div>
        `).join("")}
        ${talent ? `<div class="ranger-ability-item talent-item"><span>才能：${escapeHtml(talent)}</span></div>` : ""}
      </div>
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

  async function init() {
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
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
