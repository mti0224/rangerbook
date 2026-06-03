(() => {
  const DATA_URL = "../../res/Rangers_data.json";
  const METRICS = {
    totalAttack: {
      label: "總攻擊力",
      value: (ranger) => numberValue(ranger["物理攻擊力"]) + numberValue(ranger["魔法攻擊力"])
    },
    hp: {
      label: "體力",
      value: (ranger) => numberValue(ranger["體力"])
    },
    range: {
      label: "攻擊範圍",
      value: (ranger) => numberValue(ranger["攻擊範圍"])
    },
    speed: {
      label: "移動速度",
      value: (ranger) => numberValue(ranger["移動速度"])
    }
  };

  const els = {
    metricButtons: [...document.querySelectorAll(".ranking-metric-button")],
    typeFilter: document.getElementById("rankingTypeFilter"),
    elementFilter: document.getElementById("rankingElementFilter"),
    starFilter: document.getElementById("rankingStarFilter"),
    metricLabel: document.getElementById("rankingMetricLabel"),
    resultCount: document.getElementById("rankingResultCount"),
    conditionLabel: document.getElementById("rankingConditionLabel"),
    title: document.getElementById("rankingTitle"),
    table: document.getElementById("rankingTableWrap")
  };

  const state = {
    rows: [],
    metric: "totalAttack"
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

  function normalizeRows(raw) {
    if (Array.isArray(raw)) return raw;
    if (!raw || typeof raw !== "object") return [];
    for (const key of ["data", "rows", "rangers", "items"]) {
      if (Array.isArray(raw[key])) return raw[key];
    }
    return Object.values(raw).filter((item) => item && typeof item === "object" && !Array.isArray(item));
  }

  function rowType(ranger) {
    const value = text(ranger["類型"]);
    return ["智慧", "敏捷", "力量"].find((type) => value.includes(type)) || value;
  }

  function rowElement(ranger) {
    return text(ranger["屬性"] || ranger["元素"] || ranger["Ranger屬性"]);
  }

  function rowStar(ranger) {
    return text(ranger["Ranger星數"] || ranger["星級"]);
  }

  function rangerName(ranger) {
    return text(ranger["名稱"] || ranger["Ranger名稱"] || ranger.name || ranger.id || ranger.unitCode || "-");
  }

  function rangerCode(ranger) {
    return text(ranger.id || ranger.unitCode || ranger["unitCode"] || ranger["代碼"] || "");
  }

  function matchElement(ranger, selectedElement) {
    if (!selectedElement) return true;
    return rowElement(ranger).includes(selectedElement);
  }

  function matchStar(ranger, selectedStar) {
    const star = rowStar(ranger);
    if (!selectedStar) return true;
    if (selectedStar === "star9") return star.includes("9");
    if (selectedStar === "super8") return star.includes("8") && (star.includes("超") || star.includes("Ultra") || star.toLowerCase().includes("super"));
    if (selectedStar === "ultimate8") return star.includes("8") && (star.includes("終") || star.includes("究") || star.toLowerCase().includes("ultimate"));
    if (selectedStar === "star8") return star.includes("8");
    return true;
  }

  function filteredRows() {
    const type = els.typeFilter.value;
    const element = els.elementFilter.value;
    const star = els.starFilter.value;
    const metric = METRICS[state.metric];
    return state.rows
      .filter((ranger) => rowType(ranger) === type)
      .filter((ranger) => matchElement(ranger, element))
      .filter((ranger) => matchStar(ranger, star))
      .map((ranger) => ({ ranger, value: metric.value(ranger) }))
      .filter((item) => Number.isFinite(item.value) && item.value > 0)
      .sort((a, b) => b.value - a.value);
  }

  function starLabel(value) {
    return {
      "": "全部",
      star9: "九星",
      super8: "超進化8星",
      ultimate8: "終極進化8星",
      star8: "8星"
    }[value] || "全部";
  }

  function elementLabel(value) {
    return value || "全部";
  }

  function renderTable(rows) {
    if (!rows.length) {
      return `<div class="ranking-empty">沒有符合條件的角色。</div>`;
    }

    return `<table class="ranking-table">
      <thead>
        <tr>
          <th>排名</th>
          <th>角色</th>
          <th>類型</th>
          <th>屬性</th>
          <th>星級</th>
          <th>${html(METRICS[state.metric].label)}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((item, index) => {
          const code = rangerCode(item.ranger);
          const name = rangerName(item.ranger);
          const nameCell = code ? `<a href="../ranger/?id=${encodeURIComponent(code)}">${html(name)}</a>` : html(name);
          return `<tr>
            <td>${formatCount(index + 1)}</td>
            <th>${nameCell}</th>
            <td>${html(rowType(item.ranger))}</td>
            <td>${html(rowElement(item.ranger) || "-")}</td>
            <td>${html(rowStar(item.ranger) || "-")}</td>
            <td>${formatNumber(item.value)}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
  }

  function render() {
    const metric = METRICS[state.metric] || METRICS.totalAttack;
    const rows = filteredRows();

    els.metricButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.metric === state.metric);
    });

    els.metricLabel.textContent = metric.label;
    els.resultCount.textContent = formatCount(rows.length);
    els.conditionLabel.textContent = `${els.typeFilter.value} / ${elementLabel(els.elementFilter.value)} / ${starLabel(els.starFilter.value)}`;
    els.title.textContent = `${metric.label}排名`;
    els.table.innerHTML = renderTable(rows);
  }

  async function init() {
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.rows = normalizeRows(await res.json());
      render();
    } catch (error) {
      els.table.innerHTML = `<div class="ranking-empty">資料載入失敗，請稍後再試。</div>`;
      console.error(error);
    }
  }

  els.metricButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.metric = METRICS[button.dataset.metric] ? button.dataset.metric : "totalAttack";
      render();
    });
  });

  [els.typeFilter, els.elementFilter, els.starFilter].forEach((select) => {
    select.addEventListener("change", render);
  });

  init();
})();
