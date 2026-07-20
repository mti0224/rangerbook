(() => {
  const DATA_URL = "https://pvp-data.warmycat.com/guildwar_ranking.json";
  const els = {
    updated: document.getElementById("guildRankingUpdated"),
    count: document.getElementById("guildRankingCount"),
    search: document.getElementById("guildRankingSearch"),
    status: document.getElementById("guildRankingStatus"),
    body: document.getElementById("guildRankingBody"),
  };
  let guilds = [];

  const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const num = (v) => Number.isFinite(Number(v)) ? Number(v).toLocaleString("zh-Hant", { maximumFractionDigits: 2 }) : "-";
  const date = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? "-" : new Intl.DateTimeFormat("zh-Hant", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false }).format(d); };
  function status(text = "", error = false) { if (!els.status) return; els.status.hidden = !text; els.status.textContent = text; els.status.classList.toggle("error", error); }
  function render() {
    const q = (els.search?.value || "").trim().toLowerCase();
    const rows = guilds.filter(g => !q || String(g.guildName || "").toLowerCase().includes(q));
    if (!els.body) return;
    els.body.innerHTML = rows.length ? rows.map(g => `
      <tr>
        <td class="pvp-rank-cell"><span class="pvp-rank-medal">${esc(g.rank)}</span></td>
        <td><strong title="${esc(g.guildName || "-")}">${esc(g.guildName || "-")}</strong></td>
        <td>${esc(num(g.score))}</td>
        <td>${esc(num(g.curMemberCount))} / ${esc(num(g.maxMemberCount))}</td>
        <td>${esc(g.nationalFlag || "-")}</td>
      </tr>`).join("") : `<tr class="pvp-empty-row"><td colspan="5">找不到符合條件的公會。</td></tr>`;
  }
  async function load() {
    status("公會排名資料載入中…");
    try {
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      guilds = Array.isArray(data.guilds) ? data.guilds : [];
      if (els.updated) els.updated.textContent = date(data.metadata?.generatedAtUtc);
      if (els.count) els.count.textContent = num(guilds.length || data.metadata?.rankingCount);
      status();
      render();
    } catch (e) {
      console.error(e);
      status("公會排名資料尚未產生或目前無法載入。", true);
      if (els.body) els.body.innerHTML = "";
    }
  }
  els.search?.addEventListener("input", render);
  load();
})();
