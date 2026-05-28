(() => {
  const DATA_URL = "../res/Rangers_data.json";
  const ABILITY_DATA_URL = "../res/%E8%83%BD%E5%8A%9B.json";
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
  const ABILITY_ICON = (icon) => `https://rangers.lerico.net/res/ability_icon/${encodeURIComponent(icon)}`;
  const SKILL_ICON = (icon) => `https://rangers.lerico.net/res/skill_icon/${encodeURIComponent(icon)}`;
  const TLT_ICON = (index) => `../assets/tlt_icon/tlt${index}.png`;
  const ANIMATION_META_BASE = "https://res.warmycat.com/animation_meta/";
  const ANIMATION_INDEX_URL = `${ANIMATION_META_BASE}index.json`;

  const state = {
    rows: [],
    filtered: [],
    abilityMap: {},
    selectedId: "",
    page: 1,
    pageSize: 60,
    animationIndexPromise: null,
    animationMetaCache: new Map()
  };
  const $ = (id) => document.getElementById(id);
  const els = {
    search: $("rangerSearchInput"), star: $("starFilter"), type: $("typeFilter"), element: $("elementFilter"), special: $("specialFilter"),
    skillEffect: $("skillEffectFilter"), abilityEffect: $("abilityEffectFilter"), talentCondition: $("talentConditionFilter"), talentEffect: $("talentEffectFilter"),
    reset: $("rangerResetBtn"), count: $("rangerResultCount"), list: $("rangerList"), modal: $("rangerModal"),
    modalContent: $("rangerModalContent"), close: $("rangerModalCloseBtn")
  };
  const modalPanel = els.modal?.querySelector(".modal-panel");

  function rawText(value) {
    if (value === null || value === undefined) return "";
    return typeof value === "string" ? value : String(value);
  }
  function text(value) { return rawText(value).replaceAll("\\n", "\n").trim(); }
  function html(value) {
    return rawText(value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  function isNone(value) { const v = text(value); return !v || v === "無" || v === "(無)" || v === "-"; }
  function isYes(value) { return value === true || value === 1 || ["是", "true", "1", "yes", "y"].includes(text(value).toLowerCase()); }
  function num(value) {
    if (typeof value === "number") return value;
    const n = Number(rawText(value).replaceAll(",", ""));
    return Number.isFinite(n) ? n : 0;
  }
  function fmt(value) {
    if (typeof value === "number") return value.toLocaleString("zh-Hant");
    const n = num(value);
    return n ? n.toLocaleString("zh-Hant") : html(value || "-");
  }
  function getId(r) { return text(r.ranger_id || r.unitCode || r.id || ""); }
  function getName(r) { return text(r["Ranger名稱"]) || getId(r) || "未命名角色"; }
  function attackValue(r) { return Math.max(num(r["物理攻擊力"]), num(r["魔法攻擊力"])); }
  function parseDate(value) {
    const parts = text(value).replaceAll("-", "/").split("/").map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return 0;
    return new Date(parts[0], parts[1] - 1, parts[2]).getTime() || 0;
  }
  function animationMetaUrl(metaPath, unitId) {
    const raw = text(metaPath);
    const filename = raw ? raw.split("/").pop() : `${unitId}.json`;
    return `${ANIMATION_META_BASE}${encodeURIComponent(filename)}`;
  }
  function loadAnimationIndex() {
    if (!state.animationIndexPromise) {
      state.animationIndexPromise = fetch(ANIMATION_INDEX_URL)
        .then((res) => res.ok ? res.json() : null)
        .catch(() => null);
    }
    return state.animationIndexPromise;
  }
  async function loadAnimationMeta(unitId) {
    if (!unitId) return null;
    if (state.animationMetaCache.has(unitId)) return state.animationMetaCache.get(unitId);
    const index = await loadAnimationIndex();
    const metaPath = index?.units?.[unitId]?.meta;
    if (!metaPath) {
      state.animationMetaCache.set(unitId, null);
      return null;
    }
    const meta = await fetch(animationMetaUrl(metaPath, unitId))
      .then((res) => res.ok ? res.json() : null)
      .catch(() => null);
    state.animationMetaCache.set(unitId, meta);
    return meta;
  }
  function startupSeconds(animationMeta, skillIndex) {
    const key = skillIndex === 0 ? "skill_1" : "skill_2";
    const seconds = Number(animationMeta?.startup?.[key]?.seconds || 0);
    return seconds ? `${seconds.toFixed(2)}秒` : "-";
  }
  function getSkill(r, key) { const v = r[key]; return v && typeof v === "object" && !Array.isArray(v) ? v : null; }
  function skillEffects(r) {
    return ["技能1", "技能2"].flatMap((key) => {
      const s = getSkill(r, key);
      const group = Array.isArray(s?.["技能組"]) ? s["技能組"] : [];
      return group.map((e) => text(e?.["效果"])).filter((v) => !isNone(v));
    });
  }
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
  function allAbilities(r) { return [...normalAbilities(r), ...awakeAbilities(r)]; }
  function abilityFilterValues(r) { return allAbilities(r).map((a) => a.name).filter((v) => !isNone(v)); }
  function talentSearchCategories(r) {
    const mainTalent = r?.["才能"]?.["主要才能"];
    const condition = text(mainTalent?.["條件搜尋分類"]);
    const effects = Array.isArray(mainTalent?.["增益效果"])
      ? mainTalent["增益效果"].map((e) => text(e?.["效果搜尋分類"])).filter((v) => !isNone(v))
      : [];
    return { conditions: isNone(condition) ? [] : [condition], effects };
  }
  function searchBlob(r) {
    const skills = ["技能1", "技能2"].flatMap((key) => {
      const s = getSkill(r, key);
      return s ? [s["技能名稱"], s["技能敘述"], s["發動機率"], s["觸發基準"], s["技能冷卻時間"], s["前搖時間"], ...(Array.isArray(s["技能組"]) ? s["技能組"].flatMap((e) => Object.values(e)) : [])] : [r[key]];
    });
    const abs = allAbilities(r).flatMap((a) => [a.name, a.code, a.detail?.["名稱"], a.detail?.["敘述"], ...abilityEffects(a.detail).flatMap((e) => Object.values(e))]);
    const talent = talentSearchCategories(r);
    return [getName(r), getId(r), r["角色敘述"], r["登場時間"], r["Ranger星數"], r["類型"], r["屬性"], r["命中率"], r["技能命中率"], ...talent.conditions, ...talent.effects, ...abs, ...skills].map(rawText).join(" ").toLowerCase();
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
  function splitRows(value) {
    return valueText(value).split(/\n+/).map((row) => row.trim()).filter(Boolean);
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
  function fillSelect(sel, values, label = "") {
    if (!sel) return;
    const unique = [...new Set(values.map(text).filter((v) => !isNone(v)))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
    const first = label ? `全部${label}` : "全部";
    sel.innerHTML = `<option value="">${html(first)}</option>` + unique.map((v) => `<option value="${html(v)}">${html(v)}</option>`).join("");
  }

  function setupPagination() {
    if ($("rangerPaginationBar")) return;
    const bar = document.createElement("section");
    bar.id = "rangerPaginationBar";
    bar.className = "pagination-bar";
    bar.innerHTML = `<div class="pagination-info" id="paginationInfo"></div><div class="pagination-actions"><label class="pagination-size"><span>每頁顯示</span><select id="paginationSize"><option value="30">30</option><option value="60" selected>60</option><option value="120">120</option></select></label><button id="paginationPrev" type="button">上一頁</button><div id="paginationPages" class="pagination-pages"></div><button id="paginationNext" type="button">下一頁</button></div>`;
    document.querySelector(".summary-bar")?.insertAdjacentElement("afterend", bar);
    $("paginationSize")?.addEventListener("change", (e) => { state.pageSize = Number(e.target.value) || 60; state.page = 1; renderList(); });
    $("paginationPrev")?.addEventListener("click", () => { state.page -= 1; renderList(); });
    $("paginationNext")?.addEventListener("click", () => { state.page += 1; renderList(); });
  }
  function renderPagination(total) {
    setupPagination();
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const start = (state.page - 1) * state.pageSize;
    $("paginationInfo").textContent = total ? `第 ${state.page} / ${totalPages} 頁，顯示第 ${start + 1}–${Math.min(start + state.pageSize, total)} 筆，共 ${total} 筆` : "";
    $("paginationPrev").disabled = state.page <= 1;
    $("paginationNext").disabled = state.page >= totalPages;
    const pages = [...new Set([1, totalPages, state.page - 1, state.page, state.page + 1])].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
    let last = 0;
    $("paginationPages").innerHTML = totalPages <= 1 ? "" : pages.map((p) => { const gap = p - last > 1 ? `<span class="pagination-ellipsis">…</span>` : ""; last = p; return `${gap}<button class="pagination-page ${p === state.page ? "active" : ""}" type="button" data-page="${p}">${p}</button>`; }).join("");
    $("paginationPages").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { state.page = Number(b.dataset.page); renderList(); }));
  }
  function applyFilters() {
    const q = els.search.value.trim().toLowerCase();
    const selectedSkillEffect = text(els.skillEffect?.value);
    const selectedAbility = text(els.abilityEffect?.value);
    const selectedTalentCondition = text(els.talentCondition?.value);
    const selectedTalentEffect = text(els.talentEffect?.value);

    state.filtered = state.rows.filter(({ ranger: r, search }) => {
      const talent = talentSearchCategories(r);
      if (q && !search.includes(q)) return false;
      if (els.star.value && r["Ranger星數"] !== els.star.value) return false;
      if (els.type.value && r["類型"] !== els.type.value) return false;
      if (els.element.value && r["屬性"] !== els.element.value) return false;
      if (els.special.value === "nft" && !isYes(r["nft角色"])) return false;
      if (els.special.value === "event" && !isYes(r["降臨關卡角色"])) return false;
      if (els.special.value === "talent" && isNone(r["才能"])) return false;
      if (selectedSkillEffect && !skillEffects(r).includes(selectedSkillEffect)) return false;
      if (selectedAbility && !abilityFilterValues(r).includes(selectedAbility)) return false;
      if (selectedTalentCondition && !talent.conditions.includes(selectedTalentCondition)) return false;
      if (selectedTalentEffect && !talent.effects.includes(selectedTalentEffect)) return false;
      return true;
    });
    state.page = 1;
    renderList();
  }
  function renderList() {
    const total = state.filtered.length;
    els.count.textContent = total.toLocaleString("zh-Hant");
    renderPagination(total);
    if (!total) { els.list.innerHTML = `<div class="empty-state">找不到符合條件的角色。</div>`; return; }
    const pageRows = state.filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
    els.list.innerHTML = pageRows.map(({ ranger: r }) => {
      const id = getId(r);
      return `<button class="ranger-card${state.selectedId === id ? " active" : ""}" type="button" data-ranger-id="${html(id)}"><div class="ranger-thumb-wrap"><img class="ranger-thumb" src="${RANGER_IMAGE(id)}" alt="" loading="lazy" onerror="this.closest('.ranger-thumb-wrap').classList.add('missing-icon'); this.remove();"></div><div class="ranger-card-main"><div class="ranger-title-row"><h2>${html(getName(r))}</h2><span class="tag">${html(r["屬性"] || "-")}</span></div><div class="ranger-tags">${[r["Ranger星數"], r["類型"], r["屬性"]].filter(Boolean).map((v) => `<span>${html(v)}</span>`).join("")}</div><div class="ranger-mini-stats"><span>攻擊力 ${fmt(attackValue(r))}</span><span>體力 ${fmt(r["體力"])}</span><span>礦物 ${fmt(r["生產礦物費用"])}</span></div></div></button>`;
    }).join("");
    els.list.querySelectorAll(".ranger-card").forEach((card) => card.addEventListener("click", () => openRanger(card.dataset.rangerId)));
  }
  function stat(label, value) { return `<div class="ranger-stat"><span>${html(label)}</span><strong>${fmt(value)}</strong></div>`; }
  function description(value, className) {
    return isNone(value) ? "" : `<p class="${className} preline">${html(text(value))}</p>`;
  }
  function skillValue(skill, keys) {
    for (const key of keys) {
      const value = text(skill?.[key]);
      if (value) return value;
    }
    return "-";
  }
  function skillStartupValue(skill, animationMeta, skillIndex) {
    const directValue = skillValue(skill, ["前搖時間", "技能前搖時間", "前搖", "startup", "startupTime"]);
    if (directValue !== "-") return directValue;
    return startupSeconds(animationMeta, skillIndex);
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
    const conditionRows = splitRows(getExactValue(content, ["條件", "觸發條件"]));
    const conditions = conditionRows.length ? conditionRows : ["無特定條件"];
    const effectValue = getExactValue(content, ["增益效果", "效果", "觸發效果", "效果列表"]);
    const effects = parseMainTalentEffects(effectValue, probability);
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
  async function openRanger(id) {
    state.selectedId = id;
    const row = state.rows.find(({ ranger }) => getId(ranger) === id);
    if (!row) return;
    const animationMeta = await loadAnimationMeta(id);
    if (state.selectedId !== id) return;
    els.modalContent.innerHTML = detail(row.ranger, animationMeta);
    els.modal.hidden = false;
    document.body.classList.add("modal-open");
    els.modal.scrollTop = 0; modalPanel.scrollTop = 0; els.modalContent.scrollTop = 0;
  }
  function closeModal() { els.modal.hidden = true; els.modalContent.innerHTML = ""; document.body.classList.remove("modal-open"); }

  async function init() {
    try {
      const [rRes, aRes] = await Promise.all([fetch(DATA_URL), fetch(ABILITY_DATA_URL).catch(() => null)]);
      if (!rRes.ok) throw new Error(`HTTP ${rRes.status}`);
      const raw = await rRes.json();
      state.abilityMap = aRes && aRes.ok ? await aRes.json() : {};
      state.rows = (Array.isArray(raw) ? raw : []).map((ranger, index) => ({ ranger, index, date: parseDate(ranger["登場時間"]), search: searchBlob(ranger) })).sort((a, b) => (b.date - a.date) || (a.index - b.index));
      state.filtered = [...state.rows];
      loadAnimationIndex();
      fillSelect(els.star, state.rows.map((x) => x.ranger["Ranger星數"]));
      fillSelect(els.type, state.rows.map((x) => x.ranger["類型"]));
      fillSelect(els.element, state.rows.map((x) => x.ranger["屬性"]));
      fillSelect(els.skillEffect, state.rows.flatMap((x) => skillEffects(x.ranger)), "技能效果");
      fillSelect(els.abilityEffect, state.rows.flatMap((x) => abilityFilterValues(x.ranger)), "能力");
      fillSelect(els.talentCondition, state.rows.flatMap((x) => talentSearchCategories(x.ranger).conditions), "才能條件");
      fillSelect(els.talentEffect, state.rows.flatMap((x) => talentSearchCategories(x.ranger).effects), "才能效果");
      renderList();
    } catch (err) {
      els.list.innerHTML = `<div class="empty-state">資料載入失敗，請稍後再試。</div>`;
      console.error(err);
    }
  }
  [els.search, els.star, els.type, els.element, els.special, els.skillEffect, els.abilityEffect, els.talentCondition, els.talentEffect].forEach((el) => {
    el?.addEventListener("input", applyFilters);
    el?.addEventListener("change", applyFilters);
  });
  els.reset?.addEventListener("click", () => {
    [els.search, els.star, els.type, els.element, els.special, els.skillEffect, els.abilityEffect, els.talentCondition, els.talentEffect].forEach((el) => { if (el) el.value = ""; });
    applyFilters();
  });
  els.close?.addEventListener("click", closeModal);
  els.modal?.addEventListener("click", (e) => { if (e.target === els.modal) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !els.modal.hidden) closeModal(); });
  init();
})();
