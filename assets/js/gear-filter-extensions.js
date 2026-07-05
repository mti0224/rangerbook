(() => {
  const style = document.createElement("style");
  style.textContent = `
    .gear-skillplus-grid {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 0.55rem;
    }
    .gear-skillplus-grid .gear-checkbox {
      min-width: 0;
    }
    .gear-skillplus-grid .gear-checkbox span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    @media (max-width: 1100px) {
      .gear-skillplus-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
    }
    @media (max-width: 700px) {
      .gear-skillplus-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `;
  document.head.appendChild(style);

  const originalJson = Response.prototype.json;
  const originalObjectKeys = Object.keys;
  const originalArrayFilter = Array.prototype.filter;
  const basicToSpecKeys = new WeakMap();
  let skillPlusOptions = [];

  const text = (value) => {
    if (value === null || value === undefined || typeof value === "object") return "";
    return String(value).replaceAll("\\n", "\n").trim();
  };

  function isGearDatabaseResponse(response) {
    try {
      return decodeURIComponent(response.url).includes("裝備資料庫.json");
    } catch {
      return response.url.includes("%E8%A3%9D%E5%82%99%E8%B3%87%E6%96%99%E5%BA%AB.json");
    }
  }

  function getSkillPlusKeys(gear) {
    const skillPlus = Array.isArray(gear?.["Skill+"]) ? gear["Skill+"] : [];
    return new Set(skillPlus.map((item) => {
      if (item && typeof item === "object") return text(item["技能效果"] ?? item["效果"] ?? item.skillEffect ?? item.effect);
      return text(item);
    }).filter(Boolean));
  }

  function registerGearData(rows) {
    const options = new Set();
    rows.forEach((gear) => {
      if (!gear || typeof gear !== "object") return;

      const basic = gear["基本效果"];
      const specBasic = gear["Spec+"]?.["基本效果"];
      if (basic && typeof basic === "object" && !Array.isArray(basic)
        && specBasic && typeof specBasic === "object" && !Array.isArray(specBasic)) {
        const extraKeys = originalObjectKeys(specBasic)
          .filter((key) => !key.startsWith("每次升級"));
        basicToSpecKeys.set(basic, extraKeys);
      }

      getSkillPlusKeys(gear).forEach((key) => options.add(key));
    });

    skillPlusOptions = [...options].sort((a, b) => a.localeCompare(b, "zh-Hant", { numeric: true }));
    renderSkillPlusFilter();
  }

  Response.prototype.json = async function (...args) {
    const data = await originalJson.apply(this, args);
    if (isGearDatabaseResponse(this) && Array.isArray(data)) registerGearData(data);
    return data;
  };

  Object.keys = function (value) {
    const keys = originalObjectKeys(value);
    const extraKeys = value && typeof value === "object" ? basicToSpecKeys.get(value) : null;
    return extraKeys?.length ? [...new Set([...keys, ...extraKeys])] : keys;
  };

  function selectedSkillPlusValues() {
    const container = document.getElementById("gearSkillPlusFilter");
    if (!container) return new Set();
    return new Set([...container.querySelectorAll("input[type='checkbox']:checked")].map((input) => input.value));
  }

  Array.prototype.filter = function (callback, thisArg) {
    const result = originalArrayFilter.call(this, callback, thisArg);
    const selected = selectedSkillPlusValues();
    const first = this[0];
    const isGearRowList = first && typeof first === "object" && first.gear && Object.prototype.hasOwnProperty.call(first, "search");
    if (!selected.size || !isGearRowList) return result;

    return originalArrayFilter.call(result, (row) => {
      const keys = getSkillPlusKeys(row.gear);
      return [...selected].some((key) => keys.has(key));
    });
  };

  function ensureSkillPlusPanel() {
    let container = document.getElementById("gearSkillPlusFilter");
    if (container) return container;

    const advancedFilters = document.getElementById("gearAdvancedFilters");
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

    container = panel.querySelector("#gearSkillPlusFilter");
    container.addEventListener("change", () => {
      document.getElementById("gearSearchInput")?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return container;
  }

  function renderSkillPlusFilter() {
    const container = ensureSkillPlusPanel();
    if (!container) return;
    const selected = selectedSkillPlusValues();
    container.innerHTML = skillPlusOptions.map((value) => {
      const escaped = value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
      return `<label class="gear-checkbox" title="${escaped}"><input type="checkbox" value="${escaped}"${selected.has(value) ? " checked" : ""}><span>${escaped}</span></label>`;
    }).join("");
  }

  document.getElementById("gearResetBtn")?.addEventListener("click", () => {
    document.querySelectorAll("#gearSkillPlusFilter input[type='checkbox']").forEach((input) => {
      input.checked = false;
    });
  }, true);

  ensureSkillPlusPanel();
})();
