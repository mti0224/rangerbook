(() => {
  const PLAYER_TEAMS_URL = "https://pvp-data.warmycat.com/player_teams.json";
  const GUILDWAR_DATA_URLS = {
    LEGEND: "https://pvp-data.warmycat.com/guildwar_data_LEGEND.json",
    MASTER: "https://pvp-data.warmycat.com/guildwar_data_MASTER.json",
    DIAMOND: "https://pvp-data.warmycat.com/guildwar_data_DIAMOND.json",
  };
  const ABILITY_DATA_URL = "../../res/%E8%83%BD%E5%8A%9B.json";
  const EFFECT_DICT_URL = "../../res/effect_dict.json";
  const ABILITY_ICON = (icon) => `https://rangers.lerico.net/res/ability_icon/${encodeURIComponent(icon)}`;
  const TALENT_ICON = (grade) => `../../assets/tlt_icon/tlt${encodeURIComponent(grade)}.png`;
  const EQUIP_SLOTS = ["WEAPON", "ARMOR", "ACC"];
  const EFFECT_VISIBLE_MS = 5000;

  const modal = document.getElementById("pvpPlayerTeamModal");
  const modalContent = document.getElementById("pvpPlayerTeamModalContent");
  const guildModal = document.getElementById("guildMemberModal");
  const guildContent = document.getElementById("guildMemberModalContent");
  if ((!modal || !modalContent) && (!guildModal || !guildContent)) return;

  let dataPromise = null;
  let effectPromise = null;
  const guildDataPromises = new Map();
  const effectTimers = new WeakMap();

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function loadData() {
    if (dataPromise) return dataPromise;
    dataPromise = Promise.all([
      fetch(`${PLAYER_TEAMS_URL}?t=${Date.now()}`, { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`player_teams HTTP ${res.status}`);
        return res.json();
      }),
      fetch(ABILITY_DATA_URL).then((res) => res.ok ? res.json() : {}).catch(() => ({})),
    ]);
    return dataPromise;
  }

  function loadEffectDict() {
    if (effectPromise) return effectPromise;
    effectPromise = fetch(EFFECT_DICT_URL)
      .then((res) => res.ok ? res.json() : {})
      .catch(() => ({}));
    return effectPromise;
  }

  function loadGuildData(tier) {
    const code = String(tier || "LEGEND").toUpperCase();
    if (guildDataPromises.has(code)) return guildDataPromises.get(code);
    const url = GUILDWAR_DATA_URLS[code];
    if (!url) return Promise.resolve({});
    const promise = fetch(`${url}?t=${Date.now()}`, { cache: "no-store" })
      .then((res) => res.ok ? res.json() : {})
      .catch(() => ({}));
    guildDataPromises.set(code, promise);
    return promise;
  }

  function currentRank() {
    const text = modalContent?.querySelector(".pvp-player-team-header > p")?.textContent || "";
    const match = text.match(/排名\s*#\s*(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function selectedTeamKey() {
    return document.getElementById("pvpPlayerTeamSelect")?.value || "pvpteam";
  }

  function selectedUnitIndex() {
    const selected = modalContent?.querySelector(".pvp-player-unit-button.is-selected[data-unit-index]");
    if (!selected) return -1;
    return Number(selected.dataset.unitIndex);
  }

  function normalizeUnits(value) {
    if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object");
    if (!value || typeof value !== "object") return [];
    if (value.unitCode) return [value];
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b)))
      .flatMap((key) => normalizeUnits(value[key]));
  }

  function findDetail(payload, rank) {
    const players = payload?.players;
    if (Array.isArray(players)) {
      return players.find((item) => Number(item?.rank) === Number(rank)) || null;
    }
    if (players && typeof players === "object") {
      return Object.values(players).find((item) => Number(item?.rank) === Number(rank)) || null;
    }
    return null;
  }

  function talentInfo(value) {
    const grade = Number(value);
    if (!Number.isInteger(grade) || grade < 0 || grade > 4) {
      return { label: value === undefined || value === null || value === "" ? "無資料" : `階段 ${value}`, icon: "" };
    }
    return {
      label: grade === 0 ? "未解放才能" : `解放才能階段 ${grade}`,
      icon: TALENT_ICON(grade),
    };
  }

  function infoCard(label, value, icon = "") {
    const iconHtml = icon
      ? `<img class="pvp-player-extra-icon" src="${icon}" alt="" loading="lazy" onerror="this.remove();">`
      : `<span class="pvp-player-extra-icon pvp-player-extra-icon-empty" aria-hidden="true">—</span>`;
    return `
      <div class="pvp-player-extra-card">
        ${iconHtml}
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      </div>`;
  }

  function equipmentObject(unit, slot) {
    const map = unit?.equipMap && typeof unit.equipMap === "object"
      ? unit.equipMap
      : (unit?.equipment && typeof unit.equipment === "object" ? unit.equipment : {});
    const value = map?.[slot];
    return value && typeof value === "object" ? value : null;
  }

  function advancedEffectCode(unit, slot) {
    const equipment = equipmentObject(unit, slot);
    const value = equipment?.goodGearAttr;
    return value === undefined || value === null || value === "" ? "" : String(value);
  }

  function effectName(effectDict, code) {
    if (!code || !effectDict || typeof effectDict !== "object") return "";
    const direct = effectDict[String(code)] ?? effectDict[Number(code)];
    if (typeof direct === "string") return direct;
    if (direct && typeof direct === "object") {
      return String(direct["名稱"] || direct.name || direct.label || direct.text || "");
    }
    const reversed = Object.entries(effectDict).find(([, value]) => {
      if (value && typeof value === "object") {
        const nestedCode = value.code ?? value.id ?? value.effectCode;
        return String(nestedCode ?? "") === String(code);
      }
      return String(value ?? "") === String(code);
    });
    return reversed ? String(reversed[0]) : "";
  }

  function hideEffect(item) {
    const timer = effectTimers.get(item);
    if (timer) clearTimeout(timer);
    effectTimers.delete(item);
    item.querySelector(".pvp-player-equipment-effect")?.remove();
    item.classList.remove("is-effect-visible");
  }

  function showEffect(item, text) {
    if (!item || !text) return;
    hideEffect(item);
    const body = item.querySelector(":scope > div");
    if (!body) return;
    const effect = document.createElement("span");
    effect.className = "pvp-player-equipment-effect";
    effect.textContent = `高級效果：${text}`;
    body.appendChild(effect);
    item.classList.add("is-effect-visible");
    effectTimers.set(item, window.setTimeout(() => hideEffect(item), EFFECT_VISIBLE_MS));
  }

  async function currentPvpUnit() {
    const rank = currentRank();
    const unitIndex = selectedUnitIndex();
    if (!rank || unitIndex < 0) return null;
    const [payload] = await loadData();
    const detail = findDetail(payload, rank);
    const units = normalizeUnits(detail?.teams?.[selectedTeamKey()] ?? detail?.[selectedTeamKey()]);
    return units[unitIndex] || null;
  }

  function guildTierCode() {
    return document.getElementById("guildRankingTier")?.value || "LEGEND";
  }

  function guildNamesFromHeader() {
    const memberName = guildContent?.querySelector("#guildMemberModalTitle")?.textContent?.trim() || "";
    const subtitle = guildContent?.querySelector(".guildwar-member-header > p")?.textContent || "";
    const guildName = subtitle.split("·")[0]?.trim() || "";
    return { memberName, guildName };
  }

  function memberName(member) {
    return String(member?.displayName || member?.name || member?.playerName || "未公開名稱");
  }

  async function currentGuildUnit() {
    const selected = guildContent?.querySelector(".pvp-player-unit-button.is-selected[data-guildwar-unit-index]");
    if (!selected) return null;
    const unitIndex = Number(selected.dataset.guildwarUnitIndex);
    const { memberName: selectedMemberName, guildName } = guildNamesFromHeader();
    if (!selectedMemberName || !guildName || unitIndex < 0) return null;
    const data = await loadGuildData(guildTierCode());
    const guild = (Array.isArray(data?.guilds) ? data.guilds : [])
      .find((item) => String(item?.guildName || "").trim() === guildName);
    const member = (Array.isArray(guild?.members) ? guild.members : [])
      .find((item) => memberName(item) === selectedMemberName);
    const units = normalizeUnits(member?.guildwar);
    return units[unitIndex] || null;
  }

  async function handleEquipmentClick(event, root, unitLoader) {
    const item = event.target.closest(".pvp-player-equipment-item");
    if (!item || !root?.contains(item)) return;
    const items = [...item.parentElement.querySelectorAll(":scope > .pvp-player-equipment-item")];
    const slot = EQUIP_SLOTS[items.indexOf(item)];
    if (!slot) return;
    const unit = await unitLoader();
    const code = advancedEffectCode(unit, slot);
    if (!code) {
      hideEffect(item);
      return;
    }
    const dict = await loadEffectDict();
    const name = effectName(dict, code);
    if (name) showEffect(item, name);
  }

  async function renderExtraDetails() {
    if (!modal || !modalContent || modal.hidden) return;
    const card = modalContent.querySelector("#pvpPlayerUnitDetail .pvp-player-unit-detail-card");
    if (!card) return;

    card.querySelector(".pvp-player-extra-details")?.remove();

    const rank = currentRank();
    const unitIndex = selectedUnitIndex();
    if (!rank || unitIndex < 0) return;

    try {
      const [payload, abilityMap] = await loadData();
      const detail = findDetail(payload, rank);
      const units = normalizeUnits(detail?.teams?.[selectedTeamKey()] ?? detail?.[selectedTeamKey()]);
      const unit = units[unitIndex];
      if (!unit) return;

      const leonardPoint = unit.leonardPoint ?? "-";
      const awakeCode = String(unit.awakeAbilityCode || "").trim();
      const ability = awakeCode ? (abilityMap?.[awakeCode] || {}) : {};
      const abilityName = awakeCode ? String(ability["名稱"] || awakeCode) : "未設定覺醒能力";
      const abilityIcon = ability?.icon ? ABILITY_ICON(ability.icon) : "";
      const talent = talentInfo(unit.talentGrade);

      const extra = document.createElement("div");
      extra.className = "pvp-player-extra-details";
      extra.innerHTML = `
        ${infoCard("Leonard 點數", leonardPoint)}
        ${infoCard("覺醒能力", abilityName, abilityIcon)}
        ${infoCard("解放才能狀態", talent.label, talent.icon)}
      `;

      const equipmentList = card.querySelector(".pvp-player-equipment-list");
      if (equipmentList) card.insertBefore(extra, equipmentList);
      else card.appendChild(extra);
    } catch (error) {
      console.error("PvP player extra detail load failed", error);
    }
  }

  modalContent?.addEventListener("click", (event) => {
    if (event.target.closest(".pvp-player-equipment-item")) {
      handleEquipmentClick(event, modalContent, currentPvpUnit).catch((error) => {
        console.error("PvP advanced gear effect load failed", error);
      });
      return;
    }
    if (!event.target.closest(".pvp-player-unit-button[data-unit-index]")) return;
    queueMicrotask(renderExtraDetails);
  });

  guildContent?.addEventListener("click", (event) => {
    if (!event.target.closest(".pvp-player-equipment-item")) return;
    handleEquipmentClick(event, guildContent, currentGuildUnit).catch((error) => {
      console.error("Guild War advanced gear effect load failed", error);
    });
  });

  modalContent?.addEventListener("change", (event) => {
    if (event.target.id !== "pvpPlayerTeamSelect") return;
    queueMicrotask(renderExtraDetails);
  });

  if (modalContent) {
    const observer = new MutationObserver(() => {
      if (!modal || modal.hidden) return;
      if (!modalContent.querySelector(".pvp-player-unit-button.is-selected")) return;
      if (modalContent.querySelector(".pvp-player-extra-details")) return;
      renderExtraDetails();
    });
    observer.observe(modalContent, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }
})();
