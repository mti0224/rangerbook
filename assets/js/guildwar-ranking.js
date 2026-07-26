(() => {
  const DATA_URL = "https://pvp-data.warmycat.com/guildwar_ranking.json";
  const COMPACT_URLS = {
    LEGEND: "https://pvp-data.warmycat.com/guildwar_data_LEGEND.json",
    MASTER: "https://pvp-data.warmycat.com/guildwar_data_MASTER.json",
    DIAMOND: "https://pvp-data.warmycat.com/guildwar_data_DIAMOND.json",
  };
  const RANGERS_URL = "../../res/Rangers_data.json";
  const ID_DICT_URL = "../../res/id_dict.json";
  const ABILITY_URL = "../../res/%E8%83%BD%E5%8A%9B.json";
  const EFFECT_DICT_URL = "../../res/effect_dict.json";
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
  const GEAR_ICON = (id) => `https://rangers.lerico.net/res/gear_icon/${encodeURIComponent(id)}_icon.png`;
  const ABILITY_ICON = (icon) => `https://rangers.lerico.net/res/ability_icon/${encodeURIComponent(icon)}`;
  const TALENT_ICON = (grade) => `../../assets/tlt_icon/tlt${encodeURIComponent(grade)}.png`;
  const NONE_CODE = "__NONE__";
  const EFFECT_VISIBLE_MS = 5000;
  const SLOT_LABELS = { WEAPON: "武器", ARMOR: "防具", ACC: "飾品" };
  const ADMIN_MODE = localStorage.getItem("rangerbook-admin-mode") === "true";
  const TIERS = {
    LEGEND: { label: "傳奇", min: 1, max: 50, teamData: true },
    MASTER: { label: "大師", min: 51, max: 200, teamData: true },
    DIAMOND: { label: "鑽石", min: 201, max: 400, teamData: false },
  };

  const els = {
    updated: document.getElementById("guildRankingUpdated"),
    count: document.getElementById("guildRankingCount"),
    tier: document.getElementById("guildRankingTier"),
    tierLabel: document.getElementById("guildRankingTierLabel"),
    search: document.getElementById("guildRankingSearch"),
    status: document.getElementById("guildRankingStatus"),
    body: document.getElementById("guildRankingBody"),
    modal: document.getElementById("guildMemberModal"),
    modalContent: document.getElementById("guildMemberModalContent"),
    modalClose: document.getElementById("guildMemberModalClose"),
  };

  let guilds = [];
  let rangerNames = {};
  let gearNames = {};
  let abilityMap = {};
  let effectMap = {};
  let openGuildRank = 0;
  let currentUnits = [];
  const tierDataCache = new Map();
  const effectTimers = new WeakMap();

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const num = (value) => Number.isFinite(Number(value))
    ? Number(value).toLocaleString("zh-Hant", { maximumFractionDigits: 2 }) : "-";
  const date = (value) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "-" : new Intl.DateTimeFormat("zh-Hant", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
      minute: "2-digit", second: "2-digit", hour12: false,
    }).format(d);
  };
  const status = (text = "", error = false) => {
    if (!els.status) return;
    els.status.hidden = !text;
    els.status.textContent = text;
    els.status.classList.toggle("error", error);
  };

  const currentTierCode = () => els.tier?.value || "LEGEND";
  const currentTier = () => TIERS[currentTierCode()] || TIERS.LEGEND;
  const tierGuilds = () => {
    const tier = currentTier();
    return guilds.filter((guild) => Number(guild.rank) >= tier.min && Number(guild.rank) <= tier.max);
  };
  const memberName = (member) => member?.displayName || member?.name || member?.playerName || "未公開名稱";
  const memberRawLevel = (member) => Number(member?.level ?? member?.playerLevel ?? 0) || 0;

  function displayLevel(rawLevel) {
    const value = Number(rawLevel);
    if (!Number.isFinite(value) || value <= 0) return "-";
    return ((Math.floor(value) - 1) % 99) + 1;
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

  function memberLevelHtml(member) {
    const raw = memberRawLevel(member);
    const badgeFile = levelBadgeFile(raw);
    const badge = badgeFile
      ? `<img class="guildwar-member-level-badge" src="../../assets/level_icon/${badgeFile}" alt="" aria-hidden="true">`
      : "";
    return `<span class="guildwar-member-level-line">${badge}<span>Lv. ${esc(displayLevel(raw))}</span></span>`;
  }

  function render() {
    const query = (els.search?.value || "").trim().toLowerCase();
    const tier = currentTier();
    const scoped = tierGuilds();
    const rows = scoped.filter((guild) => !query || String(guild.guildName || "").toLowerCase().includes(query));
    if (els.tierLabel) els.tierLabel.textContent = tier.label;
    if (els.count) els.count.textContent = num(scoped.length);
    if (!els.body) return;
    els.body.innerHTML = rows.length ? rows.map((guild) => `
      <tr class="guildwar-rank-row" data-guild-rank="${esc(guild.rank)}" tabindex="0" role="button">
        <td class="pvp-rank-cell"><span class="pvp-rank-medal">${esc(guild.rank)}</span></td>
        <td><strong title="${esc(guild.guildName || "-")}">${esc(guild.guildName || "-")}</strong></td>
        <td>${num(guild.score)}</td>
        <td>${num(guild.curMemberCount)} / ${num(guild.maxMemberCount)}</td>
        <td>${esc(guild.nationalFlag || "-")}</td>
      </tr>`).join("") : `<tr class="pvp-empty-row"><td colspan="5">目前沒有${esc(tier.label)}段位的公會資料。</td></tr>`;
  }

  async function loadTierData(code) {
    if (tierDataCache.has(code)) return tierDataCache.get(code);
    const url = COMPACT_URLS[code];
    if (!url) return {};
    const promise = fetch(`${url}?t=${Date.now()}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : {})
      .catch(() => ({}));
    tierDataCache.set(code, promise);
    return promise;
  }

  function compactGuild(data, rank) {
    return (Array.isArray(data?.guilds) ? data.guilds : [])
      .find((guild) => Number(guild.rank) === Number(rank)) || null;
  }

  function normalizeUnits(value) {
    if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object" && item.unitCode);
    if (!value || typeof value !== "object") return [];
    if (value.unitCode) return [value];
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b)))
      .flatMap((key) => normalizeUnits(value[key]));
  }

  function rangerName(code) {
    return rangerNames[code] || code || "未知角色";
  }

  function unitLevel(unit) {
    const value = [unit?.level, unit?.unitLevel, unit?.unitLv, unit?.rangerLevel]
      .find((item) => item !== undefined && item !== null && item !== "");
    return value === undefined ? "-" : num(value);
  }

  function unitTalentIcon(unit) {
    const grade = Number(unit?.talentGrade);
    if (!Number.isInteger(grade) || grade <= 0 || grade > 4) return "";
    return `<img class="guildwar-unit-talent-icon" src="${TALENT_ICON(grade)}" alt="" aria-hidden="true" decoding="async" onerror="this.remove();">`;
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

  function effectName(code) {
    if (code === undefined || code === null || code === "") return "";
    const value = effectMap[String(code)];
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      return String(value["效果名稱"] || value["名稱"] || value.name || value.label || "");
    }
    return "";
  }

  function equipmentItem(unit, slot) {
    const code = equipmentCode(unit, slot);
    const isNone = !code || code === NONE_CODE;
    const name = isNone ? "未裝備" : (gearNames[code] || code);
    const effect = isNone ? "" : effectName(equipmentObject(unit, slot)?.attr4No);
    const icon = isNone
      ? `<span class="pvp-player-equipment-empty-icon" aria-hidden="true">—</span>`
      : `<img src="${GEAR_ICON(code)}" alt="" decoding="async" onerror="this.remove();">`;
    return `<div class="pvp-player-equipment-item" data-slot="${slot}" data-effect="${esc(effect)}">${icon}<div><span>${SLOT_LABELS[slot]}</span><strong title="${esc(name)}">${esc(name)}</strong></div></div>`;
  }

  function hideEffect(item) {
    const timer = effectTimers.get(item);
    if (timer) window.clearTimeout(timer);
    effectTimers.delete(item);
    item.querySelector(".pvp-player-equipment-effect")?.remove();
  }

  function showEffect(item) {
    const text = item?.dataset?.effect || "";
    hideEffect(item);
    if (!text) return;
    const body = item.querySelector(":scope > div");
    if (!body) return;
    const effect = document.createElement("span");
    effect.className = "pvp-player-equipment-effect";
    effect.textContent = `高級效果：${text}`;
    effect.style.display = "block";
    effect.style.marginTop = "0.2rem";
    effect.style.fontSize = "0.78rem";
    effect.style.fontWeight = "700";
    effect.style.lineHeight = "1.35";
    effect.style.whiteSpace = "normal";
    effect.style.overflow = "visible";
    effect.style.textOverflow = "clip";
    body.appendChild(effect);
    effectTimers.set(item, window.setTimeout(() => hideEffect(item), EFFECT_VISIBLE_MS));
  }

  function abilityInfo(unit) {
    const code = String(unit?.awakeAbilityCode || "").trim();
    if (!code) return { name: "未設定覺醒能力", icon: "" };
    const info = abilityMap[code] || {};
    return { name: info["名稱"] || code, icon: info.icon || String(unit?.awakeAbilityIcon || "").trim() };
  }

  function talentInfo(unit) {
    const raw = unit?.talentGrade;
    if (raw === undefined || raw === null || raw === "") return { name: "才能解放狀態無資料", icon: "", badge: "?" };
    const grade = Number(raw);
    if (!Number.isInteger(grade) || grade < 0 || grade > 4) return { name: `才能解放階段 ${raw}`, icon: "", badge: String(raw) };
    return { name: grade === 0 ? "未解放才能" : `才能解放階段 ${grade}`, icon: TALENT_ICON(grade), badge: String(grade) };
  }

  function extraDetailItem(label, value, icon = "", badge = "") {
    const iconHtml = icon
      ? `<img class="pvp-player-extra-icon" src="${icon}" alt="" decoding="async" onerror="this.remove();">`
      : `<span class="pvp-player-extra-icon pvp-player-extra-icon-empty" aria-hidden="true">${esc(badge || "—")}</span>`;
    return `<div class="pvp-player-extra-item">${iconHtml}<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div></div>`;
  }

  function renderUnitDetail(unit) {
    const target = document.getElementById("guildwarPlayerUnitDetail");
    if (!target) return;
    if (!unit) {
      target.innerHTML = `<div class="pvp-player-unit-detail-empty">點擊左側角色查看等級、覺醒能力、解放才能與裝備。</div>`;
      return;
    }
    const code = String(unit.unitCode || "");
    const ability = abilityInfo(unit);
    const talent = talentInfo(unit);
    const abilityIcon = ability.icon ? ABILITY_ICON(ability.icon) : "";
    target.innerHTML = `
      <div class="pvp-player-unit-detail-card">
        <div class="pvp-player-unit-detail-head">
          <img src="${RANGER_IMAGE(code)}" alt="" decoding="async" onerror="this.remove();">
          <div><strong>${esc(rangerName(code))}</strong><span>等級：Lv. ${esc(unitLevel(unit))}</span></div>
        </div>
        <div class="pvp-player-extra-list">
          ${extraDetailItem("覺醒能力", ability.name, abilityIcon)}
          ${extraDetailItem("解放才能", talent.name, talent.icon, talent.badge)}
        </div>
        <div class="pvp-player-equipment-list">
          ${equipmentItem(unit, "WEAPON")}${equipmentItem(unit, "ARMOR")}${equipmentItem(unit, "ACC")}
        </div>
      </div>`;
  }

  async function renderGuildMembers(guild) {
    els.modalContent.innerHTML = `<div class="guildwar-member-empty">公會成員資料載入中…</div>`;
    const data = await loadTierData(currentTierCode());
    const detail = compactGuild(data, guild.rank);
    const source = Array.isArray(detail?.members) ? detail.members : [];
    const members = source.map((member, index) => ({ member, index }))
      .sort((a, b) => memberRawLevel(b.member) - memberRawLevel(a.member)
        || memberName(a.member).localeCompare(memberName(b.member), "zh-Hant"));
    const canViewTeams = ADMIN_MODE && currentTier().teamData;
    const list = members.length ? `<div class="guildwar-member-list">${members.map(({ member, index }) => `
      <div class="guildwar-member-row">
        <div>
          <div class="guildwar-member-name">${esc(memberName(member))}</div>
          <div class="guildwar-member-level">${memberLevelHtml(member)}</div>
        </div>
        ${canViewTeams ? `<button class="guildwar-member-team-button" type="button" data-member-team-index="${index}">查看進攻隊伍</button>` : ""}
      </div>`).join("")}</div>` : `<div class="guildwar-member-empty">此公會的成員資料尚未產生。</div>`;
    els.modalContent.innerHTML = `<header class="guildwar-member-header"><h2 id="guildMemberModalTitle">${esc(guild.guildName || "-")}</h2><p>排名第 ${num(guild.rank)} 名 · ${num(guild.curMemberCount)} / ${num(guild.maxMemberCount)} 名成員</p></header>${list}`;
  }

  async function renderMemberTeam(index) {
    if (!currentTier().teamData) return;
    const guild = guilds.find((item) => Number(item.rank) === openGuildRank);
    if (!guild) return;
    const data = await loadTierData(currentTierCode());
    const detail = compactGuild(data, openGuildRank);
    const member = Array.isArray(detail?.members) ? detail.members[index] : null;
    if (!member) return;
    currentUnits = normalizeUnits(member.guildwar);
    const content = currentUnits.length ? `
      <div class="pvp-player-team-layout">
        <section class="pvp-player-team-pane">
          <h3>隊伍角色</h3>
          <div id="guildwarPlayerTeamGrid" class="pvp-player-team-grid">${currentUnits.map((unit, unitIndex) => {
            const code = String(unit.unitCode || "");
            return `<button class="pvp-player-unit-button" type="button" data-guildwar-unit-index="${unitIndex}" title="${esc(rangerName(code))}"><img class="pvp-player-unit-image" src="${RANGER_IMAGE(code)}" alt="" decoding="async" onerror="this.remove();"><span class="guildwar-unit-name-line">${unitTalentIcon(unit)}<span class="pvp-player-unit-name">${esc(rangerName(code))}</span></span></button>`;
          }).join("")}</div>
        </section>
        <aside class="pvp-player-unit-detail"><h3>角色詳細資料</h3><div id="guildwarPlayerUnitDetail"></div></aside>
      </div>` : `<div class="guildwar-member-empty">此成員目前沒有可顯示的公會戰進攻隊伍資料。</div>`;
    els.modalContent.innerHTML = `
      <button class="guildwar-team-back" type="button" data-team-back>← 返回成員列表</button>
      <header class="guildwar-member-header"><h2 id="guildMemberModalTitle">${esc(memberName(member))}</h2><p>${esc(guild.guildName || "-")} · ${memberLevelHtml(member)}</p></header>${content}`;
    if (currentUnits.length) renderUnitDetail(null);
  }

  function openGuild(guild) {
    if (!guild || !els.modal) return;
    openGuildRank = Number(guild.rank) || 0;
    currentUnits = [];
    els.modal.hidden = false;
    document.body.classList.add("modal-open");
    renderGuildMembers(guild);
  }

  function closeModal() {
    if (!els.modal || els.modal.hidden) return;
    els.modal.hidden = true;
    document.body.classList.remove("modal-open");
    currentUnits = [];
  }

  function guildFromRow(row) {
    const rank = Number(row?.dataset?.guildRank);
    return guilds.find((guild) => Number(guild.rank) === rank);
  }

  async function optional(url, fallback) {
    try {
      const response = await fetch(url);
      return response.ok ? response.json() : fallback;
    } catch {
      return fallback;
    }
  }

  function parseEffectMap(data) {
    if (Array.isArray(data)) {
      return Object.fromEntries(data
        .filter((row) => row && row.attrNo !== undefined)
        .map((row) => [String(row.attrNo), String(row["效果名稱"] || row.name || row.label || row.attrNo)]));
    }
    return data && typeof data === "object" ? data : {};
  }

  function preloadTalentIcons() {
    for (let grade = 0; grade <= 4; grade += 1) {
      const image = new Image();
      image.src = TALENT_ICON(grade);
    }
  }

  async function load() {
    status("公會排名資料載入中…");
    try {
      const requests = [fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" })];
      if (ADMIN_MODE) {
        requests.push(
          optional(RANGERS_URL, []),
          optional(ID_DICT_URL, {}),
          optional(ABILITY_URL, {}),
          optional(EFFECT_DICT_URL, {}),
        );
      }
      const results = await Promise.all(requests);
      const rankingRes = results[0];
      if (!rankingRes.ok) throw new Error(`HTTP ${rankingRes.status}`);
      const data = await rankingRes.json();
      guilds = Array.isArray(data.guilds) ? data.guilds : [];
      if (ADMIN_MODE) {
        rangerNames = {};
        (Array.isArray(results[1]) ? results[1] : []).forEach((row) => {
          const code = String(row.ranger_id || "");
          if (code) rangerNames[code] = String(row["Ranger名稱"] || code);
        });
        gearNames = Object.fromEntries(Object.entries(results[2] || {}).map(([name, code]) => [String(code), String(name)]));
        abilityMap = results[3] && typeof results[3] === "object" ? results[3] : {};
        effectMap = parseEffectMap(results[4]);
      }
      if (els.updated) els.updated.textContent = date(data.metadata?.generatedAtUtc);
      status();
      render();
    } catch (error) {
      console.error(error);
      status("公會排名資料尚未產生或目前無法載入。", true);
      if (els.body) els.body.innerHTML = "";
    }
  }

  els.search?.addEventListener("input", render);
  els.tier?.addEventListener("change", () => {
    closeModal();
    render();
  });
  els.body?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-guild-rank]");
    if (row) openGuild(guildFromRow(row));
  });
  els.body?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("[data-guild-rank]");
    if (row) {
      event.preventDefault();
      openGuild(guildFromRow(row));
    }
  });
  els.modalContent?.addEventListener("click", (event) => {
    const equipment = event.target.closest(".pvp-player-equipment-item");
    if (equipment) {
      showEffect(equipment);
      return;
    }
    const memberButton = event.target.closest("[data-member-team-index]");
    if (memberButton && ADMIN_MODE && currentTier().teamData) {
      renderMemberTeam(Number(memberButton.dataset.memberTeamIndex));
      return;
    }
    const unitButton = event.target.closest("[data-guildwar-unit-index]");
    if (unitButton) {
      const index = Number(unitButton.dataset.guildwarUnitIndex);
      els.modalContent.querySelectorAll("[data-guildwar-unit-index]").forEach((button) => button.classList.remove("is-selected"));
      unitButton.classList.add("is-selected");
      renderUnitDetail(currentUnits[index]);
      return;
    }
    if (event.target.closest("[data-team-back]")) {
      currentUnits = [];
      const guild = guilds.find((item) => Number(item.rank) === openGuildRank);
      if (guild) renderGuildMembers(guild);
    }
  });
  els.modalClose?.addEventListener("click", closeModal);
  els.modal?.addEventListener("click", (event) => {
    if (event.target.closest("[data-guild-member-modal-close]")) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  preloadTalentIcons();
  load();
})();
