(() => {
  const ROOT = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const DATA_URL = `${ROOT}res/%E7%84%A1%E9%99%90%E4%B9%8B%E5%A1%94%E6%95%B5%E4%BA%BA%E7%94%9F%E7%94%A2%E7%B7%9A.json`;
  const ENEMY_DATA_URL = `${ROOT}res/infEnemy_data.json`;
  const ABILITY_DATA_URL = `${ROOT}res/%E8%83%BD%E5%8A%9B.json`;
  const ENEMY_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
  const ABILITY_ICON = (icon) => `https://rangers.lerico.net/res/ability_icon/${encodeURIComponent(icon)}`;
  const SKILL_ICON = (icon) => `https://rangers.lerico.net/res/skill_icon/${encodeURIComponent(icon)}`;
  const GIMMICK_ICON = (icon) => `${ROOT}assets/endless_icon/${encodeURIComponent(icon)}`;

  const state = { stages: [], enemyMap: new Map(), abilityMap: {}, currentStage: null };

  const $ = (id) => document.getElementById(id);
  const stageGrid = $("endlessStageGrid");
  const stageDetail = $("endlessStageDetail");
  const stageTitle = $("endlessStageTitle");
  const stageTable = $("endlessStageTable");
  const modal = $("endlessEnemyModal");
  const modalPanel = modal?.querySelector(".modal-panel");
  const modalContent = $("endlessEnemyModalContent");
  const modalCloseBtn = $("endlessEnemyModalCloseBtn");

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
    const raw = text(value);
    const n = Number(raw.replaceAll(",", ""));
    if (Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(raw.replaceAll(",", ""))) return n.toLocaleString("zh-Hant");
    return escapeHtml(raw);
  }

  function normalizeKey(key) {
    return text(key).replace(/[\s_\-]/g, "").toLowerCase();
  }

  function pick(obj, keys) {
    if (!obj || typeof obj !== "object") return "";
    const entries = Object.entries(obj);
    for (const wanted of keys) {
      const found = entries.find(([key]) => normalizeKey(key) === normalizeKey(wanted));
      if (found) return found[1];
    }
    for (const wanted of keys) {
      const found = entries.find(([key]) => normalizeKey(key).includes(normalizeKey(wanted)));
      if (found) return found[1];
    }
    return "";
  }

  function hasValue(value) {
    return value !== null && value !== undefined && value !== "";
  }

  function getEnemyId(row) {
    return text(pick(row, ["敵人id", "敵人ID", "敵人", "enemy", "enemyId", "unitCode", "ranger_id", "id"]));
  }

  function getEnemyBase(row) {
    const id = getEnemyId(row);
    return state.enemyMap.get(id) || {};
  }

  function getLineDetail(row) {
    const detail = row?.["詳細資訊"];
    return detail && typeof detail === "object" ? detail : {};
  }

  function getStageNoFromKey(key, fallback) {
    const match = text(key).match(/\d+/);
    return match ? Number(match[0]) : fallback;
  }

  function getStageRows(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      if (Array.isArray(value["敵人生產線"])) return value["敵人生產線"];
      if (Array.isArray(value["生產線"])) return value["生產線"];
      if (Array.isArray(value.rows)) return value.rows;
    }
    return [];
  }

  function getStageInfo(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return {
      "樓層類型": value["樓層類型"] ?? value.stageType ?? value["stageType"],
      "地圖長度": value["地圖長度"] ?? value.mapLength ?? value["mapLength"],
      "時間限制": value["時間限制"] ?? value.timeLimit ?? value["timeLimit"],
      "羽毛消耗量": value["羽毛消耗量"] ?? value.featherCost ?? value["featherCost"],
      "拯救數量": value["拯救數量"] ?? value.rescueCount ?? value["rescueCount"],
      "塔城體力": value["塔城體力"] ?? value.towerHp ?? value["towerHp"],
      "牢籠體力": value["牢籠體力"] ?? value.cageHp ?? value["cageHp"]
    };
  }

  function getStageGimmicks(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    return Object.keys(value)
      .map((key) => {
        const match = key.match(/^機關(\d+)$/);
        if (!match) return null;
        const no = Number(match[1]);
        const description = value[key];
        const icon = value[`機關${no}_icon`] || value[`機關${no}icon`] || "";
        if (!description) return null;
        return { no, description, icon };
      })
      .filter(Boolean)
      .sort((a, b) => a.no - b.no);
  }

  function stageUrl(n) {
    return `${ROOT}endless/stage/end${n}`;
  }

  function parseStageData(raw) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return Object.entries(raw).map(([key, value], index) => ({
        no: getStageNoFromKey(key, index + 1),
        rows: getStageRows(value),
        info: getStageInfo(value),
        gimmicks: getStageGimmicks(value),
        raw: { key, value }
      })).sort((a, b) => a.no - b.no);
    }

    if (Array.isArray(raw)) {
      return raw.map((value, index) => ({
        no: index + 1,
        rows: getStageRows(value).length ? getStageRows(value) : [value],
        info: getStageInfo(value),
        gimmicks: getStageGimmicks(value),
        raw: value
      }));
    }
    return [];
  }

  function renderStageGrid() {
    if (!stageGrid) return;
    if (!state.stages.length) {
      stageGrid.innerHTML = `<div class="empty-state">找不到無限之塔關卡資料。</div>`;
      return;
    }
    stageGrid.innerHTML = state.stages.map((stage) => `
      <a class="endless-stage-card" href="${stageUrl(stage.no)}" data-stage-no="${stage.no}">
        <span>第 ${stage.no} 層</span>
      </a>
    `).join("");
  }

  function renderEnemyCell(row) {
    const id = getEnemyId(row);
    return `
      <div class="endless-enemy-cell image-only" title="${escapeHtml(id)}">
        <div class="endless-enemy-thumb">
          ${id ? `<img src="${ENEMY_IMAGE(id)}" alt="${escapeHtml(id)}" loading="lazy" onerror="this.closest('.endless-enemy-thumb').classList.add('missing-icon'); this.remove();">` : `<span class="no-icon">無圖</span>`}
        </div>
      </div>
    `;
  }

  function renderSectionTitle(title) {
    return `<h2 class="endless-detail-section-title">${escapeHtml(title)}</h2>`;
  }

  function renderStageNav(stage) {
    const index = state.stages.findIndex((item) => item.no === stage.no);
    const prev = index > 0 ? state.stages[index - 1] : null;
    const next = index >= 0 && index < state.stages.length - 1 ? state.stages[index + 1] : null;
    return `
      <nav class="endless-stage-nav" aria-label="無限之塔關卡切換">
        ${prev ? `<a class="endless-stage-nav-link" href="${stageUrl(prev.no)}">← 上一關<span>第 ${prev.no} 層</span></a>` : `<span class="endless-stage-nav-link disabled">← 上一關</span>`}
        ${next ? `<a class="endless-stage-nav-link" href="${stageUrl(next.no)}">下一關 →<span>第 ${next.no} 層</span></a>` : `<span class="endless-stage-nav-link disabled">下一關 →</span>`}
      </nav>
    `;
  }

  function updateStageNav(stage) {
    const head = stageTitle?.closest(".endless-stage-head");
    if (!head) return;
    head.querySelector(".endless-stage-nav")?.remove();
    stageTitle.insertAdjacentHTML("afterend", renderStageNav(stage));
  }

  function renderStageInfoTable(stage) {
    const stageType = text(stage.info?.["樓層類型"]);
    const infoRows = [
      ["樓層類型", stage.info?.["樓層類型"]],
      ["地圖長度", stage.info?.["地圖長度"]],
      ["時間限制", stage.info?.["時間限制"]],
      ["羽毛消耗量", stage.info?.["羽毛消耗量"]]
    ];

    if (stageType === "破壞牢籠" || stageType === "拯救關卡") {
      infoRows.push(["拯救數量", stage.info?.["拯救數量"]]);
    }
    if (stageType === "破壞塔城") {
      infoRows.push(["塔城體力", stage.info?.["塔城體力"]]);
    }
    if (stageType === "破壞牢籠") {
      infoRows.push(["牢籠體力", stage.info?.["牢籠體力"]]);
    }

    const visibleRows = infoRows.filter(([, value]) => hasValue(value));
    if (!visibleRows.length) return "";
    return `
      ${renderSectionTitle("關卡資訊")}
      <div class="endless-table-wrap endless-stage-info-wrap">
        <table class="endless-stage-table endless-stage-info-table">
          <tbody>
            ${visibleRows.map(([label, value]) => `
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

  function renderGimmickTable(stage) {
    if (!stage.gimmicks?.length) return "";
    return `
      ${renderSectionTitle("機關")}
      <div class="endless-table-wrap endless-gimmick-table-wrap">
        <table class="endless-stage-table endless-gimmick-table">
          <tbody>
            ${stage.gimmicks.map((gimmick) => `
              <tr>
                <td class="endless-gimmick-icon-cell">
                  <div class="endless-gimmick-icon">
                    ${gimmick.icon ? `<img src="${GIMMICK_ICON(gimmick.icon)}" alt="" loading="lazy" onerror="this.closest('.endless-gimmick-icon').classList.add('missing-icon'); this.remove();">` : `<span class="no-icon">無圖</span>`}
                  </div>
                </td>
                <td>${formatValue(gimmick.description)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderEnemyLineTable(stage) {
    return `
      ${renderSectionTitle("敵人生產線")}
      <div class="endless-table-wrap">
        <table class="endless-stage-table">
          <thead>
            <tr>
              <th>敵人</th>
              <th>初登場時間</th>
              <th>再生產間距</th>
              <th>數量上限</th>
              <th>詳細資訊</th>
            </tr>
          </thead>
          <tbody>
            ${stage.rows.map((row, index) => `
              <tr>
                <td>${renderEnemyCell(row)}</td>
                <td>${formatValue(row["初登場時間"])}</td>
                <td>${formatValue(row["再生產間距"])}</td>
                <td>${formatValue(row["生產上限"] || row["數量上限"])}</td>
                <td><button class="endless-detail-btn" type="button" data-row-index="${index}">查看</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderStageDetail(stage) {
    if (!stageDetail || !stageTitle || !stageTable) return;
    state.currentStage = stage;
    if (stageGrid) stageGrid.hidden = true;
    stageDetail.hidden = false;
    stageTitle.textContent = `第 ${stage.no} 層`;
    updateStageNav(stage);

    stageTable.innerHTML = `
      ${renderStageInfoTable(stage)}
      ${renderGimmickTable(stage)}
      ${renderEnemyLineTable(stage)}
    `;

    stageTable.querySelectorAll(".endless-detail-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const row = stage.rows[Number(button.dataset.rowIndex) || 0];
        openEnemyLineModal(row);
      });
    });
  }

  function renderStat(label, value) {
    return `<div class="ranger-stat"><span>${escapeHtml(label)}</span><strong>${formatValue(value)}</strong></div>`;
  }

  function getSkill(enemy, key) {
    const value = enemy?.[key];
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  }

  function renderSkillMetaTable(skill) {
    return `
      <div class="table-scroll skill-meta-table-wrap enemy-skill-meta-table-wrap">
        <table class="skill-meta-table enemy-skill-meta-table">
          <thead><tr><th>發動率</th><th>技能冷卻時間</th><th>觸發基準</th></tr></thead>
          <tbody><tr><td>${escapeHtml(skill["發動機率"] || "-")}</td><td>${escapeHtml(skill["技能冷卻時間"] || "-")}</td><td>${escapeHtml(skill["觸發基準"] || "-")}</td></tr></tbody>
        </table>
      </div>
    `;
  }

  function renderSkills(enemy) {
    const skills = [getSkill(enemy, "技能1"), getSkill(enemy, "技能2"), getSkill(enemy, "技能3")].filter(Boolean);
    if (!skills.length) return `<div class="empty-state small">沒有技能資料。</div>`;
    return skills.map((skill, index) => `
      <article class="ranger-skill-card">
        <div class="ranger-icon-title">
          ${skill.icon ? `<img class="small-icon" src="${SKILL_ICON(skill.icon)}" alt="" onerror="this.remove();">` : ""}
          <div><h4>技能 ${index + 1}</h4></div>
        </div>
        ${renderSkillMetaTable(skill)}
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

  function getAbilityDetail(code) {
    return code ? state.abilityMap[code] : null;
  }

  function parseAbility(value, fallbackCode = "") {
    if (!value || value === "無" || value === "(無)") return [];
    if (Array.isArray(value)) return value.flatMap((entry) => parseAbility(entry, fallbackCode));
    const code = typeof value === "object" ? text(value.abilityCode || value["abilityCode"] || value.code || fallbackCode) : text(fallbackCode);
    const detail = getAbilityDetail(code);
    const name = typeof value === "object" ? text(value["能力"] || value["名稱"] || value.name || detail?.["名稱"] || code) : text(value || detail?.["名稱"] || code);
    if (!name || name === "無" || name === "(無)") return [];
    const icon = typeof value === "object" && value.icon ? value.icon : detail?.icon || "";
    return [{ name, code, icon, detail }];
  }

  function getAbilities(enemy) {
    return [
      ...parseAbility(enemy?.["能力1"], enemy?.abilityCode),
      ...parseAbility(enemy?.["能力2"], enemy?.abilityCode2),
      ...parseAbility(enemy?.["能力3"], enemy?.abilityCode3)
    ];
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
      .map(([, value]) => value);
  }

  function renderAbilities(enemy) {
    const abilities = getAbilities(enemy);
    if (!abilities.length) return `<div class="empty-state small">沒有能力資料。</div>`;
    return `<div class="ranger-ability-list">${abilities.map((ability) => {
      const description = text(ability.detail?.["敘述"] || "");
      return `
        <article class="ranger-ability-card">
          <div class="ranger-icon-title">
            ${ability.icon ? `<img class="small-icon" src="${ABILITY_ICON(ability.icon)}" alt="" onerror="this.remove();">` : ""}
            <div>
              <h4>${escapeHtml(ability.name)}</h4>
              ${description && description !== "無" && description !== "(無)" ? `<p class="preline">${escapeHtml(description)}</p>` : ""}
            </div>
          </div>
          ${renderAbilityEffectTable(getAbilityEffects(ability.detail))}
        </article>
      `;
    }).join("")}</div>`;
  }

  function renderAbilityEffectTable(effects) {
    if (!effects.length) return "";
    return `
      <div class="ability-effect-list">
        <div class="table-scroll ability-effect-table-wrap">
          <table class="ability-effect-table">
            <thead><tr><th>機率</th><th>時機</th><th>場合</th><th>條件</th><th>效果</th></tr></thead>
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

  function renderEnemyLineDetail(row) {
    const id = getEnemyId(row);
    const enemy = getEnemyBase(row);
    const detail = getLineDetail(row);
    return `
      <div class="ranger-detail-head">
        <div class="ranger-detail-image-wrap">
          ${id ? `<img class="ranger-detail-image" src="${ENEMY_IMAGE(id)}" alt="" onerror="this.closest('.ranger-detail-image-wrap').classList.add('missing-icon'); this.remove();">` : `<span class="no-icon">無圖</span>`}
        </div>
        <div>
          <h2 id="endlessEnemyModalTitle">${escapeHtml(id || "未知敵人")}</h2>
          <div class="ranger-tags detail-tags">
            ${[enemy["Ranger星數"], enemy["類型"], enemy["屬性"]].filter(Boolean).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
          </div>
        </div>
      </div>
      <section class="detail-section">
        <h3>生產線資訊</h3>
        <div class="ranger-stat-grid">
          ${renderStat("初登場時間", row["初登場時間"])}
          ${renderStat("再生產間距", row["再生產間距"])}
          ${renderStat("生產上限", row["生產上限"])}
        </div>
      </section>
      <section class="detail-section">
        <h3>敵人詳細資訊</h3>
        <div class="ranger-stat-grid">
          ${renderStat("體力", detail["體力"])}
          ${renderStat("物理攻擊力", detail["物理攻擊力"])}
          ${renderStat("魔法攻擊力", detail["魔法攻擊力"])}
          ${renderStat("物理防禦力", detail["物理防禦力"])}
          ${renderStat("魔法防禦力", detail["魔法防禦力"])}
          ${renderStat("攻擊範圍", detail["攻擊範圍"])}
          ${renderStat("濺射範圍", detail["濺射範圍"])}
          ${renderStat("技能抗性", detail["技能抗性"])}
          ${renderStat("爆擊機率", detail["爆擊機率"])}
          ${renderStat("爆擊傷害", detail["爆擊傷害"])}
          ${renderStat("閃避機率", detail["閃避機率"])}
          ${renderStat("技能閃避機率", detail["技能閃避機率"])}
          ${renderStat("命中率", detail["命中率"])}
          ${renderStat("技能命中率", detail["技能命中率"])}
        </div>
      </section>
      <section class="detail-section"><h3>技能</h3>${renderSkills(enemy)}</section>
      <section class="detail-section"><h3>能力</h3>${renderAbilities(enemy)}</section>
    `;
  }

  function openEnemyLineModal(row) {
    modalContent.innerHTML = renderEnemyLineDetail(row);
    modal.hidden = false;
    document.body.classList.add("modal-open");
    modal.scrollTop = 0;
    modalPanel.scrollTop = 0;
    modalContent.scrollTop = 0;
    modalCloseBtn.focus();
  }

  function closeModal() {
    modal.hidden = true;
    modalContent.innerHTML = "";
    document.body.classList.remove("modal-open");
  }

  function getRequestedStageNo() {
    const match = window.location.pathname.match(/\/endless\/stage\/end(\d+)\/?$/);
    return match ? Number(match[1]) : 0;
  }

  async function init() {
    try {
      const [stageRes, enemyRes, abilityRes] = await Promise.all([
        fetch(DATA_URL),
        fetch(ENEMY_DATA_URL).catch(() => null),
        fetch(ABILITY_DATA_URL).catch(() => null)
      ]);
      if (!stageRes.ok) throw new Error(`HTTP ${stageRes.status}`);
      state.stages = parseStageData(await stageRes.json());

      if (enemyRes && enemyRes.ok) {
        const enemies = await enemyRes.json();
        if (Array.isArray(enemies)) {
          enemies.forEach((enemy) => {
            const id = text(enemy.ranger_id || enemy.enemy_id || enemy.unitCode || enemy.id || "");
            if (id) state.enemyMap.set(id, enemy);
          });
        }
      }
      if (abilityRes && abilityRes.ok) state.abilityMap = await abilityRes.json();

      const requested = getRequestedStageNo();
      if (requested) {
        const stage = state.stages.find((item) => item.no === requested);
        if (stage) renderStageDetail(stage);
        else {
          renderStageGrid();
          stageGrid.innerHTML = `<div class="empty-state">找不到第 ${requested} 層資料。</div>`;
        }
      } else {
        renderStageGrid();
      }
    } catch (error) {
      if (stageGrid) stageGrid.innerHTML = `<div class="empty-state">資料載入失敗，請確認「無限之塔敵人生產線.json」是否已放在 /res 資料夾。</div>`;
      console.error(error);
    }
  }

  modalCloseBtn?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modal.hidden) closeModal(); });

  init();
})();
