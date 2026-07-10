(() => {
  const ROOT = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const RANGER_DATA_URL = `${ROOT}res/Rangers_data.json`;
  const GEAR_ICON = (id) => `https://rangers.lerico.net/res/gear_icon/${encodeURIComponent(id)}_icon.png`;
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum-140.png`;
  const LEVELS = [0, 1, 2, 3, 4, 5];

  const selectedLevels = new Map();
  let rangerPromise = null;
  let currentContext = null;
  let currentRangers = [];

  const text = (value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") {
      try { return JSON.stringify(value); } catch { return String(value); }
    }
    return String(value).replaceAll("\\n", "\n").trim();
  };

  const scalarText = (value) => value == null || typeof value === "object"
    ? ""
    : String(value).replaceAll("\\n", "\n").trim();

  const escapeHtml = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

  function getId(item) {
    return scalarText(item?.id || item?.gear_id || item?.code || item?.ranger_id || item?.unitCode);
  }

  function getGearName(gear) {
    return scalarText(gear?.["裝備名稱"] || gear?.name || getId(gear));
  }

  function getGearTypeValue(gear) {
    return gear?.["裝備種類"]
      ?? gear?.["種類"]
      ?? gear?.["類型"]
      ?? gear?.type
      ?? gear?.gearType;
  }

  function getGearTypeLabel(gear) {
    return scalarText(getGearTypeValue(gear));
  }

  function getGearStar(gear) {
    return scalarText(gear?.["裝備星級"] || gear?.["星數"] || gear?.star);
  }

  function normalize(value) {
    return scalarText(value)
      .replace(/\s+/g, "")
      .replace(/[()（）]/g, "")
      .toLowerCase();
  }

  function numericTokens(value) {
    return scalarText(value).match(/[+-]?\d+(?:\.\d+)?/g) || [];
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
    const source = scalarText(baseValue);
    if (!source || source === "-") return source || "-";
    const increments = numericTokens(incrementValue).map(Number);
    let index = 0;
    return source.replace(/[+-]?\d+(?:\.\d+)?/g, (token) => {
      const base = Number(token);
      let result = base;
      if (mode === "multiply") result = base * (level + 1);
      else if (level > 0 && increments.length) {
        const increment = increments.length === 1
          ? increments[0]
          : increments[Math.min(index, increments.length - 1)];
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
    const options = LEVELS.map((value) => (
      `<option value="${value}"${value === level ? " selected" : ""}>${value === 5 ? "+Max" : `+${value}`}</option>`
    )).join("");
    return `<label class="gear-level-control"><span class="sr-only">${escapeHtml(section)}強化等級</span><select class="gear-level-select" data-gear-id="${escapeHtml(id)}" data-gear-level-section="${escapeHtml(section)}" aria-label="${escapeHtml(section)}強化等級">${options}</select></label>`;
  }

  function heading(id, section, level, hasData = true) {
    return `<h3 class="gear-section-heading"><span>${escapeHtml(section)}</span>${hasData ? levelSelect(id, section, level) : ""}</h3>`;
  }

  function effectTable(rows, className = "") {
    if (!rows.length) return `<div class="empty-state small">沒有資料。</div>`;
    return `<div class="table-scroll gear-effect-table-wrap"><table class="gear-effect-table ${className}"><thead><tr><th>效果</th><th>數值</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.effect)}</td><td>${escapeHtml(row.value)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function hasMeaningfulValue(value, key = "") {
    if (key.startsWith("每次升級")) return false;
    if (Array.isArray(value)) return value.some((item) => hasMeaningfulValue(item));
    if (isObject(value)) return Object.entries(value).some(([childKey, childValue]) => hasMeaningfulValue(childValue, childKey));
    const valueText = scalarText(value);
    return Boolean(valueText) && !["-", "無", "(無)", "null", "undefined"].includes(valueText);
  }

  function basicRows(gear, level) {
    const effects = isObject(gear?.["基本效果"]) ? gear["基本效果"] : {};
    return Object.entries(effects).map(([effect, value]) => ({
      effect,
      value: transformValue(value, level, "multiply")
    }));
  }

  function renderBasicSection(gear, id) {
    const level = getLevel(id, "基本效果");
    const rows = basicRows(gear, level);
    return `<section class="detail-section" data-gear-section="基本效果">${heading(id, "基本效果", level, rows.length > 0)}${rows.length ? effectTable(rows) : '<div class="empty-state small">沒有基本效果資料。</div>'}</section>`;
  }

  function advancedDefaultRows(advanced, level) {
    const effect = scalarText(advanced?.["預設效果"] ?? "");
    if (!effect) return [];
    const switchable = isObject(advanced?.["可切換的效果"]) ? advanced["可切換的效果"] : {};
    const matching = isObject(switchable[effect]) ? switchable[effect] : {};
    const baseValue = advanced["預設效果係數"] ?? matching["係數"] ?? matching["數值"] ?? "-";
    const increment = matching["每次升級增加"] ?? advanced["每次升級增加"] ?? "";
    return [{ effect, value: transformValue(baseValue, level, "increment", increment) }];
  }

  function advancedRows(advanced, level) {
    const switchable = isObject(advanced?.["可切換的效果"]) ? advanced["可切換的效果"] : {};
    return Object.entries(switchable).map(([effect, data]) => ({
      effect,
      value: isObject(data)
        ? transformValue(data["係數"] ?? data["數值"] ?? "-", level, "increment", data["每次升級增加"] ?? "")
        : scalarText(data) || "-"
    }));
  }

  function renderAdvancedSection(gear, id) {
    const advanced = isObject(gear?.["高級效果"]) ? gear["高級效果"] : {};
    const level = getLevel(id, "高級效果");
    const condition = scalarText(advanced["觸發條件"] ?? advanced["條件"] ?? "");
    const defaultRows = advancedDefaultRows(advanced, level);
    const switchableRows = advancedRows(advanced, level);
    const hasData = defaultRows.length > 0 || switchableRows.length > 0;

    if (!hasData) {
      return `<section class="detail-section" data-gear-section="高級效果">${heading(id, "高級效果", level, false)}<div class="empty-state small gear-advanced-empty-state">沒有高級效果資料。</div></section>`;
    }

    const conditionHtml = condition
      ? `<p class="gear-condition"><span class="gear-condition-label">觸發條件：</span><span>${escapeHtml(condition)}</span></p><div class="gear-advanced-divider" aria-hidden="true"></div>`
      : "";
    const defaultHtml = defaultRows.length
      ? `<div class="talent-section gear-advanced-default-section"><h4>預設效果</h4>${effectTable(defaultRows)}</div>`
      : "";
    const switchableHtml = switchableRows.length
      ? `${defaultRows.length ? '<div class="gear-advanced-divider" aria-hidden="true"></div>' : ""}<details class="gear-advanced-switchable-details"><summary class="gear-advanced-switchable-summary">可切換效果</summary><div class="talent-section gear-advanced-switchable-section">${effectTable(switchableRows)}</div></details>`
      : "";

    return `<section class="detail-section" data-gear-section="高級效果">${heading(id, "高級效果", level)}<div class="ranger-talent-list gear-advanced-detail"><article class="ranger-talent-card gear-advanced-card">${conditionHtml}${defaultHtml}${switchableHtml}</article></div></section>`;
  }

  function readValue(source, keys) {
    if (!isObject(source)) return "";
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
    }
    return "";
  }

  function normalizeSkillRows(value) {
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) return value.flatMap(normalizeSkillRows);
    if (!isObject(value)) return scalarText(value) ? [{ effect: scalarText(value), factor: "-", duration: "-", factorIncrement: "", durationIncrement: "" }] : [];

    const effect = readValue(value, ["技能效果", "效果", "skillEffect", "effect"]);
    const factor = readValue(value, ["係數", "倍率", "數值", "factor", "value"]);
    const duration = readValue(value, ["有效時間", "時間", "持續時間", "duration", "time"]);
    const factorIncrement = readValue(value, ["每次升級係數增加", "每次升級倍率增加", "factorIncrement"]);
    const durationIncrement = readValue(value, ["每次升級時間增加", "每次升級有效時間增加", "durationIncrement"]);

    if (hasMeaningfulValue(effect) || hasMeaningfulValue(factor) || hasMeaningfulValue(duration)) {
      return [{
        effect: scalarText(effect) || "-",
        factor: scalarText(factor) || "-",
        duration: scalarText(duration) || "-",
        factorIncrement: scalarText(factorIncrement),
        durationIncrement: scalarText(durationIncrement)
      }];
    }
    return Object.values(value).flatMap(normalizeSkillRows);
  }

  function skillTable(rows, level) {
    return `<div class="table-scroll gear-effect-table-wrap"><table class="gear-effect-table gear-skillplus-table"><thead><tr><th>技能效果</th><th>係數</th><th>有效時間</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.effect)}</td><td>${escapeHtml(transformValue(row.factor, level, "increment", row.factorIncrement))}</td><td>${escapeHtml(transformValue(row.duration, level, "increment", row.durationIncrement))}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function rangerValue(ranger, keys) {
    for (const key of keys) {
      const value = scalarText(ranger?.[key]);
      if (value) return value;
    }
    return "";
  }

  function rangerSkillBlob(ranger) {
    return ["技能1", "技能2"].map((key) => {
      const skill = ranger?.[key];
      if (!isObject(skill)) return "";
      const group = Array.isArray(skill["技能組"]) ? skill["技能組"] : [];
      return JSON.stringify(group).replaceAll("\\n", "\n");
    }).join(" ");
  }

  function skillEffects(rows) {
    return [...new Set(rows.map((row) => scalarText(row.effect)).filter((effect) => effect && effect !== "-"))];
  }

  function matchedRangers(rows, rangers) {
    const effects = skillEffects(rows);
    if (!effects.length) return [];
    return rangers.filter((ranger) => {
      const blob = rangerSkillBlob(ranger);
      return blob && effects.some((effect) => blob.includes(effect));
    });
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant", { numeric: true }));
  }

  function filterOptions(label, values) {
    return `<option value="">${escapeHtml(label)}：全部</option>${unique(values).map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  }

  function rangerCard(ranger) {
    const id = getId(ranger);
    if (!id) return "";
    const name = scalarText(ranger?.["Ranger名稱"] || ranger?.name || id) || id;
    const star = rangerValue(ranger, ["星數", "Ranger星數", "star"]);
    const type = rangerValue(ranger, ["類型", "type"]);
    const element = rangerValue(ranger, ["屬性", "attribute", "element"]);
    return `<a class="gear-skillplus-ranger-card" href="${ROOT}ranger/ranger/${encodeURIComponent(id)}" title="${escapeHtml(name)}" data-star="${escapeHtml(star)}" data-type="${escapeHtml(type)}" data-element="${escapeHtml(element)}"><img src="${RANGER_IMAGE(id)}" alt="${escapeHtml(name)}" loading="lazy"><span>${escapeHtml(name)}</span></a>`;
  }

  function rangerDetails(rows, rangers) {
    const matches = matchedRangers(rows, rangers);
    const stars = matches.map((ranger) => rangerValue(ranger, ["星數", "Ranger星數", "star"]));
    const types = matches.map((ranger) => rangerValue(ranger, ["類型", "type"]));
    const elements = matches.map((ranger) => rangerValue(ranger, ["屬性", "attribute", "element"]));
    return `<details class="gear-skillplus-ranger-details"><summary class="gear-skillplus-ranger-summary">具有此技能效果的角色（${matches.length}）</summary><div class="gear-skillplus-ranger-filters"><select aria-label="篩選星數">${filterOptions("星數", stars)}</select><select aria-label="篩選類型">${filterOptions("類型", types)}</select><select aria-label="篩選屬性">${filterOptions("屬性", elements)}</select></div>${matches.length ? `<div class="gear-skillplus-ranger-grid">${matches.map(rangerCard).join("")}</div>` : '<div class="empty-state small gear-skillplus-ranger-empty">沒有符合的角色資料。</div>'}<div class="empty-state small gear-skillplus-ranger-filter-empty" hidden>沒有符合篩選條件的角色。</div></details>`;
  }

  function renderSkillSection(gear, id, rangers) {
    const rows = normalizeSkillRows(gear?.["Skill+"] ?? gear?.["Skill＋"] ?? gear?.skillPlus);
    const level = getLevel(id, "Skill+");
    if (!rows.length) {
      return `<section class="detail-section" data-gear-section="Skill+">${heading(id, "Skill+", level, false)}<div class="empty-state small">沒有Skill+資料。</div></section>`;
    }
    return `<section class="detail-section" data-gear-section="Skill+">${heading(id, "Skill+", level)}<div class="ranger-talent-list gear-skillplus-detail"><article class="ranger-talent-card gear-skillplus-card"><h4 class="gear-skillplus-effect-title">技能效果</h4>${skillTable(rows, level)}${rangerDetails(rows, rangers)}</article></div></section>`;
  }

  function specBasicRows(spec, level) {
    const basic = isObject(spec?.["基本效果"]) ? spec["基本效果"] : {};
    const globalIncrement = basic["每次升級增加"] ?? "";
    return Object.entries(basic)
      .filter(([key]) => key !== "每次升級增加" && !key.startsWith("每次升級"))
      .map(([effect, data]) => ({
        effect,
        value: isObject(data)
          ? transformValue(data["係數"] ?? data["數值"] ?? "-", level, "increment", data["每次升級增加"] ?? globalIncrement)
          : transformValue(data, level, "increment", globalIncrement)
      }));
  }

  function triggerRows(special, level, fallbackProbability) {
    return Object.entries(special)
      .filter(([key]) => /^觸發效果\d*$/.test(key))
      .flatMap(([, value]) => Array.isArray(value) ? value : [value])
      .filter(isObject)
      .map((trigger) => ({
        probability: transformValue(trigger["觸發機率"] ?? fallbackProbability, level, "increment", trigger["每次升級觸發機率增加"] ?? ""),
        effect: scalarText(trigger["效果"] ?? trigger["技能效果"] ?? "-") || "-",
        factor: transformValue(trigger["係數"] ?? "-", level, "increment", trigger["每次升級係數增加"] ?? trigger["每次升級增加"] ?? ""),
        time: transformValue(trigger["時間"] ?? "-", level, "increment", trigger["每次升級時間增加"] ?? "")
      }));
  }

  function renderSpecSection(gear, id) {
    const spec = isObject(gear?.["Spec+"]) ? gear["Spec+"] : null;
    const level = getLevel(id, "Spec+");
    if (!spec || !hasMeaningfulValue(spec)) {
      return `<section class="detail-section" data-gear-section="Spec+">${heading(id, "Spec+", level, false)}<div class="empty-state small gear-specplus-empty-state">沒有Spec+資料。</div></section>`;
    }

    const special = isObject(spec["特殊效果"]) ? spec["特殊效果"] : {};
    const name = scalarText(spec["名稱"] ?? "Spec+") || "Spec+";
    const description = scalarText(special["敘述"] ?? special["描述"] ?? "");
    const probability = transformValue(special["觸發機率"] ?? "-", level, "increment", special["每次升級觸發機率增加"] ?? "");
    const conditions = Object.entries(special)
      .filter(([key, value]) => /^(?:觸發)?條件\d*$/.test(key) && scalarText(value))
      .map(([, value]) => scalarText(value));
    const triggers = triggerRows(special, level, probability);
    const basics = specBasicRows(spec, level);
    const hasSpecial = description || conditions.length || triggers.length || hasMeaningfulValue(special["觸發機率"]);

    if (!basics.length && !hasSpecial) {
      return `<section class="detail-section" data-gear-section="Spec+">${heading(id, "Spec+", level, false)}<div class="empty-state small gear-specplus-empty-state">沒有Spec+資料。</div></section>`;
    }

    const basicHtml = basics.length
      ? `<div class="talent-section gear-specplus-section"><h5>基本效果</h5><div class="table-scroll talent-main-effect-wrap"><table class="talent-main-effect-table gear-specplus-basic-table"><thead><tr><th>效果</th><th>數值</th></tr></thead><tbody>${basics.map((row) => `<tr><td>${escapeHtml(row.effect)}</td><td>${escapeHtml(row.value)}</td></tr>`).join("")}</tbody></table></div></div>`
      : "";
    const conditionValues = conditions.length ? conditions : ["無特定條件"];
    const specialHtml = hasSpecial
      ? `<div class="talent-section gear-specplus-section gear-specplus-special-section"><h5>特殊效果</h5>${description ? `<p class="ranger-talent-description gear-specplus-special-description">${escapeHtml(description)}</p>` : ""}<div class="table-scroll talent-main-table-wrap"><table class="talent-main-table gear-specplus-condition-table"><thead><tr><th>機率</th><th>條件</th></tr></thead><tbody>${conditionValues.map((condition, index) => `<tr>${index === 0 ? `<td rowspan="${conditionValues.length}" class="talent-prob-cell">${escapeHtml(probability)}</td>` : ""}<td>${escapeHtml(condition)}</td></tr>`).join("")}</tbody></table></div>${triggers.length ? `<div class="table-scroll talent-main-effect-wrap"><table class="talent-main-effect-table gear-specplus-effect-table"><thead><tr><th>機率</th><th>效果</th><th>係數</th><th>時間</th></tr></thead><tbody>${triggers.map((row) => `<tr><td>${escapeHtml(row.probability)}</td><td>${escapeHtml(row.effect)}</td><td>${escapeHtml(row.factor)}</td><td>${escapeHtml(row.time)}</td></tr>`).join("")}</tbody></table></div>` : ""}</div>`
      : "";

    return `<section class="detail-section" data-gear-section="Spec+">${heading(id, "Spec+", level)}<div class="ranger-talent-list gear-specplus-detail"><article class="ranger-talent-card gear-specplus-card"><h4 class="talent-title-with-icon"><span>${escapeHtml(name)}</span></h4>${basicHtml}${specialHtml}</article></div></section>`;
  }

  function basicKeys(gear) {
    const basic = gear?.["基本效果"];
    if (!isObject(basic)) return [];
    return Object.getOwnPropertyNames(basic).map(normalize).filter(Boolean).sort((a, b) => a.localeCompare(b, "zh-Hant", { numeric: true }));
  }

  function sameBasicEffects(a, b) {
    const left = basicKeys(a);
    const right = basicKeys(b);
    return left.length > 0 && left.length === right.length && left.every((key, index) => key === right[index]);
  }

  function similarCard(gear) {
    const id = getId(gear);
    const name = getGearName(gear);
    const tags = [getGearStar(gear) ? `${getGearStar(gear)}星` : "", getGearTypeLabel(gear)].filter(Boolean).join("／");
    return `<a class="gear-similar-card" href="${ROOT}gear/${encodeURIComponent(id)}" title="${escapeHtml(name)}" data-gear-id="${escapeHtml(id)}"><img src="${GEAR_ICON(id)}" alt="${escapeHtml(name)}" loading="lazy"><span class="gear-similar-name">${escapeHtml(name)}</span><span class="gear-similar-tags">${escapeHtml(tags)}</span></a>`;
  }

  function renderSimilarSection(gear, id, allGear, isPublicGear) {
    const currentType = normalize(getGearTypeValue(gear));
    const matches = allGear
      .filter((candidate) => getId(candidate) && getId(candidate) !== id)
      .filter((candidate) => !isPublicGear || isPublicGear(candidate))
      .filter((candidate) => currentType && normalize(getGearTypeValue(candidate)) === currentType && sameBasicEffects(candidate, gear))
      .sort((a, b) => (Number(getGearStar(b)) - Number(getGearStar(a))) || getGearName(a).localeCompare(getGearName(b), "zh-Hant", { numeric: true }));
    return `<section class="detail-section gear-similar-section" data-gear-section="相似的裝備"><h3>相似的裝備</h3>${matches.length ? `<div class="ranger-talent-list"><article class="ranger-talent-card"><div class="gear-similar-list">${matches.map(similarCard).join("")}</div></article></div>` : '<div class="empty-state small">沒有相似的裝備。</div>'}</section>`;
  }

  function renderHead(gear, id) {
    const tags = [getGearStar(gear) ? `${getGearStar(gear)}星` : "", getGearTypeLabel(gear)].filter(Boolean);
    return `<div class="ranger-detail-head gear-detail-head"><div class="ranger-detail-image-wrap gear-detail-image-wrap"><img class="ranger-detail-image gear-detail-image" src="${GEAR_ICON(id)}" alt="${escapeHtml(getGearName(gear))}"></div><div><h2 id="gearModalTitle">${escapeHtml(getGearName(gear))}</h2><div class="ranger-tags detail-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div></div></div>`;
  }

  async function loadRangers() {
    if (!rangerPromise) {
      rangerPromise = fetch(RANGER_DATA_URL)
        .then((response) => response.ok ? response.json() : [])
        .then((rows) => Array.isArray(rows) ? rows : [])
        .catch(() => []);
    }
    return rangerPromise;
  }

  function preload() {
    loadRangers();
  }

  async function render(context) {
    const root = context?.root;
    const gear = context?.gear;
    const id = context?.id || getId(gear);
    if (!root || !gear || !id) throw new Error("Missing gear detail render context");

    const skillRows = normalizeSkillRows(gear?.["Skill+"] ?? gear?.["Skill＋"] ?? gear?.skillPlus);
    const rangers = skillRows.length ? await loadRangers() : [];
    if (context.shouldCommit && !context.shouldCommit()) return false;
    currentContext = { ...context, id, gear };
    currentRangers = rangers;

    const allGear = Array.isArray(context.allGear) ? context.allGear : [];
    root.innerHTML = [
      renderHead(gear, id),
      renderBasicSection(gear, id),
      renderAdvancedSection(gear, id),
      renderSkillSection(gear, id, rangers),
      renderSpecSection(gear, id),
      renderSimilarSection(gear, id, allGear, context.isPublicGear)
    ].join("");
    root.dataset.renderedGearId = id;
    return true;
  }

  function rerenderSection(sectionName) {
    if (!currentContext) return;
    const { root, gear, id, allGear, isPublicGear } = currentContext;
    const section = root.querySelector(`[data-gear-section="${CSS.escape(sectionName)}"]`);
    if (!section) return;
    let html = "";
    if (sectionName === "基本效果") html = renderBasicSection(gear, id);
    else if (sectionName === "高級效果") html = renderAdvancedSection(gear, id);
    else if (sectionName === "Skill+") html = renderSkillSection(gear, id, currentRangers);
    else if (sectionName === "Spec+") html = renderSpecSection(gear, id);
    else if (sectionName === "相似的裝備") html = renderSimilarSection(gear, id, allGear || [], isPublicGear);
    if (html) section.outerHTML = html;
  }

  function applyRangerFilters(container) {
    const details = container.closest(".gear-skillplus-ranger-details");
    if (!details) return;
    const selects = [...details.querySelectorAll(".gear-skillplus-ranger-filters select")];
    const [star, type, element] = selects.map((select) => select.value);
    let visible = 0;
    details.querySelectorAll(".gear-skillplus-ranger-card").forEach((card) => {
      const match = (!star || card.dataset.star === star)
        && (!type || card.dataset.type === type)
        && (!element || card.dataset.element === element);
      card.hidden = !match;
      if (match) visible += 1;
    });
    const empty = details.querySelector(".gear-skillplus-ranger-filter-empty");
    if (empty) empty.hidden = visible > 0;
  }

  document.addEventListener("change", (event) => {
    const level = event.target.closest?.("#gearModalContent .gear-level-select");
    if (level) {
      const id = level.dataset.gearId || currentContext?.id || "";
      const section = level.dataset.gearLevelSection || "";
      selectedLevels.set(levelKey(id, section), Number(level.value) || 0);
      rerenderSection(section);
      return;
    }

    const rangerFilter = event.target.closest?.("#gearModalContent .gear-skillplus-ranger-filters select");
    if (rangerFilter) applyRangerFilters(rangerFilter);
  });

  document.addEventListener("error", (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.closest("#gearModalContent")) return;

    const similarCardElement = image.closest(".gear-similar-card");
    if (similarCardElement) {
      const missingId = similarCardElement.dataset.gearId || "";
      currentContext?.rememberMissingIcon?.(missingId);
      const section = similarCardElement.closest(".gear-similar-section");
      similarCardElement.remove();
      if (section && !section.querySelector(".gear-similar-card")) {
        section.querySelector(":scope > .ranger-talent-list")?.remove();
        if (!section.querySelector(":scope > .empty-state")) {
          section.insertAdjacentHTML("beforeend", '<div class="empty-state small">沒有相似的裝備。</div>');
        }
      }
      return;
    }

    if (image.classList.contains("gear-detail-image")) {
      image.closest(".gear-detail-image-wrap")?.classList.add("missing-icon");
      image.remove();
      return;
    }

    if (image.closest(".gear-skillplus-ranger-card")) image.remove();
  }, true);

  window.RangerbookGearDetail = { render, preload };
})();
