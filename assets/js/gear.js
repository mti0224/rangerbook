(() => {
  const ROOT = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const DATA_URL = `${ROOT}res/%E8%A3%9D%E5%82%99%E8%B3%87%E6%96%99%E5%BA%AB.json`;
  const GEAR_ICON = (id) => `https://rangers.lerico.net/res/gear_icon/${encodeURIComponent(id)}_icon.png`;
  const ATTR_OPTIONS = ["火", "水", "木", "光", "暗"];
  const TYPECLASS_OPTIONS = ["智慧型", "敏捷型", "力量型"];
  const ADMIN_MODE_KEY = "rangerbook-admin-mode";
  const MISSING_GEAR_ICON_KEY = "rangerbook-missing-gear-icons";

  const state = {
    rows: [],
    filtered: [],
    selectedId: "",
    page: 1,
    pageSize: 60,
    basicMode: "OR",
    basicDisplayLevel: 0,
    openSequence: 0
  };

  const $ = (id) => document.getElementById(id);
  const searchInput = $("gearSearchInput");
  const advancedToggleBtn = $("gearAdvancedToggleBtn");
  const advancedFilters = $("gearAdvancedFilters");
  const starFilter = $("gearStarFilter");
  const typeFilter = $("gearTypeFilter");
  const basicEffectFilter = $("gearBasicEffectFilter");
  const triggerAttrFilter = $("gearTriggerAttrFilter");
  const triggerTypeFilter = $("gearTriggerTypeFilter");
  const basicModeOr = $("gearBasicModeOr");
  const basicModeAnd = $("gearBasicModeAnd");
  const basicDisplayLevel = $("gearBasicDisplayLevel");
  const resetBtn = $("gearResetBtn");
  const resultCount = $("gearResultCount");
  const gearList = $("gearList");
  const modal = $("gearModal");
  const modalPanel = modal?.querySelector(".modal-panel");
  const modalContent = $("gearModalContent");
  const modalCloseBtn = $("gearModalCloseBtn");

  let skillPlusFilter = null;

  function isAdminMode() {
    return localStorage.getItem(ADMIN_MODE_KEY) === "true";
  }

  function getMissingIconSet() {
    try {
      const raw = JSON.parse(localStorage.getItem(MISSING_GEAR_ICON_KEY) || "[]");
      return new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch {
      return new Set();
    }
  }

  function rememberMissingIcon(id, force = false) {
    if (!id || (isAdminMode() && !force)) return;
    const set = getMissingIconSet();
    if (set.has(id)) return;
    set.add(id);
    localStorage.setItem(MISSING_GEAR_ICON_KEY, JSON.stringify([...set]));
  }

  function text(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") {
      try { return JSON.stringify(value); } catch { return String(value); }
    }
    return String(value).replaceAll("\\n", "\n").trim();
  }

  function scalarText(value) {
    return value == null || typeof value === "object"
      ? ""
      : String(value).replaceAll("\\n", "\n").trim();
  }

  function escapeHtml(value) {
    return text(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function getId(gear) {
    return scalarText(gear?.id || gear?.gear_id || gear?.code || "");
  }

  function getName(gear) {
    return scalarText(gear?.["裝備名稱"] || gear?.name || getId(gear));
  }

  function getType(gear) {
    return scalarText(gear?.["裝備種類"] ?? gear?.["種類"] ?? gear?.["類型"] ?? gear?.type ?? gear?.gearType);
  }

  function hasKorean(value) {
    return /[\u3130-\u318F\uAC00-\uD7AF]/.test(text(value));
  }

  function hasTstText(value) {
    return text(value).toUpperCase().includes("TST");
  }

  function gearRawText(gear) {
    return [
      getId(gear),
      getName(gear),
      gear?.["裝備星級"],
      getType(gear),
      gear?.["基本效果"],
      gear?.["高級效果"],
      gear?.["Skill+"]
    ].map(text).join(" ");
  }

  function isPubliclyVisible(gear) {
    const id = getId(gear);
    const rawText = gearRawText(gear);
    return Boolean(id) && !hasKorean(rawText) && !hasTstText(rawText) && !getMissingIconSet().has(id);
  }

  function shouldHideGearForPublic(gear) {
    return !isAdminMode() && !isPubliclyVisible(gear);
  }

  function numberFrom(value) {
    const matched = text(value).match(/\d+/g);
    return matched ? Number(matched.join("")) : 0;
  }

  function getStarNumber(gear) {
    return numberFrom(gear?.["裝備星級"]);
  }

  function getGearNumber(gear) {
    return numberFrom(gear?.["編號"] || gear?.number || gear?.no || getId(gear));
  }

  function sortGearRows(a, b) {
    const starDiff = getStarNumber(b.gear) - getStarNumber(a.gear);
    if (starDiff) return starDiff;
    const numberDiff = getGearNumber(b.gear) - getGearNumber(a.gear);
    if (numberDiff) return numberDiff;
    return getId(a.gear).localeCompare(getId(b.gear), "zh-Hant", { numeric: true }) || a.index - b.index;
  }

  function formatSigned1(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    const output = number.toFixed(1);
    return number > 0 ? `+${output}` : output;
  }

  function scaleNumbersInText(value, factor) {
    if (value === null || value === undefined) return "";
    if (typeof value === "number") return formatSigned1(value * factor);
    return scalarText(value).replace(/[+\-]?\d+(?:\.\d+)?/g, (token) => {
      const number = Number(token);
      return Number.isFinite(number) ? formatSigned1(number * factor) : token;
    });
  }

  function formatBasicEffectValue(value) {
    return scaleNumbersInText(value, state.basicDisplayLevel + 1);
  }

  function effectText(obj, limit = 3) {
    if (!isObject(obj)) return [];
    return Object.entries(obj)
      .slice(0, limit)
      .map(([key, value]) => `${key} ${formatBasicEffectValue(value)}`);
  }

  function getBasicKeys(gear) {
    return isObject(gear?.["基本效果"])
      ? new Set(Object.keys(gear["基本效果"]).filter(Boolean))
      : new Set();
  }

  function hasMeaningfulValue(value, key = "") {
    if (key.startsWith("每次升級")) return false;
    if (Array.isArray(value)) return value.some((item) => hasMeaningfulValue(item));
    if (isObject(value)) return Object.entries(value).some(([childKey, childValue]) => hasMeaningfulValue(childValue, childKey));
    const valueText = scalarText(value);
    return Boolean(valueText) && !["-", "無", "(無)", "null", "undefined"].includes(valueText);
  }

  function getSpecBasicKeys(gear) {
    const spec = isObject(gear?.["Spec+"]) ? gear["Spec+"] : null;
    if (!spec || !hasMeaningfulValue(spec)) return new Set();
    const basic = isObject(spec["基本效果"]) ? spec["基本效果"] : {};
    return new Set(Object.keys(basic).filter((key) => key && !key.startsWith("每次升級")));
  }

  function getFilterBasicKeys(gear) {
    return new Set([...getBasicKeys(gear), ...getSpecBasicKeys(gear)]);
  }

  function getSkillPlusKeys(gear) {
    const source = gear?.["Skill+"] ?? gear?.["Skill＋"] ?? gear?.skillPlus;
    const result = new Set();

    const collect = (value) => {
      if (Array.isArray(value)) {
        value.forEach(collect);
        return;
      }
      if (!isObject(value)) {
        const item = scalarText(value);
        if (item) result.add(item);
        return;
      }
      const effect = scalarText(value["技能效果"] ?? value["效果"] ?? value.skillEffect ?? value.effect);
      if (effect) {
        result.add(effect);
        return;
      }
      Object.values(value).forEach(collect);
    };

    collect(source);
    return result;
  }

  function getTriggerText(gear) {
    const advanced = gear?.["高級效果"];
    return isObject(advanced) ? scalarText(advanced["觸發條件"] ?? advanced["條件"] ?? "") : "";
  }

  function pickTriggerTags(triggerText) {
    const attrs = new Set();
    const types = new Set();
    const source = scalarText(triggerText);
    ATTR_OPTIONS.forEach((attr) => {
      if (source.includes(`${attr}屬性`) || source.includes(attr)) attrs.add(attr);
    });
    TYPECLASS_OPTIONS.forEach((type) => {
      if (source.includes(type)) types.add(type);
    });
    return { attrs, types };
  }

  function triggerLabels(gear) {
    const tags = pickTriggerTags(getTriggerText(gear));
    return [...tags.attrs].map((attr) => `${attr}屬性`).concat([...tags.types]);
  }

  function searchBlob(gear) {
    return gearRawText(gear).toLowerCase();
  }

  function uniqueSorted(values) {
    return [...new Set(values.map(scalarText).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "zh-Hant", { numeric: true }));
  }

  function getSelectedValues(container) {
    if (!container) return new Set();
    return new Set([...container.querySelectorAll("input[type='checkbox']:checked")].map((input) => input.value));
  }

  function matchEffectKeys(gearKeys, selectedSet, mode) {
    if (!selectedSet.size) return true;
    const matched = [...selectedSet].filter((key) => gearKeys.has(key)).length;
    return mode === "AND" ? matched === selectedSet.size : matched > 0;
  }

  function renderCheckbox(container, values, formatter = (value) => value) {
    if (!container) return;
    container.innerHTML = uniqueSorted(values).map((value) => `
      <label class="gear-checkbox" title="${escapeHtml(formatter(value))}">
        <input type="checkbox" value="${escapeHtml(value)}">
        <span>${escapeHtml(formatter(value))}</span>
      </label>
    `).join("");
  }

  function ensureSkillPlusPanel() {
    skillPlusFilter = $("gearSkillPlusFilter");
    if (skillPlusFilter) return skillPlusFilter;
    if (!advancedFilters) return null;

    const panel = document.createElement("section");
    panel.className = "gear-filter-panel gear-skillplus-filter-panel";
    panel.innerHTML = `
      <div class="gear-filter-head"><h2>Skill+</h2></div>
      <div id="gearSkillPlusFilter" class="gear-checkbox-grid gear-skillplus-grid"></div>
    `;
    const triggerPanel = advancedFilters.querySelector(".gear-trigger-filter-panel");
    if (triggerPanel) triggerPanel.before(panel);
    else advancedFilters.appendChild(panel);
    skillPlusFilter = panel.querySelector("#gearSkillPlusFilter");
    skillPlusFilter.addEventListener("change", applyFilters);
    return skillPlusFilter;
  }

  function buildFilters() {
    const sourceRows = isAdminMode()
      ? state.rows
      : state.rows.filter(({ gear }) => isPubliclyVisible(gear));

    renderCheckbox(starFilter, sourceRows.map(({ gear }) => gear?.["裝備星級"]), (value) => `${value}星`);
    renderCheckbox(typeFilter, sourceRows.map(({ gear }) => getType(gear)));
    renderCheckbox(basicEffectFilter, sourceRows.flatMap(({ gear }) => [...getFilterBasicKeys(gear)]));
    renderCheckbox(triggerAttrFilter, ATTR_OPTIONS);
    renderCheckbox(triggerTypeFilter, TYPECLASS_OPTIONS);
    renderCheckbox(ensureSkillPlusPanel(), sourceRows.flatMap(({ gear }) => [...getSkillPlusKeys(gear)]));
  }

  function setBasicMode(mode) {
    state.basicMode = mode;
    basicModeOr?.classList.toggle("active", mode === "OR");
    basicModeAnd?.classList.toggle("active", mode === "AND");
    applyFilters();
  }

  function toggleAdvancedFilters() {
    if (!advancedToggleBtn || !advancedFilters) return;
    const isOpen = advancedFilters.hidden;
    advancedFilters.hidden = !isOpen;
    advancedToggleBtn.setAttribute("aria-expanded", String(isOpen));
    advancedToggleBtn.textContent = isOpen ? "收合進階篩選 ▲" : "進階篩選 ▼";
  }

  function ensurePaginationBar() {
    if ($("gearPaginationBar")) return;
    const summaryBar = document.querySelector(".summary-bar");
    const bar = document.createElement("section");
    bar.id = "gearPaginationBar";
    bar.className = "pagination-bar";
    bar.innerHTML = `
      <div class="pagination-info" id="paginationInfo"></div>
      <div class="pagination-actions">
        <label class="pagination-size">
          <span>每頁顯示</span>
          <select id="paginationSize">
            <option value="30">30</option>
            <option value="60" selected>60</option>
            <option value="120">120</option>
          </select>
        </label>
        <button id="paginationPrev" type="button">上一頁</button>
        <div id="paginationPages" class="pagination-pages"></div>
        <button id="paginationNext" type="button">下一頁</button>
      </div>
    `;
    summaryBar?.insertAdjacentElement("afterend", bar);
    $("paginationSize")?.addEventListener("change", (event) => {
      state.pageSize = Number(event.target.value) || 60;
      state.page = 1;
      renderList();
    });
    $("paginationPrev")?.addEventListener("click", () => {
      state.page -= 1;
      renderList();
    });
    $("paginationNext")?.addEventListener("click", () => {
      state.page += 1;
      renderList();
    });
  }

  function renderPagination(total) {
    ensurePaginationBar();
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const start = (state.page - 1) * state.pageSize;
    const end = Math.min(start + state.pageSize, total);
    $("paginationInfo").textContent = total
      ? `第 ${state.page} / ${totalPages} 頁，顯示第 ${start + 1}–${end} 筆，共 ${total} 筆`
      : "";
    $("paginationPrev").disabled = state.page <= 1;
    $("paginationNext").disabled = state.page >= totalPages;

    const pages = [...new Set([1, totalPages, state.page - 1, state.page, state.page + 1])]
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((a, b) => a - b);
    let last = 0;
    $("paginationPages").innerHTML = totalPages <= 1 ? "" : pages.map((page) => {
      const gap = page - last > 1 ? '<span class="pagination-ellipsis">…</span>' : "";
      last = page;
      return `${gap}<button class="pagination-page ${page === state.page ? "active" : ""}" type="button" data-page="${page}">${page}</button>`;
    }).join("");
    $("paginationPages").querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        state.page = Number(button.dataset.page) || 1;
        renderList();
      });
    });
  }

  function applyFilters() {
    const query = searchInput?.value.trim().toLowerCase() || "";
    const stars = getSelectedValues(starFilter);
    const types = getSelectedValues(typeFilter);
    const basicEffects = getSelectedValues(basicEffectFilter);
    const skillPlusEffects = getSelectedValues(skillPlusFilter);
    const triggerAttrs = getSelectedValues(triggerAttrFilter);
    const triggerTypes = getSelectedValues(triggerTypeFilter);
    const triggerSelected = new Set([...triggerAttrs, ...triggerTypes]);

    state.filtered = state.rows.filter((row) => {
      const gear = row.gear;
      if (shouldHideGearForPublic(gear)) return false;
      if (query && !row.search.includes(query)) return false;
      if (stars.size && !stars.has(scalarText(gear?.["裝備星級"]))) return false;
      if (types.size && !types.has(getType(gear))) return false;
      if (!matchEffectKeys(getFilterBasicKeys(gear), basicEffects, state.basicMode)) return false;
      if (!matchEffectKeys(getSkillPlusKeys(gear), skillPlusEffects, "OR")) return false;

      const trigger = pickTriggerTags(getTriggerText(gear));
      const triggerTags = new Set([...trigger.attrs, ...trigger.types]);
      if (!matchEffectKeys(triggerTags, triggerSelected, "OR")) return false;
      return true;
    });

    state.page = 1;
    renderList();
  }

  function handleGearIconError(image, id) {
    const wrap = image.closest(".gear-thumb-wrap");
    wrap?.classList.add("missing-icon");
    image.remove();
    rememberMissingIcon(id);
    if (!isAdminMode()) {
      wrap?.closest(".gear-card")?.remove();
      window.setTimeout(applyFilters, 0);
    }
  }

  function renderList() {
    const total = state.filtered.length;
    if (resultCount) resultCount.textContent = total.toLocaleString("zh-Hant");
    renderPagination(total);
    if (!gearList) return;
    if (!total) {
      gearList.innerHTML = '<div class="empty-state">找不到符合條件的裝備。</div>';
      return;
    }

    const rows = state.filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
    gearList.innerHTML = rows.map(({ gear }) => {
      const id = getId(gear);
      const tags = [
        gear?.["裝備星級"] ? `${gear["裝備星級"]}星` : "",
        getType(gear),
        ...triggerLabels(gear)
      ].filter(Boolean);
      const mini = effectText(gear?.["基本效果"], 3);
      return `
        <button class="ranger-card gear-card ${state.selectedId === id ? "active" : ""}" type="button" data-gear-id="${escapeHtml(id)}">
          <div class="ranger-thumb-wrap gear-thumb-wrap">
            <img class="ranger-thumb gear-thumb" src="${GEAR_ICON(id)}" alt="" loading="lazy" data-gear-id="${escapeHtml(id)}">
          </div>
          <div class="ranger-card-main">
            <div class="ranger-title-row"><h2>${escapeHtml(getName(gear))}</h2></div>
            <div class="ranger-tags">${tags.map((tag, index) => `<span${index >= 2 ? ' class="gear-trigger-condition-tag"' : ""}>${escapeHtml(tag)}</span>`).join("")}</div>
            <div class="ranger-mini-stats gear-mini-stats">${mini.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
          </div>
        </button>
      `;
    }).join("");

    gearList.querySelectorAll(".gear-thumb").forEach((image) => {
      image.addEventListener("error", () => handleGearIconError(image, image.dataset.gearId || ""), { once: true });
    });
    gearList.querySelectorAll(".gear-card").forEach((card) => {
      card.addEventListener("click", () => openGear(card.dataset.gearId || ""));
    });
  }

  function fallbackDetail(gear, id, message = "") {
    const tags = [gear?.["裝備星級"] ? `${gear["裝備星級"]}星` : "", getType(gear)].filter(Boolean);
    return `<div class="ranger-detail-head gear-detail-head"><div class="ranger-detail-image-wrap gear-detail-image-wrap"><img class="ranger-detail-image gear-detail-image" src="${GEAR_ICON(id)}" alt="${escapeHtml(getName(gear))}"></div><div><h2 id="gearModalTitle">${escapeHtml(getName(gear))}</h2><div class="ranger-tags detail-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div></div></div><div class="empty-state">${escapeHtml(message || "裝備詳細資料載入失敗，請重新整理後再試。")}</div>`;
  }

  async function openGear(id) {
    state.selectedId = id;
    const row = state.rows.find(({ gear }) => getId(gear) === id);
    if (!row || !modalContent || !modal) return;
    const sequence = ++state.openSequence;
    const gear = row.gear;
    renderList();
    modalContent.setAttribute("aria-busy", "true");

    try {
      const renderer = window.RangerbookGearDetail;
      if (!renderer?.render) throw new Error("Gear detail renderer is unavailable");
      const rendered = await renderer.render({
        root: modalContent,
        gear,
        id,
        allGear: state.rows.map((item) => item.gear),
        isPublicGear: isPubliclyVisible,
        rememberMissingIcon: (missingId) => rememberMissingIcon(missingId, true),
        shouldCommit: () => sequence === state.openSequence && state.selectedId === id
      });
      if (rendered === false) return;
    } catch (error) {
      console.error(error);
      modalContent.innerHTML = fallbackDetail(gear, id);
    } finally {
      modalContent.removeAttribute("aria-busy");
    }

    if (sequence !== state.openSequence || state.selectedId !== id) return;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    modal.scrollTop = 0;
    if (modalPanel) modalPanel.scrollTop = 0;
    modalContent.scrollTop = 0;
    document.dispatchEvent(new CustomEvent("rangerbook:gear-rendered", {
      detail: { id, gear, modalContent }
    }));
  }

  function closeModal() {
    state.openSequence += 1;
    if (modal) modal.hidden = true;
    if (modalContent) {
      modalContent.innerHTML = "";
      delete modalContent.dataset.renderedGearId;
    }
    document.body.classList.remove("modal-open");
  }

  function clearAll() {
    if (searchInput) searchInput.value = "";
    [starFilter, typeFilter, basicEffectFilter, skillPlusFilter, triggerAttrFilter, triggerTypeFilter].forEach((container) => {
      container?.querySelectorAll("input[type='checkbox']").forEach((input) => { input.checked = false; });
    });
    state.basicMode = "OR";
    basicModeOr?.classList.add("active");
    basicModeAnd?.classList.remove("active");
    state.basicDisplayLevel = 0;
    const zero = basicDisplayLevel?.querySelector("input[value='0']");
    if (zero) zero.checked = true;
    applyFilters();
  }

  async function init() {
    if (!gearList) return;
    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.json();
      state.rows = (Array.isArray(raw) ? raw : [])
        .map((gear, index) => ({ gear, index, search: searchBlob(gear) }))
        .sort(sortGearRows);
      buildFilters();
      applyFilters();
      window.RangerbookGearDetail?.preload?.();
    } catch (error) {
      gearList.innerHTML = '<div class="empty-state">資料載入失敗，請確認裝備資料庫.json是否已放在 /res 資料夾。</div>';
      console.error(error);
    }
  }

  searchInput?.addEventListener("input", applyFilters);
  advancedToggleBtn?.addEventListener("click", toggleAdvancedFilters);
  [starFilter, typeFilter, basicEffectFilter, triggerAttrFilter, triggerTypeFilter].forEach((container) => {
    container?.addEventListener("change", applyFilters);
  });
  basicModeOr?.addEventListener("click", () => setBasicMode("OR"));
  basicModeAnd?.addEventListener("click", () => setBasicMode("AND"));
  basicDisplayLevel?.addEventListener("change", (event) => {
    const input = event.target.closest?.("input[name='gearBasicDisplayLevel']");
    if (!input) return;
    state.basicDisplayLevel = Number(input.value) || 0;
    renderList();
  });
  resetBtn?.addEventListener("click", clearAll);
  modalCloseBtn?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && modal && !modal.hidden) closeModal(); });

  init();
})();
