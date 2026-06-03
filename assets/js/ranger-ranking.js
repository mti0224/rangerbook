(() => {
  const DATA_URL = "../../res/Rangers_data.json";
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
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
    paginationBar: document.getElementById("rankingPaginationBar"),
    paginationInfo: document.getElementById("paginationInfo"),
    paginationSize: document.getElementById("paginationSize"),
    paginationPrev: document.getElementById("paginationPrev"),
    paginationNext: document.getElementById("paginationNext"),
    paginationPages: document.getElementById("paginationPages")
  };

  const state = {
    rows: [],
    filtered: [],
    metric: "totalAttack",
    page: 1,
    pageSize: 60
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
    return text(ranger["Ranger名稱"] || ranger["名稱"] || ranger.name || ranger.id || ranger.unitCode || "-");
  }

  function rangerCode(ranger) {
    return text(ranger.ranger_id || ranger.id || ranger.unitCode || ranger["unitCode"] || ranger["代碼"] || "");
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

  function buildFilteredRows() {
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
    const imageUrl = code ? RANGER_IMAGE(code) : "";

    return `<article class="ranking-card ranger-card" data-ranger-id="${html(code || name)}">
      <div class="ranking-card-left">
        <div class="ranking-rank">${formatCount(rank)}</div>
        <div class="ranking-thumb-wrap ranger-thumb-wrap">
          ${imageUrl ? `<img class="ranking-thumb ranger-thumb" src="${imageUrl}" alt="" loading="lazy" onerror="this.closest('.ranking-thumb-wrap').classList.add('missing-icon'); this.remove();">` : `<span class="no-icon">無圖</span>`}
        </div>
      </div>
      <div class="ranking-card-main">
        <div class="ranking-card-title-row">
          <h3>${nameCell}</h3>
        </div>
        <div class="ranking-card-meta mini-meta">
          <span>${html(rowType(item.ranger) || "-")}</span>
          <span>${html(rowElement(item.ranger) || "-")}</span>
          <span>${html(rowStar(item.ranger) || "-")}</span>
        </div>
      </div>
      <strong class="ranking-value">${formatNumber(item.value)}</strong>
    </article>`;
  }

  function makePageButtons(totalPages) {
    if (totalPages <= 1) {
      els.paginationPages.innerHTML = "";
      return;
    }

    const pages = new Set([1, totalPages, state.page - 1, state.page, state.page + 1]);
    const ordered = [...pages]
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((a, b) => a - b);

    const parts = [];
    let last = 0;
    ordered.forEach((page) => {
      if (page - last > 1) parts.push(`<span class="pagination-ellipsis">…</span>`);
      parts.push(`<button class="pagination-page ${page === state.page ? "active" : ""}" type="button" data-page="${page}">${formatCount(page)}</button>`);
      last = page;
    });

    els.paginationPages.innerHTML = parts.join("");
    els.paginationPages.querySelectorAll(".pagination-page").forEach((button) => {
      button.addEventListener("click", () => {
        state.page = Number(button.dataset.page) || 1;
        applyPagination(false);
        scrollToListTop();
      });
    });
  }

  function scrollToListTop() {
    const top = Math.max(0, els.list.getBoundingClientRect().top + window.scrollY - 120);
    window.scrollTo({ top, behavior: "smooth" });
  }

  function applyPagination(resetPage = true) {
    const total = state.filtered.length;
    if (!total) {
      els.paginationBar.hidden = true;
      els.list.innerHTML = `<div class="ranking-empty empty-state">沒有符合條件的角色。</div>`;
      return;
    }

    els.paginationBar.hidden = false;
    state.pageSize = Number(els.paginationSize.value) || 60;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    if (resetPage) state.page = 1;
    state.page = Math.min(Math.max(1, state.page), totalPages);

    const start = (state.page - 1) * state.pageSize;
    const end = start + state.pageSize;
    const pageRows = state.filtered.slice(start, end);

    els.list.innerHTML = pageRows.map((item, index) => renderCard(item, start + index + 1)).join("");
    els.paginationInfo.textContent = `第 ${state.page} / ${totalPages} 頁，顯示第 ${start + 1}–${Math.min(end, total)} 筆，共 ${total} 筆`;
    els.paginationPrev.disabled = state.page <= 1;
    els.paginationNext.disabled = state.page >= totalPages;
    makePageButtons(totalPages);
  }

  function render(resetPage = true) {
    const metric = METRICS[state.metric] || METRICS.totalAttack;
    state.filtered = buildFilteredRows();

    els.metricButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.metric === state.metric);
    });

    els.title.textContent = `${metric.label}排名`;
    applyPagination(resetPage);
  }

  async function init() {
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.rows = normalizeRows(await res.json());
      render(true);
    } catch (error) {
      els.list.innerHTML = `<div class="ranking-empty empty-state">資料載入失敗，請稍後再試。</div>`;
      els.paginationBar.hidden = true;
      console.error(error);
    }
  }

  els.metricButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.metric = METRICS[button.dataset.metric] ? button.dataset.metric : "totalAttack";
      render(true);
    });
  });

  [els.typeFilter, els.elementFilter, els.starFilter].forEach((select) => {
    select.addEventListener("change", () => render(true));
  });

  els.paginationSize.addEventListener("change", () => {
    state.page = 1;
    applyPagination(false);
    scrollToListTop();
  });

  els.paginationPrev.addEventListener("click", () => {
    state.page -= 1;
    applyPagination(false);
    scrollToListTop();
  });

  els.paginationNext.addEventListener("click", () => {
    state.page += 1;
    applyPagination(false);
    scrollToListTop();
  });

  init();
})();
