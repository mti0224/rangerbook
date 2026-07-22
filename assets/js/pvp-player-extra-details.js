(() => {
  const PLAYER_TEAMS_URL = "https://pvp-data.warmycat.com/player_teams.json";
  const ABILITY_DATA_URL = "../../res/%E8%83%BD%E5%8A%9B.json";
  const ABILITY_ICON = (icon) => `https://rangers.lerico.net/res/ability_icon/${encodeURIComponent(icon)}`;
  const TALENT_ICON = (grade) => `../../assets/tlt_icon/tlt${encodeURIComponent(grade)}.png`;

  const modal = document.getElementById("pvpPlayerTeamModal");
  const modalContent = document.getElementById("pvpPlayerTeamModalContent");
  if (!modal || !modalContent) return;

  let dataPromise = null;

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

  function currentRank() {
    const text = modalContent.querySelector(".pvp-player-team-header > p")?.textContent || "";
    const match = text.match(/排名\s*#\s*(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function selectedTeamKey() {
    return document.getElementById("pvpPlayerTeamSelect")?.value || "pvpteam";
  }

  function selectedUnitIndex() {
    const selected = modalContent.querySelector(".pvp-player-unit-button.is-selected[data-unit-index]");
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

  async function renderExtraDetails() {
    if (modal.hidden) return;
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

  modalContent.addEventListener("click", (event) => {
    if (!event.target.closest(".pvp-player-unit-button[data-unit-index]")) return;
    queueMicrotask(renderExtraDetails);
  });

  modalContent.addEventListener("change", (event) => {
    if (event.target.id !== "pvpPlayerTeamSelect") return;
    queueMicrotask(renderExtraDetails);
  });

  const observer = new MutationObserver(() => {
    if (modal.hidden) return;
    if (!modalContent.querySelector(".pvp-player-unit-button.is-selected")) return;
    if (modalContent.querySelector(".pvp-player-extra-details")) return;
    renderExtraDetails();
  });
  observer.observe(modalContent, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
})();
