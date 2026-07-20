(() => {
  const DATA_URL = "https://pvp-data.warmycat.com/leaderboard.json";
  const REFRESH_MS = 5 * 60 * 1000;

  const elements = {
    updated: document.getElementById("pvpLeaderboardUpdated"),
    league: document.getElementById("pvpLeaderboardLeague"),
    rankingCount: document.getElementById("pvpLeaderboardCount"),
    totalCount: document.getElementById("pvpLeaderboardTotal"),
    status: document.getElementById("pvpLeaderboardStatus"),
    body: document.getElementById("pvpLeaderboardBody"),
    search: document.getElementById("pvpLeaderboardSearch"),
  };

  let players = [];

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

  function levelBadgeFile(level) {
    const value = Number(level);
    if (!Number.isFinite(value)) return "";
    if (value >= 100 && value <= 198) return "level_badge_master.png";
    if (value >= 199 && value <= 297) return "level_badge_super.png";
    if (value >= 298 && value <= 396) return "level_badge_ultra.png";
    if (value >= 397 && value <= 495) return "level_badge_legend.png";
    if (value >= 496 && value <= 594) return "level_badge_superlegend.png";
    return "";
  }

  function levelHtml(level, nationalFlag) {
    const levelText = level ? `Lv. ${level}` : "Lv. -";
    const flagText = nationalFlag ? ` · ${nationalFlag}` : "";
    const badgeFile = levelBadgeFile(level);
    const badge = badgeFile
      ? `<img class="pvp-level-badge" src="../../assets/level_icon/${badgeFile}" alt="" aria-hidden="true">`
      : "";

    return `<span class="pvp-player-level-line">${badge}<span>${escapeHtml(levelText + flagText)}</span></span>`;
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
      const name = player.availableName && player.displayName ? player.displayName : "未公開名稱";
      return `
        <tr>
          <td class="pvp-rank-cell"><span class="pvp-rank-medal">${escapeHtml(player.rank)}</span>${rankDelta(player)}</td>
          <td>
            <div class="pvp-player-main">
              <div>
                <div class="pvp-player-name">${escapeHtml(name)}</div>
                <div class="pvp-player-sub">${levelHtml(player.displayLevel, player.nationalFlag)}</div>
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

  async function load() {
    if (elements.status) {
      elements.status.hidden = false;
      elements.status.classList.remove("error");
      elements.status.textContent = "排行榜資料載入中…";
    }
    try {
      const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      players = Array.isArray(data.players) ? data.players : [];
      renderMetadata(data.metadata || {});
      renderRows();
      if (elements.status) elements.status.hidden = true;
    } catch (error) {
      console.error("PvP leaderboard load failed", error);
      if (elements.status) {
        elements.status.hidden = false;
        elements.status.classList.add("error");
        elements.status.textContent = "排行榜資料尚未產生或目前無法載入。";
      }
      if (elements.body) elements.body.innerHTML = "";
    }
  }

  elements.search?.addEventListener("input", renderRows);
  load();
  window.setInterval(load, REFRESH_MS);
})();
