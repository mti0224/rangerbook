(() => {
  const DATA_URL = "https://pvp-data.warmycat.com/guildwar_ranking.json";
  const TIERS = {
    LEGEND: { label: "傳奇", min: 1, max: 50 },
    MASTER: { label: "大師", min: 51, max: 200 },
    DIAMOND: { label: "鑽石", min: 201, max: 400 },
  };
  const els = {
    updated: document.getElementById("guildRankingUpdated"),
    count: document.getElementById("guildRankingCount"),
    tier: document.getElementById("guildRankingTier"),
    tierLabel: document.getElementById("guildRankingTierLabel"),
    search: document.getElementById("guildRankingSearch"),
    status: document.getElementById("guildRankingStatus"),
    body: document.getElementById("guildRankingBody"),
    modal: document.getElementById("guildMemberModal"),
    modalContent: document.getElementById("guildMemberModalContent"),
    modalClose: document.getElementById("guildMemberModalClose"),
  };
  let guilds = [];

  const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const num = (v) => Number.isFinite(Number(v)) ? Number(v).toLocaleString("zh-Hant", { maximumFractionDigits: 2 }) : "-";
  const date = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? "-" : new Intl.DateTimeFormat("zh-Hant", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false }).format(d); };
  function status(text = "", error = false) { if (!els.status) return; els.status.hidden = !text; els.status.textContent = text; els.status.classList.toggle("error", error); }
  function currentTier() { return TIERS[els.tier?.value] || TIERS.LEGEND; }
  function tierGuilds() { const tier = currentTier(); return guilds.filter(g => Number(g.rank) >= tier.min && Number(g.rank) <= tier.max); }
  function memberName(member) { return member?.displayName || member?.name || member?.playerName || "未公開名稱"; }
  function memberLevel(member) { const raw = member?.displayLevel ?? member?.level ?? member?.playerLevel; return raw === undefined || raw === null || raw === "" ? "-" : num(raw); }

  function render() {
    const q = (els.search?.value || "").trim().toLowerCase();
    const tier = currentTier();
    const scoped = tierGuilds();
    const rows = scoped.filter(g => !q || String(g.guildName || "").toLowerCase().includes(q));
    if (els.tierLabel) els.tierLabel.textContent = tier.label;
    if (els.count) els.count.textContent = num(scoped.length);
    if (!els.body) return;
    els.body.innerHTML = rows.length ? rows.map(g => `
      <tr class="guildwar-rank-row" data-guild-rank="${esc(g.rank)}" tabindex="0" role="button" aria-label="查看 ${esc(g.guildName || "-")} 的公會成員">
        <td class="pvp-rank-cell"><span class="pvp-rank-medal">${esc(g.rank)}</span></td>
        <td><strong title="${esc(g.guildName || "-")}">${esc(g.guildName || "-")}</strong></td>
        <td>${esc(num(g.score))}</td>
        <td>${esc(num(g.curMemberCount))} / ${esc(num(g.maxMemberCount))}</td>
        <td>${esc(g.nationalFlag || "-")}</td>
      </tr>`).join("") : `<tr class="pvp-empty-row"><td colspan="5">目前沒有${esc(tier.label)}段位的公會資料。</td></tr>`;
  }

  function openGuild(guild) {
    if (!guild || !els.modal || !els.modalContent) return;
    const members = Array.isArray(guild.members) ? guild.members : [];
    const list = members.length
      ? `<div class="guildwar-member-list">${members.map(member => `<div class="guildwar-member-row"><div class="guildwar-member-name">${esc(memberName(member))}</div><div class="guildwar-member-level">Lv. ${esc(memberLevel(member))}</div></div>`).join("")}</div>`
      : `<div class="guildwar-member-empty">此公會的成員資料尚未產生。</div>`;
    els.modalContent.innerHTML = `<header class="guildwar-member-header"><h2 id="guildMemberModalTitle">${esc(guild.guildName || "-")}</h2><p>排名第 ${esc(num(guild.rank))} 名 · ${esc(num(guild.curMemberCount))} / ${esc(num(guild.maxMemberCount))} 名成員</p></header>${list}`;
    els.modal.hidden = false;
    document.body.classList.add("modal-open");
  }
  function closeModal() { if (!els.modal || els.modal.hidden) return; els.modal.hidden = true; document.body.classList.remove("modal-open"); }
  function guildFromRow(row) { const rank = Number(row?.dataset?.guildRank); return guilds.find(g => Number(g.rank) === rank); }

  async function load() {
    status("公會排名資料載入中…");
    try {
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      guilds = Array.isArray(data.guilds) ? data.guilds : [];
      if (els.updated) els.updated.textContent = date(data.metadata?.generatedAtUtc);
      status();
      render();
    } catch (e) {
      console.error(e);
      status("公會排名資料尚未產生或目前無法載入。", true);
      if (els.body) els.body.innerHTML = "";
    }
  }
  els.search?.addEventListener("input", render);
  els.tier?.addEventListener("change", render);
  els.body?.addEventListener("click", e => { const row = e.target.closest("[data-guild-rank]"); if (row) openGuild(guildFromRow(row)); });
  els.body?.addEventListener("keydown", e => { if (e.key !== "Enter" && e.key !== " ") return; const row = e.target.closest("[data-guild-rank]"); if (row) { e.preventDefault(); openGuild(guildFromRow(row)); } });
  els.modalClose?.addEventListener("click", closeModal);
  els.modal?.addEventListener("click", e => { if (e.target.closest("[data-guild-member-modal-close]")) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
  load();
})();