(() => {
  const DATA_URL = "../../res/Rangers_data.json";
  const PAGE_SIZE = 20;
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
    title: document.getElementById("rankingTitle"),
    list: document.getElementById("rankingList"),
    pagination: document.getElementById("rankingPagination")
  };

  const state = {
    rows: [],
    metric: "totalAttack",
    page: 1
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

  function matchType(ranger, selectedType) {
    if (!selectedType) return true;
    return rowType(ranger) === selectedType;
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
      .filter((ranger) => matchType(ranger, type))
      .filter((ranger) => matchElement(ranger, element))
      .filter((ranger) => matchStar(ranger, star))
      .map((ranger) => ({ ranger, value: metric.value(ranger) }))
      .filter((item) => Number.isFinite(item.value) && item.value > 0)
      .sort((a, b) => b.value - a.value);
  }

  function renderCard(item, rank) {
    const code = rangerCode(item.ranger);
    const name = rangerName(item.ranger);
    const nameCell = code ? `<a href="../ranger/?id=${encodeURIComponent(code)}">${html(name)}</a>` : html(name);
    const metric = METRICS[state.metric];

    return `<article class="ranking-card">
      <div class="ranking-rank">${formatCount(rank)}</div>
      <div class="ranking-card-main">
        <div class="ranking-card-title-row">
          <h3>${nameCell}</h3>
          <strong>${formatNumber(item.value)}</strong>
        </div>
        <div class="ranking-card-meta">
          <span>${html(metric.label)}</span>
          <span>${html(rowType(item.ranger) || "-")}</span>
          <span>${html(rowElement(item.ranger) || "-")}</span>
          <span>${html(rowStar(item.ranger) || "-")}</span>
        </div>
      </div>
    </article>`;
  }

  function renderList(rows) {
    if (!rows.length) {
      els.list.innerHTML = `<div class="ranking-empty">沒有符合條件的角色。</div>`;
      return;
    }

    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const start = (state.page - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);
    els.list.innerHTML = pageRows.map((item, index) => renderCard(item, start + index + 1)).join("");
  }

  function renderPagination(rows) {
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (!rows.length || totalPages <= 1) {
      els.pagination.innerHTML = "";
      return;
    }

    const pageButtons = Array.from({ length: totalPages }, (_, index) => index + 1)
      .filter((page) => page === 1 || page === totalPages || Math.abs(page - state.page) <= 2)
      .map((page, index, pages) => {
        const gap = index > 0 && page - pages[index - 1] > 1 ? `<span class="ranking-page-gap">...</span>` : "";
        return `${gap}<button class="ranking-page-button${page === state.page ? " active" : ""}" type="button" data-page="${page}">${formatCount(page)}</button>`;
      }).join("");

    els.pagination.innerHTML = `
      <button class="ranking-page-nav" type="button" data-page="${state.page - 1}" ${state.page <= 1 ? "disabled" : ""}>上一頁</button>
      <div class="ranking-page-buttons">${pageButtons}</div>
      <button class="ranking-page-nav" type="button" data-page="${state.page + 1}" ${state.page >= totalPages ? "disabled" : ""}>下一頁</button>
    `;

    els.pagination.querySelectorAll("button[data-page]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextPage = Number(button.dataset.page);
        if (!Number.isFinite(nextPage)) return;
        state.page = Math.min(Math.max(1, nextPage), totalPages);
        render();
        document.querySelector(".ranking-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function render() {
    const metric = METRICS[state.metric] || METRICS.totalAttack;
    const rows = filteredRows();

    els.metricButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.metric === state.metric);
    });

    els.title.textContent = `${metric.label}排名`;
    renderList(rows);
    renderPagination(rows);
  }

  function resetPageAndRender() {
    state.page = 1;
    render();
  }

  async function init() {
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.rows = normalizeRows(await res.json());
      render();
    } catch (error) {
      els.list.innerHTML = `<div class="ranking-empty">資料載入失敗，請稍後再試。</div>`;
      els.pagination.innerHTML = "";
      console.error(error);
    }
  }

  els.metricButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.metric = METRICS[button.dataset.metric] ? button.dataset.metric : "totalAttack";
      resetPageAndRender();
    });
  });

  [els.typeFilter, els.elementFilter, els.starFilter].forEach((select) => {
    select.addEventListener("change", resetPageAndRender);
  });

  init();
})();
