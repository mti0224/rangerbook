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
  const suffix = league === "LEGEND" ? "" : `_${league}`;
  const originalFetch = window.fetch.bind(window);

  window.RANGERBOOK_PVP_LEAGUE = league;
  window.RANGERBOOK_PVP_LEAGUE_LABELS = LABELS;
  window.RANGERBOOK_PVP_LEAGUE_LABEL = label;
  window.RANGERBOOK_PVP_LEAGUE_NAME = (code) => LABELS[String(code || "").toUpperCase()] || String(code || "");
  window.RANGERBOOK_PVP_USAGE_DATA = null;
  window.RANGERBOOK_PVP_USAGE_DATA_PROMISE = null;
  window.RANGERBOOK_PVP_PLAYER_TEAMS_DATA = null;
  window.RANGERBOOK_PVP_PLAYER_TEAMS_DATA_PROMISE = null;

  function rewritePvpUrl(raw) {
    if (!raw || !suffix) return raw;
    let rewritten = raw;
    for (const base of ["leaderboard", "usage", "player_teams"]) {
      const marker = `/${base}.json`;
      if (rewritten.includes(marker)) rewritten = rewritten.replace(marker, `/${base}${suffix}.json`);
    }
    return rewritten;
  }

  function matchesJsonUrl(raw, base) {
    if (!raw) return false;
    try {
      const url = new URL(raw, location.href);
      return new RegExp(`/${base}(?:_[A-Z0-9_]+)?\\.json$`, "i").test(url.pathname);
    } catch {
      return false;
    }
  }

  function shareJsonResponse(responsePromise, dataKey, promiseKey, eventName, warning) {
    const sharedPromise = responsePromise
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.clone().json();
      })
      .then((data) => {
        window[dataKey] = data;
        window.dispatchEvent(new CustomEvent(eventName, { detail: data }));
        return data;
      })
      .catch((error) => {
        console.warn(warning, error);
        return null;
      });
    window[promiseKey] = sharedPromise;
  }

  window.fetch = (input, init) => {
    const originalRaw = typeof input === "string" ? input : input?.url;
    const raw = rewritePvpUrl(originalRaw);
    const request = typeof input === "string" ? raw : new Request(raw, input);
    const responsePromise = originalFetch(request, init);

    if (matchesJsonUrl(raw, "usage")) {
      shareJsonResponse(
        responsePromise,
        "RANGERBOOK_PVP_USAGE_DATA",
        "RANGERBOOK_PVP_USAGE_DATA_PROMISE",
        "rangerbook:pvp-usage-data-ready",
        "Shared PvP usage data unavailable",
      );
    }

    if (matchesJsonUrl(raw, "player_teams")) {
      shareJsonResponse(
        responsePromise,
        "RANGERBOOK_PVP_PLAYER_TEAMS_DATA",
        "RANGERBOOK_PVP_PLAYER_TEAMS_DATA_PROMISE",
        "rangerbook:pvp-player-teams-data-ready",
        "Shared PvP player team data unavailable",
      );
    }

    return responsePromise;
  };

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
      if (node.textContent !== label) node.textContent = label;
    });
    const metaNodes = [
      document.getElementById("pvpLeaderboardLeague"),
      document.getElementById("pvpUsageLeague"),
    ].filter(Boolean);
    metaNodes.forEach((node) => {
      if (node.textContent !== label) node.textContent = label;
    });

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

  const observer = new MutationObserver(() => {
    const nodes = [
      document.getElementById("pvpLeaderboardLeague"),
      document.getElementById("pvpUsageLeague"),
    ].filter(Boolean);
    nodes.forEach((node) => {
      if (node.textContent !== label) node.textContent = label;
    });
  });
  const metadataRoot = document.querySelector("main") || document.body;
  observer.observe(metadataRoot, { subtree: true, childList: true, characterData: true });
})();
