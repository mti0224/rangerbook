(() => {
  const DATA_URL = "../res/Rangers_data.json";
  const ABILITY_DATA_URL = "../res/%E8%83%BD%E5%8A%9B.json";
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
  const ABILITY_ICON = (icon) => `https://rangers.lerico.net/res/ability_icon/${encodeURIComponent(icon)}`;
  const SKILL_ICON = (icon) => `https://rangers.lerico.net/res/skill_icon/${encodeURIComponent(icon)}`;
  const TLT_ICON = (index) => `../assets/tlt_icon/tlt${index}.png`;

  const state = { rows: [], filtered: [], abilityMap: {}, selectedId: "", page: 1, pageSize: 60 };
  const $ = (id) => document.getElementById(id);
  const els = {
    search: $("rangerSearchInput"), star: $("starFilter"), type: $("typeFilter"), element: $("elementFilter"), special: $("specialFilter"),
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
  function isNone(value) { const v = text(value); return !v || v === "無" || v === "(無)"; }
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
  function allAbilities(r) { return [...normalAbilities(r), ...awakeAbilities(r)]; }
  function searchBlob(r) {
    const skills = ["技能1", "技能2"].flatMap((key) => {
      const s = getSkill(r, key);
      return s ? [s["技能名稱"], s["發動機率"], s["觸發基準"], s["技能冷卻時間"], ...(Array.isArray(s["技能組"]) ? s["技能組"].flatMap((e) => Object.values(e)) : [])] : [r[key]];
    });
    const abs = allAbilities(r).flatMap((a) => [a.name, a.code, a.detail?.["名稱"], a.detail?.["敘述"], ...abilityEffects(a.detail).flatMap((e) => Object.values(e))]);
    return [getName(r), getId(r), r["登場時間"], r["Ranger星數"], r["類型"], r["屬性"], r["才能"], r["命中率"], r["技能命中率"], ...abs, ...skills].map(rawText).join(" ").toLowerCase();
  }
  function fillSelect(sel, values) {
    if (!sel) return;
    const unique = [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
    sel.innerHTML = `<option value="">全部</option>` + unique.map((v) => `<option value="${html(v)}">${html(v)}</option>`).join("");
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
    state.filtered = state.rows.filter(({ ranger: r, search }) => {
      if (q && !search.includes(q)) return false;
      if (els.star.value && r["Ranger星數"] !== els.star.value) return false;
      if (els.type.value && r["類型"] !== els.type.value) return false;
      if (els.element.value && r["屬性"] !== els.element.value) return false;
      if (els.special.value === "nft" && !isYes(r["nft角色"])) return false;
      if (els.special.value === "event" && !isYes(r["降臨關卡角色"])) return false;
      if (els.special.value === "talent" && isNone(r["才能"])) return false;
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
  function skillTable(skill) {
    const effects = Array.isArray(skill["技能組"]) ? skill["技能組"] : [];
    if (!effects.length) return `<div class="empty-state small">沒有技能效果資料。</div>`;
    return `<div class="table-scroll"><table class="skill-effect-table"><thead><tr><th>技能效果</th><th>係數</th><th>時間</th><th>範圍</th><th><span class="break-header">作用於<br>活動關卡</span></th><th><span class="break-header">作用於<br>副本</span></th></tr></thead><tbody>${effects.map((e) => `<tr><th>${html(e["效果"] || "-")}</th><td>${html(e["係數"] || "-")}</td><td>${html(e["有效時間"] || "-")}</td><td>${html(e["範圍"] || "-")}</td><td>${html(e["適用於活動關卡"] || "-")}</td><td>${html(e["適用於守護神"] || "-")}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function renderSkills(r) {
    const skills = [getSkill(r, "技能1"), getSkill(r, "技能2")].filter(Boolean);
    if (!skills.length) return `<div class="empty-state small">沒有技能資料。</div>`;
    return skills.map((s, i) => `<article class="ranger-skill-card"><div class="ranger-icon-title">${s.icon ? `<img class="small-icon" src="${SKILL_ICON(s.icon)}" alt="" onerror="this.remove();">` : ""}<div><h4>技能 ${i + 1}：${html(s["技能名稱"] || "未命名技能")}</h4><p>發動率：${html(s["發動機率"] || "-")}・技能冷卻時間：${html(s["技能冷卻時間"] || "-")}・觸發基準：${html(s["觸發基準"] || "-")}</p></div></div>${skillTable(s)}</article>`).join("");
  }
  function abilityTable(effects) {
    if (!effects.length) return "";
    return `<div class="ability-effect-list"><div class="table-scroll ability-effect-table-wrap"><table class="ability-effect-table"><thead><tr><th>機率</th><th>時機</th><th>場合</th><th>條件</th><th>效果</th></tr></thead><tbody>${effects.map((e) => `<tr><td>${html(e["機率"] || "-")}</td><td>${html(e["發動時機"] || "-")}</td><td>${html(e["場合"] || "-")}</td><td>${html(e["條件"] || "-")}</td><td>${html(e["效果"] || "-")}</td></tr>`).join("")}</tbody></table></div></div>`;
  }
  function abilityCards(items, empty) {
    if (!items.length) return `<div class="empty-state small">${html(empty)}</div>`;
    return `<div class="ranger-ability-list">${items.map((a) => `<article class="ranger-ability-card"><div class="ranger-icon-title">${a.icon ? `<img class="small-icon" src="${ABILITY_ICON(a.icon)}" alt="" onerror="this.remove();">` : ""}<div><h4>${html(a.name)}</h4>${!isNone(a.detail?.["敘述"]) ? `<p class="preline">${html(a.detail["敘述"])}</p>` : ""}</div></div>${abilityTable(abilityEffects(a.detail))}</article>`).join("")}</div>`;
  }
  function talentTitle(title, withIcon = true) {
    const t = text(title).replace(/\d+$/g, "");
    const isMain = text(title).includes("主要才能");
    const icon = withIcon && isMain ? `<img class="talent-icon" src="${TLT_ICON(1)}" alt="" onerror="this.remove();">` : "";
    return `<h4 class="talent-title-with-icon">${icon}<span>${html(t || title)}</span></h4>`;
  }
  function renderTalent(value) {
    if (isNone(value)) return "";
    if (typeof value === "string") return `<article class="ranger-talent-card">${talentTitle("主要才能")}<p>${html(value)}</p></article>`;
    return `<div class="ranger-talent-list">${Object.entries(value).map(([title, content]) => {
      const boost = text(title).includes("強化才能");
      if (typeof content !== "object") return `<article class="ranger-talent-card">${talentTitle(title, !boost)}<p>${html(content)}</p></article>`;
      const rows = Object.entries(content).filter(([, v]) => !isNone(v));
      return `<article class="ranger-talent-card">${talentTitle(title, !boost)}<dl>${rows.map(([k, v], i) => boost ? `<div class="talent-boost-row"><dd class="talent-boost-value"><img class="talent-icon talent-inline-icon" src="${TLT_ICON(i + 2)}" alt="" onerror="this.remove();"><span>${/^\d+$/.test(text(k)) ? html(v) : html(`${k}${v}`)}</span></dd></div>` : `<div><dt>${html(k)}</dt><dd>${html(v)}</dd></div>`).join("")}</dl></article>`;
    }).join("")}</div>`;
  }
  function detail(r) {
    const id = getId(r);
    return `<div class="ranger-detail-head"><div class="ranger-detail-image-wrap"><img class="ranger-detail-image" src="${RANGER_IMAGE(id)}" alt="" onerror="this.closest('.ranger-detail-image-wrap').classList.add('missing-icon'); this.remove();"></div><div><h2 id="rangerModalTitle">${html(getName(r))}</h2><div class="ranger-tags detail-tags">${[r["Ranger星數"], r["類型"], r["屬性"], isYes(r["nft角色"]) ? "NFT" : "", isYes(r["降臨關卡角色"]) ? "降臨" : ""].filter(Boolean).map((v) => `<span>${html(v)}</span>`).join("")}</div><p class="ranger-date">登場時間：${html(r["登場時間"] || "-")}</p></div></div><section class="detail-section"><h3>基本數值</h3><div class="ranger-stat-grid">${["體力", "物理攻擊力", "魔法攻擊力", "物理防禦力", "魔法防禦力", "生產礦物費用", "Ranger再生產時間", "攻擊範圍", "濺射範圍", "移動速度", "攻擊速度", "技能抗性", "爆擊機率", "爆擊傷害", "閃避機率", "技能閃避機率", "命中率", "技能命中率"].map((k) => stat(k === "Ranger再生產時間" ? "再生產時間" : k, r[k])).join("")}</div></section><section class="detail-section"><h3>技能</h3>${renderSkills(r)}</section><section class="detail-section"><h3>能力</h3>${abilityCards(normalAbilities(r), "沒有能力資料。")}</section><section class="detail-section"><h3>覺醒能力</h3>${abilityCards(awakeAbilities(r), "沒有覺醒能力資料。")}</section><section class="detail-section"><h3>才能</h3>${renderTalent(r["才能"]) || `<div class="empty-state small">沒有才能資料。</div>`}</section>`;
  }
  function openRanger(id) {
    state.selectedId = id;
    const row = state.rows.find(({ ranger }) => getId(ranger) === id);
    if (!row) return;
    els.modalContent.innerHTML = detail(row.ranger);
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
      fillSelect(els.star, state.rows.map((x) => x.ranger["Ranger星數"]));
      fillSelect(els.type, state.rows.map((x) => x.ranger["類型"]));
      fillSelect(els.element, state.rows.map((x) => x.ranger["屬性"]));
      renderList();
    } catch (err) {
      els.list.innerHTML = `<div class="empty-state">資料載入失敗，請稍後再試。</div>`;
      console.error(err);
    }
  }
  [els.search, els.star, els.type, els.element, els.special].forEach((el) => {
    el?.addEventListener("input", applyFilters);
    el?.addEventListener("change", applyFilters);
  });
  els.reset?.addEventListener("click", () => { els.search.value = ""; els.star.value = ""; els.type.value = ""; els.element.value = ""; els.special.value = ""; applyFilters(); });
  els.close?.addEventListener("click", closeModal);
  els.modal?.addEventListener("click", (e) => { if (e.target === els.modal) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !els.modal.hidden) closeModal(); });
  init();
})();
