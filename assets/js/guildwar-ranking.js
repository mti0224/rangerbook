(() => {
  const DATA_URL = "https://pvp-data.warmycat.com/guildwar_ranking.json";
  const COMPACT_URLS = {
    LEGEND: "https://pvp-data.warmycat.com/guildwar_data_LEGEND.json",
    MASTER: "https://pvp-data.warmycat.com/guildwar_data_MASTER.json",
    DIAMOND: "https://pvp-data.warmycat.com/guildwar_data_DIAMOND.json",
  };
  const RANGERS_URL = "../../res/Rangers_data.json";
  const RANGER_IMAGE = id => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
  const ADMIN_MODE = localStorage.getItem("rangerbook-admin-mode") === "true";
  const TIERS = {
    LEGEND: { label:"傳奇", min:1, max:50 },
    MASTER: { label:"大師", min:51, max:200 },
    DIAMOND: { label:"鑽石", min:201, max:400 },
  };
  const els = {
    updated:document.getElementById("guildRankingUpdated"), count:document.getElementById("guildRankingCount"), tier:document.getElementById("guildRankingTier"), tierLabel:document.getElementById("guildRankingTierLabel"), search:document.getElementById("guildRankingSearch"), status:document.getElementById("guildRankingStatus"), body:document.getElementById("guildRankingBody"), modal:document.getElementById("guildMemberModal"), modalContent:document.getElementById("guildMemberModalContent"), modalClose:document.getElementById("guildMemberModalClose"),
  };
  let guilds=[], rangerNames={}, openGuildRank=0;
  const tierDataCache=new Map();
  const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const num=v=>Number.isFinite(Number(v))?Number(v).toLocaleString("zh-Hant",{maximumFractionDigits:2}):"-";
  const date=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?"-":new Intl.DateTimeFormat("zh-Hant",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(d)};
  const status=(text="",error=false)=>{if(!els.status)return;els.status.hidden=!text;els.status.textContent=text;els.status.classList.toggle("error",error)};
  const currentTierCode=()=>els.tier?.value||"LEGEND";
  const currentTier=()=>TIERS[currentTierCode()]||TIERS.LEGEND;
  const tierGuilds=()=>{const t=currentTier();return guilds.filter(g=>Number(g.rank)>=t.min&&Number(g.rank)<=t.max)};
  const memberName=m=>m?.displayName||m?.name||m?.playerName||"未公開名稱";
  const memberLevel=m=>{const raw=m?.displayLevel??m?.level??m?.playerLevel;return raw===undefined||raw===null||raw===""?"-":num(raw)};

  function render(){const q=(els.search?.value||"").trim().toLowerCase(),tier=currentTier(),scoped=tierGuilds(),rows=scoped.filter(g=>!q||String(g.guildName||"").toLowerCase().includes(q));if(els.tierLabel)els.tierLabel.textContent=tier.label;if(els.count)els.count.textContent=num(scoped.length);if(!els.body)return;els.body.innerHTML=rows.length?rows.map(g=>`<tr class="guildwar-rank-row" data-guild-rank="${esc(g.rank)}" tabindex="0" role="button"><td class="pvp-rank-cell"><span class="pvp-rank-medal">${esc(g.rank)}</span></td><td><strong title="${esc(g.guildName||"-")}">${esc(g.guildName||"-")}</strong></td><td>${num(g.score)}</td><td>${num(g.curMemberCount)} / ${num(g.maxMemberCount)}</td><td>${esc(g.nationalFlag||"-")}</td></tr>`).join(""):`<tr class="pvp-empty-row"><td colspan="5">目前沒有${esc(tier.label)}段位的公會資料。</td></tr>`}

  async function loadTierData(code){if(tierDataCache.has(code))return tierDataCache.get(code);const url=COMPACT_URLS[code];if(!url)return{};const promise=fetch(`${url}?t=${Date.now()}`,{cache:"no-store"}).then(r=>r.ok?r.json():{}).catch(()=>({}));tierDataCache.set(code,promise);return promise}
  function compactGuild(data,rank){return (Array.isArray(data?.guilds)?data.guilds:[]).find(g=>Number(g.rank)===Number(rank))||null}
  function normalizeTeamGroups(guildwar){if(!guildwar||typeof guildwar!=="object")return[];return Object.entries(guildwar).filter(([,u])=>Array.isArray(u)).map(([k,u])=>[k,u.filter(x=>x?.unitCode)])}

  async function renderGuildMembers(guild){els.modalContent.innerHTML=`<div class="guildwar-member-empty">公會成員資料載入中…</div>`;const data=await loadTierData(currentTierCode());const detail=compactGuild(data,guild.rank);const members=Array.isArray(detail?.members)?detail.members:[];const list=members.length?`<div class="guildwar-member-list">${members.map((m,i)=>`<div class="guildwar-member-row"><div><div class="guildwar-member-name">${esc(memberName(m))}</div><div class="guildwar-member-level">Lv. ${esc(memberLevel(m))}</div></div>${ADMIN_MODE?`<button class="guildwar-member-team-button" type="button" data-member-team-index="${i}">查看進攻隊伍</button>`:""}</div>`).join("")}</div>`:`<div class="guildwar-member-empty">此公會的成員資料尚未產生。</div>`;els.modalContent.innerHTML=`<header class="guildwar-member-header"><h2 id="guildMemberModalTitle">${esc(guild.guildName||"-")}</h2><p>排名第 ${num(guild.rank)} 名 · ${num(guild.curMemberCount)} / ${num(guild.maxMemberCount)} 名成員</p></header>${list}`}

  async function renderMemberTeam(index){const guild=guilds.find(g=>Number(g.rank)===openGuildRank);if(!guild)return;const data=await loadTierData(currentTierCode()),detail=compactGuild(data,openGuildRank),member=Array.isArray(detail?.members)?detail.members[index]:null;if(!member)return;const groups=normalizeTeamGroups(member.guildwar);const content=groups.length?groups.map(([teamKey,units])=>`<section class="guildwar-team-section"><h3>${esc(teamKey)}</h3><div class="guildwar-team-grid">${units.map(unit=>{const code=String(unit.unitCode||""),name=rangerNames[code]||code;return `<div class="guildwar-team-unit"><img src="${RANGER_IMAGE(code)}" alt="" loading="lazy" onerror="this.remove();"><strong title="${esc(name)}">${esc(name)}</strong></div>`}).join("")}</div></section>`).join(""):`<div class="guildwar-member-empty">此成員目前沒有可顯示的公會戰進攻隊伍資料。</div>`;els.modalContent.innerHTML=`<button class="guildwar-team-back" type="button" data-team-back>← 返回成員列表</button><header class="guildwar-member-header"><h2 id="guildMemberModalTitle">${esc(memberName(member))}</h2><p>${esc(guild.guildName||"-")} · Lv. ${esc(memberLevel(member))}</p></header>${content}`}

  function openGuild(guild){if(!guild||!els.modal)return;openGuildRank=Number(guild.rank)||0;els.modal.hidden=false;document.body.classList.add("modal-open");renderGuildMembers(guild)}
  function closeModal(){if(!els.modal||els.modal.hidden)return;els.modal.hidden=true;document.body.classList.remove("modal-open")}
  function guildFromRow(row){const rank=Number(row?.dataset?.guildRank);return guilds.find(g=>Number(g.rank)===rank)}
  async function optional(url){try{const r=await fetch(url);return r.ok?r.json():[];}catch{return[]}}
  async function load(){status("公會排名資料載入中…");try{const requests=[fetch(`${DATA_URL}?t=${Date.now()}`,{cache:"no-store"})];if(ADMIN_MODE)requests.push(optional(RANGERS_URL));const results=await Promise.all(requests),rankingRes=results[0];if(!rankingRes.ok)throw new Error(`HTTP ${rankingRes.status}`);const data=await rankingRes.json();guilds=Array.isArray(data.guilds)?data.guilds:[];if(ADMIN_MODE){rangerNames={};(Array.isArray(results[1])?results[1]:[]).forEach(row=>{const code=String(row.ranger_id||"");if(code)rangerNames[code]=String(row["Ranger名稱"]||code)})}if(els.updated)els.updated.textContent=date(data.metadata?.generatedAtUtc);status();render()}catch(e){console.error(e);status("公會排名資料尚未產生或目前無法載入。",true);if(els.body)els.body.innerHTML=""}}

  els.search?.addEventListener("input",render);els.tier?.addEventListener("change",render);els.body?.addEventListener("click",e=>{const row=e.target.closest("[data-guild-rank]");if(row)openGuild(guildFromRow(row))});els.body?.addEventListener("keydown",e=>{if(e.key!=="Enter"&&e.key!==" ")return;const row=e.target.closest("[data-guild-rank]");if(row){e.preventDefault();openGuild(guildFromRow(row))}});els.modalContent?.addEventListener("click",e=>{const b=e.target.closest("[data-member-team-index]");if(b&&ADMIN_MODE){renderMemberTeam(Number(b.dataset.memberTeamIndex));return}if(e.target.closest("[data-team-back]")){const guild=guilds.find(g=>Number(g.rank)===openGuildRank);if(guild)renderGuildMembers(guild)}});els.modalClose?.addEventListener("click",closeModal);els.modal?.addEventListener("click",e=>{if(e.target.closest("[data-guild-member-modal-close]"))closeModal()});document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});load();
})();