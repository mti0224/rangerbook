(() => {
  const modal = document.getElementById("pvpPlayerTeamModal");
  const content = document.getElementById("pvpPlayerTeamModalContent");
  if (!modal || !content) return;

  const PLAYER_TEAMS_URL = "https://pvp-data.warmycat.com/player_teams.json";
  const TALENT_ICON = (grade) => `../../assets/tlt_icon/tlt${encodeURIComponent(grade)}.png`;
  let payloadPromise = null;

  function loadPayload() {
    if (!payloadPromise) {
      payloadPromise = fetch(`${PLAYER_TEAMS_URL}?t=${Date.now()}`, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(`player_teams HTTP ${response.status}`);
          return response.json();
        })
        .catch((error) => {
          payloadPromise = null;
          console.warn("PvP talent icon data unavailable", error);
          return null;
        });
    }
    return payloadPromise;
  }

  function currentRank() {
    const text = content.querySelector(".pvp-player-team-header > p")?.textContent || "";
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

  async function decorate() {
    if (modal.hidden) return;
    const buttons = [...content.querySelectorAll(".pvp-player-unit-button[data-unit-index]")];
    if (!buttons.length) return;

    const payload = await loadPayload();
    const detail = findDetail(payload, currentRank());
    if (!detail) return;

    const units = normalizeUnits(detail?.teams?.[currentTeamKey()] ?? detail?.[currentTeamKey()]);
    buttons.forEach((button) => {
      const index = Number(button.dataset.unitIndex);
      const unit = units[index];
      const name = button.querySelector(".pvp-player-unit-name");
      if (!name || !unit) return;

      name.querySelector(".pvp-player-unit-talent-icon")?.remove();
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

  content.addEventListener("change", (event) => {
    if (event.target.id === "pvpPlayerTeamSelect") queueMicrotask(decorate);
  });

  const observer = new MutationObserver(() => queueMicrotask(decorate));
  observer.observe(content, { childList: true, subtree: true });
})();
