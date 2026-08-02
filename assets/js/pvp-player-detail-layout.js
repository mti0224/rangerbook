(() => {
  const pvpModal = document.getElementById("pvpPlayerTeamModal");
  const pvpContent = document.getElementById("pvpPlayerTeamModalContent");
  const guildContent = document.getElementById("guildMemberModalContent");
  if (!pvpContent && !guildContent) return;

  const TALENT_ICON = (grade) => `../../assets/tlt_icon/tlt${encodeURIComponent(grade)}.png`;
  let decorateQueued = false;
  let currentPlayerKey = "";
  let currentPlayerRank = 0;

  function itemLabel(item) {
    return item?.querySelector(":scope > div > span")?.textContent?.trim() || "";
  }

  function addTalentToName(headCopy, talentItem, removeTalentItem = false) {
    if (!headCopy || !talentItem || headCopy.querySelector(":scope > .pvp-player-name-with-talent")) return;

    const talentText = talentItem.querySelector(":scope > div > strong")?.textContent?.trim() || "";
    const hasTalent = talentText
      && talentText !== "未解放才能"
      && talentText !== "才能解放狀態無資料";

    if (hasTalent) {
      const talentIcon = talentItem.querySelector(":scope > img");
      const name = headCopy.querySelector(":scope > strong");
      if (name && talentIcon) {
        const nameLine = document.createElement("div");
        nameLine.className = "pvp-player-name-with-talent";

        const icon = talentIcon.cloneNode(true);
        icon.className = "pvp-player-talent-badge";
        icon.alt = "";
        icon.title = talentText;

        headCopy.insertBefore(nameLine, name);
        nameLine.append(icon, name);
      }
    }

    if (removeTalentItem) talentItem.remove();
  }

  function enhancePvpDetailCard(card) {
    if (!card || card.dataset.compactDetailLayout === "1") return;
    card.dataset.compactDetailLayout = "1";

    const headCopy = card.querySelector(".pvp-player-unit-detail-head > div");
    const extraList = card.querySelector(".pvp-player-extra-list");
    if (!headCopy || !extraList) return;

    const items = [...extraList.querySelectorAll(".pvp-player-extra-item")];
    const leonardItem = items.find((item) => itemLabel(item) === "Leonard 點數");
    const talentItem = items.find((item) => itemLabel(item) === "解放才能");

    if (leonardItem) {
      const value = leonardItem.querySelector(":scope > div > strong")?.textContent?.trim() || "-";
      const line = document.createElement("span");
      line.className = "pvp-player-leonard-line";
      line.textContent = `雷納德點數：${value === "-" ? "-" : `${value}點`}`;
      headCopy.appendChild(line);
      leonardItem.remove();
    }

    addTalentToName(headCopy, talentItem, true);
    if (!extraList.children.length) extraList.remove();
  }

  function enhanceGuildDetailCard(card) {
    if (!card || card.dataset.guildTalentNameReady === "1") return;
    card.dataset.guildTalentNameReady = "1";

    const headCopy = card.querySelector(".pvp-player-unit-detail-head > div");
    const extraList = card.querySelector(".pvp-player-extra-list");
    if (!headCopy || !extraList) return;

    const talentItem = [...extraList.querySelectorAll(".pvp-player-extra-item")]
      .find((item) => itemLabel(item) === "解放才能");
    addTalentToName(headCopy, talentItem, true);
    if (!extraList.children.length) extraList.remove();
  }

  function ensureImageWrap(button) {
    let wrap = button.querySelector(":scope > .pvp-player-unit-image-wrap");
    if (wrap) return wrap;
    const image = button.querySelector(":scope > .pvp-player-unit-image");
    if (!image) return null;
    wrap = document.createElement("span");
    wrap.className = "pvp-player-unit-image-wrap";
    button.insertBefore(wrap, image);
    wrap.appendChild(image);
    return wrap;
  }

  function ensureTeamImageWraps(root, selector) {
    if (!root) return;
    root.querySelectorAll(selector).forEach((button) => ensureImageWrap(button));
  }

  function addCornerTalentIcon(button, src, title = "") {
    if (!button || !src) return;
    const wrap = ensureImageWrap(button);
    if (!wrap || wrap.querySelector(":scope > .pvp-player-unit-talent-corner")) return;
    const icon = document.createElement("img");
    icon.className = "pvp-player-unit-talent-corner";
    icon.src = src;
    icon.alt = "";
    icon.title = title;
    icon.setAttribute("aria-hidden", "true");
    icon.loading = "lazy";
    icon.addEventListener("error", () => icon.remove(), { once: true });
    wrap.appendChild(icon);
  }

  function capturePlayerIdentity(event) {
    const row = event.target?.closest?.(".pvp-player-row[data-player-rank]");
    if (!row) return;
    currentPlayerKey = String(row.dataset.playerKey || "");
    currentPlayerRank = Number(row.dataset.playerRank) || 0;
  }

  function loadPayload() {
    if (window.RANGERBOOK_PVP_PLAYER_TEAMS_DATA) {
      return Promise.resolve(window.RANGERBOOK_PVP_PLAYER_TEAMS_DATA);
    }
    if (window.RANGERBOOK_PVP_PLAYER_TEAMS_DATA_PROMISE) {
      return window.RANGERBOOK_PVP_PLAYER_TEAMS_DATA_PROMISE;
    }
    return Promise.resolve(null);
  }

  function currentRank() {
    if (currentPlayerRank) return currentPlayerRank;
    const text = pvpContent?.querySelector(".pvp-player-team-header > p")?.textContent || "";
    const match = text.match(/排名\s*#\s*(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function currentTeamKey() {
    return document.getElementById("pvpPlayerTeamSelect")?.value || "pvpteam";
  }

  function normalizeUnits(value) {
    if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object");
    if (!value || typeof value !== "object") return [];
    if (value.unitCode) return [value];
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b)))
      .flatMap((key) => normalizeUnits(value[key]));
  }

  function findDetail(payload, rank, detailKey) {
    const players = payload?.players;
    if (Array.isArray(players)) {
      if (detailKey) {
        const byKey = players.find((item) => String(item?.detailKey || "") === detailKey);
        if (byKey) return byKey;
      }
      return players.find((item) => Number(item?.rank) === Number(rank)) || null;
    }
    if (players && typeof players === "object") {
      if (detailKey && players[detailKey]) return players[detailKey];
      if (detailKey) {
        const byKey = Object.values(players)
          .find((item) => String(item?.detailKey || "") === detailKey);
        if (byKey) return byKey;
      }
      return Object.values(players).find((item) => Number(item?.rank) === Number(rank)) || null;
    }
    return null;
  }

  async function decoratePvpTeamTalentIcons() {
    decorateQueued = false;
    if (!pvpModal || !pvpContent || pvpModal.hidden) return;

    const buttons = [...pvpContent.querySelectorAll(".pvp-player-unit-button[data-unit-index]")];
    if (!buttons.length) return;

    buttons.forEach((button) => ensureImageWrap(button));

    const pending = buttons.filter((button) => button.dataset.talentIconReady !== "1");
    if (!pending.length) return;

    const payload = await loadPayload();
    const detail = findDetail(payload, currentRank(), currentPlayerKey);
    if (!detail) return;

    const units = normalizeUnits(detail?.teams?.[currentTeamKey()] ?? detail?.[currentTeamKey()]);
    pending.forEach((button) => {
      button.dataset.talentIconReady = "1";
      const index = Number(button.dataset.unitIndex);
      const unit = units[index];
      if (!unit) return;

      const grade = Number(unit.talentGrade);
      if (!Number.isInteger(grade) || grade <= 0 || grade > 4) return;
      addCornerTalentIcon(button, TALENT_ICON(grade), `才能解放階段 ${grade}`);
    });
  }

  function decorateGuildTeamTalentIcons() {
    if (!guildContent) return;
    guildContent.querySelectorAll(".pvp-player-unit-button[data-guildwar-unit-index]").forEach((button) => {
      ensureImageWrap(button);
      if (button.dataset.talentIconReady === "1") return;
      button.dataset.talentIconReady = "1";
      const oldIcon = button.querySelector(".guildwar-unit-talent-icon");
      if (!oldIcon) return;
      const src = oldIcon.getAttribute("src");
      oldIcon.remove();
      addCornerTalentIcon(button, src, "解放才能");
    });
  }

  function queueDecoratePvpTeamTalentIcons() {
    if (decorateQueued) return;
    decorateQueued = true;
    queueMicrotask(decoratePvpTeamTalentIcons);
  }

  function enhancePvpAll() {
    if (!pvpContent) return;
    ensureTeamImageWraps(pvpContent, ".pvp-player-unit-button[data-unit-index]");
    pvpContent.querySelectorAll(".pvp-player-unit-detail-card").forEach(enhancePvpDetailCard);
    queueDecoratePvpTeamTalentIcons();
  }

  function enhanceGuildAll() {
    if (!guildContent) return;
    ensureTeamImageWraps(guildContent, ".pvp-player-unit-button[data-guildwar-unit-index]");
    guildContent.querySelectorAll(".pvp-player-unit-detail-card").forEach(enhanceGuildDetailCard);
    decorateGuildTeamTalentIcons();
  }

  const leaderboardBody = document.getElementById("pvpLeaderboardBody");
  leaderboardBody?.addEventListener("click", capturePlayerIdentity, true);
  leaderboardBody?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") capturePlayerIdentity(event);
  }, true);

  pvpContent?.addEventListener("change", (event) => {
    if (event.target.id === "pvpPlayerTeamSelect") queueDecoratePvpTeamTalentIcons();
  });

  if (pvpContent) {
    const pvpObserver = new MutationObserver((records) => {
      const relevant = records.some((record) => [...record.addedNodes].some((node) => {
        if (!(node instanceof Element)) return false;
        return node.matches?.(".pvp-player-unit-button, .pvp-player-unit-detail-card")
          || node.querySelector?.(".pvp-player-unit-button, .pvp-player-unit-detail-card");
      }));
      if (relevant) enhancePvpAll();
    });
    pvpObserver.observe(pvpContent, { childList: true, subtree: true });
    enhancePvpAll();
  }

  if (guildContent) {
    const guildObserver = new MutationObserver((records) => {
      const relevant = records.some((record) => [...record.addedNodes].some((node) => {
        if (!(node instanceof Element)) return false;
        return node.matches?.(".pvp-player-unit-button, .pvp-player-unit-detail-card")
          || node.querySelector?.(".pvp-player-unit-button, .pvp-player-unit-detail-card");
      }));
      if (relevant) enhanceGuildAll();
    });
    guildObserver.observe(guildContent, { childList: true, subtree: true });
    enhanceGuildAll();
  }
})();
