(() => {
  const DATA_URLS = {
    LEGEND: "https://pvp-data.warmycat.com/guildwar_usage.json",
    LEGEND_20: "https://pvp-data.warmycat.com/guildwar_usage.json",
    MASTER: "https://pvp-data.warmycat.com/guildwar_usage_MASTER.json",
    DIAMOND: "https://pvp-data.warmycat.com/guildwar_usage_DIAMOND.json",
  };
  const TIER_LABELS = { LEGEND: "傳奇", LEGEND_20: "傳奇（1～20名）", MASTER: "大師", DIAMOND: "鑽石" };
  const RANGERS_URL = "../../res/Rangers_data.json";
  const ID_DICT_URL = "../../res/id_dict.json";
  const ABILITY_URL = "../../res/%E8%83%BD%E5%8A%9B.json";
  const OPTION_PAGE_SIZE = 5;
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
  const RANGER_DETAIL = (id) => `../../ranger/ranger/${encodeURIComponent(id)}`;
  const GEAR_ICON = (id) => `https://rangers.lerico.net/res/gear_icon/${encodeURIComponent(id)}_icon.png`;
  const ABILITY_ICON = (icon) => `https://rangers.lerico.net/res/ability_icon/${encodeURIComponent(icon)}`;
  const TALENT_ICON = (grade) => `../../assets/tlt_icon/tlt${encodeURIComponent(grade)}.png`;
  const SLOT_LABELS = { WEAPON: "武器", ARMOR: "防具", ACC: "飾品" };
  const els = {
    updated: document.getElementById("guildUsageUpdated"), scopeLabel: document.getElementById("guildUsageScopeLabel"), sample: document.getElementById("guildUsageSampleCount"), guildCount: document.getElementById("guildUsageGuildCount"), description: document.getElementById("guildUsageDescription"),
    search: document.getElementById("guildUsageSearch"), tier: document.getElementById("guildUsageTier"), type: document.getElementById("guildUsageType"), element: document.getElementById("guildUsageElement"), status: document.getElementById("guildUsageStatus"), body: document.getElementById("guildUsageBody"),
    modal: document.getElementById("guildUsageModal"), modalContent: document.getElementById("guildUsageModalContent"), modalClose: document.getElementById("guildUsageModalClose")
  };
  let dataSet = {}, rows = [], rangerMap = {}, gearNames = {}, abilityMap = {}, supportLoaded = false;
  const modalState = { id: "", pages: { WEAPON: 0, ARMOR: 0, ACC: 0 } };
  const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const num = (v) => Number.isFinite(Number(v)) ? Number(v).toLocaleString("zh-Hant", { maximumFractionDigits: 2 }) : "-";
  const fmtDate = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? "-" : new Intl.DateTimeFormat("zh-Hant", { year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false }).format(d); };
  const infoFor = (id) => rangerMap[id] || { name: id, star: "", type: "", element: "" };
  function status(text = "", error = false) { els.status.hidden = !text; els.status.textContent = text; els.status.classList.toggle("error", error); }
  function fill(select, values, label) { const prev = select.value; const vals = [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-Hant")); select.innerHTML = `<option value="">${esc(label)}</option>` + vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join(""); if (vals.includes(prev)) select.value = prev; }
  function hydrate(raw) { return raw.map(row => { const i = infoFor(row.unitCode || row.rangerId); return { ...row, rangerId: row.unitCode || row.rangerId, name: i.name, star: i.star, type: i.type, element: i.element }; }); }
  function currentTier() { return els.tier?.value || "LEGEND"; }
  function activeRows() {
    const tier = currentTier();
    if (tier === "LEGEND_20") return dataSet.scopes?.["20"]?.rangers || [];
    if (tier === "LEGEND") return dataSet.scopes?.["50"]?.rangers || dataSet.rangers || [];
    return dataSet.rangers || [];
  }
  function activeMeta() {
    const tier = currentTier();
    if (tier === "LEGEND_20") return dataSet.scopes?.["20"]?.metadata || {};
    if (tier === "LEGEND") return dataSet.scopes?.["50"]?.metadata || dataSet.metadata || {};
    return dataSet.metadata || {};
  }
  function applyData() {
    const tier = currentTier(), label = TIER_LABELS[tier] || tier, rawRows = activeRows(), meta = activeMeta();
    rows = hydrate(rawRows);
    els.updated.textContent = fmtDate(dataSet.metadata?.generatedAtUtc); els.scopeLabel.textContent = label; els.sample.textContent = num(meta.sampleCount ?? dataSet.metadata?.sampleCount); els.guildCount.textContent = num(meta.actualGuildCount ?? (tier === "LEGEND_20" ? 20 : dataSet.metadata?.actualGuildCount));
    if (els.description) els.description.textContent = tier === "LEGEND_20" ? "傳奇段位前 20 名公會的公會戰進攻隊伍角色使用率" : `${label}段位公會戰的進攻隊伍角色使用率`;
    fill(els.type, rows.map(r=>r.type), "全部類型"); fill(els.element, rows.map(r=>r.element), "全部屬性"); render(); closeModal(); status();
  }
  function render() {
    const q = (els.search.value || "").trim().toLowerCase(), type = els.type.value, element = els.element.value;
    const list = rows.filter(r => (!type || r.type===type) && (!element || r.element===element) && (!q || [r.name,r.rangerId,r.star,r.type,r.element].some(v=>String(v||"").toLowerCase().includes(q))));
    els.body.innerHTML = list.length ? list.map(r => { const rate=Math.max(0,Math.min(100,Number(r.usageRate)||0)); return `<tr><td class="pvp-rank-cell"><span class="pvp-rank-medal">${esc(r.rank)}</span></td><td><button class="pvp-ranger-main pvp-ranger-trigger" type="button" data-ranger-id="${esc(r.rangerId)}"><img class="pvp-ranger-thumb" src="${RANGER_IMAGE(r.rangerId)}" alt="" loading="lazy" onerror="this.remove();"><span><span class="pvp-ranger-name">${esc(r.name)}</span><span class="pvp-ranger-sub">${esc([r.star,r.type,r.element].filter(Boolean).join(" · "))}</span></span></button></td><td>${esc(num(r.playerCount))}</td><td class="pvp-usage-cell"><div class="pvp-usage-number"><strong>${esc(num(rate))}%</strong><span>${esc(num(r.playerCount))} 人</span></div><div class="pvp-usage-bar"><span style="--usage-rate:${rate}%"></span></div></td><td><strong>${esc(num(r.guildUsageRate))}%</strong><span class="pvp-rank-delta">${esc(num(r.guildUsageCount))} 個公會</span></td></tr>`; }).join("") : `<tr class="pvp-empty-row"><td colspan="5">找不到符合條件的角色。</td></tr>`;
  }
  function optionList(items, kind) {
    if (!items?.length) return `<div class="pvp-modal-empty">目前沒有可顯示的統計資料。</div>`;
    return `<div class="pvp-option-list">${items.map(item => { let code, name, icon=""; if(kind==="gear"){ code=item.equipItemCode||item.itemCode||""; name=gearNames[code]||code; icon=code?GEAR_ICON(code):""; } else if(kind==="ability"){ code=item.awakeAbilityCode||""; const a=abilityMap[code]||{}; name=a["名稱"]||code; icon=a.icon?ABILITY_ICON(a.icon):""; } else { code=String(item.talentGrade ?? ""); name=Number(code)===0?"未解放才能":`才能解放階段 ${code}`; icon=/^[0-4]$/.test(code)?TALENT_ICON(code):""; } const rate=Math.max(0,Math.min(100,Number(item.rate)||0)); return `<div class="pvp-option-row">${icon?`<img class="pvp-option-icon" src="${icon}" alt="" loading="lazy" onerror="this.remove();">`:`<span class="pvp-option-icon pvp-option-icon-empty">—</span>`}<div class="pvp-option-main"><div class="pvp-option-title">${esc(name)}</div><div class="pvp-option-bar"><span style="--option-rate:${rate}%"></span></div></div><div class="pvp-option-stats"><strong>${esc(num(rate))}%</strong><span>${esc(num(item.count))} 次</span></div></div>`; }).join("")}</div>`;
  }
  function gearCard(row, slot) { const all=row.equipmentUsage?.[slot]||[], pages=Math.max(1,Math.ceil(all.length/OPTION_PAGE_SIZE)), page=Math.max(0,Math.min(pages-1,modalState.pages[slot]||0)); modalState.pages[slot]=page; const items=all.slice(page*OPTION_PAGE_SIZE,(page+1)*OPTION_PAGE_SIZE); return `<section class="pvp-equipment-card" data-slot="${slot}"><h4>${SLOT_LABELS[slot]}</h4>${optionList(items,"gear")}${pages>1?`<div class="pvp-option-pagination"><button data-page-slot="${slot}" data-page="${page-1}" ${page===0?"disabled":""}>‹</button><span>${page+1} / ${pages}</span><button data-page-slot="${slot}" data-page="${page+1}" ${page===pages-1?"disabled":""}>›</button></div>`:""}</section>`; }
  function openModal(row) { if(!row)return; modalState.id=row.rangerId; modalState.pages={WEAPON:0,ARMOR:0,ACC:0}; const common=(row.coOccurrence||[]).slice(0,5).map(x=>{const i=infoFor(x.unitCode);return `<span>${esc(i.name)} ${esc(num(x.rate))}%</span>`}).join(""); els.modalContent.innerHTML=`<header class="pvp-modal-ranger-header"><img class="pvp-modal-ranger-image" src="${RANGER_IMAGE(row.rangerId)}" alt=""><div class="pvp-modal-ranger-copy"><h2 id="guildUsageModalTitle">${esc(row.name)}</h2><p>${esc([row.star,row.type,row.element].filter(Boolean).join(" · "))}</p><div class="pvp-modal-summary"><span><strong>${esc(num(row.usageRate))}%</strong> 使用率</span><span><strong>${esc(num(row.playerCount))}</strong> 名玩家</span><span><strong>${esc(num(row.guildUsageRate))}%</strong> 公會普及率</span></div></div><a class="pvp-modal-detail-link" href="${RANGER_DETAIL(row.rangerId)}">查看角色詳細資料</a></header><section class="pvp-modal-section"><div class="pvp-modal-section-heading"><h3>配裝情況</h3></div><div class="pvp-equipment-grid">${Object.keys(SLOT_LABELS).map(s=>gearCard(row,s)).join("")}</div></section><section class="pvp-modal-section pvp-modal-section--no-divider"><div class="pvp-modal-section-heading"><h3>覺醒能力使用情況</h3></div>${optionList(row.awakeningUsage,"ability")}</section><section class="pvp-modal-section"><div class="pvp-modal-section-heading"><h3>才能解放狀態</h3></div>${optionList(row.talentUsage,"talent")}</section>${common?`<section class="pvp-modal-section"><div class="pvp-modal-section-heading"><h3>常見搭配角色</h3></div><div class="pvp-modal-summary">${common}</div></section>`:""}`; els.modal.hidden=false; document.body.classList.add("modal-open"); }
  function closeModal(){ if(!els.modal||els.modal.hidden)return; els.modal.hidden=true;document.body.classList.remove("modal-open"); }
  async function optional(url){try{const r=await fetch(url);return r.ok?await r.json():{};}catch{return {};}}
  async function loadSupport(){ if(supportLoaded)return; const [rangers,ids,abilities]=await Promise.all([optional(RANGERS_URL),optional(ID_DICT_URL),optional(ABILITY_URL)]); rangerMap={};(Array.isArray(rangers)?rangers:[]).forEach(r=>{const id=String(r.ranger_id||"");if(id)rangerMap[id]={name:String(r["Ranger名稱"]||id),star:String(r["Ranger星數"]||""),type:String(r["類型"]||""),element:String(r["屬性"]||"")};});gearNames=Object.fromEntries(Object.entries(ids||{}).map(([name,code])=>[String(code),String(name)]));abilityMap=abilities||{};supportLoaded=true; }
  async function load(){ const tier=currentTier(), url=DATA_URLS[tier] || DATA_URLS.LEGEND; window.RANGERBOOK_GUILDWAR_USAGE_URL=url; status("公會戰角色使用率資料載入中…");try{const [res]=await Promise.all([fetch(`${url}?t=${Date.now()}`,{cache:"no-store"}),loadSupport()]);if(!res.ok)throw new Error(`HTTP ${res.status}`);dataSet=await res.json();applyData();}catch(e){console.error(e);rows=[];render();status(`${TIER_LABELS[tier]||tier}公會戰角色使用率資料尚未產生或目前無法載入。`,true);}}
  [els.search,els.type,els.element].forEach(e=>{e?.addEventListener("input",render);e?.addEventListener("change",render);}); els.tier?.addEventListener("change",load); els.body?.addEventListener("click",e=>{const b=e.target.closest("[data-ranger-id]");if(b)openModal(rows.find(r=>r.rangerId===b.dataset.rangerId));}); els.modalContent?.addEventListener("click",e=>{const b=e.target.closest("[data-page-slot]");if(!b||b.disabled)return;const row=rows.find(r=>r.rangerId===modalState.id),slot=b.dataset.pageSlot;if(!row||!SLOT_LABELS[slot])return;modalState.pages[slot]=Number(b.dataset.page)||0;const card=els.modalContent.querySelector(`[data-slot="${slot}"]`);if(card)card.outerHTML=gearCard(row,slot);}); els.modalClose?.addEventListener("click",closeModal); els.modal?.addEventListener("click",e=>{if(e.target.closest("[data-guild-modal-close]"))closeModal();}); document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();}); load();
})();