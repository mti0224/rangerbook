(() => {
  const LEAGUES = [
    ["LEGEND", "傳奇"],
    ["MASTER_1", "大師 I"],
    ["MASTER_2", "大師 II"],
    ["MASTER_3", "大師 III"],
    ["DIAMOND_1", "鑽石 I"],
    ["DIAMOND_2", "鑽石 II"],
    ["DIAMOND_3", "鑽石 III"],
    ["GOLD_1", "黃金 I"],
    ["GOLD_2", "黃金 II"],
    ["GOLD_3", "黃金 III"],
  ];
  const LABELS = Object.fromEntries(LEAGUES);
  const allowed = new Set(LEAGUES.map(([code]) => code));
  const params = new URLSearchParams(location.search);
  const requested = String(params.get("league") || "LEGEND").toUpperCase();
  const league = allowed.has(requested) ? requested : "LEGEND";
  const label = LABELS[league] || league;

  window.RANGERBOOK_PVP_LEAGUE = league;
  window.RANGERBOOK_PVP_LEAGUE_LABELS = LABELS;
  window.RANGERBOOK_PVP_LEAGUE_LABEL = label;
  window.RANGERBOOK_PVP_LEAGUE_NAME = (code) => LABELS[String(code || "").toUpperCase()] || String(code || "");

  // Existing PvP scripts keep their stable LEGEND URLs. Rewrite only those
  // public JSON requests for the selected non-LEGEND league so the rest of
  // the ranking/usage/modal logic can stay shared.
  if (league !== "LEGEND") {
    const suffix = `_${league}`;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      let raw = typeof input === "string" ? input : input?.url;
      if (raw) {
        const replacements = ["leaderboard", "usage", "player_teams"];
        for (const base of replacements) {
          const marker = `/${base}.json`;
          if (raw.includes(marker)) raw = raw.replace(marker, `/${base}${suffix}.json`);
        }
        if (typeof input === "string") return originalFetch(raw, init);
        input = new Request(raw, input);
      }
      return originalFetch(input, init);
    };
  }

  function fillLeagueSelect(select) {
    if (!select) return;
    select.innerHTML = LEAGUES.map(([code, text]) =>
      `<option value="${code}" ${code === league ? "selected" : ""}>${text}</option>`
    ).join("");
    select.addEventListener("change", () => {
      const next = select.value || "LEGEND";
      const url = new URL(location.href);
      if (next === "LEGEND") url.searchParams.delete("league");
      else url.searchParams.set("league", next);
      location.href = url.toString();
    });
  }

  function updateUsageScope() {
    const select = document.getElementById("pvpUsageTopN");
    if (!select) return;
    const options = league === "LEGEND"
      ? [["10", "前 10 名"], ["30", "前 30 名"], ["50", "前 50 名"], ["100", "前 100 名"], ["all", "全部"]]
      : [["10", "前 10 名"], ["50", "前 50 名"], ["all", "全部"]];
    select.innerHTML = options.map(([value, text]) =>
      `<option value="${value}" ${value === "all" ? "selected" : ""}>${text}</option>`
    ).join("");
  }

  function updateLabels() {
    document.querySelectorAll("[data-pvp-league-label]").forEach((node) => {
      node.textContent = label;
    });
    const metaLeague = document.getElementById("pvpLeaderboardLeague") || document.getElementById("pvpUsageLeague");
    if (metaLeague) metaLeague.textContent = label;

    const usageEyebrow = document.querySelector("body[data-pvp-page='usage'] .page-title .eyebrow");
    if (usageEyebrow) usageEyebrow.textContent = `PvP · ${label}`;
    const rankingEyebrow = document.querySelector("body[data-pvp-page='leaderboard'] .page-title .eyebrow");
    if (rankingEyebrow) rankingEyebrow.textContent = `PvP · ${label}`;

    const rankingTitle = document.querySelector("body[data-pvp-page='leaderboard'] .page-title h1");
    if (rankingTitle) rankingTitle.textContent = `${label}段位排行榜`;
    const rankingDesc = document.querySelector("body[data-pvp-page='leaderboard'] .page-title p:not(.eyebrow)");
    if (rankingDesc) rankingDesc.textContent = `顯示目前${label}段位玩家的排名與 PvP 分數。點擊玩家可查看隊伍 1～5 與 PvP 防守隊伍。`;
    const usageDesc = document.querySelector("body[data-pvp-page='usage'] .page-title p:not(.eyebrow)");
    if (usageDesc) usageDesc.textContent = `統計${label}段位排行榜玩家 PvP 防守隊伍中的角色使用比例。點擊角色可查看配裝、覺醒能力與才能解放狀態。`;
  }

  fillLeagueSelect(document.getElementById("pvpLeagueSelect"));
  updateUsageScope();
  updateLabels();
})();