(() => {
  const PLAYER_TEAMS_URL = "https://pvp-data.warmycat.com/player_teams.json";
  const GUILDWAR_DATA_URLS = {
    LEGEND: "https://pvp-data.warmycat.com/guildwar_data_LEGEND.json",
    MASTER: "https://pvp-data.warmycat.com/guildwar_data_MASTER.json",
    DIAMOND: "https://pvp-data.warmycat.com/guildwar_data_DIAMOND.json",
  };
  const EFFECT_DICT_URL = "../../res/effect_dict.json";
  const EQUIP_SLOTS = ["WEAPON", "ARMOR", "ACC"];
  const EFFECT_VISIBLE_MS = 5000;

  const modalContent = document.getElementById("pvpPlayerTeamModalContent");
  const guildContent = document.getElementById("guildMemberModalContent");
  if (!modalContent && !guildContent) return;

  let dataPromise = null;
  let effectPromise = null;
  const guildDataPromises = new Map();
  const effectTimers = new WeakMap();

  function loadData() {
    if (dataPromise) return dataPromise;
    dataPromise = fetch(`${PLAYER_TEAMS_URL}?t=${Date.now()}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`player_teams HTTP ${res.status}`);
        return res.json();
      });
    return dataPromise;
  }

  function loadEffectDict() {
    if (effectPromise) return effectPromise;
    effectPromise = fetch(EFFECT_DICT_URL)
      .then((res) => res.ok ? res.json() : [])
      .then((data) => {
        if (Array.isArray(data)) {
          return Object.fromEntries(data
            .filter((row) => row && row.attrNo !== undefined)
            .map((row) => [String(row.attrNo), String(row["效果名稱"] || row.name || row.label || row.attrNo)]));
        }
        return data && typeof data === "object" ? data : {};
      })
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
    if (Array.isArray(players)) return players.find((item) => Number(item?.rank) === Number(rank)) || null;
    if (players && typeof players === "object") {
      return Object.values(players).find((item) => Number(item?.rank) === Number(rank)) || null;
    }
    return null;
  }

  function equipmentObject(unit, slot) {
    const map = unit?.equipMap && typeof unit.equipMap === "object"
      ? unit.equipMap
      : (unit?.equipment && typeof unit.equipment === "object" ? unit.equipment : {});
    const value = map?.[slot];
    return value && typeof value === "object" ? value : null;
  }

  function advancedEffectCode(unit, slot) {
    const value = equipmentObject(unit, slot)?.goodGearAttr;
    return value === undefined || value === null || value === "" ? "" : String(value);
  }

  function effectName(dict, code) {
    const value = dict?.[String(code)];
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      return String(value["效果名稱"] || value["名稱"] || value.name || value.label || "");
    }
    return "";
  }

  function hideEffect(item) {
    const timer = effectTimers.get(item);
    if (timer) clearTimeout(timer);
    effectTimers.delete(item);
    item.querySelector(".pvp-player-equipment-effect")?.remove();
  }

  function showEffect(item, text) {
    hideEffect(item);
    const body = item.querySelector(":scope > div");
    if (!body || !text) return;
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

  function currentRank() {
    const text = modalContent?.querySelector(".pvp-player-team-header > p")?.textContent || "";
    return Number(text.match(/排名\s*#\s*(\d+)/)?.[1] || 0);
  }

  function selectedTeamKey() {
    return document.getElementById("pvpPlayerTeamSelect")?.value || "pvpteam";
  }

  function selectedUnitIndex() {
    const selected = modalContent?.querySelector(".pvp-player-unit-button.is-selected[data-unit-index]");
    return selected ? Number(selected.dataset.unitIndex) : -1;
  }

  async function currentPvpUnit() {
    const rank = currentRank();
    const index = selectedUnitIndex();
    if (!rank || index < 0) return null;
    const payload = await loadData();
    const detail = findDetail(payload, rank);
    return normalizeUnits(detail?.teams?.[selectedTeamKey()] ?? detail?.[selectedTeamKey()])[index] || null;
  }

  const guildTierCode = () => document.getElementById("guildRankingTier")?.value || "LEGEND";
  const memberName = (member) => String(member?.displayName || member?.name || member?.playerName || "未公開名稱");

  async function currentGuildUnit() {
    const selected = guildContent?.querySelector(".pvp-player-unit-button.is-selected[data-guildwar-unit-index]");
    if (!selected) return null;
    const index = Number(selected.dataset.guildwarUnitIndex);
    const selectedMemberName = guildContent?.querySelector("#guildMemberModalTitle")?.textContent?.trim() || "";
    const subtitle = guildContent?.querySelector(".guildwar-member-header > p")?.textContent || "";
    const guildName = subtitle.split("·")[0]?.trim() || "";
    if (!selectedMemberName || !guildName || index < 0) return null;
    const data = await loadGuildData(guildTierCode());
    const guild = (Array.isArray(data?.guilds) ? data.guilds : [])
      .find((item) => String(item?.guildName || "").trim() === guildName);
    const member = (Array.isArray(guild?.members) ? guild.members : [])
      .find((item) => memberName(item) === selectedMemberName);
    return normalizeUnits(member?.guildwar)[index] || null;
  }

  async function handleEquipmentClick(event, root, unitLoader) {
    const item = event.target.closest(".pvp-player-equipment-item");
    if (!item || !root?.contains(item)) return;
    const items = [...item.parentElement.querySelectorAll(":scope > .pvp-player-equipment-item")];
    const slot = EQUIP_SLOTS[items.indexOf(item)];
    if (!slot) return;
    const code = advancedEffectCode(await unitLoader(), slot);
    if (!code) return hideEffect(item);
    const name = effectName(await loadEffectDict(), code);
    if (name) showEffect(item, name);
  }

  modalContent?.addEventListener("click", (event) => {
    if (!event.target.closest(".pvp-player-equipment-item")) return;
    handleEquipmentClick(event, modalContent, currentPvpUnit)
      .catch((error) => console.error("PvP advanced gear effect load failed", error));
  });

  guildContent?.addEventListener("click", (event) => {
    if (!event.target.closest(".pvp-player-equipment-item")) return;
    handleEquipmentClick(event, guildContent, currentGuildUnit)
      .catch((error) => console.error("Guild War advanced gear effect load failed", error));
  });
})();