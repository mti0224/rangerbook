(() => {
  const modal = document.getElementById("pvpPlayerTeamModal");
  const modalContent = document.getElementById("pvpPlayerTeamModalContent");
  if (!modal || !modalContent) return;

  const PLAYER_TEAMS_URL = "https://pvp-data.warmycat.com/player_teams.json";
  const TALENT_ICON = (grade) => `../../assets/tlt_icon/tlt${encodeURIComponent(grade)}.png`;
  let payloadPromise = null;
  let decorateQueued = false;

  function itemLabel(item) {
    return item?.querySelector(":scope > div > span")?.textContent?.trim() || "";
  }

  function enhanceDetailCard(card) {
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

    if (talentItem) {
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

      talentItem.remove();
    }

    if (!extraList.children.length) extraList.remove();
  }

  function loadPayload() {
    if (!payloadPromise) {
      payloadPromise = fetch(`${PLAYER_TEAMS_URL}?t=${Date.now()}`, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(`player_teams HTTP ${response.status}`);
          return response.json();
        })
        .catch((error) => {
          payloadPromise = null;
          console.warn("PvP team talent icon data unavailable", error);
          return null;
        });
    }
    return payloadPromise;
  }

  function currentRank() {
    const text = modalContent.querySelector(".pvp-player-team-header > p")?.textContent || "";
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

  async function decorateTeamTalentIcons() {
    decorateQueued = false;
    if (modal.hidden) return;

    const buttons = [...modalContent.querySelectorAll(".pvp-player-unit-button[data-unit-index]")];
    if (!buttons.length) return;

    const pending = buttons.filter((button) => button.dataset.talentIconReady !== "1");
    if (!pending.length) return;

    const payload = await loadPayload();
    const detail = findDetail(payload, currentRank());
    if (!detail) return;

    const units = normalizeUnits(detail?.teams?.[currentTeamKey()] ?? detail?.[currentTeamKey()]);
    pending.forEach((button) => {
      button.dataset.talentIconReady = "1";
      const index = Number(button.dataset.unitIndex);
      const unit = units[index];
      const name = button.querySelector(".pvp-player-unit-name");
      if (!name || !unit) return;

      const grade = Number(unit.talentGrade);
      if (!Number.isInteger(grade) || grade <= 0 || grade > 4) return;

      const icon = document.createElement("img");
      icon.className = "pvp-player-unit-talent-icon";
      icon.src = TALENT_ICON(grade);
      icon.alt = "";
      icon.setAttribute("aria-hidden", "true");
      icon.loading = "lazy";
      icon.addEventListener("error", () => icon.remove(), { once: true });
      name.prepend(icon);
    });
  }

  function queueDecorateTeamTalentIcons() {
    if (decorateQueued) return;
    decorateQueued = true;
    queueMicrotask(decorateTeamTalentIcons);
  }

  function enhanceAll() {
    modalContent.querySelectorAll(".pvp-player-unit-detail-card").forEach(enhanceDetailCard);
    queueDecorateTeamTalentIcons();
  }

  modalContent.addEventListener("change", (event) => {
    if (event.target.id === "pvpPlayerTeamSelect") queueDecorateTeamTalentIcons();
  });

  const observer = new MutationObserver((records) => {
    const hasRelevantAddition = records.some((record) => [...record.addedNodes].some((node) => {
      if (!(node instanceof Element)) return false;
      return node.matches?.(".pvp-player-unit-button, .pvp-player-unit-detail-card")
        || node.querySelector?.(".pvp-player-unit-button, .pvp-player-unit-detail-card");
    }));
    if (hasRelevantAddition) enhanceAll();
  });

  observer.observe(modalContent, { childList: true, subtree: true });
  enhanceAll();
})();