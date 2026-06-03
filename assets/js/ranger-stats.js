(() => {
  const DATA_URL = "../../res/Rangers_data.json";
  const CONFIG_URL = "../../res/ranger_stats_config.json";
  const TYPES = ["力量", "敏捷", "智慧"];
  const STAR_BUCKETS = [
    { key: "super8", label: "超進化8星", test: (ranger) => text(ranger["Ranger星數"]).includes("8") && text(ranger["Ranger星數"]).includes("超") },
    { key: "star9", label: "9星", test: (ranger) => text(ranger["Ranger星數"]).includes("9") }
  ];
  const STAT_COLUMNS = [
    { key: "魔法攻擊力", label: "平均魔法攻擊力" },
    { key: "物理攻擊力", label: "平均物理攻擊力" },
    { key: "體力", label: "平均體力" }
  ];
  const EXCLUDED_ABILITY_NAMES = ["對空迎擊", "飛翔能力"];

  const els = {
    included: document.getElementById("statsIncludedCount"),
    excluded: document.getElementById("statsExcludedCount"),
    range: document.getElementById("statsRangeLabel"),
    title: document.getElementById("statsCurrentTypeTitle"),
    table: document.getElementById("statsTableWrap"),
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
    const raw = text(value).replaceAll("-", "/");
    const parts = raw.split("/").map(Number);
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
    if (startTime && (!t || t < startTime)) return false;
    if (endTime && (!t || t > endTime)) return false;
    return true;
  }

  function emptyBucket() {
    return { count: 0, sums: Object.fromEntries(STAT_COLUMNS.map((col) => [col.key, 0])) };
  }

  function summarize(rows, type) {
    const result = Object.fromEntries(STAR_BUCKETS.map((bucket) => [bucket.key, emptyBucket()]));
    rows.forEach((ranger) => {
      if (text(ranger["類型"]) !== type) return;
      const bucket = STAR_BUCKETS.find((item) => item.test(ranger));
      if (!bucket) return;
      const target = result[bucket.key];
      target.count += 1;
      STAT_COLUMNS.forEach((col) => {
        target.sums[col.key] += numberValue(ranger[col.key]);
      });
    });
    return result;
  }

  function renderTable(summary) {
    const rows = STAR_BUCKETS.map((bucket) => {
      const item = summary[bucket.key];
      return `<tr>
        <th>${html(bucket.label)}</th>
        <td>${formatCount(item.count)}</td>
        ${STAT_COLUMNS.map((col) => `<td>${item.count ? formatNumber(item.sums[col.key] / item.count) : "-"}</td>`).join("")}
      </tr>`;
    }).join("");

    els.table.innerHTML = `<table class="stats-table">
      <thead>
        <tr>
          <th>星級分類</th>
          <th>統計數量</th>
          ${STAT_COLUMNS.map((col) => `<th>${html(col.label)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
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
    els.title.textContent = `${state.selectedType}平均數值`;
    renderTable(summarize(included, state.selectedType));
  }

  async function init() {
    try {
      const [dataRes, configRes] = await Promise.all([
        fetch(DATA_URL),
        fetch(CONFIG_URL).catch(() => null)
      ]);
      if (!dataRes.ok) throw new Error(`HTTP ${dataRes.status}`);
      const raw = await dataRes.json();
      state.rows = Array.isArray(raw) ? raw : [];
      if (configRes && configRes.ok) {
        const config = await configRes.json();
        state.config = config && typeof config === "object" ? config : state.config;
      }
      render();
    } catch (error) {
      els.table.innerHTML = `<div class="stats-empty">資料載入失敗，請稍後再試。</div>`;
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
