(() => {
  const DATA_URL = "../../res/Rangers_data.json";
  const TYPES = ["力量", "敏捷", "智慧"];
  const STAT_COLUMNS = [
    { key: "魔法攻擊力", label: "平均魔法攻擊力" },
    { key: "物理攻擊力", label: "平均物理攻擊力" },
    { key: "體力", label: "平均體力" }
  ];
  const EXCLUDED_ABILITY_NAMES = ["對空迎擊", "飛翔能力"];

  const els = {
    start: document.getElementById("statsStartDate"),
    end: document.getElementById("statsEndDate"),
    apply: document.getElementById("statsApplyBtn"),
    reset: document.getElementById("statsResetBtn"),
    included: document.getElementById("statsIncludedCount"),
    excluded: document.getElementById("statsExcludedCount"),
    range: document.getElementById("statsRangeLabel"),
    table: document.getElementById("statsTableWrap")
  };

  const state = { rows: [] };

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

  function parseDateValue(value) {
    const raw = text(value).replaceAll("-", "/");
    const parts = raw.split("/").map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return 0;
    return new Date(parts[0], parts[1] - 1, parts[2]).getTime() || 0;
  }

  function dateInputTime(value, isEnd = false) {
    if (!value) return 0;
    const parts = value.split("-").map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return 0;
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    if (isEnd) date.setHours(23, 59, 59, 999);
    return date.getTime() || 0;
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

  function summarize(rows) {
    const result = Object.fromEntries(TYPES.map((type) => [type, { count: 0, sums: Object.fromEntries(STAT_COLUMNS.map((col) => [col.key, 0])) }]));
    rows.forEach((ranger) => {
      const type = text(ranger["類型"]);
      if (!result[type]) return;
      result[type].count += 1;
      STAT_COLUMNS.forEach((col) => {
        result[type].sums[col.key] += numberValue(ranger[col.key]);
      });
    });
    return result;
  }

  function renderTable(summary) {
    const rows = TYPES.map((type) => {
      const item = summary[type];
      return `<tr>
        <th>${html(type)}</th>
        <td>${formatCount(item.count)}</td>
        ${STAT_COLUMNS.map((col) => `<td>${item.count ? formatNumber(item.sums[col.key] / item.count) : "-"}</td>`).join("")}
      </tr>`;
    }).join("");

    els.table.innerHTML = `<table class="stats-table">
      <thead>
        <tr>
          <th>角色類型</th>
          <th>統計數量</th>
          ${STAT_COLUMNS.map((col) => `<th>${html(col.label)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function render() {
    const startTime = dateInputTime(els.start.value, false);
    const endTime = dateInputTime(els.end.value, true);
    const ranged = state.rows.filter((ranger) => inRange(ranger, startTime, endTime));
    const included = ranged.filter((ranger) => !isExcluded(ranger));
    const excluded = ranged.length - included.length;

    els.included.textContent = formatCount(included.length);
    els.excluded.textContent = formatCount(excluded);
    els.range.textContent = els.start.value || els.end.value
      ? `${els.start.value || "最早"} ～ ${els.end.value || "最新"}`
      : "全部時間";
    renderTable(summarize(included));
  }

  async function init() {
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      state.rows = Array.isArray(raw) ? raw : [];
      render();
    } catch (error) {
      els.table.innerHTML = `<div class="stats-empty">資料載入失敗，請稍後再試。</div>`;
      console.error(error);
    }
  }

  els.apply?.addEventListener("click", render);
  els.reset?.addEventListener("click", () => {
    els.start.value = "";
    els.end.value = "";
    render();
  });
  els.start?.addEventListener("change", render);
  els.end?.addEventListener("change", render);

  init();
})();
