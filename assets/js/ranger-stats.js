(() => {
  const DATA_URL = "../../res/Rangers_data.json";
  const CONFIG_URL = "../../res/ranger_stats_config.json";
  const TYPES = ["力量", "敏捷", "智慧"];
  const STAT_ROWS = [
    { key: "總攻擊力", label: "總攻擊力", value: totalAttackValue },
    { key: "體力", label: "體力", value: (ranger) => numberValue(ranger["體力"]) }
  ];
  const GENERAL_ROWS = [
    { key: "生產礦物費用", label: "生產礦物費用", value: (ranger) => numberValue(ranger["生產礦物費用"]), descending: true },
    { key: "攻擊範圍", label: "攻擊範圍", value: (ranger) => numberValue(ranger["攻擊範圍"]), descendingTypes: ["力量"] }
  ];
  const STANDARD_COLUMNS = [
    { key: "p12", label: "底標" },
    { key: "q1", label: "後標" },
    { key: "median", label: "均標" },
    { key: "q3", label: "前標" },
    { key: "p88", label: "頂標" },
    { key: "avg", label: "平均" }
  ];
  const EXCLUDED_ABILITY_NAMES = ["對空迎擊", "飛翔能力"];

  const STAR_BUCKETS = [
    { key: "super8", label: "超進化數據統計", test: isSuper8 },
    { key: "star9", label: "九星數據統計", test: isStar9 }
  ];

  const els = {
    included: document.getElementById("statsIncludedCount"),
    excluded: document.getElementById("statsExcludedCount"),
    range: document.getElementById("statsRangeLabel"),
    sections: document.getElementById("statsSections"),
    typeButtons: [...document.querySelectorAll(".stats-type-button")]
  };

  const state = {
    rows: [],
    config: { start_date: "" },
    selectedType: "力量",
    now: new Date()
  };

  function rawText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value);
  }

  function text(value) {
    return rawText(value).replaceAll("\\n", "\n").trim();
  }

  function html(value) {
    return rawText(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function numberValue(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const normalized = text(value).replaceAll(",", "").replace(/[+％%秒點]/g, "");
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  }

  function totalAttackValue(ranger) {
    return numberValue(ranger["物理攻擊力"]) + numberValue(ranger["魔法攻擊力"]);
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) return "-";
    return Math.round(value).toLocaleString("zh-Hant");
  }

  function formatCount(value) {
    return Number(value || 0).toLocaleString("zh-Hant");
  }

  function formatDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseDateValue(value) {
    if (value instanceof Date) return value.getTime() || 0;
    const raw = text(value);
    const parts = raw.match(/\d+/g)?.slice(0, 3).map(Number) || [];
    if (parts.length < 3 || parts.some(Number.isNaN)) return 0;
    return new Date(parts[0], parts[1] - 1, parts[2]).getTime() || 0;
  }

  function parseConfigStartTime() {
    return parseDateValue(state.config.start_date || state.config.startDate || state.config["起始日期"] || "");
  }

  function abilityName(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return text(value["能力"] || value["名稱"] || value["能力名稱"] || value.name || value.code || value.abilityCode || "");
    }
    return text(value);
  }

  function abilityValues(ranger) {
    const values = [ranger["能力1"], ranger["能力2"], ranger["覺醒能力"]];
    return values.flatMap((value) => Array.isArray(value) ? value : [value]).map(abilityName).filter(Boolean);
  }

  function isExcluded(ranger) {
    const blob = abilityValues(ranger).join(" ");
    return EXCLUDED_ABILITY_NAMES.some((name) => blob.includes(name));
  }

  function inRange(ranger, startTime, endTime) {
    const t = parseDateValue(ranger["登場時間"]);
    if (!t) return false;
    if (startTime && t < startTime) return false;
    if (endTime && t > endTime) return false;
    return true;
  }

  function rowType(ranger) {
    const value = text(ranger["類型"]);
    return TYPES.find((type) => value.includes(type)) || value;
  }

  function isSuper8(ranger) {
    const star = text(ranger["Ranger星數"]);
    return star.includes("8") && (star.includes("超") || star.includes("究極") || star.toLowerCase().includes("ultra"));
  }

  function isStar9(ranger) {
    return text(ranger["Ranger星數"]).includes("9");
  }

  function percentile(sortedValues, ratio) {
    if (!sortedValues.length) return NaN;
    if (sortedValues.length === 1) return sortedValues[0];
    const index = (sortedValues.length - 1) * ratio;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sortedValues[lower];
    const weight = index - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  function summarizeValues(values, descending = false) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => descending ? b - a : a - b);
    const sum = sorted.reduce((total, value) => total + value, 0);
    return {
      count: sorted.length,
      p12: percentile(sorted, 0.12),
      q1: percentile(sorted, 0.25),
      median: percentile(sorted, 0.5),
      q3: percentile(sorted, 0.75),
      p88: percentile(sorted, 0.88),
      avg: sorted.length ? sum / sorted.length : NaN
    };
  }

  function bucketRows(rows, type, bucket) {
    return rows.filter((ranger) => rowType(ranger) === type && bucket.test(ranger));
  }

  function typeRows(rows, type) {
    return rows.filter((ranger) => rowType(ranger) === type);
  }

  function shouldUseDescending(stat, type) {
    return Boolean(stat.descending || stat.descendingTypes?.includes(type));
  }

  function summarizeBucket(rows, stats = STAT_ROWS, type = "") {
    return Object.fromEntries(stats.map((stat) => [
      stat.key,
      summarizeValues(
        rows.map((ranger) => stat.value(ranger)).filter((value) => value > 0),
        shouldUseDescending(stat, type)
      )
    ]));
  }

  function renderStatsSection(label, rows, stats = STAT_ROWS, type = "") {
    const summary = summarizeBucket(rows, stats, type);
    return `<section class="stats-section">
      <h2>${html(label)}</h2>
      <div class="stats-table-wrap">
        <table class="stats-table stats-standard-table">
          <thead>
            <tr>
              <th>項目</th>
              ${STANDARD_COLUMNS.map((col) => `<th>${html(col.label)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${stats.map((stat) => `<tr>
              <th>${html(stat.label)}</th>
              ${STANDARD_COLUMNS.map((col) => `<td>${formatNumber(summary[stat.key][col.key])}</td>`).join("")}
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>`;
  }

  function renderTables(rows) {
    const starSections = STAR_BUCKETS.map((bucket) => renderStatsSection(bucket.label, bucketRows(rows, state.selectedType, bucket), STAT_ROWS, state.selectedType));
    const generalSection = renderStatsSection("綜合數據", typeRows(rows, state.selectedType), GENERAL_ROWS, state.selectedType);
    els.sections.innerHTML = [...starSections, generalSection].join("");
  }

  function setActiveType(type) {
    state.selectedType = TYPES.includes(type) ? type : "力量";
    els.typeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.type === state.selectedType);
    });
  }

  function render() {
    const startTime = parseConfigStartTime();
    const endTime = state.now.getTime();
    const ranged = state.rows.filter((ranger) => inRange(ranger, startTime, endTime));
    const included = ranged.filter((ranger) => !isExcluded(ranger));
    const excluded = ranged.length - included.length;

    els.included.textContent = formatCount(included.length);
    els.excluded.textContent = formatCount(excluded);
    els.range.textContent = `${state.config.start_date || state.config.startDate || state.config["起始日期"] || "最早"} ～ ${formatDate(state.now)}`;
    renderTables(included);
  }

  function normalizeRows(raw) {
    if (Array.isArray(raw)) return raw;
    if (!raw || typeof raw !== "object") return [];
    for (const key of ["data", "rows", "rangers", "items"]) {
      if (Array.isArray(raw[key])) return raw[key];
    }
    return Object.values(raw).filter((item) => item && typeof item === "object" && !Array.isArray(item));
  }

  async function init() {
    try {
      const [dataRes, configRes] = await Promise.all([
        fetch(DATA_URL),
        fetch(CONFIG_URL).catch(() => null)
      ]);
      if (!dataRes.ok) throw new Error(`HTTP ${dataRes.status}`);
      const raw = await dataRes.json();
      state.rows = normalizeRows(raw);
      if (configRes && configRes.ok) {
        const config = await configRes.json();
        state.config = config && typeof config === "object" ? config : state.config;
      }
      render();
    } catch (error) {
      els.sections.innerHTML = `<div class="stats-empty">資料載入失敗，請稍後再試。</div>`;
      console.error(error);
    }
  }

  els.typeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveType(button.dataset.type);
      render();
    });
  });

  init();
})();
