(() => {
  const DATA_URL = "../../res/Rangers_data.json";
  const ABILITY_DATA_URL = "../../res/%E8%83%BD%E5%8A%9B.json";
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
  const ABILITY_ICON = (icon) => `https://rangers.lerico.net/res/ability_icon/${encodeURIComponent(icon)}`;
  const SKILL_ICON = (icon) => `https://rangers.lerico.net/res/skill_icon/${encodeURIComponent(icon)}`;
  const TLT_ICON = (index) => `../../assets/tlt_icon/tlt${index}.png`;
  const ANIMATION_META_BASE = "https://res.warmycat.com/animation_meta/";
  const ANIMATION_INDEX_URL = `${ANIMATION_META_BASE}index.json`;

  const METRICS = {
    totalAttack: { label: "總攻擊力", value: (ranger) => num(ranger["物理攻擊力"]) + num(ranger["魔法攻擊力"]) },
    hp: { label: "體力", value: (ranger) => num(ranger["體力"]) },
    range: { label: "攻擊範圍", value: (ranger) => num(ranger["攻擊範圍"]) },
    speed: { label: "移動速度", value: (ranger) => num(ranger["移動速度"]) }
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    metricButtons: [...document.querySelectorAll(".ranking-metric-button")],
    typeFilter: $("rankingTypeFilter"),
    elementFilter: $("rankingElementFilter"),
    starFilter: $("rankingStarFilter"),
    title: $("rankingTitle"),
    list: $("rankingList"),
    paginationBar: $("rankingPaginationBar"),
    paginationInfo: $("paginationInfo"),
    paginationSize: $("paginationSize"),
    paginationPrev: $("paginationPrev"),
    paginationNext: $("paginationNext"),
    paginationPages: $("paginationPages"),
    modal: $("rankingModal"),
    modalContent: $("rankingModalContent"),
    modalClose: $("rankingModalCloseBtn")
  };
  const modalPanel = els.modal?.querySelector(".modal-panel");

  const state = {
    rows: [],
    filtered: [],
    abilityMap: {},
    metric: "totalAttack",
    page: 1,
    pageSize: 60,
    selectedId: "",
    animationIndexPromise: null,
    animationMetaCache: new Map()
  };

  function rawText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value);
  }
  function text(value) { return rawText(value).replaceAll("\\n", "\n").trim(); }
  function html(value) {
    return rawText(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function isNone(value) { const v = text(value); return !v || v === "無" || v === "(無)" || v === "-"; }
  function isYes(value) { return value === true || value === 1 || ["是", "true", "1", "yes", "y"].includes(text(value).toLowerCase()); }
  function num(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const n = Number(rawText(value).replaceAll(",", "").replace(/[+％%秒點]/g, "").match(/-?\d+(?:\.\d+)?/)?.[0] || 0);
    return Number.isFinite(n) ? n : 0;
  }
  function fmt(value) {
    if (typeof value === "number") return Number.isFinite(value) ? Math.round(value).toLocaleString("zh-Hant") : "-";
    const n = num(value);
    return n ? Math.round(n).toLocaleString("zh-Hant") : html(value || "-");
  }
  function formatCount(value) { return Number(value || 0).toLocaleString("zh-Hant"); }
  function getId(r) { return text(r.ranger_id || r.unitCode || r.id || r["unitCode"] || r["代碼"] || ""); }
  function getName(r) { return text(r["Ranger名稱"] || r["名稱"] || r.name) || getId(r) || "未命名角色"; }
  function rowType(r) { const value = text(r["類型"]); return ["智慧", "敏捷", "力量"].find((type) => value.includes(type)) || value; }
  function rowElement(r) { return text(r["屬性"] || r["元素"] || r["Ranger屬性"]); }
  function rowStar(r) { return text(r["Ranger星數"] || r["星級"]); }
  function attackValue(r) { return Math.max(num(r["物理攻擊力"]), num(r["魔法攻擊力"])); }

  function normalizeRows(raw) {
    if (Array.isArray(raw)) return raw;
    if (!raw || typeof raw !== "object") return [];
    for (const key of ["data", "rows", "rangers", "items"]) if (Array.isArray(raw[key])) return raw[key];
    return Object.values(raw).filter((item) => item && typeof item === "object" && !Array.isArray(item));
  }

  function valueText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value !== "object") return text(value);
    if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join("、");
    return Object.entries(value)
      .filter(([key, v]) => !text(key).includes("搜尋分類") && !isNone(v))
      .map(([key, v]) => {
        const child = valueText(v);
        return child ? (/^\d+$/.test(text(key)) ? child : `${text(key)}${child}`) : "";
      })
      .filter(Boolean)
      .join("、");
  }
  function getExactValue(obj, keys) {
    if (!obj || typeof obj !== "object") return undefined;
    const entries = Object.entries(obj);
    for (const wanted of keys) {
      const found = entries.find(([key]) => text(key) === wanted);
      if (found) return found[1];
    }
    return undefined;
  }
  function getFirstText(obj, keys) {
    if (!obj || typeof obj !== "object") return "";
    for (const key of keys) if (!isNone(obj[key])) return obj[key];
    const found = Object.entries(obj).find(([key, value]) => keys.some((wanted) => text(key).includes(wanted)) && !isNone(value));
    return found ? found[1] : "";
  }
  function splitRows(value) { return valueText(value).split(/\n+/).map((row) => row.trim()).filter(Boolean); }
  function conditionKeyOrder(key) {
    const keyText = text(key);
    if (keyText === "條件" || keyText === "觸發條件") return 1;
    const match = keyText.match(/^(?:條件|觸發條件)(\d+)$/);
    return match ? Number(match[1]) : 9999;
  }
  function isMainTalentConditionKey(key) { return /^(?:條件|觸發條件)\d*$/.test(text(key)); }
  function collectMainTalentConditions(content) {
    if (!content || typeof content !== "object" || Array.isArray(content)) return [];
    return Object.entries(content)
      .filter(([key, value]) => isMainTalentConditionKey(key) && !isNone(value))
      .sort(([a], [b]) => conditionKeyOrder(a) - conditionKeyOrder(b))
      .flatMap(([, value]) => splitRows(value));
  }
  function parseMainTalentEffects(value, fallbackProbability = "-") {
    if (isNone(value)) return [];
    if (Array.isArray(value)) return value.flatMap((entry) => parseMainTalentEffects(entry, fallbackProbability));
    if (typeof value === "object" && value !== null) {
      const probability = valueText(getExactValue(value, ["觸發機率", "發動機率", "機率"])) || fallbackProbability || "-";
      const effect = valueText(getExactValue(value, ["效果", "增益效果", "內容", "文字", "名稱"]));
      return effect ? [{ probability, effect }] : [];
    }
    return splitRows(value).map((effect) => ({ probability: fallbackProbability || "-", effect }));
  }

  function animationMetaUrl(metaPath, unitId) {
    const raw = text(metaPath);
    const filename = raw ? raw.split("/").pop() : `${unitId}.json`;
    return `${ANIMATION_META_BASE}${encodeURIComponent(filename)}`;
  }
  function loadAnimationIndex() {
    if (!state.animationIndexPromise) state.animationIndexPromise = fetch(ANIMATION_INDEX_URL).then((res) => res.ok ? res.json() : null).catch(() => null);
    return state.animationIndexPromise;
  }
  async function loadAnimationMeta(unitId) {
    if (!unitId) return null;
    if (state.animationMetaCache.has(unitId)) return state.animationMetaCache.get(unitId);
    const index = await loadAnimationIndex();
    const metaPath = index?.units?.[unitId]?.meta;
    if (!metaPath) { state.animationMetaCache.set(unitId, null); return null; }
    const meta = await fetch(animationMetaUrl(metaPath, unitId)).then((res) => res.ok ? res.json() : null).catch(() => null);
    state.animationMetaCache.set(unitId, meta);
    return meta;
  }
  function startupSeconds(animationMeta, skillIndex) {
    const key = skillIndex === 0 ? "skill_1" : "skill_2";
    const seconds = Number(animationMeta?.startup?.[key]?.seconds || 0);
    return seconds ? `${seconds.toFixed(2)}秒` : "-";
  }

  function getSkill(r, key) { const v = r[key]; return v && typeof v === "object" && !Array.isArray(v) ? v : null; }
  function abilityEffects(a) {
    if (!a || typeof a !== "object") return [];
    return Object.entries(a)
      .filter(([k, v]) => k.startsWith("觸發效果") && v && typeof v === "object")
      .sort(([a], [b]) => (a === "觸發效果" ? 1 : Number(a.replace("觸發效果", "")) || 999) - (b === "觸發效果" ? 1 : Number(b.replace("觸發效果", "")) || 999))
      .map(([, v]) => v);
  }
  function parseAbility(value, fallbackCode = "") {
    if (Array.isArray(value)) return value.flatMap((v) => parseAbility(v, fallbackCode));
    if (isNone(value)) return [];
    const code = typeof value === "object" ? text(value.abilityCode || value["abilityCode"] || value.code || fallbackCode) : text(fallbackCode);
    const detail = code ? state.abilityMap[code] : null;
    const name = typeof value === "object" ? text(value["能力"] || value["名稱"] || value["能力名稱"] || value.name) : text(value);
    const displayName = name || text(detail?.["名稱"]) || code;
    const icon = (typeof value === "object" ? text(value.icon) : "") || text(detail?.icon);
    return displayName && displayName !== "無" && displayName !== "(無)" ? [{ name: displayName, code, icon, detail }] : [];
  }
  function normalAbilities(r) { return [...parseAbility(r["能力1"], r.abilityCode), ...parseAbility(r["能力2"], r.abilityCode2)]; }
  function awakeAbilities(r) { return parseAbility(r["覺醒能力"], r.awakeAbilityCode || r["覺醒能力Code"] || ""); }

  function stat(label, value) { return `<div class="ranger-stat"><span>${html(label)}</span><strong>${fmt(value)}</strong></div>`; }
  function description(value, className) { return isNone(value) ? "" : `<p class="${className} preline">${html(text(value))}</p>`; }
  function skillValue(skill, keys) {
    for (const key of keys) { const value = text(skill?.[key]); if (value) return value; }
    return "-";
  }
  function skillStartupValue(skill, animationMeta, skillIndex) {
    const directValue = skillValue(skill, ["前搖時間", "技能前搖時間", "前搖", "startup", "startupTime"]);
    return directValue !== "-" ? directValue : startupSeconds(animationMeta, skillIndex);
  }
  function skillMetaTable(skill, animationMeta, skillIndex) {
    return `<div class="table-scroll skill-meta-table-wrap"><table class="skill-meta-table"><thead><tr><th>發動率</th><th>技能冷卻時間</th><th>觸發基準</th><th>前搖時間</th></tr></thead><tbody><tr><td>${html(skillValue(skill, ["發動機率", "技能發動率", "技能發動機率"]))}</td><td>${html(skillValue(skill, ["技能冷卻時間", "冷卻時間"]))}</td><td>${html(skillValue(skill, ["觸發基準", "觸發條件", "基準"]))}</td><td>${html(skillStartupValue(skill, animationMeta, skillIndex))}</td></tr></tbody></table></div>`;
  }
  function skillTable(skill) {
    const effects = Array.isArray(skill["技能組"]) ? skill["技能組"] : [];
    if (!effects.length) return `<div class="empty-state small">沒有技能效果資料。</div>`;
    return `<div class="table-scroll"><table class="skill-effect-table"><thead><tr><th>技能效果</th><th>係數</th><th>時間</th><th>範圍</th><th><span class="break-header">作用於<br>活動關卡</span></th><th><span class="break-header">作用於<br>副本</span></th></tr></thead><tbody>${effects.map((e) => `<tr><th>${html(e["效果"] || "-")}</th><td>${html(e["係數"] || "-")}</td><td>${html(e["有效時間"] || "-")}</td><td>${html(e["範圍"] || "-")}</td><td>${html(e["適用於活動關卡"] || "-")}</td><td>${html(e["適用於守護神"] || "-")}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function renderSkills(r, animationMeta) {
    const skills = [getSkill(r, "技能1"), getSkill(r, "技能2")].filter(Boolean);
    if (!skills.length) return `<div class="empty-state small">沒有技能資料。</div>`;
    return skills.map((s, i) => `<article class="ranger-skill-card"><div class="ranger-icon-title">${s.icon ? `<img class="small-icon" src="${SKILL_ICON(s.icon)}" alt="" onerror="this.remove();">` : ""}<div><h4>技能 ${i + 1}：${html(s["技能名稱"] || "未命名技能")}</h4>${description(s["技能敘述"], "ranger-skill-description")}</div></div>${skillMetaTable(s, animationMeta, i)}${skillTable(s)}</article>`).join("");
  }
  function abilityTable(effects) {
    if (!effects.length) return "";
    return `<div class="ability-effect-list"><div class="table-scroll ability-effect-table-wrap"><table class="ability-effect-table"><thead><tr><th>機率</th><th>時機</th><th>場合</th><th>條件</th><th>效果</th></tr></thead><tbody>${effects.map((e) => `<tr><td>${html(e["機率"] || "-")}</td><td>${html(e["發動時機"] || "-")}</td><td>${html(e["場合"] || "-")}</td><td>${html(e["條件"] || "-")}</td><td>${html(e["效果"] || "-")}</td></tr>`).join("")}</tbody></table></div></div>`;
  }
  function abilityCards(items, empty) {
    if (!items.length) return `<div class="empty-state small">${html(empty)}</div>`;
    return `<div class="ranger-ability-list">${items.map((a) => `<article class="ranger-ability-card"><div class="ranger-icon-title">${a.icon ? `<img class="small-icon" src="${ABILITY_ICON(a.icon)}" alt="" onerror="this.remove();">` : ""}<div><h4>${html(a.name)}</h4>${description(a.detail?.["敘述"], "preline")}</div></div>${abilityTable(abilityEffects(a.detail))}</article>`).join("")}</div>`;
  }
  function talentTitle(title, withIcon = true, tag = "h4") {
    const t = text(title).replace(/\d+$/g, "");
    const isMain = text(title).includes("主要才能");
    const icon = withIcon && isMain ? `<img class="talent-icon" src="${TLT_ICON(1)}" alt="" onerror="this.remove();">` : "";
    return `<${tag} class="talent-title-with-icon">${icon}<span>${html(t || title)}</span></${tag}>`;
  }
  function renderMainTalent(title, content, ranger) {
    if (isNone(content)) return "";
    if (typeof content !== "object" || content === null) return `<article class="ranger-talent-card">${talentTitle(title, true)}<p>${html(valueText(content))}</p></article>`;
    const talentDesc = getFirstText(content, ["主要才能敘述", "敘述", "描述", "說明"]) || getFirstText(ranger, ["主要才能敘述", "敘述", "描述", "說明"]);
    const probability = valueText(getExactValue(content, ["觸發機率", "發動機率", "機率"])) || "-";
    const conditions = collectMainTalentConditions(content).length ? collectMainTalentConditions(content) : ["無特定條件"];
    const effects = parseMainTalentEffects(getExactValue(content, ["增益效果", "效果", "觸發效果", "效果列表"]), probability);
    const conditionTable = `<div class="table-scroll talent-main-table-wrap"><table class="talent-main-table"><colgroup><col class="talent-main-prob-col"><col class="talent-main-condition-col"></colgroup><thead><tr><th>機率</th><th>條件</th></tr></thead><tbody>${conditions.map((condition, index) => `<tr>${index === 0 ? `<td rowspan="${conditions.length}" class="talent-prob-cell">${html(probability)}</td>` : ""}<td>${html(condition)}</td></tr>`).join("")}</tbody></table></div>`;
    const effectTable = effects.length ? `<div class="table-scroll talent-main-effect-wrap"><table class="talent-main-effect-table"><colgroup><col class="talent-main-prob-col"><col class="talent-main-condition-col"></colgroup><thead><tr><th>機率</th><th>增益效果</th></tr></thead><tbody>${effects.map((effect) => `<tr><td class="talent-prob-cell">${html(effect.probability || "-")}</td><td>${html(effect.effect || "-")}</td></tr>`).join("")}</tbody></table></div>` : "";
    return `<article class="ranger-talent-card">${talentTitle(title, true)}${description(talentDesc, "ranger-talent-description")}${conditionTable}${effectTable}</article>`;
  }
  function renderBoostTalent(title, content) {
    if (isNone(content)) return "";
    const rows = typeof content === "object" && content !== null ? Object.entries(content).filter(([, value]) => !isNone(value)) : [["0", content]];
    if (!rows.length) return "";
    return `<article class="ranger-talent-card">${talentTitle(title, false)}<div class="table-scroll talent-boost-table-wrap"><table class="talent-boost-table"><tbody><tr class="talent-boost-icon-row">${rows.map(([,], index) => `<td><img class="talent-icon talent-inline-icon" src="${TLT_ICON(index + 2)}" alt="" onerror="this.remove();"></td>`).join("")}</tr><tr class="talent-boost-text-row">${rows.map(([key, value]) => { const k = text(key); const display = /^\d+$/.test(k) ? valueText(value) : `${k}${valueText(value)}`; return `<td>${html(display)}</td>`; }).join("")}</tr></tbody></table></div></article>`;
  }
  function renderNormalTalent(title, content, ranger) {
    if (text(title).includes("主要才能")) return renderMainTalent(title, content, ranger);
    if (isNone(content)) return "";
    const body = typeof content === "object" && content !== null
      ? `<dl>${Object.entries(content).filter(([, value]) => !isNone(value)).map(([key, value]) => `<div><dt>${html(key)}</dt><dd>${html(valueText(value))}</dd></div>`).join("")}</dl>`
      : `<p>${html(valueText(content))}</p>`;
    return `<article class="ranger-talent-card">${talentTitle(title, false)}${body}</article>`;
  }
  function renderTalent(value, ranger) {
    if (isNone(value)) return "";
    if (typeof value !== "object" || value === null) return renderMainTalent("主要才能", value, ranger);
    const content = Object.entries(value).map(([title, data]) => text(title).includes("強化才能") ? renderBoostTalent(title, data) : renderNormalTalent(title, data, ranger)).join("");
    return content ? `<div class="ranger-talent-list">${content}</div>` : "";
  }
  function detail(r, animationMeta) {
    const id = getId(r);
    return `<div class="ranger-detail-head"><div class="ranger-detail-image-wrap"><img class="ranger-detail-image" src="${RANGER_IMAGE(id)}" alt="" onerror="this.closest('.ranger-detail-image-wrap').classList.add('missing-icon'); this.remove();"></div><div><h2 id="rangerModalTitle">${html(getName(r))}</h2><div class="ranger-tags detail-tags">${[r["Ranger星數"], r["類型"], r["屬性"], isYes(r["nft角色"]) ? "NFT" : "", isYes(r["降臨關卡角色"]) ? "降臨" : ""].filter(Boolean).map((v) => `<span>${html(v)}</span>`).join("")}</div><p class="ranger-date">登場時間：${html(r["登場時間"] || "-")}</p>${description(r["角色敘述"], "ranger-description")}</div></div><section class="detail-section"><h3>基本數值</h3><div class="ranger-stat-grid">${["體力", "物理攻擊力", "魔法攻擊力", "物理防禦力", "魔法防禦力", "生產礦物費用", "Ranger再生產時間", "攻擊範圍", "濺射範圍", "移動速度", "攻擊速度", "技能抗性", "爆擊機率", "爆擊傷害", "閃避機率", "技能閃避機率", "命中率", "技能命中率"].map((k) => stat(k === "Ranger再生產時間" ? "再生產時間" : k, r[k])).join("")}</div></section><section class="detail-section"><h3>技能</h3>${renderSkills(r, animationMeta)}</section><section class="detail-section"><h3>能力</h3>${abilityCards(normalAbilities(r), "沒有能力資料。")}</section><section class="detail-section"><h3>覺醒能力</h3>${abilityCards(awakeAbilities(r), "沒有覺醒能力資料。")}</section><section class="detail-section"><h3>才能</h3>${renderTalent(r["才能"], r) || `<div class="empty-state small">沒有才能資料。</div>`}</section>`;
  }

  function matchType(ranger, selectedType) { return !selectedType || rowType(ranger) === selectedType; }
  function matchElement(ranger, selectedElement) { return !selectedElement || rowElement(ranger).includes(selectedElement); }
  function matchStar(ranger, selectedStar) {
    const star = rowStar(ranger);
    if (!selectedStar) return true;
    if (selectedStar === "star9") return star.includes("9");
    if (selectedStar === "super8") return star.includes("8") && (star.includes("超") || star.includes("Ultra") || star.toLowerCase().includes("super"));
    if (selectedStar === "ultimate8") return star.includes("8") && (star.includes("終") || star.includes("究") || star.toLowerCase().includes("ultimate"));
    if (selectedStar === "star8") return star.includes("8");
    return true;
  }
  function buildFilteredRows() {
    const metric = METRICS[state.metric];
    return state.rows
      .filter((ranger) => matchType(ranger, els.typeFilter.value))
      .filter((ranger) => matchElement(ranger, els.elementFilter.value))
      .filter((ranger) => matchStar(ranger, els.starFilter.value))
      .map((ranger) => ({ ranger, value: metric.value(ranger) }))
      .filter((item) => Number.isFinite(item.value) && item.value > 0)
      .sort((a, b) => b.value - a.value);
  }
  function renderCard(item, rank) {
    const id = getId(item.ranger);
    return `<button class="ranking-card ranger-card" type="button" data-ranger-id="${html(id)}"><div class="ranking-card-left"><div class="ranking-rank">${formatCount(rank)}</div><div class="ranking-thumb-wrap ranger-thumb-wrap"><img class="ranking-thumb ranger-thumb" src="${RANGER_IMAGE(id)}" alt="" loading="lazy" onerror="this.closest('.ranking-thumb-wrap').classList.add('missing-icon'); this.remove();"></div></div><div class="ranking-card-main"><div class="ranking-card-title-row"><h3>${html(getName(item.ranger))}</h3></div><div class="ranking-card-meta mini-meta"><span>${html(rowType(item.ranger) || "-")}</span><span>${html(rowElement(item.ranger) || "-")}</span><span>${html(rowStar(item.ranger) || "-")}</span></div></div><strong class="ranking-value">${fmt(item.value)}</strong></button>`;
  }
  function makePageButtons(totalPages) {
    const pages = [...new Set([1, totalPages, state.page - 1, state.page, state.page + 1])].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
    let last = 0;
    els.paginationPages.innerHTML = totalPages <= 1 ? "" : pages.map((p) => { const gap = p - last > 1 ? `<span class="pagination-ellipsis">…</span>` : ""; last = p; return `${gap}<button class="pagination-page ${p === state.page ? "active" : ""}" type="button" data-page="${p}">${p}</button>`; }).join("");
    els.paginationPages.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { state.page = Number(b.dataset.page); applyPagination(false); scrollToListTop(); }));
  }
  function scrollToListTop() { window.scrollTo({ top: Math.max(0, els.list.getBoundingClientRect().top + window.scrollY - 120), behavior: "smooth" }); }
  function applyPagination(resetPage = true) {
    const total = state.filtered.length;
    if (!total) { els.paginationBar.hidden = true; els.list.innerHTML = `<div class="ranking-empty empty-state">沒有符合條件的角色。</div>`; return; }
    els.paginationBar.hidden = false;
    state.pageSize = Number(els.paginationSize.value) || 60;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    if (resetPage) state.page = 1;
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const start = (state.page - 1) * state.pageSize;
    const end = start + state.pageSize;
    els.list.innerHTML = state.filtered.slice(start, end).map((item, index) => renderCard(item, start + index + 1)).join("");
    els.list.querySelectorAll(".ranking-card").forEach((card) => card.addEventListener("click", () => openRanger(card.dataset.rangerId)));
    els.paginationInfo.textContent = `第 ${state.page} / ${totalPages} 頁，顯示第 ${start + 1}–${Math.min(end, total)} 筆，共 ${total} 筆`;
    els.paginationPrev.disabled = state.page <= 1;
    els.paginationNext.disabled = state.page >= totalPages;
    makePageButtons(totalPages);
  }
  function render(resetPage = true) {
    const metric = METRICS[state.metric] || METRICS.totalAttack;
    state.filtered = buildFilteredRows();
    els.metricButtons.forEach((button) => button.classList.toggle("active", button.dataset.metric === state.metric));
    els.title.textContent = `${metric.label}排名`;
    applyPagination(resetPage);
  }
  async function openRanger(id) {
    state.selectedId = id;
    const ranger = state.rows.find((r) => getId(r) === id);
    if (!ranger) return;
    els.modalContent.innerHTML = `<div class="empty-state small">資料載入中...</div>`;
    els.modal.hidden = false;
    document.body.classList.add("modal-open");
    els.modal.scrollTop = 0;
    if (modalPanel) modalPanel.scrollTop = 0;
    const animationMeta = await loadAnimationMeta(id);
    if (state.selectedId !== id) return;
    els.modalContent.innerHTML = detail(ranger, animationMeta);
    els.modal.scrollTop = 0;
    if (modalPanel) modalPanel.scrollTop = 0;
  }
  function closeModal() {
    if (!els.modal || els.modal.hidden) return;
    els.modal.hidden = true;
    els.modalContent.innerHTML = "";
    document.body.classList.remove("modal-open");
  }

  async function init() {
    try {
      const [dataRes, abilityRes] = await Promise.all([fetch(DATA_URL), fetch(ABILITY_DATA_URL).catch(() => null)]);
      if (!dataRes.ok) throw new Error(`HTTP ${dataRes.status}`);
      state.rows = normalizeRows(await dataRes.json());
      state.abilityMap = abilityRes && abilityRes.ok ? await abilityRes.json() : {};
      loadAnimationIndex();
      render(true);
    } catch (error) {
      els.list.innerHTML = `<div class="ranking-empty empty-state">資料載入失敗，請稍後再試。</div>`;
      els.paginationBar.hidden = true;
      console.error(error);
    }
  }

  els.metricButtons.forEach((button) => button.addEventListener("click", () => { state.metric = METRICS[button.dataset.metric] ? button.dataset.metric : "totalAttack"; render(true); }));
  [els.typeFilter, els.elementFilter, els.starFilter].forEach((select) => select.addEventListener("change", () => render(true)));
  els.paginationSize.addEventListener("change", () => { state.page = 1; applyPagination(false); scrollToListTop(); });
  els.paginationPrev.addEventListener("click", () => { state.page -= 1; applyPagination(false); scrollToListTop(); });
  els.paginationNext.addEventListener("click", () => { state.page += 1; applyPagination(false); scrollToListTop(); });
  els.modalClose?.addEventListener("click", closeModal);
  els.modal?.addEventListener("click", (event) => { if (event.target === els.modal) closeModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !els.modal.hidden) closeModal(); });
  init();
})();
