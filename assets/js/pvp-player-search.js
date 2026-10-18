(() => {
  const auth = window.RangerbookAuth;
  if (!auth) return;
  // Only authenticated admins can load their own imported data in this mode.
  const personalMode = new URLSearchParams(window.location.search).get("personal") === "1";
  const pt = (key, fallback) => window.RangerbookI18n?.t("admin.personal.viewer." + key, fallback) || fallback;
  const pf = (key, args, fallback) => window.RangerbookI18n?.format("admin.personal.viewer." + key, args, fallback) || fallback;
  const localized = value => window.RangerbookI18n?.uiText(String(value)) || String(value);

  const $ = (id) => document.getElementById(id);
  const page = $("pvpPlayerSearchPage");
  const input = $("pvpPlayerSearchInput");
  const suggestions = $("pvpPlayerSearchSuggestions");
  const status = $("pvpPlayerSearchStatus");
  const selection = $("pvpPlayerSearchSelection");
  const selectedName = $("pvpPlayerSearchSelectedName");
  const selectedMeta = $("pvpPlayerSearchSelectedMeta");
  const teamSelect = $("pvpPlayerSearchTeamSelect");
  const result = $("pvpPlayerSearchResult");
  const teamTitle = $("pvpPlayerSearchTeamTitle");
  const teamGrid = $("pvpPlayerSearchTeamGrid");
  const unitDetail = $("pvpPlayerSearchUnitDetail");

  if (!page || !input || !suggestions || !selection || !teamSelect || !result || !teamGrid || !unitDetail) return;

  const ID_DICT_URL = "../../res/id_dict.json";
  const RANGER_DATA_URL = "../../res/Rangers_data.json";
  const GEAR_DATA_URL = "../../res/%E8%A3%9D%E5%82%99%E8%B3%87%E6%96%99%E5%BA%AB.json";
  const ABILITY_DATA_URL = "../../res/%E8%83%BD%E5%8A%9B.json";
  const EFFECT_DICT_URL = "../../res/effect_dict.json";
  const EFFECT_VISIBLE_MS = 5000;

  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
  const GEAR_ICON = (id) => `https://rangers.lerico.net/res/gear_icon/${encodeURIComponent(id)}_icon.png`;
  const ABILITY_ICON = (icon) => `https://rangers.lerico.net/res/ability_icon/${encodeURIComponent(icon)}`;
  const TALENT_ICON = (grade) => `../../assets/tlt_icon/tlt${encodeURIComponent(grade)}.png`;
  const STAR_LAYER = (level, star) => `../../assets/star_layer/com_level${level}_star${String(star).padStart(2, "0")}.png`;
  const NONE_CODE = "__NONE__";
  const SLOT_LABELS = { WEAPON: "武器", ARMOR: "防具", ACC: "飾品" };
  const TEAM_LABELS = {
    pvpteam: "PvP 防守隊伍",
    team1: "隊伍 1",
    team2: "隊伍 2",
    team3: "隊伍 3",
    team4: "隊伍 4",
    team5: "隊伍 5",
    guildwar: "公會戰進攻隊伍",
  };

  let searchTimer = 0;
  let searchSequence = 0;
  let playerQuerySequence = 0;
  let activeSuggestion = -1;
  let searchItems = [];
  let selectedPlayer = null;
  let playerPayload = null;
  let selectedUnitIndex = -1;
  let supportDataPromise = null;
  let gearNameByCode = {};
  let rangerNameByCode = {};
  let rangerStarByCode = {};
  let gearStarByCode = {};
  let abilityMap = {};
  let effectMap = {};
  const effectTimers = new WeakMap();

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function setStatus(message = "", type = "") {
    if (!status) return;
    status.textContent = message;
    status.className = `pvp-search-status ${type}`.trim();
  }

  function formatNumber(value) {
    const number = Number(value);
    return Number.isFinite(number)
      ? number.toLocaleString("zh-Hant", { maximumFractionDigits: 2 })
      : "-";
  }

  function starNumber(value) {
    const match = String(value ?? "").match(/\d+/);
    const star = match ? Number(match[0]) : 0;
    return Number.isInteger(star) && star >= 1 && star <= 9 ? star : 0;
  }

  function rangerStarLayer(value) {
    const raw = String(value ?? "");
    const star = starNumber(raw);
    if (!star) return "";
    if (star === 8 && /超進化|超進|ultra/i.test(raw)) return STAR_LAYER("04", star);
    if (star >= 6 && star <= 8 && /終極|究極|究進|ultimate|hyper/i.test(raw)) return STAR_LAYER("02", star);
    return STAR_LAYER("01", star);
  }

  function normalStarLayer(value) {
    const star = starNumber(value);
    return star ? STAR_LAYER("01", star) : "";
  }

  function parseEffectMap(data) {
    if (Array.isArray(data)) {
      return Object.fromEntries(data
        .filter((row) => row && row.attrNo !== undefined)
        .map((row) => [String(row.attrNo), String(row["效果名稱"] || row.name || row.label || row.attrNo)]));
    }
    return data && typeof data === "object" ? data : {};
  }

  async function loadSupportData() {
    if (supportDataPromise) return supportDataPromise;

    supportDataPromise = Promise.all([
      fetch(ID_DICT_URL).then((res) => res.ok ? res.json() : {}).catch(() => ({})),
      fetch(RANGER_DATA_URL).then((res) => res.ok ? res.json() : []).catch(() => ([])),
      fetch(GEAR_DATA_URL).then((res) => res.ok ? res.json() : []).catch(() => ([])),
      fetch(ABILITY_DATA_URL).then((res) => res.ok ? res.json() : {}).catch(() => ({})),
      fetch(EFFECT_DICT_URL).then((res) => res.ok ? res.json() : {}).catch(() => ({})),
    ]).then(([idDict, rangerRows, gearRows, abilityRows, effectRows]) => {
      gearNameByCode = Object.fromEntries(
        Object.entries(idDict || {}).map(([name, code]) => [String(code), String(name)])
      );
      rangerNameByCode = Object.fromEntries(
        (Array.isArray(rangerRows) ? rangerRows : [])
          .map((row) => [String(row?.ranger_id || ""), String(row?.["Ranger名稱"] || row?.ranger_id || "")])
          .filter(([code]) => code)
      );
      rangerStarByCode = Object.fromEntries(
        (Array.isArray(rangerRows) ? rangerRows : [])
          .map((row) => [String(row?.ranger_id || ""), String(row?.["Ranger星數"] || "")])
          .filter(([code]) => code)
      );
      gearStarByCode = Object.fromEntries(
        (Array.isArray(gearRows) ? gearRows : [])
          .map((row) => [String(row?.id || row?.gear_id || row?.code || ""), String(row?.["裝備星級"] || row?.["星數"] || row?.star || "")])
          .filter(([code]) => code)
      );
      abilityMap = abilityRows && typeof abilityRows === "object" ? abilityRows : {};
      effectMap = parseEffectMap(effectRows);
    }).catch((error) => {
      supportDataPromise = null;
      throw error;
    });

    return supportDataPromise;
  }

  function rangerName(code) {
    const fallback = rangerNameByCode[code] || code || (personalMode ? pt("unknownUnit","未知角色") : "未知角色");
    return window.RangerbookI18n?.unitName(code, fallback) || fallback;
  }

  function equipmentName(code, isNone) {
    if (isNone) return personalMode ? pt("noEquipment","未裝備") : "未裝備";
    const fallback = gearNameByCode[code] || code;
    return window.RangerbookI18n?.lookup("EQUIP", code + "_nm", fallback) || fallback;
  }

  function unitLevel(unit) {
    const value = [unit?.level, unit?.unitLevel, unit?.unitLv, unit?.rangerLevel]
      .find((item) => item !== undefined && item !== null && item !== "");
    return value === undefined ? "-" : formatNumber(value);
  }

  function equipmentObject(unit, slot) {
    const map = unit?.equipMap && typeof unit.equipMap === "object"
      ? unit.equipMap
      : (unit?.equipment && typeof unit.equipment === "object" ? unit.equipment : {});
    const value = map?.[slot];
    return value && typeof value === "object" ? value : null;
  }

  function equipmentCode(unit, slot) {
    const value = equipmentObject(unit, slot) ?? unit?.equipMap?.[slot] ?? unit?.equipment?.[slot];
    if (!value) return NONE_CODE;
    if (typeof value === "string") return value || NONE_CODE;
    return String(value.equipItemCode || value.itemCode || value.code || NONE_CODE);
  }

  function unitTalentCorner(unit) {
    const grade = Number(unit?.talentGrade);
    if (!Number.isInteger(grade) || grade <= 0 || grade > 4) return "";
    return `<img class="pvp-player-unit-talent-corner" src="${TALENT_ICON(grade)}" alt="" title="${escapeHtml(personalMode ? pf("talentStage",[grade],"才能解放階段 %N1") : "才能解放階段 " + grade)}" aria-hidden="true" decoding="async" onerror="this.remove();">`;
  }

  function teamStarImage(src, className) {
    return src
      ? `<img class="${className}" src="${src}" alt="" aria-hidden="true" decoding="async" onerror="this.remove();">`
      : `<span class="${className}-space" aria-hidden="true"></span>`;
  }

  function teamEquipmentSlot(unit, slot) {
    const code = equipmentCode(unit, slot);
    const isNone = !code || code === NONE_CODE;
    const name = equipmentName(code, isNone);
    const starSrc = isNone ? "" : normalStarLayer(gearStarByCode[code]);
    const icon = isNone
      ? '<span class="pvp-player-unit-equipment-image pvp-player-unit-equipment-empty" aria-hidden="true">—</span>'
      : `<img class="pvp-player-unit-equipment-image" src="${GEAR_ICON(code)}" alt="" decoding="async" onerror="this.remove();">`;
    return `<span class="pvp-player-unit-equipment-slot" title="${escapeHtml(localized(SLOT_LABELS[slot]))}：${escapeHtml(name)}">${icon}${teamStarImage(starSrc, "pvp-player-unit-equipment-star")}</span>`;
  }

  function advancedEffectName(unit, slot) {
    return window.RangerbookPlayerEquipment.effectText(equipmentObject(unit, slot), effectMap);
  }

  function equipmentItem(unit, slot) {
    const code = equipmentCode(unit, slot);
    const isNone = !code || code === NONE_CODE;
    const name = equipmentName(code, isNone);
    const effect = isNone ? "" : advancedEffectName(unit, slot);
    const icon = isNone
      ? '<span class="pvp-player-equipment-empty-icon" aria-hidden="true">—</span>'
      : `<img src="${GEAR_ICON(code)}" alt="" decoding="async" onerror="this.remove();">`;
    return `<div class="pvp-player-equipment-item" data-slot="${slot}" data-effect="${escapeHtml(localized(effect))}">${icon}<div><span>${escapeHtml(localized(SLOT_LABELS[slot]))}</span><strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong></div></div>`;
  }

  function abilityInfo(unit) {
    const code = String(unit?.awakeAbilityCode || "").trim();
    if (!code) return { name: personalMode ? pt("noAwakened","未設定覺醒能力") : "未設定覺醒能力", icon: "" };
    const info = abilityMap[code] || {};
    return {
      name: window.RangerbookI18n?.lookup("ABILITY", code + "_nm", info["名稱"] || code) || info["名稱"] || code,
      icon: info.icon || String(unit?.awakeAbilityIcon || "").trim(),
    };
  }

  function talentInfo(unit) {
    const raw = unit?.talentGrade;
    if (raw === undefined || raw === null || raw === "") {
      return { name: personalMode ? pt("talentNoData","才能解放狀態無資料") : "才能解放狀態無資料", icon: "", badge: "?" };
    }
    const grade = Number(raw);
    if (!Number.isInteger(grade) || grade < 0 || grade > 4) {
      return { name: personalMode ? pf("talentStage", [raw], "才能解放階段 %N1") : `才能解放階段 ${raw}`, icon: "", badge: String(raw) };
    }
    return {
      name: personalMode ? (grade === 0 ? pt("talentLocked","未解放才能") : pf("talentStage", [grade], "才能解放階段 %N1"))
        : (grade === 0 ? "未解放才能" : `才能解放階段 ${grade}`),
      icon: grade > 0 ? TALENT_ICON(grade) : "",
      badge: String(grade),
    };
  }

  function extraDetailItem(label, value, icon = "", badge = "") {
    const iconHtml = icon
      ? `<img class="pvp-player-extra-icon" src="${icon}" alt="" decoding="async" onerror="this.remove();">`
      : `<span class="pvp-player-extra-icon pvp-player-extra-icon-empty" aria-hidden="true">${escapeHtml(badge || "—")}</span>`;
    return `<div class="pvp-player-extra-item">${iconHtml}<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div></div>`;
  }

  function renderUnitDetail(unit) {
    if (!unit) {
      unitDetail.innerHTML = '<div class="pvp-player-unit-detail-empty">' +
        escapeHtml(personalMode ? pt("chooseUnit","點擊左側角色查看等級、Leonard 點數、覺醒能力、解放才能與裝備。")
          : "點擊左側角色查看等級、Leonard 點數、覺醒能力、解放才能與裝備。") + '</div>';
      return;
    }

    const code = String(unit.unitCode || "");
    const leonardPoint = unit.leonardPoint === undefined || unit.leonardPoint === null || unit.leonardPoint === ""
      ? "-"
      : formatNumber(unit.leonardPoint);
    const ability = abilityInfo(unit);
    const talent = talentInfo(unit);
    const abilityIcon = ability.icon ? ABILITY_ICON(ability.icon) : "";

    unitDetail.innerHTML = `
      <div class="pvp-player-unit-detail-card">
        <div class="pvp-player-unit-detail-head">
          <img src="${RANGER_IMAGE(code)}" alt="" decoding="async" onerror="this.remove();">
          <div>
            <strong>${escapeHtml(rangerName(code))}</strong>
            <span>${escapeHtml(personalMode ? pf("level",[unitLevel(unit)],"等級：Lv. %N1") : "等級：Lv. " + unitLevel(unit))}</span>
          </div>
        </div>
        <div class="pvp-player-extra-list">
          ${extraDetailItem(personalMode ? pt("leonard","Leonard 點數") : "Leonard 點數", leonardPoint, "", "L")}
          ${extraDetailItem(personalMode ? pt("awakened","覺醒能力") : "覺醒能力", ability.name, abilityIcon)}
          ${extraDetailItem(personalMode ? pt("talent","解放才能") : "解放才能", talent.name, talent.icon, talent.badge)}
        </div>
        <div class="pvp-player-equipment-list">
          ${equipmentItem(unit, "WEAPON")}
          ${equipmentItem(unit, "ARMOR")}
          ${equipmentItem(unit, "ACC")}
        </div>
      </div>`;
  }

  function currentUnits() {
    const teams = playerPayload?.teams;
    const key = teamSelect.value || "pvpteam";
    const value = teams?.[key];
    if (Array.isArray(value)) return value;
    if (personalMode && value && typeof value === "object") {
      return [...(Array.isArray(value.A) ? value.A : []), ...(Array.isArray(value.B) ? value.B : [])];
    }
    return [];
  }

  function renderTeam() {
    const key = teamSelect.value || "pvpteam";
    const units = currentUnits();
    window.RangerbookTeamAnalysis?.setUnits(units);
    teamTitle.textContent = localized(TEAM_LABELS[key] || key);
    selectedUnitIndex = -1;

    if (!units.length) {
      teamGrid.innerHTML = '<div class="pvp-player-team-empty">' + escapeHtml(personalMode ?
        pt("noUnits","這個隊伍目前沒有可顯示的角色資料。") : "這個隊伍目前沒有可顯示的角色資料。") + '</div>';
      renderUnitDetail(null);
      return;
    }

    teamGrid.innerHTML = units.map((unit, index) => {
      const code = String(unit?.unitCode || "");
      const rangerStar = rangerStarLayer(rangerStarByCode[code]);
      const personalTeam = personalMode && /^team[1-5]$/.test(key);
      const aCount = Array.isArray(playerPayload?.teams?.[key]?.A) ? playerPayload.teams[key].A.length : 0;
      const sideHeading = personalTeam && (index === 0 || index === aCount)
        ? `<h4 class="pvp-personal-side-heading">${escapeHtml(pf("side",[index < aCount ? "A" : "B"], "%N1 隊"))}</h4>`
        : "";
      return `${sideHeading}<button class="pvp-player-unit-button" type="button" data-unit-index="${index}" title="${escapeHtml(rangerName(code))}">
        <span class="pvp-player-unit-image-wrap">
          <img class="pvp-player-unit-image" src="${RANGER_IMAGE(code)}" alt="" decoding="async" onerror="this.remove();">
          ${unitTalentCorner(unit)}
          ${teamStarImage(rangerStar, "pvp-player-unit-star")}
        </span>
        <span class="pvp-player-unit-equipment-row">
          ${teamEquipmentSlot(unit, "WEAPON")}
          ${teamEquipmentSlot(unit, "ARMOR")}
          ${teamEquipmentSlot(unit, "ACC")}
        </span>
        <span class="pvp-player-unit-name">${escapeHtml(rangerName(code))}</span>
      </button>`;
    }).join("");

    renderUnitDetail(null);
  }

  function hideEffect(item) {
    const timer = effectTimers.get(item);
    if (timer) window.clearTimeout(timer);
    effectTimers.delete(item);
    item.querySelector(".pvp-player-equipment-effect")?.remove();
  }

  function showEffect(item) {
    const text = item.dataset.effect || "";
    hideEffect(item);
    if (!text) return;
    const body = item.querySelector(":scope > div");
    if (!body) return;

    const effect = document.createElement("span");
    effect.className = "pvp-player-equipment-effect";
    effect.textContent = `${window.RangerbookPlayerEquipment.label()}：${text}`;
    effect.style.display = "block";
    effect.style.marginTop = "0.2rem";
    effect.style.fontSize = "0.78rem";
    effect.style.fontWeight = "700";
    effect.style.lineHeight = "1.35";
    effect.style.whiteSpace = "normal";
    body.appendChild(effect);
    effectTimers.set(item, window.setTimeout(() => hideEffect(item), EFFECT_VISIBLE_MS));
  }

  function closeSuggestions() {
    suggestions.hidden = true;
    input.setAttribute("aria-expanded", "false");
    activeSuggestion = -1;
  }

  function renderSuggestions(items) {
    searchItems = Array.isArray(items) ? items : [];
    activeSuggestion = -1;

    if (!searchItems.length) {
      suggestions.innerHTML = '<div class="pvp-search-empty">找不到符合的玩家名稱。</div>';
      suggestions.hidden = false;
      input.setAttribute("aria-expanded", "true");
      return;
    }

    suggestions.innerHTML = searchItems.map((item, index) => {
      const context = [item.guildName, item.tier].filter(Boolean).join(" · ");
      return `<button class="pvp-search-suggestion" type="button" role="option" data-suggestion-index="${index}">
        <strong>${escapeHtml(item.name || "未公開名稱")}</strong>
        ${context ? `<small>${escapeHtml(context)}</small>` : ""}
      </button>`;
    }).join("");
    suggestions.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function setActiveSuggestion(index) {
    const buttons = [...suggestions.querySelectorAll(".pvp-search-suggestion")];
    if (!buttons.length) return;

    activeSuggestion = Math.max(0, Math.min(index, buttons.length - 1));
    buttons.forEach((button, buttonIndex) => {
      const active = buttonIndex === activeSuggestion;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    buttons[activeSuggestion]?.scrollIntoView({ block: "nearest" });
  }

  async function runSearch() {
    const query = input.value.trim();
    const sequence = ++searchSequence;

    if (!query) {
      closeSuggestions();
      setStatus();
      return;
    }

    setStatus("搜尋中…");

    try {
      const payload = await auth.api(`/super-admin/player-search?q=${encodeURIComponent(query)}&limit=50`);
      if (sequence !== searchSequence) return;
      renderSuggestions(payload?.items || []);
      setStatus(payload?.count ? `找到 ${payload.count} 筆符合結果。` : "");
    } catch (error) {
      if (sequence !== searchSequence) return;
      closeSuggestions();
      setStatus(error.message, "error");
    }
  }

  function queueSearch() {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(runSearch, 180);
  }

  async function selectPlayer(item) {
    if (!item?.uid) return;
    const querySequence = ++playerQuerySequence;

    selectedPlayer = item;
    playerPayload = null;
    window.RangerbookTeamAnalysis?.clear();
    input.value = item.name || "";
    closeSuggestions();

    selectedName.textContent = item.name || "未公開名稱";
    selectedMeta.textContent = [item.guildName, item.tier].filter(Boolean).join(" · ");
    teamSelect.value = "pvpteam";
    selection.hidden = false;
    result.hidden = false;
    teamGrid.innerHTML = '<div class="pvp-search-loading">正在讀取玩家目前隊伍…</div>';
    renderUnitDetail(null);
    setStatus("正在透過遊戲 API 讀取玩家目前隊伍…");

    try {
      const [payload] = await Promise.all([
        auth.api("/super-admin/player-team-query", {
          method: "POST",
          body: JSON.stringify({ uid: item.uid }),
        }),
        loadSupportData(),
      ]);
      if (querySequence !== playerQuerySequence || !selectedPlayer || selectedPlayer.uid !== item.uid) return;
      playerPayload = payload;
      renderTeam();
      setStatus("隊伍資料已更新。", "success");
    } catch (error) {
      if (querySequence !== playerQuerySequence || !selectedPlayer || selectedPlayer.uid !== item.uid) return;
      teamGrid.innerHTML = '<div class="pvp-player-team-empty">無法取得玩家隊伍資料。</div>';
      renderUnitDetail(null);
      setStatus(error.message, "error");
    }
  }

  input.addEventListener("input", () => {
    const currentName = selectedPlayer?.name || "";
    if (selectedPlayer && input.value !== currentName) {
      selectedPlayer = null;
      playerQuerySequence++;
      playerPayload = null;
      window.RangerbookTeamAnalysis?.clear();
      selection.hidden = true;
      result.hidden = true;
    }
    closeSuggestions();
    if (!input.value.trim()) {
      searchItems = [];
      setStatus();
      return;
    }
    queueSearch();
  });

  input.addEventListener("focus", () => {
    if (input.value.trim() && searchItems.length) {
      renderSuggestions(searchItems);
    }
  });

  input.addEventListener("keydown", (event) => {
    if (suggestions.hidden) return;

    const buttons = suggestions.querySelectorAll(".pvp-search-suggestion");
    if (!buttons.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestion(activeSuggestion < 0 ? 0 : activeSuggestion + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion(activeSuggestion < 0 ? buttons.length - 1 : activeSuggestion - 1);
    } else if (event.key === "Enter" && activeSuggestion >= 0) {
      event.preventDefault();
      selectPlayer(searchItems[activeSuggestion]);
    } else if (event.key === "Escape") {
      closeSuggestions();
    }
  });

  suggestions.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  suggestions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-suggestion-index]");
    if (!button) return;
    const index = Number(button.dataset.suggestionIndex);
    if (Number.isInteger(index) && searchItems[index]) {
      selectPlayer(searchItems[index]);
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".pvp-search-field")) closeSuggestions();
  });

  teamSelect.addEventListener("change", () => {
    if (playerPayload) renderTeam();
  });

  teamGrid.addEventListener("click", (event) => {
    const button = event.target.closest(".pvp-player-unit-button[data-unit-index]");
    if (!button) return;
    const index = Number(button.dataset.unitIndex);
    const units = currentUnits();
    if (!Number.isInteger(index) || !units[index]) return;

    selectedUnitIndex = index;
    teamGrid.querySelectorAll(".pvp-player-unit-button").forEach((item) => {
      item.classList.toggle("is-selected", item === button);
    });
    renderUnitDetail(units[index]);
  });

  unitDetail.addEventListener("click", (event) => {
    const item = event.target.closest(".pvp-player-equipment-item");
    if (!item) return;
    showEffect(item);
  });

  async function loadPersonalTeams() {
    const sequence = ++playerQuerySequence;
    selectedPlayer = null;
    playerPayload = null;
    result.hidden = false;
    teamGrid.innerHTML = '<div class="pvp-search-loading">' + escapeHtml(pt("loading","正在載入已匯入的隊伍…")) + '</div>';
    window.RangerbookTeamAnalysis?.clear();
    try {
      const [payload] = await Promise.all([
        auth.api("/admin/personal-teams"),
        loadSupportData(),
        window.RangerbookI18n?.ready,
        window.RangerbookI18n?.readyGame?.()
      ]);
      if (sequence !== playerQuerySequence || !auth.isAdmin()) return;
      playerPayload = payload?.bound ? { teams: payload.teams || {} } : null;
      if (!playerPayload) {
        result.hidden = true;
        return;
      }
      selectedName.textContent = pt("mine","我的隊伍");
      selectedMeta.textContent = pt("private","管理員私人匯入資料");
      teamSelect.value = TEAM_LABELS[teamSelect.value] ? teamSelect.value : "team1";
      selection.hidden = false;
      result.hidden = false;
      renderTeam();
      setStatus("");
    } catch (error) {
      if (sequence !== playerQuerySequence) return;
      playerPayload = null;
      window.RangerbookTeamAnalysis?.clear();
      teamGrid.innerHTML = '<div class="pvp-player-team-empty">' + escapeHtml(pt("failed","無法讀取個人隊伍。")) + '</div>';
      setStatus(error.message, "error");
    }
  }

  function reportPersonalHeight() {
    if (!personalMode || window.parent === window) return;
    window.requestAnimationFrame(() => {
      const height = Math.min(9000, Math.max(320, Math.ceil(document.documentElement.scrollHeight + 12)));
      window.parent.postMessage({ type: "rangerbook-personal-viewer-height", height }, window.location.origin);
    });
  }

  auth.ready().then(async () => {
    if (personalMode) {
      document.body.classList.add("personal-embedded");
      page.querySelector(".page-title")?.setAttribute("hidden", "");
      page.querySelector(".pvp-search-card")?.setAttribute("hidden", "");
      // Move the existing team picker out of the hidden name-search card.
      // This retains the same 7-team navigation without exposing player search.
      result.prepend(selection);
      if (!auth.isAdmin()) { page.hidden = true; return; }
      page.hidden = false;
      teamSelect.value = "team1";
      selection.hidden = true;
      result.hidden = true;
      // Search is intentionally disabled in this mode; all data is fetched
      // for the current authenticated user's own binding.
      await loadPersonalTeams();
      new ResizeObserver(reportPersonalHeight).observe(page);
      reportPersonalHeight();
      return;
    }
    if (!auth.isSuperAdmin()) {
      window.location.replace("../");
      return;
    }
    page.hidden = false;
    input.focus();
  });

  window.addEventListener("message", (event) => {
    if (!personalMode || event.origin !== window.location.origin || event.source !== window.parent) return;
    if (event.data?.type === "rangerbook-personal-refresh" && auth.isAdmin()) loadPersonalTeams();
    if (event.data?.type === "rangerbook-personal-clear") {
      playerQuerySequence++;
      playerPayload = null;
      window.RangerbookTeamAnalysis?.clear();
      teamGrid.replaceChildren();
      result.hidden = true;
    }
  });

  window.addEventListener("rangerbook:auth-changed", () => {
    if (personalMode) {
      if (!auth.isAdmin()) {
        playerQuerySequence++;
        playerPayload = null;
        result.hidden = true;
        window.RangerbookTeamAnalysis?.clear();
      }
      return;
    }
    if (!auth.isSuperAdmin()) window.location.replace("../");
  });
})();
