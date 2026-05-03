(() => {
  const DATA_URL = "../res/%E7%84%A1%E9%99%90%E4%B9%8B%E5%A1%94%E6%95%B5%E4%BA%BA%E7%94%9F%E7%94%A2%E7%B7%9A.json";
  const ENEMY_DATA_URL = "../res/infEnemy_data.json";
  const ENEMY_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;

  const state = {
    raw: null,
    stages: [],
    enemyMap: new Map(),
    currentStage: null
  };

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

  function toNumber(value) {
    if (typeof value === "number") return value;
    const n = Number(text(value).replaceAll(",", ""));
    return Number.isFinite(n) ? n : 0;
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

  function getEnemyId(row) {
    return text(pick(row, ["敵人", "敵人ID", "enemy", "enemyId", "unitCode", "ranger_id", "id"]));
  }

  function getStageNo(stage) {
    const n = toNumber(pick(stage, ["樓層", "關卡", "stage", "floor", "no", "id"]));
    if (n) return n;
    const key = text(stage.key || stage.stageKey || "");
    const m = key.match(/\d+/);
    return m ? Number(m[0]) : 0;
  }

  function stageUrl(n) {
    return `./end${n}`;
  }

  function parseStageData(raw) {
    if (Array.isArray(raw)) {
      const first = raw[0];
      if (first && typeof first === "object" && Array.isArray(first["生產線"])) {
        return raw.map((stage, index) => ({
          no: getStageNo(stage) || index + 1,
          rows: stage["生產線"],
          raw: stage
        }));
      }

      const grouped = new Map();
      raw.forEach((row) => {
        const no = toNumber(pick(row, ["樓層", "關卡", "stage", "floor", "end"]));
        if (!no) return;
        if (!grouped.has(no)) grouped.set(no, []);
        grouped.get(no).push(row);
      });
      if (grouped.size) {
        return [...grouped.entries()].map(([no, rows]) => ({ no, rows, raw: { no } })).sort((a, b) => a.no - b.no);
      }
      return raw.map((row, index) => ({ no: index + 1, rows: Array.isArray(row) ? row : [row], raw: row }));
    }

    if (raw && typeof raw === "object") {
      return Object.entries(raw).map(([key, value], index) => {
        const noMatch = key.match(/\d+/);
        const no = noMatch ? Number(noMatch[0]) : index + 1;
        const rows = Array.isArray(value) ? value : Array.isArray(value?.["生產線"]) ? value["生產線"] : [value];
        return { no, rows, raw: { key, value } };
      }).sort((a, b) => a.no - b.no);
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
      <div class="endless-enemy-cell">
        <div class="endless-enemy-thumb">
          ${id ? `<img src="${ENEMY_IMAGE(id)}" alt="" loading="lazy" onerror="this.closest('.endless-enemy-thumb').classList.add('missing-icon'); this.remove();">` : `<span class="no-icon">無圖</span>`}
        </div>
        <strong>${escapeHtml(id || "-")}</strong>
      </div>
    `;
  }

  function renderStageDetail(stage) {
    if (!stageDetail || !stageTitle || !stageTable) return;
    state.currentStage = stage;
    stageGrid && (stageGrid.hidden = true);
    stageDetail.hidden = false;
    stageTitle.textContent = `第 ${stage.no} 層`;

    stageTable.innerHTML = `
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
                <td>${formatValue(pick(row, ["初登場時間", "初登場", "登場時間", "startTime", "firstSpawn"]))}</td>
                <td>${formatValue(pick(row, ["再生產間距", "再生產時間", "生產間隔", "spawnInterval", "interval"]))}</td>
                <td>${formatValue(pick(row, ["數量上限", "最大數量", "上限", "limit", "maxCount"]))}</td>
                <td><button class="endless-detail-btn" type="button" data-row-index="${index}">查看</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    stageTable.querySelectorAll(".endless-detail-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const row = stage.rows[Number(button.dataset.rowIndex) || 0];
        openEnemyLineModal(row);
      });
    });
  }

  function renderLineStat(label, value) {
    return `<div class="endless-line-stat"><span>${escapeHtml(label)}</span><strong>${formatValue(value)}</strong></div>`;
  }

  function renderEnemyLineDetail(row) {
    const id = getEnemyId(row);
    const enemy = state.enemyMap.get(id) || {};
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
        <div class="endless-line-stat-grid">
          ${renderLineStat("初登場時間", pick(row, ["初登場時間", "初登場", "登場時間", "startTime", "firstSpawn"]))}
          ${renderLineStat("再生產間距", pick(row, ["再生產間距", "再生產時間", "生產間隔", "spawnInterval", "interval"]))}
          ${renderLineStat("數量上限", pick(row, ["數量上限", "最大數量", "上限", "limit", "maxCount"]))}
        </div>
      </section>
      <section class="detail-section">
        <h3>敵人詳細資訊</h3>
        <div class="ranger-stat-grid">
          ${renderLineStat("體力", enemy["體力"])}
          ${renderLineStat("物理攻擊力", enemy["物理攻擊力"])}
          ${renderLineStat("魔法攻擊力", enemy["魔法攻擊力"])}
          ${renderLineStat("物理防禦力", enemy["物理防禦力"])}
          ${renderLineStat("魔法防禦力", enemy["魔法防禦力"])}
          ${renderLineStat("攻擊範圍", enemy["攻擊範圍"])}
          ${renderLineStat("濺射範圍", enemy["濺射範圍"])}
          ${renderLineStat("移動速度", enemy["移動速度"])}
          ${renderLineStat("攻擊速度", enemy["攻擊速度"])}
          ${renderLineStat("技能抗性", enemy["技能抗性"])}
          ${renderLineStat("爆擊機率", enemy["爆擊機率"])}
          ${renderLineStat("爆擊傷害", enemy["爆擊傷害"])}
          ${renderLineStat("閃避機率", enemy["閃避機率"])}
          ${renderLineStat("技能閃避機率", enemy["技能閃避機率"])}
          ${renderLineStat("命中率", enemy["命中率"])}
          ${renderLineStat("技能命中率", enemy["技能命中率"])}
        </div>
      </section>
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
    const path = window.location.pathname;
    const match = path.match(/\/endless\/stage\/end(\d+)\/?$/);
    return match ? Number(match[1]) : 0;
  }

  async function init() {
    try {
      const [stageRes, enemyRes] = await Promise.all([fetch(DATA_URL), fetch(ENEMY_DATA_URL).catch(() => null)]);
      if (!stageRes.ok) throw new Error(`HTTP ${stageRes.status}`);
      const raw = await stageRes.json();
      state.raw = raw;
      state.stages = parseStageData(raw);

      if (enemyRes && enemyRes.ok) {
        const enemies = await enemyRes.json();
        if (Array.isArray(enemies)) {
          enemies.forEach((enemy) => {
            const id = text(enemy.ranger_id || enemy.enemy_id || enemy.unitCode || enemy.id || "");
            if (id) state.enemyMap.set(id, enemy);
          });
        }
      }

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
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  init();
})();
