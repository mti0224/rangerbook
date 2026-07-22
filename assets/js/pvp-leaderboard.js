(() => {
  const DATA_URL = "https://pvp-data.warmycat.com/leaderboard.json";
  const PLAYER_TEAMS_URL = "https://pvp-data.warmycat.com/player_teams.json";
  const ID_DICT_URL = "../../res/id_dict.json";
  const RANGER_DATA_URL = "../../res/Rangers_data.json";
  const ABILITY_DATA_URL = "../../res/%E8%83%BD%E5%8A%9B.json";
  const REFRESH_MS = 5 * 60 * 1000;
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
  const GEAR_ICON = (id) => `https://rangers.lerico.net/res/gear_icon/${encodeURIComponent(id)}_icon.png`;
  const ABILITY_ICON = (icon) => `https://rangers.lerico.net/res/ability_icon/${encodeURIComponent(icon)}`;
  const TALENT_ICON = (grade) => `../../assets/tlt_icon/tlt${encodeURIComponent(grade)}.png`;
  const NONE_CODE = "__NONE__";
  const TEAM_OPTIONS = [
    ["pvpteam", "PvP 防守隊伍"],
    ["team1", "隊伍 1"],
    ["team2", "隊伍 2"],
    ["team3", "隊伍 3"],
    ["team4", "隊伍 4"],
    ["team5", "隊伍 5"],
  ];
  const SLOT_LABELS = { WEAPON: "武器", ARMOR: "防具", ACC: "飾品" };

  const elements = {
    updated: document.getElementById("pvpLeaderboardUpdated"),
    league: document.getElementById("pvpLeaderboardLeague"),
    rankingCount: document.getElementById("pvpLeaderboardCount"),
    totalCount: document.getElementById("pvpLeaderboardTotal"),
    status: document.getElementById("pvpLeaderboardStatus"),
    body: document.getElementById("pvpLeaderboardBody"),
    search: document.getElementById("pvpLeaderboardSearch"),
    modal: document.getElementById("pvpPlayerTeamModal"),
    modalContent: document.getElementById("pvpPlayerTeamModalContent"),
    modalClose: document.getElementById("pvpPlayerTeamModalClose"),
  };

  let players = [];
  let playerTeamPayload = null;
  let supportDataPromise = null;
  let gearNameByCode = {};
  let rangerNameByCode = {};
  let abilityMap = {};

  const modalState = {
    player: null,
    detail: null,
    teamKey: "pvpteam",
    selectedUnitIndex: -1,
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    return number.toLocaleString("zh-Hant", { maximumFractionDigits: 2 });
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("zh-Hant", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  }

  function rankDelta(player) {
    const rank = Number(player.rank) || 0;
    const lastRank = Number(player.lastRank) || 0;
    if (!lastRank || !rank || lastRank === rank) return "";
    const delta = lastRank - rank;
    if (delta > 0) return `<span class="pvp-rank-delta up">▲ ${delta}</span>`;
    return `<span class="pvp-rank-delta down">▼ ${Math.abs(delta)}</span>`;
  }

  function levelBadgeFile(rawLevel) {
    const value = Number(rawLevel);
    if (!Number.isFinite(value)) return "";
    if (value >= 100 && value <= 198) return "level_badge_master.png";
    if (value >= 199 && value <= 297) return "level_badge_super.png";
    if (value >= 298 && value <= 396) return "level_badge_ultra.png";
    if (value >= 397 && value <= 495) return "level_badge_legend.png";
    if (value >= 496 && value <= 594) return "level_badge_superlegend.png";
    return "";
  }

  function levelHtml(rawLevel, displayLevel, nationalFlag) {
    const levelText = displayLevel ? `Lv. ${displayLevel}` : "Lv. -";
    const flagText = nationalFlag ? ` · ${nationalFlag}` : "";
    const badgeFile = levelBadgeFile(rawLevel);
    const badge = badgeFile
      ? `<img class="pvp-level-badge" src="../../assets/level_icon/${badgeFile}" alt="" aria-hidden="true">`
      : "";
    return `<span class="pvp-player-level-line">${badge}<span>${escapeHtml(levelText + flagText)}</span></span>`;
  }

  function playerName(player) {
    return player?.availableName && player?.displayName ? player.displayName : "未公開名稱";
  }

  function renderRows() {
    if (!elements.body) return;
    const query = elements.search?.value.trim().toLowerCase() || "";
    const filtered = players.filter((player) => {
      if (!query) return true;
      return [player.displayName, player.nationalFlag, player.rank, player.score]
        .some((value) => String(value ?? "").toLowerCase().includes(query));
    });

    if (!filtered.length) {
      elements.body.innerHTML = `<tr class="pvp-empty-row"><td colspan="4">找不到符合條件的玩家。</td></tr>`;
      return;
    }

    elements.body.innerHTML = filtered.map((player) => {
      const name = playerName(player);
      return `
        <tr class="pvp-player-row" data-player-rank="${escapeHtml(player.rank)}" data-player-key="${escapeHtml(player.detailKey || "")}" tabindex="0" role="button" aria-label="查看 ${escapeHtml(name)} 的隊伍">
          <td class="pvp-rank-cell"><span class="pvp-rank-medal">${escapeHtml(player.rank)}</span>${rankDelta(player)}</td>
          <td>
            <div class="pvp-player-main">
              <div>
                <div class="pvp-player-name">${escapeHtml(name)}</div>
                <div class="pvp-player-sub">${levelHtml(player.level, player.displayLevel, player.nationalFlag)}</div>
              </div>
            </div>
          </td>
          <td class="pvp-score">${escapeHtml(formatNumber(player.score))}</td>
          <td>${escapeHtml(player.nationalFlag || "-")}</td>
        </tr>`;
    }).join("");
  }

  function renderMetadata(metadata) {
    if (elements.updated) elements.updated.textContent = formatDate(metadata.generatedAtUtc);
    if (elements.league) elements.league.textContent = metadata.league || "LEGEND";
    if (elements.rankingCount) elements.rankingCount.textContent = formatNumber(metadata.rankingCount);
    if (elements.totalCount) elements.totalCount.textContent = metadata.totalCount ? formatNumber(metadata.totalCount) : "-";
  }

  function setStatus(message = "", error = false) {
    if (!elements.status) return;
    elements.status.hidden = !message;
    elements.status.classList.toggle("error", error);
    elements.status.textContent = message;
  }

  function normalizeUnits(value) {
    if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object");
    if (!value || typeof value !== "object") return [];
    if (value.unitCode) return [value];
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b)))
      .flatMap((key) => normalizeUnits(value[key]));
  }

  function teamUnits(detail, teamKey) {
    return normalizeUnits(detail?.teams?.[teamKey] ?? detail?.[teamKey]);
  }

  function rangerName(unitCode) {
    return rangerNameByCode[unitCode] || unitCode || "未知角色";
  }

  function unitLevel(unit) {
    const candidates = [unit?.level, unit?.unitLevel, unit?.unitLv, unit?.rangerLevel];
    const value = candidates.find((item) => item !== undefined && item !== null && item !== "");
    return value === undefined ? "-" : formatNumber(value);
  }

  function equipmentCode(unit, slot) {
    const equipMap = unit?.equipMap && typeof unit.equipMap === "object" ? unit.equipMap : (unit?.equipment || {});
    const value = equipMap?.[slot];
    if (!value) return NONE_CODE;
    if (typeof value === "string") return value || NONE_CODE;
    if (typeof value === "object") {
      return String(value.equipItemCode || value.itemCode || value.code || NONE_CODE);
    }
    return NONE_CODE;
  }

  function equipmentItem(unit, slot) {
    const code = equipmentCode(unit, slot);
    const isNone = !code || code === NONE_CODE;
    const name = isNone ? "未裝備" : (gearNameByCode[code] || code);
    const icon = isNone
      ? `<span class="pvp-player-equipment-empty-icon" aria-hidden="true">—</span>`
      : `<img src="${GEAR_ICON(code)}" alt="" loading="lazy" onerror="this.remove();">`;
    return `<div class="pvp-player-equipment-item">${icon}<div><span>${escapeHtml(SLOT_LABELS[slot])}</span><strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong></div></div>`;
  }

  function abilityInfo(unit) {
    const code = String(unit?.awakeAbilityCode || "").trim();
    if (!code) return { name: "未設定覺醒能力", icon: "" };
    const info = abilityMap[code] || {};
    return {
      name: info["名稱"] || code,
      icon: info.icon || String(unit?.awakeAbilityIcon || "").trim(),
    };
  }

  function talentInfo(unit) {
    const raw = unit?.talentGrade;
    if (raw === undefined || raw === null || raw === "") {
      return { name: "才能解放狀態無資料", icon: "", badge: "?" };
    }
    const grade = Number(raw);
    if (!Number.isInteger(grade) || grade < 0 || grade > 4) {
      return { name: `才能解放階段 ${raw}`, icon: "", badge: String(raw) };
    }
    return {
      name: grade === 0 ? "未解放才能" : `才能解放階段 ${grade}`,
      icon: TALENT_ICON(grade),
      badge: String(grade),
    };
  }

  function extraDetailItem(label, value, icon = "", badge = "") {
    const iconHtml = icon
      ? `<img class="pvp-player-extra-icon" src="${icon}" alt="" loading="lazy" onerror="this.remove();">`
      : `<span class="pvp-player-extra-icon pvp-player-extra-icon-empty" aria-hidden="true">${escapeHtml(badge || "—")}</span>`;
    return `<div class="pvp-player-extra-item">${iconHtml}<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div></div>`;
  }

  function renderUnitDetail(unit) {
    const target = document.getElementById("pvpPlayerUnitDetail");
    if (!target) return;
    if (!unit) {
      target.innerHTML = `<div class="pvp-player-unit-detail-empty">點擊左側角色查看等級、Leonard 點數、覺醒能力、解放才能與裝備。</div>`;
      return;
    }

    const unitCode = String(unit.unitCode || "");
    const leonardPoint = unit.leonardPoint === undefined || unit.leonardPoint === null || unit.leonardPoint === ""
      ? "-"
      : formatNumber(unit.leonardPoint);
    const ability = abilityInfo(unit);
    const talent = talentInfo(unit);
    const abilityIcon = ability.icon ? ABILITY_ICON(ability.icon) : "";

    target.innerHTML = `
      <div class="pvp-player-unit-detail-card">
        <div class="pvp-player-unit-detail-head">
          <img src="${RANGER_IMAGE(unitCode)}" alt="" loading="lazy" onerror="this.remove();">
          <div>
            <strong>${escapeHtml(rangerName(unitCode))}</strong>
            <span>等級：Lv. ${escapeHtml(unitLevel(unit))}</span>
          </div>
        </div>
        <div class="pvp-player-extra-list">
          ${extraDetailItem("Leonard 點數", leonardPoint, "", "L")}
          ${extraDetailItem("覺醒能力", ability.name, abilityIcon)}
          ${extraDetailItem("解放才能", talent.name, talent.icon, talent.badge)}
        </div>
        <div class="pvp-player-equipment-list">
          ${equipmentItem(unit, "WEAPON")}
          ${equipmentItem(unit, "ARMOR")}
          ${equipmentItem(unit, "ACC")}
        </div>
      </div>`;
  }

  function renderTeamGrid() {
    const target = document.getElementById("pvpPlayerTeamGrid");
    if (!target) return;
    const units = teamUnits(modalState.detail, modalState.teamKey);
    modalState.selectedUnitIndex = -1;

    if (!units.length) {
      target.innerHTML = `<div class="pvp-player-team-empty">這個隊伍目前沒有可顯示的角色資料。</div>`;
      renderUnitDetail(null);
      return;
    }

    target.innerHTML = units.map((unit, index) => {
      const unitCode = String(unit.unitCode || "");
      return `
        <button class="pvp-player-unit-button" type="button" data-unit-index="${index}" title="${escapeHtml(rangerName(unitCode))}">
          <img class="pvp-player-unit-image" src="${RANGER_IMAGE(unitCode)}" alt="" loading="lazy" onerror="this.remove();">
          <span class="pvp-player-unit-name">${escapeHtml(rangerName(unitCode))}</span>
        </button>`;
    }).join("");
    renderUnitDetail(null);
  }

  function renderModal() {
    if (!elements.modalContent || !modalState.player || !modalState.detail) return;
    const player = modalState.player;
    const optionHtml = TEAM_OPTIONS.map(([value, label]) =>
      `<option value="${value}" ${value === modalState.teamKey ? "selected" : ""}>${escapeHtml(label)}</option>`
    ).join("");

    elements.modalContent.innerHTML = `
      <header class="pvp-player-team-header">
        <h2 id="pvpPlayerTeamModalTitle">${escapeHtml(playerName(player))}</h2>
        <p>排名 #${escapeHtml(player.rank)} · ${escapeHtml(formatNumber(player.score))} 分</p>
        <div class="pvp-player-team-toolbar">
          <label><span>顯示隊伍</span><select id="pvpPlayerTeamSelect">${optionHtml}</select></label>
        </div>
      </header>
      <div class="pvp-player-team-layout">
        <section class="pvp-player-team-pane">
          <h3>隊伍角色</h3>
          <div id="pvpPlayerTeamGrid" class="pvp-player-team-grid"></div>
        </section>
        <aside class="pvp-player-unit-detail">
          <h3>角色詳細資料</h3>
          <div id="pvpPlayerUnitDetail"></div>
        </aside>
      </div>`;
    renderTeamGrid();
  }

  function findPlayerDetail(player) {
    const source = playerTeamPayload?.players;
    if (!source) return null;

    if (!Array.isArray(source) && typeof source === "object") {
      if (player.detailKey && source[player.detailKey]) return source[player.detailKey];
      const values = Object.values(source).filter((item) => item && typeof item === "object");
      return values.find((item) => Number(item.rank) === Number(player.rank)) || null;
    }

    if (Array.isArray(source)) {
      if (player.detailKey) {
        const byKey = source.find((item) => String(item?.detailKey || "") === String(player.detailKey));
        if (byKey) return byKey;
      }
      return source.find((item) => Number(item?.rank) === Number(player.rank)) || null;
    }

    return null;
  }

  function loadSupportData() {
    if (supportDataPromise) return supportDataPromise;
    supportDataPromise = Promise.all([
      fetch(`${PLAYER_TEAMS_URL}?t=${Date.now()}`, { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`player_teams HTTP ${res.status}`);
        return res.json();
      }),
      fetch(ID_DICT_URL).then((res) => res.ok ? res.json() : {}).catch(() => ({})),
      fetch(RANGER_DATA_URL).then((res) => res.ok ? res.json() : []).catch(() => ([])),
      fetch(ABILITY_DATA_URL).then((res) => res.ok ? res.json() : {}).catch(() => ({})),
    ]).then(([teamPayload, idDict, rangerRows, abilityRows]) => {
      playerTeamPayload = teamPayload && typeof teamPayload === "object" ? teamPayload : {};
      gearNameByCode = Object.fromEntries(
        Object.entries(idDict || {}).map(([name, code]) => [String(code), String(name)])
      );
      rangerNameByCode = Object.fromEntries(
        (Array.isArray(rangerRows) ? rangerRows : [])
          .map((row) => [String(row?.ranger_id || ""), String(row?.["Ranger名稱"] || row?.ranger_id || "")])
          .filter(([code]) => code)
      );
      abilityMap = abilityRows && typeof abilityRows === "object" ? abilityRows : {};
      return playerTeamPayload;
    }).catch((error) => {
      supportDataPromise = null;
      throw error;
    });
    return supportDataPromise;
  }

  async function openPlayerModal(player) {
    if (!elements.modal || !elements.modalContent) return;
    modalState.player = player;
    modalState.detail = null;
    modalState.teamKey = "pvpteam";
    modalState.selectedUnitIndex = -1;
    elements.modal.hidden = false;
    document.body.classList.add("modal-open");
    elements.modalContent.innerHTML = `<div class="pvp-status">玩家隊伍資料載入中…</div>`;

    try {
      await loadSupportData();
      const detail = findPlayerDetail(player);
      if (!detail) {
        elements.modalContent.innerHTML = `
          <header class="pvp-player-team-header">
            <h2 id="pvpPlayerTeamModalTitle">${escapeHtml(playerName(player))}</h2>
            <p>排名 #${escapeHtml(player.rank)} · ${escapeHtml(formatNumber(player.score))} 分</p>
          </header>
          <div class="pvp-player-unit-detail-empty">這名玩家的隊伍詳細資料尚未產生，請等待下一次完整 PvP 資料更新。</div>`;
        return;
      }
      modalState.detail = detail;
      renderModal();
    } catch (error) {
      console.error("PvP player team detail load failed", error);
      elements.modalContent.innerHTML = `<div class="pvp-status error">玩家隊伍詳細資料目前無法載入。</div>`;
    }
  }

  function closePlayerModal() {
    if (!elements.modal) return;
    elements.modal.hidden = true;
    document.body.classList.remove("modal-open");
    modalState.player = null;
    modalState.detail = null;
    modalState.selectedUnitIndex = -1;
  }

  async function load() {
    setStatus("排行榜資料載入中…");
    try {
      const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      players = Array.isArray(data.players) ? data.players : [];
      renderMetadata(data.metadata || {});
      renderRows();
      setStatus();
    } catch (error) {
      console.error("PvP leaderboard load failed", error);
      setStatus("排行榜資料尚未產生或目前無法載入。", true);
      if (elements.body) elements.body.innerHTML = "";
    }
  }

  elements.search?.addEventListener("input", renderRows);

  elements.body?.addEventListener("click", (event) => {
    const row = event.target.closest(".pvp-player-row[data-player-rank]");
    if (!row) return;
    const player = players.find((item) => Number(item.rank) === Number(row.dataset.playerRank));
    if (player) openPlayerModal(player);
  });

  elements.body?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest(".pvp-player-row[data-player-rank]");
    if (!row) return;
    event.preventDefault();
    const player = players.find((item) => Number(item.rank) === Number(row.dataset.playerRank));
    if (player) openPlayerModal(player);
  });

  elements.modalContent?.addEventListener("change", (event) => {
    if (event.target.id !== "pvpPlayerTeamSelect") return;
    modalState.teamKey = event.target.value || "pvpteam";
    renderTeamGrid();
  });

  elements.modalContent?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-unit-index]");
    if (!button || !modalState.detail) return;
    const index = Number(button.dataset.unitIndex);
    const units = teamUnits(modalState.detail, modalState.teamKey);
    const unit = units[index];
    if (!unit) return;
    modalState.selectedUnitIndex = index;
    elements.modalContent.querySelectorAll(".pvp-player-unit-button").forEach((item) => {
      item.classList.toggle("is-selected", item === button);
    });
    renderUnitDetail(unit);
  });

  elements.modalClose?.addEventListener("click", closePlayerModal);
  elements.modal?.querySelector("[data-pvp-player-modal-close]")?.addEventListener("click", closePlayerModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.modal && !elements.modal.hidden) closePlayerModal();
  });

  load();
  window.setInterval(load, REFRESH_MS);
})();