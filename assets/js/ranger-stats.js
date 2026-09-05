(() => {
  const DATA_URL = "../../res/Rangers_data.json";
  const CONFIG_URL = "../../res/ranger_stats_config.json";
  const TYPES = ["力量", "敏捷", "智慧"];
  const WINDOW_MONTHS = 30;
  const STAT_ROWS = [
    { key: "總攻擊力", label: "總攻擊力", value: totalAttackValue },
    { key: "體力", label: "體力", value: (ranger) => numberValue(ranger["體力"]) },
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
    { key: "super8", label: "超進化", sectionLabel: "超進化數據統計", test: isSuper8 },
    { key: "star9", label: "九星", sectionLabel: "九星數據統計", test: isStar9 }
  ];

  const LINE_DEFS = [
    { key: "p12", label: "底標" },
    { key: "q1", label: "後標" },
    { key: "median", label: "均標" },
    { key: "q3", label: "前標" },
    { key: "p88", label: "頂標" },
    { key: "avg", label: "平均" }
  ];
  const LINE_COLORS = ["#2563eb", "#16a34a", "#9333ea", "#f97316", "#dc2626", "#0f172a"];
  const DARK_LINE_COLORS = ["#60a5fa", "#4ade80", "#c084fc", "#fb923c", "#f87171", "#e2e8f0"];

  const els = {
    included: document.getElementById("statsIncludedCount"),
    excluded: document.getElementById("statsExcludedCount"),
    range: document.getElementById("statsRangeLabel"),
    sections: document.getElementById("statsSections"),
    typeButtons: [...document.querySelectorAll(".stats-type-button")],
    trendPanel: document.getElementById("statsTrendPanel"),
    trendSelect: document.getElementById("statsTrendMetricSelect"),
    trendRange: document.getElementById("statsTrendRangeText"),
    trendCanvas: document.getElementById("statsTrendChart"),
    trendLegend: document.getElementById("statsTrendLegend"),
    trendEmpty: document.getElementById("statsTrendEmpty")
  };

  const state = {
    rows: [],
    config: { start_date: "" },
    selectedType: "力量",
    now: new Date(),
    includedRows: []
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

  function formatMonth(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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

  function configStartDate() {
    const startTime = parseConfigStartTime();
    return startTime ? new Date(startTime) : null;
  }

  function monthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function addMonths(date, months) {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
  }

  function endOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
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
    els.sections.innerHTML = STAR_BUCKETS
      .map((bucket) => renderStatsSection(bucket.sectionLabel, bucketRows(rows, state.selectedType, bucket), STAT_ROWS, state.selectedType))
      .join("");
  }

  function trendOptions() {
    return STAR_BUCKETS.flatMap((bucket) => STAT_ROWS.map((stat) => ({ bucket, stat })));
  }

  function renderTrendOptions() {
    if (!els.trendSelect) return;
    const current = els.trendSelect.value;
    els.trendSelect.innerHTML = trendOptions().map(({ bucket, stat }) => {
      const value = `${bucket.key}::${stat.key}`;
      return `<option value="${html(value)}">${html(bucket.label)}｜${html(stat.label)}</option>`;
    }).join("");
    if (current && [...els.trendSelect.options].some((option) => option.value === current)) els.trendSelect.value = current;
  }

  function selectedTrendOption() {
    const [bucketKey, statKey] = text(els.trendSelect?.value || "").split("::");
    const bucket = STAR_BUCKETS.find((item) => item.key === bucketKey) || STAR_BUCKETS[0];
    const stat = STAT_ROWS.find((item) => item.key === statKey) || STAT_ROWS[0];
    return { bucket, stat };
  }

  function trendMonths() {
    const start = monthStart(configStartDate() || state.now);
    const end = monthStart(state.now);
    const months = [];
    for (let cursor = start; cursor <= end; cursor = addMonths(cursor, 1)) months.push(cursor);
    return months;
  }

  function trendRowsForMonth(rows, type, bucket, month) {
    const windowStart = addMonths(month, -WINDOW_MONTHS);
    const windowEnd = endOfMonth(month);
    return rows.filter((ranger) => {
      const t = parseDateValue(ranger["登場時間"]);
      return t && t >= windowStart.getTime() && t <= windowEnd.getTime() && rowType(ranger) === type && bucket.test(ranger);
    });
  }

  function trendData() {
    const { bucket, stat } = selectedTrendOption();
    const months = trendMonths();
    return months.map((month) => {
      const rows = trendRowsForMonth(state.rows.filter((ranger) => !isExcluded(ranger)), state.selectedType, bucket, month);
      const summary = summarizeValues(rows.map((ranger) => stat.value(ranger)).filter((value) => value > 0), shouldUseDescending(stat, state.selectedType));
      return { month, label: formatMonth(month), count: summary.count, summary };
    });
  }

  function setupCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(640, Math.floor(rect.width || canvas.clientWidth || 960));
    const height = Math.max(320, Math.floor(width * 0.44));
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, width, height };
  }

  function themeValue(name, fallback) {
    const bodyValue = getComputedStyle(document.body).getPropertyValue(name).trim();
    if (bodyValue) return bodyValue;
    const rootValue = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return rootValue || fallback;
  }

  function drawTrendChart() {
    if (!els.trendCanvas || !els.trendPanel?.open) return;
    const points = trendData();
    const valid = points.filter((point) => point.count > 0);
    els.trendEmpty.hidden = valid.length > 0;
    els.trendCanvas.hidden = valid.length === 0;
    els.trendLegend.hidden = valid.length === 0;

    const { bucket, stat } = selectedTrendOption();
    const startText = points[0]?.label || "-";
    const endText = points[points.length - 1]?.label || "-";
    els.trendRange.textContent = `${bucket.label}｜${state.selectedType}｜${stat.label}｜${startText} ～ ${endText}（每月資料集：該月往前 ${WINDOW_MONTHS} 個月）`;
    if (!valid.length) return;

    const { ctx, width, height } = setupCanvas(els.trendCanvas);
    const isDark = document.documentElement.dataset.theme === "dark";
    const lineColors = isDark ? DARK_LINE_COLORS : LINE_COLORS;
    const panelColor = themeValue("--panel", isDark ? "#172033" : "#ffffff");
    const gridColor = themeValue("--line", isDark ? "#334155" : "#e5e7eb");
    const labelColor = themeValue("--muted", isDark ? "#a8b3c7" : "#64748b");
    const axisColor = isDark ? "#64748b" : "#94a3b8";
    const pad = { top: 26, right: 26, bottom: 54, left: 82 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const values = valid.flatMap((point) => LINE_DEFS.map((line) => point.summary[line.key]).filter(Number.isFinite));
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      min = Math.max(0, min - 1);
      max += 1;
    }
    const span = max - min;
    min = Math.max(0, min - span * 0.08);
    max = max + span * 0.08;

    const x = (index) => pad.left + (points.length === 1 ? plotW / 2 : (plotW * index) / (points.length - 1));
    const y = (value) => pad.top + plotH - ((value - min) / (max - min)) * plotH;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = panelColor;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.fillStyle = labelColor;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    for (let i = 0; i <= 4; i++) {
      const yy = pad.top + (plotH * i) / 4;
      const value = max - ((max - min) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.left, yy);
      ctx.lineTo(width - pad.right, yy);
      ctx.stroke();
      ctx.fillText(formatNumber(value), 10, yy + 4);
    }

    ctx.strokeStyle = axisColor;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.lineTo(width - pad.right, pad.top + plotH);
    ctx.stroke();

    const labelStep = Math.max(1, Math.ceil(points.length / 8));
    ctx.fillStyle = labelColor;
    points.forEach((point, index) => {
      if (index % labelStep !== 0 && index !== points.length - 1) return;
      ctx.save();
      ctx.translate(x(index), pad.top + plotH + 18);
      ctx.rotate(-Math.PI / 6);
      ctx.textAlign = "right";
      ctx.fillText(point.label, 0, 0);
      ctx.restore();
    });

    LINE_DEFS.forEach((line, lineIndex) => {
      ctx.strokeStyle = lineColors[lineIndex];
      ctx.fillStyle = lineColors[lineIndex];
      ctx.lineWidth = line.key === "avg" ? 3 : 2;
      ctx.beginPath();
      let started = false;
      points.forEach((point, index) => {
        const value = point.summary[line.key];
        if (!Number.isFinite(value)) return;
        const xx = x(index);
        const yy = y(value);
        if (!started) {
          ctx.moveTo(xx, yy);
          started = true;
        } else {
          ctx.lineTo(xx, yy);
        }
      });
      ctx.stroke();
      points.forEach((point, index) => {
        const value = point.summary[line.key];
        if (!Number.isFinite(value)) return;
        ctx.beginPath();
        ctx.arc(x(index), y(value), 2.7, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    els.trendLegend.innerHTML = LINE_DEFS.map((line, index) => `<span><i style="background:${lineColors[index]}"></i>${html(line.label)}</span>`).join("");
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
    state.includedRows = included;

    els.included.textContent = formatCount(included.length);
    els.excluded.textContent = formatCount(excluded);
    els.range.textContent = `${state.config.start_date || state.config.startDate || state.config["起始日期"] || "最早"} ～ ${formatDate(state.now)}`;
    renderTables(included);
    renderTrendOptions();
    drawTrendChart();
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
      renderTrendOptions();
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
  els.trendPanel?.addEventListener("toggle", () => drawTrendChart());
  els.trendSelect?.addEventListener("change", () => drawTrendChart());
  window.addEventListener("resize", () => drawTrendChart());

  const themeObserver = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === "attributes" && mutation.attributeName === "data-theme")) {
      requestAnimationFrame(drawTrendChart);
    }
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  init();
})();
