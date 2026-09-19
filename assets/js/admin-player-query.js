(() => {
  const auth = window.RangerbookAuth;
  if (!auth) return;

  const $ = (id) => document.getElementById(id);
  const panel = $("superAdminPlayerQueryPanel");
  const form = $("adminPlayerSearchForm");
  const input = $("adminPlayerSearchInput");
  const searchButton = $("adminPlayerSearchButton");
  const message = $("adminPlayerSearchMessage");
  const results = $("adminPlayerSearchResults");
  const detail = $("adminPlayerTeamResult");
  const detailTitle = $("adminPlayerTeamTitle");
  const detailMeta = $("adminPlayerTeamMeta");
  const teamsRoot = $("adminPlayerTeams");
  if (!panel || !form || !input || !results || !detail || !teamsRoot) return;

  const RANGERS_URL = "../res/Rangers_data.json";
  const GEAR_DATA_URL = "../res/%E8%A3%9D%E5%82%99%E8%B3%87%E6%96%99%E5%BA%AB.json";
  const RANGER_IMAGE = (id) => "https://rangers.lerico.net/res/" + encodeURIComponent(id) + "/" + encodeURIComponent(id) + "-thum.png";
  const GEAR_ICON = (id) => "https://rangers.lerico.net/res/gear_icon/" + encodeURIComponent(id) + "_icon.png";
  const TALENT_ICON = (grade) => "../assets/tlt_icon/tlt" + encodeURIComponent(grade) + ".png";
  const STAR_LAYER = (level, star) => "../assets/star_layer/com_level" + level + "_star" + String(star).padStart(2, "0") + ".png";
  const SLOT_LABELS = { WEAPON: "武器", ARMOR: "防具", ACC: "飾品" };
  const TEAM_LABELS = [
    ["team1", "隊伍 1"],
    ["team2", "隊伍 2"],
    ["team3", "隊伍 3"],
    ["team4", "隊伍 4"],
    ["team5", "隊伍 5"],
    ["pvpteam", "PvP 防守隊伍"],
    ["guildwar", "公會戰進攻隊伍"]
  ];

  let supportPromise = null;
  let rangerNames = {};
  let rangerStars = {};
  let gearNames = {};
  let gearStars = {};

  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setMessage(text, type) {
    if (!message) return;
    message.textContent = text || "";
    message.className = ("admin-message " + (type || "")).trim();
  }

  function starNumber(value) {
    const match = String(value == null ? "" : value).match(/\d+/);
    const star = match ? Number(match[0]) : 0;
    return Number.isInteger(star) && star >= 1 && star <= 9 ? star : 0;
  }

  function rangerStarLayer(value) {
    const raw = String(value == null ? "" : value);
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

  function firstValue(object, keys) {
    for (const key of keys) {
      const value = object && object[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return "";
  }

  async function loadSupportData() {
    if (supportPromise) return supportPromise;
    supportPromise = Promise.all([
      fetch(RANGERS_URL).then((response) => response.ok ? response.json() : []),
      fetch(GEAR_DATA_URL).then((response) => response.ok ? response.json() : [])
    ]).then(([rangers, gears]) => {
      const rangerRows = Array.isArray(rangers) ? rangers : Object.values(rangers || {});
      for (const row of rangerRows) {
        if (!row || typeof row !== "object") continue;
        const code = String(firstValue(row, ["ranger_id", "unitCode", "id", "code"]));
        if (!code) continue;
        rangerNames[code] = String(firstValue(row, ["Ranger名稱", "name", "displayName"]) || code);
        rangerStars[code] = String(firstValue(row, ["Ranger星數", "star", "grade"]));
      }

      const gearRows = Array.isArray(gears) ? gears : Object.values(gears || {});
      for (const row of gearRows) {
        if (!row || typeof row !== "object") continue;
        const code = String(firstValue(row, ["id", "gear_id", "code", "itemCode", "equipItemCode"]));
        if (!code) continue;
        gearNames[code] = String(firstValue(row, ["裝備名稱", "name", "displayName"]) || code);
        gearStars[code] = String(firstValue(row, ["裝備星級", "star", "grade"]));
      }
    }).catch((error) => {
      supportPromise = null;
      throw error;
    });
    return supportPromise;
  }

  function equipmentCode(unit, slot) {
    const value = unit && unit.equipMap && unit.equipMap[slot];
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    return String(value.itemCode || value.equipItemCode || value.code || "");
  }

  function talentCorner(unit) {
    const grade = Number(unit && unit.talentGrade);
    if (!Number.isInteger(grade) || grade < 1 || grade > 4) return "";
    return '<img class="pvp-player-unit-talent-corner" src="' + TALENT_ICON(grade) + '" alt="才能 ' + grade + '" decoding="async">';
  }

  function starImage(src, className) {
    if (!src) return '<span class="' + className + '-space" aria-hidden="true"></span>';
    return '<img class="' + className + '" src="' + esc(src) + '" alt="" decoding="async">';
  }

  function equipmentSlot(unit, slot) {
    const code = equipmentCode(unit, slot);
    const label = SLOT_LABELS[slot] || slot;
    if (!code) {
      return '<span class="pvp-player-unit-equipment-slot" title="' + esc(label) + '：未裝備">' +
        '<span class="pvp-player-unit-equipment-empty">—</span>' +
        '<span class="pvp-player-unit-equipment-star-space" aria-hidden="true"></span></span>';
    }
    const name = gearNames[code] || code;
    const star = normalStarLayer(gearStars[code]);
    return '<span class="pvp-player-unit-equipment-slot" title="' + esc(label) + '：' + esc(name) + '">' +
      '<img class="pvp-player-unit-equipment-image" src="' + GEAR_ICON(code) + '" alt="' + esc(name) + '" decoding="async" onerror="this.remove();">' +
      starImage(star, "pvp-player-unit-equipment-star") + '</span>';
  }

  function unitCard(unit) {
    const code = String(unit && unit.unitCode || "");
    const name = rangerNames[code] || code || "未知角色";
    const star = rangerStarLayer(rangerStars[code]);
    return '<article class="pvp-player-unit-button admin-player-unit-card" title="' + esc(name) + '">' +
      '<span class="pvp-player-unit-image-wrap">' +
      '<img class="pvp-player-unit-image" src="' + RANGER_IMAGE(code) + '" alt="' + esc(name) + '" decoding="async" onerror="this.remove();">' +
      talentCorner(unit) + starImage(star, "pvp-player-unit-star") +
      '</span>' +
      '<span class="pvp-player-unit-equipment-row">' +
      equipmentSlot(unit, "WEAPON") +
      equipmentSlot(unit, "ARMOR") +
      equipmentSlot(unit, "ACC") +
      '</span>' +
      '<span class="pvp-player-unit-name">' + esc(name) + '</span>' +
      '</article>';
  }

  function renderTeams(payload) {
    const teams = payload && payload.teams && typeof payload.teams === "object" ? payload.teams : {};
    detailTitle.textContent = payload && payload.name || "未公開名稱";

    const meta = [];
    if (payload && payload.guildName) meta.push("公會：" + payload.guildName);
    if (payload && payload.tier) meta.push("段位：" + payload.tier);
    if (payload && payload.uid) meta.push("UID：" + payload.uid);
    if (payload && payload.queriedAtUtc) {
      meta.push("查詢時間：" + new Date(payload.queriedAtUtc).toLocaleString("zh-Hant", { hour12: false }));
    }
    detailMeta.textContent = meta.join(" · ");

    teamsRoot.innerHTML = TEAM_LABELS.map(([key, label]) => {
      const units = Array.isArray(teams[key]) ? teams[key] : [];
      const content = units.length
        ? '<div class="pvp-player-team-grid">' + units.map(unitCard).join("") + '</div>'
        : '<div class="admin-player-team-empty">未設定隊伍或 API 未回傳資料。</div>';
      return '<section class="admin-player-team-section">' +
        '<div class="admin-player-team-heading"><h3>' + esc(label) + '</h3><span>' + units.length + ' 隻</span></div>' +
        content + '</section>';
    }).join("");

    detail.hidden = false;
    detail.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderSearchResults(payload) {
    const items = Array.isArray(payload && payload.items) ? payload.items : [];
    if (!items.length) {
      results.innerHTML = '<div class="admin-empty">找不到符合名稱的玩家。</div>';
      return;
    }

    results.innerHTML = items.map((item) => {
      return '<article class="admin-player-search-row">' +
        '<div class="admin-player-search-meta">' +
        '<strong>' + esc(item.name || "未公開名稱") + '</strong>' +
        '<small>' + esc(item.guildName || "未記錄公會") + ' · ' + esc(item.tier || "-") + '</small>' +
        '<code>' + esc(item.uid || "") + '</code>' +
        '</div>' +
        '<button class="primary" type="button" data-player-query-uid="' + esc(item.uid || "") + '">查詢隊伍</button>' +
        '</article>';
    }).join("");
  }

  async function search(event) {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) {
      setMessage("請輸入玩家名稱。", "error");
      input.focus();
      return;
    }

    searchButton.disabled = true;
    results.innerHTML = '<div class="admin-empty">搜尋中…</div>';
    detail.hidden = true;
    setMessage();

    try {
      const payload = await auth.api("/super-admin/player-search?q=" + encodeURIComponent(query) + "&limit=50");
      renderSearchResults(payload);
      const shown = payload && payload.items ? payload.items.length : 0;
      const count = payload && payload.count ? payload.count : 0;
      const suffix = count > shown ? "，顯示前 " + shown + " 筆" : "";
      setMessage("找到 " + count + " 筆符合結果" + suffix + "。", "success");
    } catch (error) {
      results.innerHTML = "";
      setMessage(error.message, "error");
    } finally {
      searchButton.disabled = false;
    }
  }

  async function queryTeams(button) {
    const uid = button && button.dataset.playerQueryUid;
    if (!uid) return;

    const buttons = [...results.querySelectorAll("button[data-player-query-uid]")];
    buttons.forEach((item) => { item.disabled = true; });
    const originalText = button.textContent;
    button.textContent = "讀取中…";
    setMessage("正在透過遊戲 API 讀取玩家目前隊伍…");
    detail.hidden = true;

    try {
      await loadSupportData();
      const payload = await auth.api("/super-admin/player-team-query", {
        method: "POST",
        body: JSON.stringify({ uid })
      });
      renderTeams(payload);
      setMessage("已更新 " + (payload.name || uid) + " 的隊伍資料。", "success");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      buttons.forEach((item) => { item.disabled = false; });
      button.textContent = originalText;
    }
  }

  function updateVisibility() {
    const visible = auth.isSuperAdmin();
    panel.hidden = !visible;
    if (!visible) {
      results.innerHTML = "";
      detail.hidden = true;
      setMessage();
    }
  }

  form.addEventListener("submit", search);
  results.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-player-query-uid]");
    if (button) queryTeams(button);
  });

  window.addEventListener("rangerbook:auth-changed", updateVisibility);
  auth.ready().then(updateVisibility);
})();
