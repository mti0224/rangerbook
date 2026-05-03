(() => {
  const ROOT = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const INDEX_URL = `${ROOT}res/Ranger_index.json`;
  const DATA_URL = `${ROOT}res/Rangers_data.json`;
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
  const MAX_SUGGESTIONS = 8;

  const state = {
    index: [],
    fullRows: [],
    fullMap: new Map(),
    left: null,
    right: null,
    indexPromise: null,
    fullPromise: null,
    indexLoaded: false,
    fullLoaded: false,
    indexError: null,
    fullError: null
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

  function raw(value) {
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function text(value) {
    return raw(value).replaceAll("\\n", "\n").trim();
  }

  function html(value) {
    return raw(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isNone(value) {
    const v = text(value);
    return !v || v === "無" || v === "(無)" || v === "-";
  }

  function fmt(value) {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "number") return value.toLocaleString("zh-Hant");
    const t = text(value);
    const n = Number(t.replaceAll(",", ""));
    if (Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(t.replaceAll(",", ""))) return n.toLocaleString("zh-Hant");
    return html(t || "-");
  }

  function getId(ranger) {
    return text(ranger?.ranger_id || ranger?.unitCode || ranger?.id || "");
  }

  function getName(ranger) {
    return text(ranger?.["Ranger名稱"] || ranger?.name) || getId(ranger) || "未命名角色";
  }

  function makeSearchText(item) {
    return [item.id, item.name, item.star, item.type, item.element].map(raw).join(" ").toLowerCase();
  }

  function parseIndexRow(row) {
    const item = {
      id: text(row.id || row.ranger_id || row.unitCode),
      name: text(row.name || row["Ranger名稱"]),
      star: text(row.star || row["Ranger星數"]),
      type: text(row.type || row["類型"]),
      element: text(row.element || row["屬性"])
    };
    item.search = makeSearchText(item);
    item.meta = [item.star, item.type, item.element, item.id].filter(Boolean).join(" / ");
    return item;
  }

  function skillSummary(ranger, key) {
    const skill = ranger?.[key];
    if (!skill || typeof skill !== "object" || Array.isArray(skill)) return "-";
    const effects = Array.isArray(skill["技能組"])
      ? skill["技能組"].map((effect) => text(effect?.["效果"])).filter(Boolean).join("、")
      : "";
    return [
      skill["技能名稱"] ? `名稱：${text(skill["技能名稱"])}` : "",
      skill["發動機率"] ? `發動率：${text(skill["發動機率"])}` : "",
      skill["技能冷卻時間"] ? `冷卻：${text(skill["技能冷卻時間"])}` : "",
      skill["觸發基準"] ? `基準：${text(skill["觸發基準"])}` : "",
      effects ? `效果：${effects}` : ""
    ].filter(Boolean).join("\n") || "-";
  }

  function abilityText(value) {
    if (isNone(value)) return "-";
    if (Array.isArray(value)) return value.map(abilityText).filter((v) => v !== "-").join("、") || "-";
    if (typeof value === "object") return text(value["能力"] || value["名稱"] || value.name || value.abilityCode || value.code || "-");
    return text(value);
  }

  function talentSummary(ranger) {
    const talent = ranger?.["才能"];
    if (!talent || typeof talent !== "object") return isNone(talent) ? "-" : text(talent);
    const main = talent["主要才能"];
    const boost = talent["強化才能"];
    const lines = [];
    if (main && typeof main === "object") {
      const effects = Array.isArray(main["增益效果"])
        ? main["增益效果"].map((item) => text(item?.["效果"])).filter(Boolean).join("、")
        : "";
      lines.push(`主要才能：${[main["條件"], effects].map(text).filter(Boolean).join(" / ") || text(main["敘述"]) || "-"}`);
    } else if (!isNone(main)) {
      lines.push(`主要才能：${text(main)}`);
    }
    if (Array.isArray(boost) && boost.length) lines.push(`強化才能：${boost.map(text).join("、")}`);
    return lines.join("\n") || "-";
  }

  function selectedCard(ranger, side) {
    if (!ranger) {
      return `<div class="compare-selected-card"><div class="compare-selected-image"><span class="no-icon">未選</span></div><div><h2>${side === "left" ? "角色 A" : "角色 B"}</h2><p class="compare-suggestion-meta">請從上方搜尋選擇角色</p></div></div>`;
    }
    const id = getId(ranger);
    return `
      <div class="compare-selected-card">
        <div class="compare-selected-image"><img src="${RANGER_IMAGE(id)}" alt="" loading="lazy" onerror="this.closest('.compare-selected-image').classList.add('missing-icon'); this.remove();"></div>
        <div>
          <h2>${html(getName(ranger))}</h2>
          <div class="ranger-tags">${[ranger["Ranger星數"], ranger["類型"], ranger["屬性"]].filter(Boolean).map((tag) => `<span>${html(tag)}</span>`).join("")}</div>
          <p class="compare-suggestion-meta">${html(id)}</p>
        </div>
      </div>`;
  }

  function renderSelected() {
    els.selected.innerHTML = `<div class="compare-selected-row">${selectedCard(state.left, "left")}${selectedCard(state.right, "right")}</div>`;
  }

  function valueOf(ranger, key) {
    if (!ranger) return "-";
    return fmt(ranger[key]);
  }

  function row(label, left, right) {
    return `<tr><th>${html(label)}</th><td>${left}</td><td>${right}</td></tr>`;
  }

  function section(title, rows) {
    return `<section class="compare-section"><h3>${html(title)}</h3><div class="compare-table-wrap"><table class="compare-table"><tbody>${rows.join("")}</tbody></table></div></section>`;
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
      ["ID", (r) => html(getId(r))],
      ["登場時間", (r) => valueOf(r, "登場時間")],
      ["星數", (r) => valueOf(r, "Ranger星數")],
      ["類型", (r) => valueOf(r, "類型")],
      ["屬性", (r) => valueOf(r, "屬性")],
      ["生產礦物費用", (r) => valueOf(r, "生產礦物費用")],
      ["再生產時間", (r) => valueOf(r, "Ranger再生產時間")]
    ];
    const statKeys = ["體力", "物理攻擊力", "魔法攻擊力", "物理防禦力", "魔法防禦力", "攻擊範圍", "濺射範圍", "移動速度", "攻擊速度", "技能抗性", "爆擊機率", "爆擊傷害", "閃避機率", "技能閃避機率", "命中率", "技能命中率"];

    els.result.innerHTML = [
      section("基本資料", basicRows.map(([label, getter]) => row(label, getter(state.left), getter(state.right)))),
      section("基本數值", statKeys.map((key) => row(key, valueOf(state.left, key), valueOf(state.right, key)))),
      section("技能", [row("技能1", html(skillSummary(state.left, "技能1")), html(skillSummary(state.right, "技能1"))), row("技能2", html(skillSummary(state.left, "技能2")), html(skillSummary(state.right, "技能2")))]),
      section("能力與才能", [
        row("能力1", html(abilityText(state.left?.["能力1"])), html(abilityText(state.right?.["能力1"]))),
        row("能力2", html(abilityText(state.left?.["能力2"])), html(abilityText(state.right?.["能力2"]))),
        row("覺醒能力", html(abilityText(state.left?.["覺醒能力"])), html(abilityText(state.right?.["覺醒能力"]))),
        row("才能", html(talentSummary(state.left)), html(talentSummary(state.right)))
      ])
    ].join("");
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
        state.index = (Array.isArray(rows) ? rows : [])
          .map(parseIndexRow)
          .filter((item) => item.id && item.name);
        state.indexLoaded = true;
        return true;
      })
      .catch((error) => {
        state.indexError = error;
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
        state.fullRows = Array.isArray(rows) ? rows : [];
        state.fullMap = new Map(state.fullRows.map((ranger) => [getId(ranger), ranger]));
        state.fullLoaded = true;
        return true;
      })
      .catch((error) => {
        state.fullError = error;
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
      const ok = await loadIndex();
      if (!ok) {
        target.innerHTML = `<div class="empty-state small">搜尋索引載入失敗。</div>`;
        return;
      }
    }

    const rows = filterRows(query);
    target.innerHTML = rows.length ? rows.map((item) => suggestionItem(item, side)).join("") : `<div class="empty-state small">找不到角色。</div>`;
  }

  async function selectRanger(side, id) {
    renderResult("完整角色資料載入中...");
    const ok = await loadFullData();
    if (!ok) {
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

  const debouncedLeft = debounce(() => renderSuggestions("left"));
  const debouncedRight = debounce(() => renderSuggestions("right"));

  els.leftInput.addEventListener("focus", () => renderSuggestions("left"));
  els.rightInput.addEventListener("focus", () => renderSuggestions("right"));
  els.leftInput.addEventListener("input", debouncedLeft);
  els.rightInput.addEventListener("input", debouncedRight);

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