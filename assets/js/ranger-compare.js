(() => {
  const ROOT = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const INDEX_URL = `${ROOT}res/Ranger_index.json`;
  const DATA_URL = `${ROOT}res/Rangers_data.json`;
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
  const TLT_ICON = (index) => `${ROOT}assets/tlt_icon/tlt${index}.png`;
  const MAX_SUGGESTIONS = 8;

  const state = {
    index: [],
    fullMap: new Map(),
    left: null,
    right: null,
    indexPromise: null,
    fullPromise: null,
    indexLoaded: false,
    fullLoaded: false,
    highlightBetter: false
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    leftInput: $("compareLeftInput"),
    rightInput: $("compareRightInput"),
    leftSuggestions: $("compareLeftSuggestions"),
    rightSuggestions: $("compareRightSuggestions"),
    selected: $("compareSelected"),
    result: $("compareResult")
  };

  const raw = (value) => value === null || value === undefined ? "" : String(value);
  const text = (value) => raw(value).replaceAll("\\n", "\n").trim();
  const html = (value) => raw(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const isNone = (value) => ["", "無", "(無)", "-"].includes(text(value));

  function fmt(value) {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "number") return value.toLocaleString("zh-Hant");
    const t = text(value);
    const n = Number(t.replaceAll(",", ""));
    if (Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(t.replaceAll(",", ""))) return n.toLocaleString("zh-Hant");
    return html(t || "-");
  }

  function parseNumber(value) {
    const match = text(value).replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : null;
  }

  const getId = (ranger) => text(ranger?.ranger_id || ranger?.unitCode || ranger?.id || "");
  const getName = (ranger) => text(ranger?.["Ranger名稱"] || ranger?.name) || getId(ranger) || "未命名角色";

  function parseIndexRow(row) {
    const item = {
      id: text(row.id || row.ranger_id || row.unitCode),
      name: text(row.name || row["Ranger名稱"]),
      star: text(row.star || row["Ranger星數"]),
      type: text(row.type || row["類型"]),
      element: text(row.element || row["屬性"])
    };
    item.search = [item.id, item.name, item.star, item.type, item.element].map(raw).join(" ").toLowerCase();
    item.meta = [item.star, item.type, item.element, item.id].filter(Boolean).join(" / ");
    return item;
  }

  function getSkill(ranger, key) {
    const skill = ranger?.[key];
    return skill && typeof skill === "object" && !Array.isArray(skill) ? skill : null;
  }

  const getSkillEffects = (skill) => skill && Array.isArray(skill["技能組"]) ? skill["技能組"] : [];

  function skillRange(skill) {
    const ranges = getSkillEffects(skill).map((effect) => text(effect?.["範圍"])).filter((value) => value && value !== "-");
    if (!ranges.length) return "-";
    const numeric = ranges.map((value) => ({ value, n: parseNumber(value) })).filter((item) => item.n !== null);
    if (!numeric.length) return html(ranges[0]);
    const max = numeric.reduce((best, item) => item.n > best.n ? item : best, numeric[0]);
    return html(max.value);
  }

  function skillMetaValue(skill, field) {
    if (!skill) return "-";
    if (field === "名稱") return fmt(skill["技能名稱"] || skill.name || "-");
    if (field === "發動率") return fmt(skill["發動機率"] || skill["技能發動率"] || skill["技能發動機率"]);
    if (field === "冷卻") return fmt(skill["技能冷卻時間"] || skill["冷卻時間"]);
    if (field === "觸發基準") return fmt(skill["觸發基準"] || skill["觸發條件"] || skill["基準"]);
    if (field === "技能範圍") return skillRange(skill);
    return "-";
  }

  function effectCell(effect, field) {
    if (!effect) return "-";
    if (field === "效果") return fmt(effect["效果"] || "-");
    if (field === "係數") return fmt(effect["係數"] || "-");
    if (field === "時間") return fmt(effect["有效時間"] || effect["時間"] || "-");
    return "-";
  }

  function abilityText(value) {
    if (isNone(value)) return "-";
    if (Array.isArray(value)) return value.map(abilityText).filter((v) => v !== "-").join("、") || "-";
    if (typeof value === "object") return text(value["能力"] || value["名稱"] || value.name || value.abilityCode || value.code || "-");
    return text(value);
  }

  function getMainTalent(ranger) {
    const main = ranger?.["才能"]?.["主要才能"];
    return main && typeof main === "object" ? main : null;
  }

  function mainTalentEffects(main) {
    const effects = main && Array.isArray(main["增益效果"]) ? main["增益效果"] : [];
    return effects.map((effect) => ({
      effect: text(effect?.["效果"] || "-"),
      probability: text(effect?.["觸發機率"] || effect?.["發動機率"] || effect?.["機率"] || "-")
    })).filter((item) => item.effect && item.effect !== "-");
  }

  function minProbabilityText(probabilities) {
    const rows = probabilities.filter((value) => value && value !== "-");
    if (!rows.length) return "-";
    const parsed = rows.map((value) => ({ value, n: parseNumber(value) })).filter((item) => item.n !== null);
    if (!parsed.length) return html(rows[0]);
    const min = parsed.reduce((best, item) => item.n < best.n ? item : best, parsed[0]);
    return html(min.value);
  }

  function mainTalentValue(ranger, field) {
    const main = getMainTalent(ranger);
    if (!main) return "-";
    if (field === "條件") return fmt(main["條件"] || "無特定條件");
    if (field === "條件觸發機率") return fmt(main["觸發機率"] || main["發動機率"] || main["機率"]);
    if (field === "效果") {
      const effects = mainTalentEffects(main).map((item) => item.effect).join("\n");
      return html(effects || text(main["敘述"] || "-"));
    }
    if (field === "效果觸發機率") {
      return minProbabilityText(mainTalentEffects(main).map((item) => item.probability));
    }
    return "-";
  }

  function boostTalentValue(ranger, index) {
    const boost = ranger?.["才能"]?.["強化才能"];
    if (!Array.isArray(boost)) return "-";
    return fmt(boost[index] || "-");
  }

  function selectedCard(ranger, side) {
    if (!ranger) {
      return `<div class="compare-selected-card"><div class="compare-selected-image"><span class="no-icon">未選</span></div><div><h2>${side === "left" ? "角色 A" : "角色 B"}</h2><p class="compare-suggestion-meta">請從上方搜尋選擇角色</p></div></div>`;
    }
    const id = getId(ranger);
    return `<div class="compare-selected-card"><div class="compare-selected-image"><img src="${RANGER_IMAGE(id)}" alt="" loading="lazy" onerror="this.closest('.compare-selected-image').classList.add('missing-icon'); this.remove();"></div><div><h2>${html(getName(ranger))}</h2><div class="ranger-tags">${[ranger["Ranger星數"], ranger["類型"], ranger["屬性"]].filter(Boolean).map((tag) => `<span>${html(tag)}</span>`).join("")}</div><p class="compare-suggestion-meta">${html(id)}</p></div></div>`;
  }

  function renderSelected() {
    els.selected.innerHTML = `<div class="compare-selected-row">${selectedCard(state.left, "left")}${selectedCard(state.right, "right")}</div>`;
  }

  const valueOf = (ranger, key) => ranger ? fmt(ranger[key]) : "-";
  const rawValue = (ranger, key) => ranger ? ranger[key] : "";
  const row = (label, left, right) => `<tr><th>${label}</th><td>${left}</td><td>${right}</td></tr>`;

  function section(title, rows, extraClass = "") {
    return `<section class="compare-section ${extraClass}"><h3>${title}</h3><div class="compare-table-wrap"><table class="compare-table"><tbody>${rows.join("")}</tbody></table></div></section>`;
  }

  function betterSide(key, leftValue, rightValue) {
    const left = parseNumber(leftValue);
    const right = parseNumber(rightValue);
    if (left === null || right === null || left === right) return null;
    const lowerIsBetter = new Set(["生產礦物費用", "Ranger再生產時間", "再生產時間"]);
    return lowerIsBetter.has(key) ? (left < right ? "left" : "right") : (left > right ? "left" : "right");
  }

  function statRow(key, label = key) {
    const leftRaw = rawValue(state.left, key);
    const rightRaw = rawValue(state.right, key);
    const better = state.highlightBetter ? betterSide(key, leftRaw, rightRaw) : null;
    const leftClass = better === "left" ? " class=\"compare-better\"" : "";
    const rightClass = better === "right" ? " class=\"compare-better\"" : "";
    return `<tr><th>${html(label)}</th><td${leftClass}>${valueOf(state.left, key)}</td><td${rightClass}>${valueOf(state.right, key)}</td></tr>`;
  }

  function basicStatTitle() {
    return `基本數值 <label class="compare-highlight-control"><input id="compareHighlightBetter" type="checkbox" ${state.highlightBetter ? "checked" : ""}>醒目顯示較佳數值</label>`;
  }

  function skillSection(title, key) {
    const leftSkill = getSkill(state.left, key);
    const rightSkill = getSkill(state.right, key);
    const metaFields = ["名稱", "發動率", "冷卻", "觸發基準", "技能範圍"];
    const leftEffects = getSkillEffects(leftSkill);
    const rightEffects = getSkillEffects(rightSkill);
    const effectCount = Math.max(leftEffects.length, rightEffects.length);

    const metaRows = metaFields.map((field) => `<tr><th>${html(field)}</th><td colspan="3">${skillMetaValue(leftSkill, field)}</td><td colspan="3">${skillMetaValue(rightSkill, field)}</td></tr>`);
    const effectRows = [];

    if (effectCount) {
      effectRows.push(`<tr class="compare-skill-subhead"><th>技能效果</th><td>效果</td><td>係數</td><td>時間</td><td>效果</td><td>係數</td><td>時間</td></tr>`);
      for (let i = 0; i < effectCount; i += 1) {
        const left = leftEffects[i];
        const right = rightEffects[i];
        effectRows.push(`<tr><th>效果 ${i + 1}</th><td>${effectCell(left, "效果")}</td><td>${effectCell(left, "係數")}</td><td>${effectCell(left, "時間")}</td><td>${effectCell(right, "效果")}</td><td>${effectCell(right, "係數")}</td><td>${effectCell(right, "時間")}</td></tr>`);
      }
    } else {
      effectRows.push(`<tr><th>技能效果</th><td colspan="3">-</td><td colspan="3">-</td></tr>`);
    }

    return `<section class="compare-section compare-skill-section"><h3>${html(title)}</h3><div class="compare-table-wrap"><table class="compare-table compare-skill-table"><tbody>${[...metaRows, ...effectRows].join("")}</tbody></table></div></section>`;
  }

  function iconLabel(index) {
    return `<img class="compare-talent-icon" src="${TLT_ICON(index)}" alt="tlt${index}" onerror="this.replaceWith(document.createTextNode('tlt${index}'))">`;
  }

  function bindHighlightCheckbox() {
    const checkbox = document.getElementById("compareHighlightBetter");
    if (!checkbox) return;
    checkbox.addEventListener("change", () => {
      state.highlightBetter = checkbox.checked;
      renderResult();
    });
  }

  function renderResult(message = "") {
    renderSelected();
    if (message) {
      els.result.innerHTML = `<div class="compare-empty">${html(message)}</div>`;
      return;
    }
    if (!state.left && !state.right) {
      els.result.innerHTML = `<div class="compare-empty">請先選擇兩隻角色進行比對。</div>`;
      return;
    }

    const basicRows = [
      ["Ranger名稱", (r) => html(getName(r))],
      ["星數", (r) => valueOf(r, "Ranger星數")],
      ["類型", (r) => valueOf(r, "類型")],
      ["屬性", (r) => valueOf(r, "屬性")]
    ];
    const statKeys = ["生產礦物費用", "Ranger再生產時間", "體力", "物理攻擊力", "魔法攻擊力", "物理防禦力", "魔法防禦力", "攻擊範圍", "濺射範圍", "移動速度", "攻擊速度", "技能抗性", "爆擊機率", "爆擊傷害", "閃避機率", "技能閃避機率", "命中率", "技能命中率"];
    const statLabels = { Ranger再生產時間: "再生產時間" };

    els.result.innerHTML = [
      section("基本資料", basicRows.map(([label, getter]) => row(html(label), getter(state.left), getter(state.right)))),
      section(basicStatTitle(), statKeys.map((key) => statRow(key, statLabels[key] || key)), "compare-basic-stat-section"),
      skillSection("技能1", "技能1"),
      skillSection("技能2", "技能2"),
      section("能力", [
        row("能力1", html(abilityText(state.left?.["能力1"])), html(abilityText(state.right?.["能力1"]))),
        row("能力2", html(abilityText(state.left?.["能力2"])), html(abilityText(state.right?.["能力2"]))),
        row("覺醒能力", html(abilityText(state.left?.["覺醒能力"])), html(abilityText(state.right?.["覺醒能力"])))
      ]),
      section("主要才能", [
        row("條件", mainTalentValue(state.left, "條件"), mainTalentValue(state.right, "條件")),
        row("條件觸發機率", mainTalentValue(state.left, "條件觸發機率"), mainTalentValue(state.right, "條件觸發機率")),
        row("效果", mainTalentValue(state.left, "效果"), mainTalentValue(state.right, "效果")),
        row("效果觸發機率", mainTalentValue(state.left, "效果觸發機率"), mainTalentValue(state.right, "效果觸發機率"))
      ]),
      section("強化才能", [
        row(iconLabel(2), boostTalentValue(state.left, 0), boostTalentValue(state.right, 0)),
        row(iconLabel(3), boostTalentValue(state.left, 1), boostTalentValue(state.right, 1)),
        row(iconLabel(4), boostTalentValue(state.left, 2), boostTalentValue(state.right, 2))
      ])
    ].join("");

    bindHighlightCheckbox();
  }

  function suggestionItem(item, side) {
    return `<button class="compare-suggestion compare-suggestion-text" type="button" data-id="${html(item.id)}" data-side="${side}"><div><div class="compare-suggestion-name">${html(item.name)}</div><div class="compare-suggestion-meta">${html(item.meta)}</div></div></button>`;
  }

  async function loadIndex() {
    if (state.indexLoaded) return true;
    if (state.indexPromise) return state.indexPromise;
    state.indexPromise = fetch(INDEX_URL, { cache: "force-cache" })
      .then((res) => {
        if (!res.ok) throw new Error(`Ranger_index.json HTTP ${res.status}`);
        return res.json();
      })
      .then((rows) => {
        state.index = (Array.isArray(rows) ? rows : []).map(parseIndexRow).filter((item) => item.id && item.name);
        state.indexLoaded = true;
        return true;
      })
      .catch((error) => {
        console.error(error);
        return false;
      });
    return state.indexPromise;
  }

  async function loadFullData() {
    if (state.fullLoaded) return true;
    if (state.fullPromise) return state.fullPromise;
    state.fullPromise = fetch(DATA_URL, { cache: "force-cache" })
      .then((res) => {
        if (!res.ok) throw new Error(`Rangers_data.json HTTP ${res.status}`);
        return res.json();
      })
      .then((rows) => {
        state.fullMap = new Map((Array.isArray(rows) ? rows : []).map((ranger) => [getId(ranger), ranger]));
        state.fullLoaded = true;
        return true;
      })
      .catch((error) => {
        console.error(error);
        return false;
      });
    return state.fullPromise;
  }

  function filterRows(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const exact = [];
    const partial = [];
    for (const item of state.index) {
      if (item.id.toLowerCase() === q || item.name.toLowerCase() === q) exact.push(item);
      else if (item.search.includes(q)) partial.push(item);
      if (exact.length + partial.length >= MAX_SUGGESTIONS) break;
    }
    return [...exact, ...partial].slice(0, MAX_SUGGESTIONS);
  }

  async function renderSuggestions(side) {
    const input = side === "left" ? els.leftInput : els.rightInput;
    const target = side === "left" ? els.leftSuggestions : els.rightSuggestions;
    const query = input.value.trim();
    if (!query) {
      target.innerHTML = `<div class="empty-state small">輸入關鍵字後顯示候選角色。</div>`;
      return;
    }
    if (!state.indexLoaded) {
      target.innerHTML = `<div class="empty-state small">搜尋索引載入中...</div>`;
      if (!await loadIndex()) {
        target.innerHTML = `<div class="empty-state small">搜尋索引載入失敗。</div>`;
        return;
      }
    }
    const rows = filterRows(query);
    target.innerHTML = rows.length ? rows.map((item) => suggestionItem(item, side)).join("") : `<div class="empty-state small">找不到角色。</div>`;
  }

  async function selectRanger(side, id) {
    renderResult("完整角色資料載入中...");
    if (!await loadFullData()) {
      renderResult("完整 Rangers 資料載入失敗，無法比對。");
      return;
    }
    const ranger = state.fullMap.get(id);
    if (!ranger) {
      renderResult(`找不到角色資料：${id}`);
      return;
    }
    if (side === "left") {
      state.left = ranger;
      els.leftInput.value = getName(ranger);
    } else {
      state.right = ranger;
      els.rightInput.value = getName(ranger);
    }
    renderSuggestions(side);
    renderResult();
  }

  function debounce(fn, delay = 80) {
    let timer = 0;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  els.leftInput.addEventListener("focus", () => renderSuggestions("left"));
  els.rightInput.addEventListener("focus", () => renderSuggestions("right"));
  els.leftInput.addEventListener("input", debounce(() => renderSuggestions("left")));
  els.rightInput.addEventListener("input", debounce(() => renderSuggestions("right")));
  els.leftSuggestions.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest(".compare-suggestion") : null;
    if (button) selectRanger(button.dataset.side, button.dataset.id);
  });
  els.rightSuggestions.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest(".compare-suggestion") : null;
    if (button) selectRanger(button.dataset.side, button.dataset.id);
  });

  els.leftSuggestions.innerHTML = `<div class="empty-state small">輸入關鍵字後顯示候選角色。</div>`;
  els.rightSuggestions.innerHTML = `<div class="empty-state small">輸入關鍵字後顯示候選角色。</div>`;
  renderResult();
  window.setTimeout(() => { loadIndex(); }, 50);
})();