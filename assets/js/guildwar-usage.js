(() => {
  const DATA_URLS = {
    LEGEND: "https://pvp-data.warmycat.com/guildwar_data_LEGEND.json",
    LEGEND_20: "https://pvp-data.warmycat.com/guildwar_data_LEGEND.json",
    MASTER: "https://pvp-data.warmycat.com/guildwar_data_MASTER.json",
    DIAMOND: "https://pvp-data.warmycat.com/guildwar_data_DIAMOND.json",
  };
  const TIER_LABELS = { LEGEND: "傳奇", LEGEND_20: "傳奇（1～20名）", MASTER: "大師", DIAMOND: "鑽石" };
  const RANGERS_URL = "../../res/Rangers_data.json";
  const ID_DICT_URL = "../../res/id_dict.json";
  const ABILITY_URL = "../../res/%E8%83%BD%E5%8A%9B.json";
  const PAGE_SIZE = 5;
  const SLOTS = ["WEAPON", "ARMOR", "ACC"];
  const SLOT_LABELS = { WEAPON: "武器", ARMOR: "防具", ACC: "飾品" };
  const RANGER_IMAGE = id => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
  const RANGER_DETAIL = id => `../../ranger/ranger/${encodeURIComponent(id)}`;
  const GEAR_ICON = id => `https://rangers.lerico.net/res/gear_icon/${encodeURIComponent(id)}_icon.png`;
  const ABILITY_ICON = icon => `https://rangers.lerico.net/res/ability_icon/${encodeURIComponent(icon)}`;
  const TALENT_ICON = grade => `../../assets/tlt_icon/tlt${encodeURIComponent(grade)}.png`;

  const els = {
    updated: document.getElementById("guildUsageUpdated"), scopeLabel: document.getElementById("guildUsageScopeLabel"),
    sample: document.getElementById("guildUsageSampleCount"), guildCount: document.getElementById("guildUsageGuildCount"),
    description: document.getElementById("guildUsageDescription"), search: document.getElementById("guildUsageSearch"),
    tier: document.getElementById("guildUsageTier"), type: document.getElementById("guildUsageType"),
    element: document.getElementById("guildUsageElement"), status: document.getElementById("guildUsageStatus"),
    body: document.getElementById("guildUsageBody"), modal: document.getElementById("guildUsageModal"),
    modalContent: document.getElementById("guildUsageModalContent"), modalClose: document.getElementById("guildUsageModalClose"),
  };

  let dataSet = {}, activeGuilds = [], rows = [], rangerMap = {}, gearNames = {}, abilityMap = {}, supportLoaded = false;
  const detailCache = new Map();
  const modalState = { id: "", gearPages: { WEAPON: 0, ARMOR: 0, ACC: 0 }, comboPage: 0 };

  const esc = v => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const num = v => Number.isFinite(Number(v)) ? Number(v).toLocaleString("zh-Hant", { maximumFractionDigits: 2 }) : "-";
  const pct = (a, b) => b > 0 ? Math.round(a * 10000 / b) / 100 : 0;
  const fmtDate = v => { const d = new Date(v); return Number.isNaN(d.getTime()) ? "-" : new Intl.DateTimeFormat("zh-Hant", { year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false }).format(d); };
  const currentTier = () => els.tier?.value || "LEGEND";
  const infoFor = id => rangerMap[id] || { name: id, star: "", type: "", element: "" };
  const status = (text = "", error = false) => { if (!els.status) return; els.status.hidden = !text; els.status.textContent = text; els.status.classList.toggle("error", error); };

  function fill(select, values, label) {
    if (!select) return;
    const prev = select.value;
    const vals = [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-Hant"));
    select.innerHTML = `<option value="">${esc(label)}</option>` + vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
    if (vals.includes(prev)) select.value = prev;
  }

  function iterUnits(member) {
    const out = [], guildwar = member?.guildwar;
    if (!guildwar || typeof guildwar !== "object") return out;
    for (const list of Object.values(guildwar)) if (Array.isArray(list)) for (const unit of list) if (unit?.unitCode) out.push(unit);
    return out;
  }

  function selectGuilds() {
    const guilds = Array.isArray(dataSet.guilds) ? dataSet.guilds : [];
    return currentTier() === "LEGEND_20" ? guilds.filter(g => Number(g.rank) <= 20) : guilds;
  }

  function buildSummary(guilds) {
    const players = new Map(), appearances = new Map(), guildUsage = new Map();
    let sampleCount = 0;
    for (const guild of guilds) {
      const seenGuild = new Set();
      for (const member of Array.isArray(guild.members) ? guild.members : []) {
        const units = iterUnits(member); if (!units.length) continue;
        sampleCount += 1;
        const seenPlayer = new Set();
        for (const unit of units) {
          const id = String(unit.unitCode);
          appearances.set(id, (appearances.get(id) || 0) + 1);
          seenPlayer.add(id); seenGuild.add(id);
        }
        for (const id of seenPlayer) players.set(id, (players.get(id) || 0) + 1);
      }
      for (const id of seenGuild) {
        if (!guildUsage.has(id)) guildUsage.set(id, new Set());
        guildUsage.get(id).add(String(guild.rank));
      }
    }
    const result = [...players.keys()].map(id => {
      const info = infoFor(id), playerCount = players.get(id) || 0, guildUsageCount = guildUsage.get(id)?.size || 0;
      return { rangerId:id, unitCode:id, name:info.name, star:info.star, type:info.type, element:info.element,
        playerCount, appearanceCount:appearances.get(id)||0, usageRate:pct(playerCount,sampleCount),
        guildUsageCount, guildUsageRate:pct(guildUsageCount,guilds.length) };
    }).sort((a,b)=>b.playerCount-a.playerCount||b.appearanceCount-a.appearanceCount||a.rangerId.localeCompare(b.rangerId));
    result.forEach((row,i)=>row.rank=i+1);
    return { rows:result, sampleCount };
  }

  function applyData() {
    activeGuilds = selectGuilds(); detailCache.clear();
    const summary = buildSummary(activeGuilds); rows = summary.rows;
    const tier=currentTier(), label=TIER_LABELS[tier]||tier;
    els.updated.textContent=fmtDate(dataSet.metadata?.generatedAtUtc); els.scopeLabel.textContent=label;
    els.sample.textContent=num(summary.sampleCount); els.guildCount.textContent=num(activeGuilds.length);
    if(els.description) els.description.textContent=tier==="LEGEND_20"?"傳奇段位前 20 名公會的公會戰進攻隊伍角色使用率":`${label}段位公會戰的進攻隊伍角色使用率`;
    fill(els.type,rows.map(r=>r.type),"全部類型"); fill(els.element,rows.map(r=>r.element),"全部屬性");
    render(); closeModal(); status();
  }

  function render() {
    const q=(els.search?.value||"").trim().toLowerCase(), type=els.type?.value||"", element=els.element?.value||"";
    const list=rows.filter(r=>(!type||r.type===type)&&(!element||r.element===element)&&(!q||[r.name,r.rangerId,r.star,r.type,r.element].some(v=>String(v||"").toLowerCase().includes(q))));
    els.body.innerHTML=list.length?list.map(r=>{const rate=Math.max(0,Math.min(100,Number(r.usageRate)||0));return `<tr><td class="pvp-rank-cell"><span class="pvp-rank-medal">${r.rank}</span></td><td><button class="pvp-ranger-main pvp-ranger-trigger" type="button" data-ranger-id="${esc(r.rangerId)}"><img class="pvp-ranger-thumb" src="${RANGER_IMAGE(r.rangerId)}" alt="" loading="lazy" onerror="this.remove();"><span><span class="pvp-ranger-name">${esc(r.name)}</span><span class="pvp-ranger-sub">${esc([r.star,r.type,r.element].filter(Boolean).join(" · "))}</span></span></button></td><td>${num(r.playerCount)}</td><td class="pvp-usage-cell"><div class="pvp-usage-number"><strong>${num(rate)}%</strong><span>${num(r.playerCount)} 人</span></div><div class="pvp-usage-bar"><span style="--usage-rate:${rate}%"></span></div></td><td><strong>${num(r.guildUsageRate)}%</strong><span class="pvp-rank-delta">${num(r.guildUsageCount)} 個公會</span></td></tr>`}).join(""):`<tr class="pvp-empty-row"><td colspan="5">找不到符合條件的角色。</td></tr>`;
  }

  function gearCode(unit,slot){const v=unit?.equipMap?.[slot];if(typeof v==="string")return v;if(v&&typeof v==="object")return String(v.equipItemCode||v.itemCode||v.code||"");return "";}
  function sortedUsage(map,key,denom){return [...map.entries()].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]))).map(([code,count])=>({[key]:code,count,rate:pct(count,denom)}));}

  function buildDetail(rangerId) {
    const cacheKey=`${currentTier()}:${rangerId}`; if(detailCache.has(cacheKey))return detailCache.get(cacheKey);
    const gear={WEAPON:new Map(),ARMOR:new Map(),ACC:new Map()}, combos=new Map(), awakening=new Map(), talent=new Map(), co=new Map(); let appearances=0;
    for(const guild of activeGuilds) for(const member of Array.isArray(guild.members)?guild.members:[]) {
      const units=iterUnits(member), codes=[...new Set(units.map(u=>String(u.unitCode)))];
      if(codes.includes(rangerId)) for(const other of codes) if(other!==rangerId) co.set(other,(co.get(other)||0)+1);
      for(const unit of units){if(String(unit.unitCode)!==rangerId)continue;appearances+=1;const parts=SLOTS.map(s=>gearCode(unit,s)||"__NONE__");parts.forEach((code,i)=>gear[SLOTS[i]].set(code,(gear[SLOTS[i]].get(code)||0)+1));const ck=parts.join("\u0001");combos.set(ck,(combos.get(ck)||0)+1);const awake=unit.awakeAbilityCode;if(awake!==null&&awake!==undefined&&awake!=="")awakening.set(String(awake),(awakening.get(String(awake))||0)+1);const tg=unit.talentGrade;if(tg!==null&&tg!==undefined&&tg!=="")talent.set(String(tg),(talent.get(String(tg))||0)+1);}
    }
    const playerDenom=rows.find(r=>r.rangerId===rangerId)?.playerCount||0;
    const detail={equipmentUsage:Object.fromEntries(SLOTS.map(s=>[s,sortedUsage(gear[s],"equipItemCode",appearances)])),equipmentCombinationUsage:[...combos.entries()].sort((a,b)=>b[1]-a[1]).map(([key,count])=>{const [WEAPON,ARMOR,ACC]=key.split("\u0001");return{WEAPON,ARMOR,ACC,count,rate:pct(count,appearances)}}),awakeningUsage:sortedUsage(awakening,"awakeAbilityCode",appearances),talentUsage:sortedUsage(talent,"talentGrade",appearances),coOccurrence:[...co.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([unitCode,count])=>({unitCode,count,rate:pct(count,playerDenom)}))};
    detailCache.set(cacheKey,detail); return detail;
  }

  function optionList(items,kind){if(!items?.length)return `<div class="pvp-modal-empty">目前沒有可顯示的統計資料。</div>`;return `<div class="pvp-option-list">${items.map(item=>{let code,name,icon="";if(kind==="gear"){code=item.equipItemCode||"";name=code==="__NONE__"?"未裝備":gearNames[code]||code;icon=code&&code!=="__NONE__"?GEAR_ICON(code):""}else if(kind==="ability"){code=item.awakeAbilityCode||"";const a=abilityMap[code]||{};name=a["名稱"]||code;icon=a.icon?ABILITY_ICON(a.icon):""}else{code=String(item.talentGrade??"");name=Number(code)===0?"未解放才能":`才能解放階段 ${code}`;icon=/^[0-4]$/.test(code)?TALENT_ICON(code):""}const rate=Math.max(0,Math.min(100,Number(item.rate)||0));return `<div class="pvp-option-row">${icon?`<img class="pvp-option-icon" src="${icon}" alt="" loading="lazy" onerror="this.remove();">`:`<span class="pvp-option-icon pvp-option-icon-empty">—</span>`}<div class="pvp-option-main"><div class="pvp-option-title">${esc(name)}</div><div class="pvp-option-bar"><span style="--option-rate:${rate}%"></span></div></div><div class="pvp-option-stats"><strong>${num(rate)}%</strong><span>${num(item.count)} 次</span></div></div>`}).join("")}</div>`;}
  function gearCard(detail,slot){const all=detail.equipmentUsage?.[slot]||[],pages=Math.max(1,Math.ceil(all.length/PAGE_SIZE)),page=Math.max(0,Math.min(pages-1,modalState.gearPages[slot]||0));modalState.gearPages[slot]=page;const items=all.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);return `<section class="pvp-equipment-card" data-slot="${slot}"><h4>${SLOT_LABELS[slot]}</h4>${optionList(items,"gear")}${pages>1?`<div class="pvp-option-pagination"><button data-page-slot="${slot}" data-page="${page-1}" ${page===0?"disabled":""}>‹</button><span>${page+1} / ${pages}</span><button data-page-slot="${slot}" data-page="${page+1}" ${page===pages-1?"disabled":""}>›</button></div>`:""}</section>`;}
  function comboChip(code,label){const name=code==="__NONE__"?"未裝備":gearNames[code]||code,icon=code&&code!=="__NONE__"?`<img class="pvp-combo-gear-icon" src="${GEAR_ICON(code)}" alt="" loading="lazy" onerror="this.remove();">`:`<span class="pvp-combo-gear-icon pvp-combo-gear-empty">—</span>`;return `<div class="pvp-combo-gear">${icon}<div><span>${label}</span><strong title="${esc(name)}">${esc(name)}</strong></div></div>`;}
  function comboSection(detail){const all=detail.equipmentCombinationUsage||[],pages=Math.max(1,Math.ceil(all.length/PAGE_SIZE)),page=Math.max(0,Math.min(pages-1,modalState.comboPage||0));modalState.comboPage=page;const visible=all.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE),body=visible.length?`<div class="pvp-combo-list">${visible.map((c,i)=>`<div class="pvp-combo-row"><span class="pvp-combo-rank">${page*PAGE_SIZE+i+1}</span><div class="pvp-combo-gears">${comboChip(c.WEAPON,"武器")}${comboChip(c.ARMOR,"防具")}${comboChip(c.ACC,"飾品")}</div><div class="pvp-combo-stats"><strong>${num(c.rate)}%</strong><span>${num(c.count)} 次</span></div></div>`).join("")}</div>`:`<div class="pvp-modal-empty">目前沒有可顯示的裝備組合資料。</div>`;return `<section class="pvp-modal-section pvp-equipment-combination-section" data-combo-section><div class="pvp-modal-section-heading"><h3>裝備組合排名</h3></div>${body}${pages>1?`<div class="pvp-option-pagination pvp-combo-pagination"><button data-combo-page="${page-1}" ${page===0?"disabled":""}>‹</button><span>${page+1} / ${pages}</span><button data-combo-page="${page+1}" ${page===pages-1?"disabled":""}>›</button></div>`:""}</section>`;}

  function openModal(row){if(!row)return;modalState.id=row.rangerId;modalState.gearPages={WEAPON:0,ARMOR:0,ACC:0};modalState.comboPage=0;const d=buildDetail(row.rangerId),common=(d.coOccurrence||[]).slice(0,5).map(x=>`<span>${esc(infoFor(x.unitCode).name)} ${num(x.rate)}%</span>`).join("");els.modalContent.innerHTML=`<header class="pvp-modal-ranger-header"><img class="pvp-modal-ranger-image" src="${RANGER_IMAGE(row.rangerId)}" alt=""><div class="pvp-modal-ranger-copy"><h2 id="guildUsageModalTitle">${esc(row.name)}</h2><p>${esc([row.star,row.type,row.element].filter(Boolean).join(" · "))}</p><div class="pvp-modal-summary"><span><strong>${num(row.usageRate)}%</strong> 使用率</span><span><strong>${num(row.playerCount)}</strong> 名玩家</span><span><strong>${num(row.guildUsageRate)}%</strong> 公會普及率</span></div></div><a class="pvp-modal-detail-link" href="${RANGER_DETAIL(row.rangerId)}">查看角色詳細資料</a></header><section class="pvp-modal-section"><div class="pvp-modal-section-heading"><h3>配裝情況</h3></div><div class="pvp-equipment-grid">${SLOTS.map(s=>gearCard(d,s)).join("")}</div></section>${comboSection(d)}<section class="pvp-modal-section pvp-modal-section--no-divider"><div class="pvp-modal-section-heading"><h3>覺醒能力使用情況</h3></div>${optionList(d.awakeningUsage,"ability")}</section><section class="pvp-modal-section"><div class="pvp-modal-section-heading"><h3>才能解放狀態</h3></div>${optionList(d.talentUsage,"talent")}</section>${common?`<section class="pvp-modal-section"><div class="pvp-modal-section-heading"><h3>常見搭配角色</h3></div><div class="pvp-modal-summary">${common}</div></section>`:""}`;els.modal.hidden=false;document.body.classList.add("modal-open");}
  function closeModal(){if(!els.modal||els.modal.hidden)return;els.modal.hidden=true;document.body.classList.remove("modal-open");}
  async function optional(url){try{const r=await fetch(url);return r.ok?await r.json():{};}catch{return {};}}
  async function loadSupport(){if(supportLoaded)return;const [rangers,ids,abilities]=await Promise.all([optional(RANGERS_URL),optional(ID_DICT_URL),optional(ABILITY_URL)]);rangerMap={};(Array.isArray(rangers)?rangers:[]).forEach(r=>{const id=String(r.ranger_id||"");if(id)rangerMap[id]={name:String(r["Ranger名稱"]||id),star:String(r["Ranger星數"]||""),type:String(r["類型"]||""),element:String(r["屬性"]||"")}});gearNames=Object.fromEntries(Object.entries(ids||{}).map(([name,code])=>[String(code),String(name)]));abilityMap=abilities||{};supportLoaded=true;}
  async function load(){const tier=currentTier(),url=DATA_URLS[tier]||DATA_URLS.LEGEND;status("公會戰角色使用率資料載入中…");try{const [res]=await Promise.all([fetch(`${url}?t=${Date.now()}`,{cache:"no-store"}),loadSupport()]);if(!res.ok)throw new Error(`HTTP ${res.status}`);dataSet=await res.json();applyData()}catch(e){console.error(e);rows=[];render();status(`${TIER_LABELS[tier]||tier}公會戰角色使用率資料尚未產生或目前無法載入。`,true)}}

  [els.search,els.type,els.element].forEach(e=>{e?.addEventListener("input",render);e?.addEventListener("change",render)});els.tier?.addEventListener("change",load);els.body?.addEventListener("click",e=>{const b=e.target.closest("[data-ranger-id]");if(b)openModal(rows.find(r=>r.rangerId===b.dataset.rangerId))});els.modalContent?.addEventListener("click",e=>{const p=e.target.closest("[data-page-slot]");if(p&&!p.disabled){const row=rows.find(r=>r.rangerId===modalState.id),d=row?buildDetail(row.rangerId):null,slot=p.dataset.pageSlot;if(d&&SLOT_LABELS[slot]){modalState.gearPages[slot]=Number(p.dataset.page)||0;const card=els.modalContent.querySelector(`[data-slot="${slot}"]`);if(card)card.outerHTML=gearCard(d,slot)}return}const c=e.target.closest("[data-combo-page]");if(c&&!c.disabled){const row=rows.find(r=>r.rangerId===modalState.id),d=row?buildDetail(row.rangerId):null;if(d){modalState.comboPage=Number(c.dataset.comboPage)||0;const section=els.modalContent.querySelector("[data-combo-section]");if(section)section.outerHTML=comboSection(d)}}});els.modalClose?.addEventListener("click",closeModal);els.modal?.addEventListener("click",e=>{if(e.target.closest("[data-guild-modal-close]"))closeModal()});document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});load();
})();