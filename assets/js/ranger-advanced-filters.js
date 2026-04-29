(() => {
  const DATA_URL = "../res/Rangers_data.json";
  const ABILITY_DATA_URL = "../res/%E8%83%BD%E5%8A%9B.json";
  const $ = (id) => document.getElementById(id);

  const searchInput = $("rangerSearchInput");
  const advancedToggleBtn = $("rangerAdvancedToggleBtn");
  const advancedFilters = $("rangerAdvancedFilters");
  const resetBtn = $("rangerResetBtn");

  const selects = [
    $("skillEffectFilter"),
    $("abilityEffectFilter"),
    $("talentConditionFilter"),
    $("talentEffectFilter")
  ].filter(Boolean);

  if (!searchInput || !advancedToggleBtn || !advancedFilters) return;

  let visibleSearchValue = searchInput.value || "";
  let isDispatching = false;

  function rawText(value) {
    if (value === null || value === undefined) return "";
    return typeof value === "string" ? value : String(value);
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

  function normalize(value) {
    return text(value).toLowerCase();
  }

  function isNone(value) {
    const v = text(value);
    return !v || v === "無" || v === "(無)" || v === "-";
  }

  function getSkill(ranger, key) {
    const value = ranger?.[key];
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  }

  function getSkillEffects(ranger) {
    return ["技能1", "技能2"]
      .flatMap((key) => {
        const skill = getSkill(ranger, key);
        const group = Array.isArray(skill?.["技能組"]) ? skill["技能組"] : [];
        return group.map((effect) => text(effect?.["效果"])).filter(Boolean);
      });
  }

  function parseAbility(value, abilityMap = {}, fallbackCode = "") {
    if (Array.isArray(value)) return value.flatMap((item) => parseAbility(item, abilityMap, fallbackCode));
    if (isNone(value)) return [];

    const code = typeof value === "object"
      ? text(value.abilityCode || value["abilityCode"] || value.code || fallbackCode)
      : text(fallbackCode);
    const detail = code ? abilityMap[code] : null;
    const name = typeof value === "object"
      ? text(value["能力"] || value["名稱"] || value["能力名稱"] || value.name)
      : text(value);
    const displayName = name || text(detail?.["名稱"]) || code;

    return displayName && displayName !== "無" && displayName !== "(無)" ? [displayName] : [];
  }

  function getAbilityOptions(ranger, abilityMap = {}) {
    return [
      ...parseAbility(ranger?.["能力1"], abilityMap, ranger?.abilityCode),
      ...parseAbility(ranger?.["能力2"], abilityMap, ranger?.abilityCode2),
      ...parseAbility(ranger?.["覺醒能力"], abilityMap, ranger?.awakeAbilityCode || ranger?.["覺醒能力Code"])
    ];
  }

  function walkTalent(value, result = { conditions: [], effects: [] }, keyPath = "") {
    if (isNone(value)) return result;

    if (Array.isArray(value)) {
      value.forEach((item) => walkTalent(item, result, keyPath));
      return result;
    }

    if (typeof value === "object") {
      Object.entries(value).forEach(([key, item]) => {
        const nextKeyPath = `${keyPath} ${key}`;
        const keyText = text(key);
        const itemText = text(item);

        if (typeof item !== "object" && !isNone(item)) {
          if (keyText.includes("條件") || nextKeyPath.includes("條件")) result.conditions.push(itemText);
          else if (keyText.includes("效果") || nextKeyPath.includes("效果")) result.effects.push(itemText);
          else if (nextKeyPath.includes("主要才能")) result.effects.push(itemText);
          else if (nextKeyPath.includes("強化才能")) result.effects.push(itemText);
        }

        walkTalent(item, result, nextKeyPath);
      });
      return result;
    }

    if (keyPath.includes("條件")) result.conditions.push(text(value));
    else if (keyPath.includes("效果") || keyPath.includes("主要才能") || keyPath.includes("強化才能")) result.effects.push(text(value));

    return result;
  }

  function fillSelect(select, values, label) {
    if (!select) return;
    const unique = [...new Set(values.map(text).filter((value) => !isNone(value)))]
      .sort((a, b) => a.localeCompare(b, "zh-Hant"));

    select.innerHTML = `<option value="">全部${label}</option>` + unique
      .map((value) => `<option value="${html(value)}">${html(value)}</option>`)
      .join("");
  }

  function buildMergedSearchValue() {
    const parts = [visibleSearchValue, ...selects.map((select) => select.value)]
      .map(text)
      .filter(Boolean);
    return parts.join(" ");
  }

  function dispatchMergedFilter() {
    if (isDispatching) return;

    isDispatching = true;
    const displayValue = visibleSearchValue;
    searchInput.value = buildMergedSearchValue();
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    searchInput.value = displayValue;
    isDispatching = false;
  }

  async function populateDropdowns() {
    try {
      const [rangerResponse, abilityResponse] = await Promise.all([
        fetch(DATA_URL),
        fetch(ABILITY_DATA_URL).catch(() => null)
      ]);
      if (!rangerResponse.ok) return;

      const rangers = await rangerResponse.json();
      const abilityMap = abilityResponse && abilityResponse.ok ? await abilityResponse.json() : {};
      if (!Array.isArray(rangers)) return;

      const skillEffects = [];
      const abilities = [];
      const talentConditions = [];
      const talentEffects = [];

      rangers.forEach((ranger) => {
        skillEffects.push(...getSkillEffects(ranger));
        abilities.push(...getAbilityOptions(ranger, abilityMap));

        const talent = walkTalent(ranger?.["才能"]);
        talentConditions.push(...talent.conditions);
        talentEffects.push(...talent.effects);
      });

      fillSelect($("skillEffectFilter"), skillEffects, "技能效果");
      fillSelect($("abilityEffectFilter"), abilities, "能力");
      fillSelect($("talentConditionFilter"), talentConditions, "才能條件");
      fillSelect($("talentEffectFilter"), talentEffects, "才能效果");
    } catch (error) {
      console.error("進階篩選選項載入失敗", error);
    }
  }

  searchInput.addEventListener("input", () => {
    if (!isDispatching) visibleSearchValue = searchInput.value;
  }, true);

  advancedToggleBtn.addEventListener("click", () => {
    const isOpen = advancedFilters.hidden;
    advancedFilters.hidden = !isOpen;
    advancedToggleBtn.setAttribute("aria-expanded", String(isOpen));
    advancedToggleBtn.textContent = isOpen ? "收合進階篩選 ▲" : "進階篩選 ▼";
  });

  selects.forEach((select) => {
    select.addEventListener("change", dispatchMergedFilter);
  });

  resetBtn?.addEventListener("click", () => {
    visibleSearchValue = "";
    selects.forEach((select) => {
      select.value = "";
    });
  }, true);

  populateDropdowns();
})();
