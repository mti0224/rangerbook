(() => {
  const DATA_URL = "../res/%E8%A3%9D%E5%82%99%E8%B3%87%E6%96%99%E5%BA%AB.json";
  const LEVELS = [0, 1, 2, 3, 4, 5];
  const selectedLevels = new Map();
  let gearMapPromise = null;
  let renderTimer = 0;
  let rendering = false;

  const text = (value) => value == null ? "" : String(value).replaceAll("\\n", "\n").trim();
  const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const escapeHtml = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function getGearId(gear) {
    return text(gear?.id || gear?.gear_id || gear?.code || "");
  }

  function currentGearId() {
    const src = document.querySelector("#gearModalContent .gear-detail-image")?.getAttribute("src") || "";
    const match = src.match(/gear_icon\/([^/]+)_icon\.png/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function loadGearMap() {
    if (!gearMapPromise) {
      gearMapPromise = fetch(DATA_URL)
        .then((response) => response.ok ? response.json() : [])
        .then((rows) => {
          const map = new Map();
          if (Array.isArray(rows)) {
            rows.forEach((gear) => {
              const id = getGearId(gear);
              if (id) map.set(id, gear);
            });
          }
          return map;
        })
        .catch(() => new Map());
    }
    return gearMapPromise;
  }

  function numericTokens(value) {
    return text(value).match(/[+-]?\d+(?:\.\d+)?/g) || [];
  }

  function decimals(token) {
    return token.includes(".") ? token.split(".")[1].length : 0;
  }

  function formatNumber(value, token) {
    const rounded = Math.abs(value) < 1e-10 ? 0 : value;
    const output = rounded.toFixed(decimals(token));
    return token.startsWith("+") && rounded >= 0 ? `+${output}` : output;
  }

  function transformValue(baseValue, level, mode, incrementValue = "") {
    const source = text(baseValue);
    if (!source || source === "-") return source || "-";
    const increments = numericTokens(incrementValue).map(Number);
    let index = 0;
    return source.replace(/[+-]?\d+(?:\.\d+)?/g, (token) => {
      const base = Number(token);
      let result = base;
      if (mode === "multiply") result = base * (level + 1);
      else if (level > 0 && increments.length) {
        const increment = increments.length === 1 ? increments[0] : increments[Math.min(index, increments.length - 1)];
        result = base + level * increment;
      }
      index += 1;
      return formatNumber(result, token);
    });
  }

  function levelKey(id, section) {
    return `${id}:${section}`;
  }

  function getLevel(id, section) {
    return selectedLevels.get(levelKey(id, section)) ?? 0;
  }

  function levelSelect(id, section, level) {
    return `<label class="gear-level-control"><span class="sr-only">${escapeHtml(section)}強化等級</span><select class="gear-level-select" data-gear-id="${escapeHtml(id)}" data-gear-level-section="${escapeHtml(section)}" aria-label="${escapeHtml(section)}強化等級">${LEVELS.map((value) => `<option value="${value}"${value === level ? " selected" : ""}>${value === 5 ? "+Max" : `+${value}`}</option>`).join("")}</select></label>`;
  }

  function heading(id, section, level) {
    return `<h3 class="gear-section-heading"><span>${escapeHtml(section)}</span>${levelSelect(id, section, level)}</h3>`;
  }

  function effectTable(rows) {
    if (!rows.length) return `<div class="empty-state small">沒有資料。</div>`;
    return `<div class="table-scroll gear-effect-table-wrap"><table class="gear-effect-table"><thead><tr><th>效果</th><th>數值</th></tr></thead><tbody>${rows.map((row) => `<tr><th>${escapeHtml(row.effect)}</th><td>${escapeHtml(row.value)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function sectionTitle(section) {
    return section.querySelector(":scope > h3 > span")?.textContent.trim() || section.querySelector(":scope > h3")?.childNodes?.[0]?.textContent?.trim() || "";
  }

  function findSection(content, title) {
    return [...content.querySelectorAll(":scope > .detail-section")].find((section) => sectionTitle(section) === title);
  }

  function ensureSpecSection(content, gear) {
    let section = findSection(content, "Spec+");
    if (section || !isObject(gear["Spec+"])) return section;
    section = document.createElement("section");
    section.className = "detail-section";
    section.innerHTML = "<h3>Spec+</h3>";
    const skillSection = findSection(content, "Skill+");
    if (skillSection) skillSection.insertAdjacentElement("afterend", section);
    else content.appendChild(section);
    return section;
  }

  function renderBasic(content, gear, id) {
    const section = findSection(content, "基本效果");
    if (!section) return;
    const level = getLevel(id, "基本效果");
    const effects = isObject(gear["基本效果"]) ? gear["基本效果"] : {};
    const rows = Object.entries(effects).map(([effect, value]) => ({ effect, value: transformValue(value, level, "multiply") }));
    section.innerHTML = `${heading(id, "基本效果", level)}${effectTable(rows)}`;
  }

  function advancedRows(advanced, level) {
    const switchable = isObject(advanced?.["可切換的效果"]) ? advanced["可切換的效果"] : {};
    return Object.entries(switchable).map(([effect, data]) => ({ effect, value: isObject(data) ? transformValue(data["係數"] ?? data["數值"] ?? "-", level, "increment", data["每次升級增加"] ?? "") : text(data) || "-" }));
  }

  function renderAdvanced(content, gear, id) {
    const section = findSection(content, "高級效果");
    if (!section) return;
    const level = getLevel(id, "高級效果");
    const advanced = isObject(gear["高級效果"]) ? gear["高級效果"] : {};
    const condition = text(advanced["觸發條件"] ?? advanced["條件"] ?? "");
    section.innerHTML = `${heading(id, "高級效果", level)}<div class="ranger-talent-list gear-advanced-detail"><article class="ranger-talent-card gear-advanced-card">${condition ? `<p class="gear-condition">觸發條件：${escapeHtml(condition)}</p><div class="gear-advanced-divider" aria-hidden="true"></div>` : ""}${effectTable(advancedRows(advanced, level))}</article></div>`;
  }

  function specBasicRows(spec, level) {
    const basic = isObject(spec?.["基本效果"]) ? spec["基本效果"] : {};
    const globalIncrement = basic["每次升級增加"] ?? "";
    return Object.entries(basic).filter(([key]) => key !== "每次升級增加" && !key.startsWith("每次升級")).map(([effect, data]) => ({ effect, value: isObject(data) ? transformValue(data["係數"] ?? data["數值"] ?? "-", level, "increment", data["每次升級增加"] ?? globalIncrement) : transformValue(data, level, "increment", globalIncrement) }));
  }

  function triggerRows(special, level, fallbackProbability) {
    return Object.entries(special).filter(([key]) => /^觸發效果\d*$/.test(key)).flatMap(([, value]) => Array.isArray(value) ? value : [value]).filter(isObject).map((trigger) => ({ probability: transformValue(trigger["觸發機率"] ?? fallbackProbability, level, "increment", trigger["每次升級觸發機率增加"] ?? ""), effect: text(trigger["效果"] ?? trigger["技能效果"] ?? "-") || "-", factor: transformValue(trigger["係數"] ?? "-", level, "increment", trigger["每次升級係數增加"] ?? trigger["每次升級增加"] ?? ""), time: transformValue(trigger["時間"] ?? "-", level, "increment", trigger["每次升級時間增加"] ?? "") }));
  }

  function renderSpec(content, gear, id) {
    const section = ensureSpecSection(content, gear);
    if (!section) return;
    const level = getLevel(id, "Spec+");
    const spec = gear["Spec+"];
    const special = isObject(spec["特殊效果"]) ? spec["特殊效果"] : {};
    const name = text(spec["名稱"] ?? "Spec+");
    const description = text(special["敘述"] ?? special["描述"] ?? "");
    const probability = transformValue(special["觸發機率"] ?? "-", level, "increment", special["每次升級觸發機率增加"] ?? "");
    const conditions = Object.entries(special).filter(([key, value]) => /^(?:觸發)?條件\d*$/.test(key) && text(value)).map(([, value]) => text(value));
    const conditionValues = conditions.length ? conditions : ["無特定條件"];
    const triggers = triggerRows(special, level, probability);
    const basicRows = specBasicRows(spec, level);

    section.innerHTML = `${heading(id, "Spec+", level)}<div class="ranger-talent-list gear-specplus-detail"><article class="ranger-talent-card gear-specplus-card"><h4 class="talent-title-with-icon"><span>${escapeHtml(name)}</span></h4><div class="talent-section gear-specplus-section"><h5>基本效果</h5><div class="table-scroll talent-main-effect-wrap"><table class="talent-main-effect-table gear-specplus-basic-table"><thead><tr><th>效果</th><th>數值</th></tr></thead><tbody>${basicRows.map((row) => `<tr><td>${escapeHtml(row.effect)}</td><td>${escapeHtml(row.value)}</td></tr>`).join("")}</tbody></table></div></div><div class="talent-section gear-specplus-section gear-specplus-special-section"><h5>特殊效果</h5>${description ? `<p class="ranger-talent-description gear-specplus-special-description">${escapeHtml(description)}</p>` : ""}<div class="table-scroll talent-main-table-wrap"><table class="talent-main-table gear-specplus-condition-table"><thead><tr><th>觸發機率</th><th>觸發條件</th></tr></thead><tbody>${conditionValues.map((condition, index) => `<tr>${index === 0 ? `<td rowspan="${conditionValues.length}" class="talent-prob-cell">${escapeHtml(probability)}</td>` : ""}<td>${escapeHtml(condition)}</td></tr>`).join("")}</tbody></table></div><div class="gear-specplus-table-divider" aria-hidden="true"></div><div class="table-scroll talent-main-effect-wrap"><table class="talent-main-effect-table gear-specplus-effect-table"><thead><tr><th>觸發機率</th><th>觸發效果</th><th>係數</th><th>時間</th></tr></thead><tbody>${triggers.map((row) => `<tr><td>${escapeHtml(row.probability)}</td><td>${escapeHtml(row.effect)}</td><td>${escapeHtml(row.factor)}</td><td>${escapeHtml(row.time)}</td></tr>`).join("")}</tbody></table></div></div></article></div>`;
  }

  async function renderAll() {
    if (rendering) return;
    const content = document.getElementById("gearModalContent");
    const id = currentGearId();
    if (!content || !id || !content.children.length) return;
    rendering = true;
    try {
      const gear = (await loadGearMap()).get(id);
      if (!gear) return;
      renderBasic(content, gear, id);
      renderAdvanced(content, gear, id);
      renderSpec(content, gear, id);
    } finally {
      rendering = false;
    }
  }

  document.addEventListener("change", async (event) => {
    const select = event.target.closest?.(".gear-level-select");
    if (!select) return;
    const id = select.dataset.gearId || currentGearId();
    const section = select.dataset.gearLevelSection || "";
    selectedLevels.set(levelKey(id, section), Number(select.value) || 0);
    const content = document.getElementById("gearModalContent");
    const gear = (await loadGearMap()).get(id);
    if (!content || !gear) return;
    if (section === "基本效果") renderBasic(content, gear, id);
    else if (section === "高級效果") renderAdvanced(content, gear, id);
    else if (section === "Spec+") renderSpec(content, gear, id);
  });

  const content = document.getElementById("gearModalContent");
  if (content) {
    new MutationObserver((mutations) => {
      if (rendering) return;
      if (!mutations.some((mutation) => mutation.target === content)) return;
      clearTimeout(renderTimer);
      renderTimer = window.setTimeout(renderAll, 40);
    }).observe(content, { childList: true });
  }

  renderAll();
})();
