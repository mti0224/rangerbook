(() => {
  const DATA_URL = "../../res/pvp/usage.json";
  const REFRESH_MS = 60 * 60 * 1000;
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
  const RANGER_DETAIL = (id) => `../../ranger/ranger/${encodeURIComponent(id)}`;

  const elements = {
    updated: document.getElementById("pvpUsageUpdated"),
    league: document.getElementById("pvpUsageLeague"),
    sampleCount: document.getElementById("pvpUsageSampleCount"),
    rankingCount: document.getElementById("pvpUsageRankingCount"),
    status: document.getElementById("pvpUsageStatus"),
    body: document.getElementById("pvpUsageBody"),
    search: document.getElementById("pvpUsageSearch"),
    type: document.getElementById("pvpUsageType"),
    element: document.getElementById("pvpUsageElement"),
  };

  let rows = [];

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

  function fillSelect(select, values, firstLabel) {
    if (!select) return;
    const previous = select.value;
    const unique = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
    select.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>`
      + unique.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
    if (unique.includes(previous)) select.value = previous;
  }

  function renderRows() {
    if (!elements.body) return;
    const query = elements.search?.value.trim().toLowerCase() || "";
    const type = elements.type?.value || "";
    const element = elements.element?.value || "";

    const filtered = rows.filter((row) => {
      if (type && row.type !== type) return false;
      if (element && row.element !== element) return false;
      if (!query) return true;
      return [row.name, row.rangerId, row.star, row.type, row.element]
        .some((value) => String(value ?? "").toLowerCase().includes(query));
    });

    if (!filtered.length) {
      elements.body.innerHTML = `<tr class="pvp-empty-row"><td colspan="5">找不到符合條件的角色。</td></tr>`;
      return;
    }

    elements.body.innerHTML = filtered.map((row) => {
      const usageRate = Math.max(0, Math.min(100, Number(row.usageRate) || 0));
      const rank = Number(row.rank) || "-";
      return `
        <tr>
          <td class="pvp-rank-cell"><span class="pvp-rank-medal">${rank}</span></td>
          <td>
            <a class="pvp-ranger-main" href="${RANGER_DETAIL(row.rangerId)}">
              <img class="pvp-ranger-thumb" src="${RANGER_IMAGE(row.rangerId)}" alt="" loading="lazy" onerror="this.remove();">
              <div>
                <div class="pvp-ranger-name">${escapeHtml(row.name || row.rangerId)}</div>
                <div class="pvp-ranger-sub">${escapeHtml([row.star, row.type, row.element].filter(Boolean).join(" · "))}</div>
              </div>
            </a>
          </td>
          <td>${escapeHtml(formatNumber(row.playerCount))}</td>
          <td class="pvp-usage-cell">
            <div class="pvp-usage-number"><strong>${escapeHtml(formatNumber(usageRate))}%</strong><span>${escapeHtml(formatNumber(row.playerCount))} 人</span></div>
            <div class="pvp-usage-bar" aria-hidden="true"><span style="--usage-rate:${usageRate}%"></span></div>
          </td>
          <td>${escapeHtml(formatNumber(row.appearanceCount))}</td>
        </tr>`;
    }).join("");
  }

  function renderMetadata(metadata) {
    if (elements.updated) elements.updated.textContent = formatDate(metadata.generatedAtUtc);
    if (elements.league) elements.league.textContent = metadata.league || "LEGEND";
    if (elements.sampleCount) elements.sampleCount.textContent = formatNumber(metadata.sampleCount);
    if (elements.rankingCount) elements.rankingCount.textContent = formatNumber(metadata.rankingCount);
  }

  async function load() {
    if (elements.status) {
      elements.status.hidden = false;
      elements.status.classList.remove("error");
      elements.status.textContent = "角色使用率資料載入中…";
    }
    try {
      const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      rows = Array.isArray(data.rangers) ? data.rangers : [];
      renderMetadata(data.metadata || {});
      fillSelect(elements.type, rows.map((row) => row.type), "全部類型");
      fillSelect(elements.element, rows.map((row) => row.element), "全部屬性");
      renderRows();
      if (elements.status) elements.status.hidden = true;
    } catch (error) {
      console.error("PvP usage load failed", error);
      if (elements.status) {
        elements.status.hidden = false;
        elements.status.classList.add("error");
        elements.status.textContent = "角色使用率資料尚未產生或目前無法載入。";
      }
      if (elements.body) elements.body.innerHTML = "";
    }
  }

  [elements.search, elements.type, elements.element].forEach((element) => {
    element?.addEventListener("input", renderRows);
    element?.addEventListener("change", renderRows);
  });

  load();
  window.setInterval(load, REFRESH_MS);
})();
