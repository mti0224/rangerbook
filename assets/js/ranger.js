(() => {
  const currentScript = document.currentScript;
  const scriptBaseUrl = currentScript?.src || window.location.href;
  const path = window.location.pathname;
  const rootPath = path.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const prettyDetailMatch = path.match(/^(?:\/rangerbook)?\/ranger\/ranger\/([^/]+)\/?$/);

  if (prettyDetailMatch) {
    const rangerId = decodeURIComponent(prettyDetailMatch[1]);
    window.location.replace(`${rootPath}ranger/ranger/?detail=${encodeURIComponent(rangerId)}`);
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const detailId = (params.get("detail") || "").trim();
  const isDetailPage = Boolean(detailId);
  window.__RANGER_DETAIL_MODE__ = isDetailPage;

  const DATA_URL = "../res/Rangers_data.json";
  const ABILITY_DATA_URL = "../res/%E8%83%BD%E5%8A%9B.json";
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
  const ABILITY_ICON = (icon) => `https://rangers.lerico.net/res/ability_icon/${encodeURIComponent(icon)}`;
  const SKILL_ICON = (icon) => `https://rangers.lerico.net/res/skill_icon/${encodeURIComponent(icon)}`;
  const TLT_ICON = (index) => `../assets/tlt_icon/tlt${index}.png`;
  const ANIMATION_META_BASE = "https://res.warmycat.com/animation_meta/";
  const ANIMATION_INDEX_URL = `${ANIMATION_META_BASE}index.json`;
  const RESPAWN_MIN_SECONDS = 1.3;
  const GENERAL_RESPAWN_DECREASE_RATES = [0, 0.20, 0.30, 0.40, 0.50];
  const EVOLVED_RESPAWN_DECREASE_RATES = [
    0, 0.01, 0.02, 0.03, 0.05, 0.07, 0.09, 0.12, 0.15, 0.18, 0.20,
    0.22, 0.24, 0.26, 0.28, 0.30, 0.33, 0.36, 0.40, 0.45, 0.50
  ];
  const STAT_GROWTH = [
    { label: "體力", base: "體力", normal: "hpIncreaseAmount", max: "hpIncreaseAmountMax" },
    { label: "物理攻擊力", base: "物理攻擊力", normal: "attackIncreaseAmount", max: "attackIncreaseAmountMax" },
    { label: "魔法攻擊力", base: "魔法攻擊力", normal: "specialAttackDelta", max: "specialAttackDeltaMax" },
    { label: "物理防禦力", base: "物理防禦力", normal: "generalDefenceDelta", max: "generalDefenceDeltaMax" },
    { label: "魔法防禦力", base: "魔法防禦力", normal: "specialDefenceDelta", max: "specialDefenceDeltaMax" }
  ];
  const TAG_CLASS_MAP = new Map([
    ["力量型", "tag-type-power"],
    ["敏捷型", "tag-type-agility"],
    ["智慧型", "tag-type-intelligence"],
    ["火", "tag-element-fire"],
    ["水", "tag-element-water"],
    ["木", "tag-element-wood"],
    ["光", "tag-element-light"],
    ["暗", "tag-element-dark"],
    ["火屬性", "tag-element-fire"],
    ["水屬性", "tag-element-water"],
    ["木屬性", "tag-element-wood"],
    ["光屬性", "tag-element-light"],
    ["暗屬性", "tag-element-dark"]
  ]);

  const state = {
    rows: [],
    filtered: [],
    abilityMap: {},
    selectedId: "",
    page: 1,
    pageSize: 60,
    animationIndexPromise: null,
    animationMetaCache: new Map(),
    selectedLevels: new Map()
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    search: $("rangerSearchInput"),
    star: $("starFilter"),
    type: $("typeFilter"),
    element: $("elementFilter"),
    special: $("specialFilter"),
    skillEffect: $("skillEffectFilter"),
    abilityEffect: $("abilityEffectFilter"),
    talentCondition: $("talentConditionFilter"),
    talentEffect: $("talentEffectFilter"),
    advancedToggle: $("rangerAdvancedToggleBtn"),
    advancedFilters: $("rangerAdvancedFilters"),
    reset: $("rangerResetBtn"),
    count: $("rangerResultCount"),
    list: $("rangerList"),
    modal: $("rangerModal"),
    modalContent: $("rangerModalContent"),
    close: $("rangerModalCloseBtn")
  };
  const modalPanel = els.modal?.querySelector(".modal-panel");
  let detailPage = null;

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

  function isNone(value) {
    const normalized = text(value);
    return !normalized || normalized === "無" || normalized === "(無)" || normalized === "-";
  }

  function isYes(value) {
    return value === true || value === 1 || ["是", "true", "1", "yes", "y"].includes(text(value).toLowerCase());
  }

  function num(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const parsed = Number(rawText(value).replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function numericValue(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const match = text(value).replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function fmt(value) {
    if (typeof value === "number") return value.toLocaleString("zh-Hant");
    const parsed = num(value);
    return parsed ? parsed.toLocaleString("zh-Hant") : html(value || "-");
  }

  function formatCalculatedNumber(value) {
    if (!Number.isFinite(value)) return "-";
    return value.toLocaleString("zh-Hant", { maximumFractionDigits: 3 });
  }

  function formatRespawnTime(value) {
    if (!Number.isFinite(value)) return "-";
    return `${value.toLocaleString("zh-Hant", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 3
    })}秒`;
  }

  function getId(ranger) {
    return text(ranger?.ranger_id || ranger?.unitCode || ranger?.id || "");
  }

  function getName(ranger) {
    return text(ranger?.["Ranger名稱"]) || getId(ranger) || "未命名角色";
  }

  function attackValue(ranger) {
    return Math.max(num(ranger?.["物理攻擊力"]), num(ranger?.["魔法攻擊力"]));
  }

  function parseDate(value) {
    const parts = text(value).replaceAll("-", "/").split("/").map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return 0;
    return new Date(parts[0], parts[1] - 1, parts[2]).getTime() || 0;
  }

  function detailUrl(id) {
    return `${rootPath}ranger/ranger/${encodeURIComponent(id)}`;
  }

  function animationMetaUrl(metaPath, unitId) {
    const raw = text(metaPath);
    const filename = raw ? raw.split("/").pop() : `${unitId}.json`;
    return `${ANIMATION_META_BASE}${encodeURIComponent(filename)}`;
  }

  function loadAnimationIndex() {
    if (!state.animationIndexPromise) {
      state.animationIndexPromise = fetch(ANIMATION_INDEX_URL)
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null);
    }
    return state.animationIndexPromise;
  }

  async function loadAnimationMeta(unitId) {
    if (!unitId) return null;
    if (state.animationMetaCache.has(unitId)) return state.animationMetaCache.get(unitId);
    const index = await loadAnimationIndex();
    const metaPath = index?.units?.[unitId]?.meta;
    if (!metaPath) {
      state.animationMetaCache.set(unitId, null);
      return null;
    }
    const meta = await fetch(animationMetaUrl(metaPath, unitId))
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null);
    state.animationMetaCache.set(unitId, meta);
    return meta;
  }

  function startupSeconds(animationMeta, skillIndex) {
    const key = skillIndex === 0 ? "skill_1" : "skill_2";
    const seconds = Number(animationMeta?.startup?.[key]?.seconds || 0);
    return seconds ? `${seconds.toFixed(2)}秒` : "-";
  }

  function getSkill(ranger, key) {
    const value = ranger?.[key];
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  }

  function skillEffects(ranger) {
    return ["技能1", "技能2"].flatMap((key) => {
      const skill = getSkill(ranger, key);
      const group = Array.isArray(skill?.["技能組"]) ? skill["技能組"] : [];
      return group.map((effect) => text(effect?.["效果"])).filter((value) => !isNone(value));
    });
  }

  function abilityEffects(ability) {
    if (!ability || typeof ability !== "object") return [];
    return Object.entries(ability)
      .filter(([key, value]) => key.startsWith("觸發效果") && value && typeof value === "object")
      .sort(([a], [b]) => {
        const first = a === "觸發效果" ? 1 : Number(a.replace("觸發效果", "")) || 999;
        const second = b === "觸發效果" ? 1 : Number(b.replace("觸發效果", "")) || 999;
        return first - second;
      })
      .map(([, value]) => value);
  }

  function parseAbility(value, fallbackCode = "") {
    if (Array.isArray(value)) return value.flatMap((entry) => parseAbility(entry, fallbackCode));
    if (isNone(value)) return [];
    const code = typeof value === "object"
      ? text(value.abilityCode || value["abilityCode"] || value.code || fallbackCode)
      : text(fallbackCode);
    const detail = code ? state.abilityMap[code] : null;
    const name = typeof value === "object"
      ? text(value["能力"] || value["名稱"] || value["能力名稱"] || value.name)
      : text(value);
    const displayName = name || text(detail?.["名稱"]) || code;
    const icon = (typeof value === "object" ? text(value.icon) : "") || text(detail?.icon);
    return displayName && displayName !== "無" && displayName !== "(無)"
      ? [{ name: displayName, code, icon, detail }]
      : [];
  }

  function normalAbilities(ranger) {
    return [
      ...parseAbility(ranger?.["能力1"], ranger?.abilityCode),
      ...parseAbility(ranger?.["能力2"], ranger?.abilityCode2)
    ];
  }

  function awakeAbilities(ranger) {
    return parseAbility(ranger?.["覺醒能力"], ranger?.awakeAbilityCode || ranger?.["覺醒能力Code"] || "");
  }

  function allAbilities(ranger) {
    return [...normalAbilities(ranger), ...awakeAbilities(ranger)];
  }

  function abilityFilterValues(ranger) {
    return allAbilities(ranger).map((ability) => ability.name).filter((value) => !isNone(value));
  }

  function talentSearchCategories(ranger) {
    const mainTalent = ranger?.["才能"]?.["主要才能"];
    const condition = text(mainTalent?.["條件搜尋分類"]);
    const effects = Array.isArray(mainTalent?.["增益效果"])
      ? mainTalent["增益效果"]
          .map((effect) => text(effect?.["效果搜尋分類"]))
          .filter((value) => !isNone(value))
      : [];
    return { conditions: isNone(condition) ? [] : [condition], effects };
  }

  function searchBlob(ranger) {
    const skills = ["技能1", "技能2"].flatMap((key) => {
      const skill = getSkill(ranger, key);
      return skill
        ? [
            skill["技能名稱"], skill["技能敘述"], skill["發動機率"], skill["觸發基準"],
            skill["技能冷卻時間"], skill["前搖時間"],
            ...(Array.isArray(skill["技能組"]) ? skill["技能組"].flatMap((effect) => Object.values(effect)) : [])
          ]
        : [ranger?.[key]];
    });
    const abilities = allAbilities(ranger).flatMap((ability) => [
      ability.name,
      ability.code,
      ability.detail?.["名稱"],
      ability.detail?.["敘述"],
      ...abilityEffects(ability.detail).flatMap((effect) => Object.values(effect))
    ]);
    const talent = talentSearchCategories(ranger);
    return [
      getName(ranger), getId(ranger), ranger?.["角色敘述"], ranger?.["登場時間"], ranger?.["Ranger星數"],
      ranger?.["類型"], ranger?.["屬性"], ranger?.["命中率"], ranger?.["技能命中率"],
      ...talent.conditions, ...talent.effects, ...abilities, ...skills
    ].map(rawText).join(" ").toLowerCase();
  }

  function valueText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value !== "object") return text(value);
    if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join("、");
    return Object.entries(value)
      .filter(([key, child]) => !text(key).includes("搜尋分類") && !isNone(child))
      .map(([key, child]) => {
        const rendered = valueText(child);
        return rendered ? (/^\d+$/.test(text(key)) ? rendered : `${text(key)}${rendered}`) : "";
      })
      .filter(Boolean)
      .join("、");
  }

  function getExactValue(object, keys) {
    if (!object || typeof object !== "object") return undefined;
    const entries = Object.entries(object);
    for (const wanted of keys) {
      const found = entries.find(([key]) => text(key) === wanted);
      if (found) return found[1];
    }
    return undefined;
  }

  function getFirstText(object, keys) {
    if (!object || typeof object !== "object") return "";
    for (const key of keys) if (!isNone(object[key])) return object[key];
    const found = Object.entries(object)
      .find(([key, value]) => keys.some((wanted) => text(key).includes(wanted)) && !isNone(value));
    return found ? found[1] : "";
  }

  function splitRows(value) {
    return valueText(value).split(/\n+/).map((row) => row.trim()).filter(Boolean);
  }

  function conditionKeyOrder(key) {
    const normalized = text(key);
    if (normalized === "條件" || normalized === "觸發條件") return 1;
    const match = normalized.match(/^(?:條件|觸發條件)(\d+)$/);
    return match ? Number(match[1]) : 9999;
  }

  function isMainTalentConditionKey(key) {
    return /^(?:條件|觸發條件)\d*$/.test(text(key));
  }

  function collectMainTalentConditions(content) {
    if (!content || typeof content !== "object" || Array.isArray(content)) return [];
    return Object.entries(content)
      .filter(([key, value]) => isMainTalentConditionKey(key) && !isNone(value))
      .sort(([a], [b]) => conditionKeyOrder(a) - conditionKeyOrder(b))
      .flatMap(([, value]) => splitRows(value));
  }

  function parseMainTalentEffects(value, fallbackProbability = "-") {
    if (isNone(value)) return [];
    if (Array.isArray(value)) return value.flatMap((entry) => parseMainTalentEffects(entry, fallbackProbability));
    if (typeof value === "object" && value !== null) {
      const probability = valueText(getExactValue(value, ["觸發機率", "發動機率", "機率"])) || fallbackProbability || "-";
      const effect = valueText(getExactValue(value, ["效果", "增益效果", "內容", "文字", "名稱"]));
      return effect ? [{ probability, effect }] : [];
    }
    return splitRows(value).map((effect) => ({ probability: fallbackProbability || "-", effect }));
  }

  function fillSelect(select, values, label = "") {
    if (!select) return;
    const unique = [...new Set(values.map(text).filter((value) => !isNone(value)))]
      .sort((a, b) => a.localeCompare(b, "zh-Hant"));
    const first = label ? `全部${label}` : "全部";
    select.innerHTML = `<option value="">${html(first)}</option>`
      + unique.map((value) => `<option value="${html(value)}">${html(value)}</option>`).join("");
  }

  function tagClass(value) {
    return TAG_CLASS_MAP.get(text(value)) || "";
  }

  function coloredTag(value) {
    const className = tagClass(value);
    return `<span${className ? ` class="${className}"` : ""}>${html(value)}</span>`;
  }

  function paginationBarHtml(bottom = false) {
    const prefix = bottom ? "bottomPagination" : "pagination";
    return `
      <div class="pagination-info" id="${prefix}Info"></div>
      <div class="pagination-actions">
        <label class="pagination-size">
          <span>每頁顯示</span>
          <select id="${prefix}Size">
            <option value="30">30</option>
            <option value="60" selected>60</option>
            <option value="120">120</option>
          </select>
        </label>
        <button id="${prefix}Prev" type="button">上一頁</button>
        <div id="${prefix}Pages" class="pagination-pages"></div>
        <button id="${prefix}Next" type="button">下一頁</button>
      </div>`;
  }

  function setupPagination() {
    if ($("rangerPaginationBar") || isDetailPage) return;
    const topBar = document.createElement("section");
    topBar.id = "rangerPaginationBar";
    topBar.className = "pagination-bar";
    topBar.innerHTML = paginationBarHtml(false);
    document.querySelector(".summary-bar")?.insertAdjacentElement("afterend", topBar);

    const bottomBar = document.createElement("section");
    bottomBar.id = "bottomPaginationBar";
    bottomBar.className = "pagination-bar pagination-bar-bottom";
    bottomBar.innerHTML = paginationBarHtml(true);
    document.querySelector(".ranger-list-layout")?.insertAdjacentElement("afterend", bottomBar);

    ["paginationSize", "bottomPaginationSize"].forEach((id) => {
      $(id)?.addEventListener("change", (event) => {
        state.pageSize = Number(event.target.value) || 60;
        state.page = 1;
        renderList();
      });
    });
    ["paginationPrev", "bottomPaginationPrev"].forEach((id) => {
      $(id)?.addEventListener("click", () => {
        state.page -= 1;
        renderList();
      });
    });
    ["paginationNext", "bottomPaginationNext"].forEach((id) => {
      $(id)?.addEventListener("click", () => {
        state.page += 1;
        renderList();
      });
    });
    ["paginationPages", "bottomPaginationPages"].forEach((id) => {
      $(id)?.addEventListener("click", (event) => {
        const button = event.target.closest?.(".pagination-page[data-page]");
        if (!button) return;
        state.page = Number(button.dataset.page) || 1;
        renderList();
      });
    });
  }

  function renderPaginationBar(prefix, total, totalPages, start, end) {
    const bar = prefix === "pagination" ? $("rangerPaginationBar") : $("bottomPaginationBar");
    if (!bar) return;
    bar.hidden = total === 0;
    if (!total) return;

    $(`${prefix}Info`).textContent = `第 ${state.page} / ${totalPages} 頁，顯示第 ${start + 1}–${end} 筆，共 ${total} 筆`;
    $(`${prefix}Prev`).disabled = state.page <= 1;
    $(`${prefix}Next`).disabled = state.page >= totalPages;
    $(`${prefix}Size`).value = String(state.pageSize);

    const pages = [...new Set([1, totalPages, state.page - 1, state.page, state.page + 1])]
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((a, b) => a - b);
    let last = 0;
    $(`${prefix}Pages`).innerHTML = totalPages <= 1 ? "" : pages.map((page) => {
      const gap = page - last > 1 ? `<span class="pagination-ellipsis">…</span>` : "";
      last = page;
      return `${gap}<button class="pagination-page ${page === state.page ? "active" : ""}" type="button" data-page="${page}">${page}</button>`;
    }).join("");
  }

  function renderPagination(total) {
    setupPagination();
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const start = (state.page - 1) * state.pageSize;
    const end = Math.min(start + state.pageSize, total);
    renderPaginationBar("pagination", total, totalPages, start, end);
    renderPaginationBar("bottomPagination", total, totalPages, start, end);
  }

  function applyFilters() {
    if (isDetailPage) return;
    const query = els.search?.value.trim().toLowerCase() || "";
    const selectedSkillEffect = text(els.skillEffect?.value);
    const selectedAbility = text(els.abilityEffect?.value);
    const selectedTalentCondition = text(els.talentCondition?.value);
    const selectedTalentEffect = text(els.talentEffect?.value);

    state.filtered = state.rows.filter(({ ranger, search }) => {
      const talent = talentSearchCategories(ranger);
      if (query && !search.includes(query)) return false;
      if (els.star?.value && ranger["Ranger星數"] !== els.star.value) return false;
      if (els.type?.value && ranger["類型"] !== els.type.value) return false;
      if (els.element?.value && ranger["屬性"] !== els.element.value) return false;
      if (els.special?.value === "nft" && !isYes(ranger["nft角色"])) return false;
      if (els.special?.value === "event" && !isYes(ranger["降臨關卡角色"])) return false;
      if (els.special?.value === "talent" && isNone(ranger["才能"])) return false;
      if (selectedSkillEffect && !skillEffects(ranger).includes(selectedSkillEffect)) return false;
      if (selectedAbility && !abilityFilterValues(ranger).includes(selectedAbility)) return false;
      if (selectedTalentCondition && !talent.conditions.includes(selectedTalentCondition)) return false;
      if (selectedTalentEffect && !talent.effects.includes(selectedTalentEffect)) return false;
      return true;
    });
    state.page = 1;
    renderList();
  }

  function renderList() {
    if (isDetailPage || !els.list || !els.count) return;
    const total = state.filtered.length;
    els.count.textContent = total.toLocaleString("zh-Hant");
    renderPagination(total);
    if (!total) {
      els.list.innerHTML = `<div class="empty-state">找不到符合條件的角色。</div>`;
      return;
    }

    const pageRows = state.filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
    els.list.innerHTML = pageRows.map(({ ranger }) => {
      const id = getId(ranger);
      const tags = [ranger["Ranger星數"], ranger["類型"], ranger["屬性"]]
        .filter(Boolean)
        .map(coloredTag)
        .join("");
      return `
        <button class="ranger-card${state.selectedId === id ? " active" : ""}" type="button" data-ranger-id="${html(id)}">
          <div class="ranger-thumb-wrap">
            <img class="ranger-thumb" src="${RANGER_IMAGE(id)}" alt="" loading="lazy" onerror="this.closest('.ranger-thumb-wrap').classList.add('missing-icon'); this.remove();">
          </div>
          <div class="ranger-card-main">
            <div class="ranger-title-row"><h2>${html(getName(ranger))}</h2><span class="tag">${html(ranger["屬性"] || "-")}</span></div>
            <div class="ranger-tags">${tags}</div>
            <div class="ranger-mini-stats">
              <span>攻擊力 ${fmt(attackValue(ranger))}</span>
              <span>體力 ${fmt(ranger["體力"])}</span>
              <span>礦物 ${fmt(ranger["生產礦物費用"])}</span>
            </div>
          </div>
        </button>`;
    }).join("");
  }

  function stat(label, value) {
    return `<div class="ranger-stat"><span>${html(label)}</span><strong>${fmt(value)}</strong></div>`;
  }

  function description(value, className) {
    return isNone(value) ? "" : `<p class="${className} preline">${html(text(value))}</p>`;
  }

  function skillValue(skill, keys) {
    for (const key of keys) {
      const value = text(skill?.[key]);
      if (value) return value;
    }
    return "-";
  }

  function skillStartupValue(skill, animationMeta, skillIndex) {
    const directValue = skillValue(skill, ["前搖時間", "技能前搖時間", "前搖", "startup", "startupTime"]);
    return directValue !== "-" ? directValue : startupSeconds(animationMeta, skillIndex);
  }

  function skillMetaTable(skill, animationMeta, skillIndex) {
    return `
      <div class="table-scroll skill-meta-table-wrap">
        <table class="skill-meta-table">
          <thead><tr><th>發動率</th><th>技能冷卻時間</th><th>觸發基準</th><th>前搖時間</th></tr></thead>
          <tbody><tr>
            <td>${html(skillValue(skill, ["發動機率", "技能發動率", "技能發動機率"]))}</td>
            <td>${html(skillValue(skill, ["技能冷卻時間", "冷卻時間"]))}</td>
            <td>${html(skillValue(skill, ["觸發基準", "觸發條件", "基準"]))}</td>
            <td>${html(skillStartupValue(skill, animationMeta, skillIndex))}</td>
          </tr></tbody>
        </table>
      </div>`;
  }

  function skillTable(skill) {
    const effects = Array.isArray(skill?.["技能組"]) ? skill["技能組"] : [];
    if (!effects.length) return `<div class="empty-state small">沒有技能效果資料。</div>`;
    return `
      <div class="table-scroll">
        <table class="skill-effect-table">
          <thead><tr><th>技能效果</th><th>係數</th><th>時間</th><th>範圍</th><th><span class="break-header">作用於<br>活動關卡</span></th><th><span class="break-header">作用於<br>副本</span></th></tr></thead>
          <tbody>${effects.map((effect) => `
            <tr>
              <th>${html(effect["效果"] || "-")}</th>
              <td>${html(effect["係數"] || "-")}</td>
              <td>${html(effect["有效時間"] || "-")}</td>
              <td>${html(effect["範圍"] || "-")}</td>
              <td>${html(effect["適用於活動關卡"] || "-")}</td>
              <td>${html(effect["適用於守護神"] || "-")}</td>
            </tr>`).join("")}</tbody>
        </table>
      </div>`;
  }

  function renderSkills(ranger, animationMeta) {
    const skills = [getSkill(ranger, "技能1"), getSkill(ranger, "技能2")].filter(Boolean);
    if (!skills.length) return `<div class="empty-state small">沒有技能資料。</div>`;
    const cards = skills.map((skill, index) => `
      <article class="ranger-skill-card">
        <div class="ranger-icon-title">
          ${skill.icon ? `<img class="small-icon" src="${SKILL_ICON(skill.icon)}" alt="" onerror="this.remove();">` : ""}
          <div><h4>技能 ${index + 1}：${html(skill["技能名稱"] || "未命名技能")}</h4>${description(skill["技能敘述"], "ranger-skill-description")}</div>
        </div>
        ${skillMetaTable(skill, animationMeta, index)}
        ${skillTable(skill)}
      </article>`).join("");
    return `<div class="ranger-category-box ranger-skill-group">${cards}</div>`;
  }

  function abilityTable(effects) {
    if (!effects.length) return "";
    return `
      <div class="ability-effect-list">
        <div class="table-scroll ability-effect-table-wrap">
          <table class="ability-effect-table">
            <thead><tr><th>機率</th><th>時機</th><th>場合</th><th>條件</th><th>效果</th></tr></thead>
            <tbody>${effects.map((effect) => `
              <tr>
                <td>${html(effect["機率"] || "-")}</td>
                <td>${html(effect["發動時機"] || "-")}</td>
                <td>${html(effect["場合"] || "-")}</td>
                <td>${html(effect["條件"] || "-")}</td>
                <td>${html(effect["效果"] || "-")}</td>
              </tr>`).join("")}</tbody>
          </table>
        </div>
      </div>`;
  }

  function abilityCards(items, empty, groupClass) {
    if (!items.length) return `<div class="empty-state small">${html(empty)}</div>`;
    return `<div class="ranger-ability-list ranger-category-box ${groupClass}">${items.map((ability) => `
      <article class="ranger-ability-card">
        <div class="ranger-icon-title">
          ${ability.icon ? `<img class="small-icon" src="${ABILITY_ICON(ability.icon)}" alt="" onerror="this.remove();">` : ""}
          <div><h4>${html(ability.name)}</h4>${description(ability.detail?.["敘述"], "preline")}</div>
        </div>
        ${abilityTable(abilityEffects(ability.detail))}
      </article>`).join("")}</div>`;
  }

  function talentTitle(title, withIcon = true, tag = "h4") {
    const normalized = text(title).replace(/\d+$/g, "");
    const isMain = text(title).includes("主要才能");
    const icon = withIcon && isMain ? `<img class="talent-icon" src="${TLT_ICON(1)}" alt="" onerror="this.remove();">` : "";
    return `<${tag} class="talent-title-with-icon">${icon}<span>${html(normalized || title)}</span></${tag}>`;
  }

  function renderMainTalent(title, content, ranger) {
    if (isNone(content)) return "";
    if (typeof content !== "object" || content === null) {
      return `<article class="ranger-talent-card">${talentTitle(title, true)}<p>${html(valueText(content))}</p></article>`;
    }
    const talentDescription = getFirstText(content, ["主要才能敘述", "敘述", "描述", "說明"])
      || getFirstText(ranger, ["主要才能敘述", "敘述", "描述", "說明"]);
    const probability = valueText(getExactValue(content, ["觸發機率", "發動機率", "機率"])) || "-";
    const conditionRows = collectMainTalentConditions(content);
    const conditions = conditionRows.length ? conditionRows : ["無特定條件"];
    const effectValue = getExactValue(content, ["增益效果", "效果", "觸發效果", "效果列表"]);
    const effects = parseMainTalentEffects(effectValue, probability);
    const conditionTable = `
      <div class="table-scroll talent-main-table-wrap">
        <table class="talent-main-table">
          <colgroup><col class="talent-main-prob-col"><col class="talent-main-condition-col"></colgroup>
          <thead><tr><th>機率</th><th>條件</th></tr></thead>
          <tbody>${conditions.map((condition, index) => `<tr>${index === 0 ? `<td rowspan="${conditions.length}" class="talent-prob-cell">${html(probability)}</td>` : ""}<td>${html(condition)}</td></tr>`).join("")}</tbody>
        </table>
      </div>`;
    const effectTable = effects.length ? `
      <div class="table-scroll talent-main-effect-wrap">
        <table class="talent-main-effect-table">
          <colgroup><col class="talent-main-prob-col"><col class="talent-main-condition-col"></colgroup>
          <thead><tr><th>機率</th><th>增益效果</th></tr></thead>
          <tbody>${effects.map((effect) => `<tr><td class="talent-prob-cell">${html(effect.probability || "-")}</td><td>${html(effect.effect || "-")}</td></tr>`).join("")}</tbody>
        </table>
      </div>` : "";
    return `<article class="ranger-talent-card">${talentTitle(title, true)}${description(talentDescription, "ranger-talent-description")}${conditionTable}${effectTable}</article>`;
  }

  function renderBoostTalent(title, content) {
    if (isNone(content)) return "";
    const rows = typeof content === "object" && content !== null
      ? Object.entries(content).filter(([, value]) => !isNone(value))
      : [["0", content]];
    if (!rows.length) return "";
    return `
      <article class="ranger-talent-card">
        ${talentTitle(title, false)}
        <div class="table-scroll talent-boost-table-wrap">
          <table class="talent-boost-table">
            <tbody>
              <tr class="talent-boost-icon-row">${rows.map(([,], index) => `<td><img class="talent-icon talent-inline-icon" src="${TLT_ICON(index + 2)}" alt="" onerror="this.remove();"></td>`).join("")}</tr>
              <tr class="talent-boost-text-row">${rows.map(([key, value]) => {
                const normalized = text(key);
                const display = /^\d+$/.test(normalized) ? valueText(value) : `${normalized}${valueText(value)}`;
                return `<td>${html(display)}</td>`;
              }).join("")}</tr>
            </tbody>
          </table>
        </div>
      </article>`;
  }

  function renderNormalTalent(title, content, ranger) {
    if (text(title).includes("主要才能")) return renderMainTalent(title, content, ranger);
    if (isNone(content)) return "";
    const body = typeof content === "object" && content !== null
      ? `<dl>${Object.entries(content).filter(([, value]) => !isNone(value)).map(([key, value]) => `<div><dt>${html(key)}</dt><dd>${html(valueText(value))}</dd></div>`).join("")}</dl>`
      : `<p>${html(valueText(content))}</p>`;
    return `<article class="ranger-talent-card">${talentTitle(title, false)}${body}</article>`;
  }

  function renderTalent(value, ranger) {
    if (isNone(value)) return "";
    if (typeof value !== "object" || value === null) return renderMainTalent("主要才能", value, ranger);
    const content = Object.entries(value)
      .map(([title, data]) => text(title).includes("強化才能")
        ? renderBoostTalent(title, data)
        : renderNormalTalent(title, data, ranger))
      .join("");
    return content ? `<div class="ranger-talent-list ranger-category-box ranger-talent-group">${content}</div>` : "";
  }

  function renderDetail(ranger, animationMeta) {
    const id = getId(ranger);
    const detailTags = [
      ranger["Ranger星數"], ranger["類型"], ranger["屬性"],
      isYes(ranger["nft角色"]) ? "NFT" : "",
      isYes(ranger["降臨關卡角色"]) ? "降臨" : ""
    ].filter(Boolean).map((value) => `<span>${html(value)}</span>`).join("");
    const stats = [
      "體力", "物理攻擊力", "魔法攻擊力", "物理防禦力", "魔法防禦力", "生產礦物費用",
      "Ranger再生產時間", "攻擊範圍", "濺射範圍", "移動速度", "攻擊速度", "技能抗性",
      "爆擊機率", "爆擊傷害", "閃避機率", "技能閃避機率", "命中率", "技能命中率"
    ].map((key) => stat(key === "Ranger再生產時間" ? "再生產時間" : key, ranger[key])).join("");

    return `
      <div class="ranger-detail-head">
        <div class="ranger-detail-image-wrap">
          <img class="ranger-detail-image" src="${RANGER_IMAGE(id)}" alt="" onerror="this.closest('.ranger-detail-image-wrap').classList.add('missing-icon'); this.remove();">
        </div>
        <div>
          <h2 id="rangerModalTitle">${html(getName(ranger))}</h2>
          <div class="ranger-tags detail-tags">${detailTags}</div>
          <p class="ranger-date">登場時間：${html(ranger["登場時間"] || "-")}</p>
          ${description(ranger["角色敘述"], "ranger-description")}
        </div>
      </div>
      <section class="detail-section"><h3>基本數值</h3><div class="ranger-stat-grid">${stats}</div></section>
      <section class="detail-section"><h3>技能</h3>${renderSkills(ranger, animationMeta)}</section>
      <section class="detail-section"><h3>能力</h3>${abilityCards(normalAbilities(ranger), "沒有能力資料。", "ranger-ability-group")}</section>
      <section class="detail-section"><h3>覺醒能力</h3>${abilityCards(awakeAbilities(ranger), "沒有覺醒能力資料。", "ranger-awake-ability-group")}</section>
      <section class="detail-section"><h3>才能</h3>${renderTalent(ranger["才能"], ranger) || `<div class="empty-state small">沒有才能資料。</div>`}</section>`;
  }

  function pruneSummaryModal(id) {
    if (!els.modalContent) return;
    const allowedStats = new Set(["魔法攻擊力", "物理攻擊力", "體力", "生產礦物費用", "攻擊範圍"]);
    els.modalContent.querySelectorAll(".ranger-stat").forEach((item) => {
      const label = item.querySelector("span")?.textContent?.trim() || "";
      if (!allowedStats.has(label)) item.remove();
    });
    els.modalContent.querySelectorAll(".ranger-skill-card .skill-meta-table-wrap").forEach((item) => item.remove());
    els.modalContent.querySelectorAll(".ranger-skill-card .table-scroll").forEach((item) => {
      if (item.querySelector(".skill-effect-table")) item.remove();
    });
    els.modalContent.querySelectorAll(".ability-effect-list").forEach((item) => item.remove());
    els.modalContent.querySelectorAll(".talent-main-table-wrap, .talent-main-effect-wrap").forEach((item) => item.remove());
    els.modalContent.querySelectorAll(".ranger-animation-section").forEach((item) => item.remove());

    const summaryArea = els.modalContent.querySelector(".ranger-detail-head > div:not(.ranger-detail-image-wrap)");
    const lastLine = summaryArea?.querySelector(".ranger-description")
      || summaryArea?.querySelector(".ranger-date")
      || summaryArea;
    if (!lastLine) return;
    const link = document.createElement("a");
    link.className = "ranger-detail-link";
    link.href = detailUrl(id);
    link.textContent = "查看詳細資料";
    lastLine.appendChild(link);
  }

  function starNumber(ranger) {
    const match = text(ranger?.["Ranger星數"]).match(/\d+/);
    return match ? Number(match[0]) : 0;
  }

  function isEvolvedRanger(ranger) {
    const label = text(ranger?.["Ranger星數"]).toLowerCase();
    return ["超進化", "終極進化", "究極進化", "ultra", "hyper", "ultimate"]
      .some((token) => label.includes(token));
  }

  function nonEvolvedRegularCap(star) {
    if (star >= 1 && star <= 5) return star * 10 + 10;
    if (star >= 6 && star <= 8) return 60 + (star - 5) * 20;
    if (star === 9) return 160;
    return 0;
  }

  function levelLimits(ranger) {
    const star = starNumber(ranger);
    const baseRegularCap = nonEvolvedRegularCap(star);
    if (!baseRegularCap) return null;
    const evolved = isEvolvedRanger(ranger);
    const regularCap = evolved ? baseRegularCap + 20 : baseRegularCap;
    return {
      star,
      evolved,
      regularCap,
      maxLevel: regularCap + (evolved ? 100 : 20)
    };
  }

  function statAtLevel(ranger, statDefinition, limits, level) {
    const base = numericValue(ranger?.[statDefinition.base]);
    if (base === null) return null;
    const normalGrowth = numericValue(ranger?.[statDefinition.normal]) ?? 0;
    const maxGrowth = numericValue(ranger?.[statDefinition.max]) ?? normalGrowth;
    if (level <= limits.regularCap) return base + (level - 1) * normalGrowth;
    return base
      + (limits.regularCap - 1) * normalGrowth
      + (level - limits.regularCap) * maxGrowth;
  }

  function levelExpansionCount(limits, level) {
    if (level <= limits.regularCap) return 0;
    const maximumCount = limits.evolved ? 20 : 4;
    return Math.min(maximumCount, Math.ceil((level - limits.regularCap) / 5));
  }

  function respawnTimeAtLevel(ranger, limits, level) {
    const baseSeconds = numericValue(ranger?.["Ranger再生產時間"]);
    if (baseSeconds === null) return null;
    const rates = limits.evolved ? EVOLVED_RESPAWN_DECREASE_RATES : GENERAL_RESPAWN_DECREASE_RATES;
    const expansionCount = levelExpansionCount(limits, level);
    const decreaseRate = rates[expansionCount] ?? rates[rates.length - 1];
    return Math.max(RESPAWN_MIN_SECONDS, baseSeconds * (1 - decreaseRate));
  }

  function levelProgress(level, maxLevel) {
    return maxLevel <= 1 ? 0 : ((level - 1) / (maxLevel - 1)) * 100;
  }

  function findStatValue(label) {
    const item = [...(els.modalContent?.querySelectorAll(".ranger-stat") || [])]
      .find((element) => element.querySelector("span")?.textContent.trim() === label);
    return item?.querySelector("strong") || null;
  }

  function updateLevelStats(ranger, limits, level) {
    const control = els.modalContent?.querySelector("[data-ranger-level-control]");
    if (!control) return;
    const output = control.querySelector(".ranger-level-output");
    const range = control.querySelector(".ranger-level-range");
    if (output) output.textContent = `${level}/${limits.maxLevel}`;
    if (range) range.setAttribute("aria-valuetext", `${level}等，共${limits.maxLevel}等`);
    control.style.setProperty("--level-progress", `${levelProgress(level, limits.maxLevel)}%`);

    STAT_GROWTH.forEach((definition) => {
      const element = findStatValue(definition.label);
      const value = statAtLevel(ranger, definition, limits, level);
      if (element && value !== null) element.textContent = formatCalculatedNumber(value);
    });

    const respawnElement = findStatValue("再生產時間");
    const respawnSeconds = respawnTimeAtLevel(ranger, limits, level);
    if (respawnElement && respawnSeconds !== null) respawnElement.textContent = formatRespawnTime(respawnSeconds);
  }

  function mountLevelControl(ranger) {
    if (!isDetailPage || !els.modalContent) return;
    const limits = levelLimits(ranger);
    const basicSection = [...els.modalContent.querySelectorAll(":scope > .detail-section")]
      .find((section) => section.querySelector(":scope > h3")?.textContent.trim() === "基本數值");
    if (!limits || !basicSection || basicSection.querySelector("[data-ranger-level-control]")) return;

    const id = getId(ranger);
    const level = Math.min(limits.maxLevel, Math.max(1, state.selectedLevels.get(id) ?? 1));
    basicSection.querySelector(":scope > h3")?.insertAdjacentHTML("afterend", `
      <div class="ranger-level-control" data-ranger-level-control data-ranger-id="${html(id)}" style="--level-progress:${levelProgress(level, limits.maxLevel)}%">
        <label class="ranger-level-label" for="rangerLevelRange">等級：<output class="ranger-level-output" for="rangerLevelRange">${level}/${limits.maxLevel}</output></label>
        <div class="ranger-level-range-wrap">
          <input id="rangerLevelRange" class="ranger-level-range" type="range" min="1" max="${limits.maxLevel}" step="1" value="${level}" aria-label="角色等級">
        </div>
      </div>`);

    const range = basicSection.querySelector(".ranger-level-range");
    range?.addEventListener("input", () => {
      const selected = Math.min(limits.maxLevel, Math.max(1, Number(range.value) || 1));
      state.selectedLevels.set(id, selected);
      updateLevelStats(ranger, limits, selected);
    });
    updateLevelStats(ranger, limits, level);
  }

  function setupDetailShell() {
    document.body.classList.add("ranger-detail-page");
    window.history.replaceState(null, "", detailUrl(detailId));
    const title = document.querySelector(".page-title h1");
    const intro = document.querySelector(".page-title p:last-child");
    if (title) title.textContent = "角色詳細資料";
    if (intro) intro.textContent = "查詢每隻角色的詳細數據。";
    document.title = "角色詳細資料｜LINE Rangers Database";

    const main = document.querySelector("main.ranger-page");
    if (!main || !els.modalContent) return;
    const backLink = document.createElement("a");
    backLink.className = "endless-back-link ranger-detail-back-link";
    backLink.href = `${rootPath}ranger/ranger/`;
    backLink.textContent = "返回角色列表";

    const status = document.createElement("div");
    status.className = "ranger-detail-loading";
    status.textContent = "角色資料載入中…";

    const content = document.createElement("section");
    content.className = "ranger-detail-content";
    content.hidden = true;
    content.appendChild(els.modalContent);
    main.append(status, content);
    detailPage = { backLink, status, content };
  }

  function revealDetailPage() {
    if (!detailPage || !els.modalContent?.children.length) return;
    const detailHead = els.modalContent.querySelector(".ranger-detail-head");
    if (detailHead && detailPage.backLink.parentElement !== detailHead) detailHead.appendChild(detailPage.backLink);
    detailPage.status.hidden = true;
    detailPage.content.hidden = false;
    document.body.classList.remove("modal-open");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function loadAnimationViewer() {
    if (!isDetailPage || document.querySelector("script[data-ranger-animation-viewer]")) return;
    const script = document.createElement("script");
    script.src = new URL("ranger-animation-viewer.js", scriptBaseUrl).href;
    script.async = false;
    script.dataset.rangerAnimationViewer = "";
    document.head.appendChild(script);
  }

  async function openRanger(id) {
    state.selectedId = id;
    const row = state.rows.find(({ ranger }) => getId(ranger) === id);
    if (!row || !els.modalContent) return false;
    const animationMeta = isDetailPage ? await loadAnimationMeta(id) : null;
    if (state.selectedId !== id) return false;

    els.modalContent.innerHTML = renderDetail(row.ranger, animationMeta);
    if (isDetailPage) {
      mountLevelControl(row.ranger);
      revealDetailPage();
    } else {
      pruneSummaryModal(id);
      if (els.modal) els.modal.hidden = false;
      document.body.classList.add("modal-open");
      if (els.modal) els.modal.scrollTop = 0;
      if (modalPanel) modalPanel.scrollTop = 0;
      els.modalContent.scrollTop = 0;
    }
    return true;
  }

  function closeModal() {
    if (!els.modal || isDetailPage) return;
    els.modal.hidden = true;
    if (els.modalContent) els.modalContent.innerHTML = "";
    document.body.classList.remove("modal-open");
  }

  function setupEvents() {
    if (!isDetailPage) {
      [els.search, els.star, els.type, els.element, els.special, els.skillEffect, els.abilityEffect, els.talentCondition, els.talentEffect]
        .forEach((element) => {
          element?.addEventListener("input", applyFilters);
          element?.addEventListener("change", applyFilters);
        });
      els.list?.addEventListener("click", (event) => {
        const card = event.target.closest?.(".ranger-card[data-ranger-id]");
        if (card) openRanger(card.dataset.rangerId || "");
      });
      els.reset?.addEventListener("click", () => {
        [els.search, els.star, els.type, els.element, els.special, els.skillEffect, els.abilityEffect, els.talentCondition, els.talentEffect]
          .forEach((element) => { if (element) element.value = ""; });
        applyFilters();
      });
      els.advancedToggle?.addEventListener("click", () => {
        if (!els.advancedFilters) return;
        const isOpen = els.advancedFilters.hidden;
        els.advancedFilters.hidden = !isOpen;
        els.advancedToggle.setAttribute("aria-expanded", String(isOpen));
        els.advancedToggle.textContent = isOpen ? "收合進階篩選 ▲" : "進階篩選 ▼";
      });
      els.close?.addEventListener("click", closeModal);
      els.modal?.addEventListener("click", (event) => {
        if (event.target === els.modal) closeModal();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && els.modal && !els.modal.hidden) closeModal();
      });
    }
  }

  async function init() {
    try {
      const [rangerResponse, abilityResponse] = await Promise.all([
        fetch(DATA_URL),
        fetch(ABILITY_DATA_URL).catch(() => null)
      ]);
      if (!rangerResponse.ok) throw new Error(`HTTP ${rangerResponse.status}`);
      const raw = await rangerResponse.json();
      state.abilityMap = abilityResponse && abilityResponse.ok ? await abilityResponse.json() : {};
      state.rows = (Array.isArray(raw) ? raw : [])
        .map((ranger, index) => ({ ranger, index, date: parseDate(ranger["登場時間"]), search: searchBlob(ranger) }))
        .sort((a, b) => (b.date - a.date) || (a.index - b.index));

      if (isDetailPage) {
        const found = await openRanger(detailId);
        if (!found && detailPage) detailPage.status.textContent = `找不到角色 ID：${detailId}`;
        return;
      }

      state.filtered = [...state.rows];
      fillSelect(els.star, state.rows.map((row) => row.ranger["Ranger星數"]));
      fillSelect(els.type, state.rows.map((row) => row.ranger["類型"]));
      fillSelect(els.element, state.rows.map((row) => row.ranger["屬性"]));
      fillSelect(els.skillEffect, state.rows.flatMap((row) => skillEffects(row.ranger)), "技能效果");
      fillSelect(els.abilityEffect, state.rows.flatMap((row) => abilityFilterValues(row.ranger)), "能力");
      fillSelect(els.talentCondition, state.rows.flatMap((row) => talentSearchCategories(row.ranger).conditions), "才能條件");
      fillSelect(els.talentEffect, state.rows.flatMap((row) => talentSearchCategories(row.ranger).effects), "才能效果");
      renderList();
    } catch (error) {
      if (isDetailPage && detailPage) {
        detailPage.status.textContent = "角色資料載入失敗，請稍後再試。";
      } else if (els.list) {
        els.list.innerHTML = `<div class="empty-state">資料載入失敗，請稍後再試。</div>`;
      }
      console.error(error);
    }
  }

  if (isDetailPage) {
    setupDetailShell();
    loadAnimationViewer();
  }
  setupEvents();
  init();
})();
