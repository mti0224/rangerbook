(() => {
  const ROOT = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const DATA_URL = `${ROOT}res/Rangers_data.json`;
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
  const MAX_SUGGESTIONS = 8;

  const state = {
    rows: [],
    rowMap: new Map(),
    left: null,
    right: null,
    leftQuery: "",
    rightQuery: ""
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

  function num(value) {
    if (typeof value === "number") return value;
    const n = Number(text(value).replaceAll(",", ""));
    return Number.isFinite(n) ? n : 0;
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
    return text(ranger?.["Ranger名稱"]) || getId(ranger) || "未命名角色";
  }

  function parseDate(value) {
    const parts = text(value).replaceAll("-", "/").split("/").map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return 0;
    return new Date(parts[0], parts[1] - 1, parts[2]).getTime() || 0;
  }

  function searchable(ranger) {
    return [
      getName(ranger),
      getId(ranger),
      ranger["Ranger星數"],
      ranger["類型"],
      ranger["屬性"],
      ranger["登場時間"]
    ].map(raw).join(" ").toLowerCase();
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
      return `
        <div class="compare-selected-card">
          <div class="compare-selected-image"><span class="no-icon">未選</span></div>
          <div>
            <h2>${side === "left" ? "角色 A" : "角色 B"}</h2>
            <p class="compare-suggestion-meta">請從上方搜尋選擇角色</p>
          </div>
        </div>
      `;
    }
    const id = getId(ranger);
    return `
      <div class="compare-selected-card">
        <div class="compare-selected-image">
          <img src="${RANGER_IMAGE(id)}" alt="" loading="lazy" onerror="this.closest('.compare-selected-image').classList.add('missing-icon'); this.remove();">
        </div>
        <div>
          <h2>${html(getName(ranger))}</h2>
          <div class="ranger-tags">
            ${[ranger["Ranger星數"], ranger["類型"], ranger["屬性"]].filter(Boolean).map((tag) => `<span>${html(tag)}</span>`).join("")}
          </div>
          <p class="compare-suggestion-meta">${html(id)}</p>
        </div>
      </div>
    `;
  }

  function renderSelected() {
    els.selected.innerHTML = `
      <div class="compare-selected-row">
        ${selectedCard(state.left, "left")}
        ${selectedCard(state.right, "right")}
      </div>
    `;
  }

  function valueOf(ranger, key) {
    if (!ranger) return "-";
    return fmt(ranger[key]);
  }

  function row(label, left, right) {
    return `<tr><th>${html(label)}</th><td>${left}</td><td>${right}</td></tr>`;
  }

  function section(title, rows) {
    return `
      <section class="compare-section">
        <h3>${html(title)}</h3>
        <div class="compare-table-wrap">
          <table class="compare-table"><tbody>${rows.join("")}</tbody></table>
        </div>
      </section>
    `;
  }

  function renderResult() {
    renderSelected();
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
      section("技能", [
        row("技能1", html(skillSummary(state.left, "技能1")), html(skillSummary(state.right, "技能1"))),
        row("技能2", html(skillSummary(state.left, "技能2")), html(skillSummary(state.right, "技能2")))
      ]),
      section("能力與才能", [
        row("能力1", html(abilityText(state.left?.["能力1"])), html(abilityText(state.right?.["能力1"]))),
        row("能力2", html(abilityText(state.left?.["能力2"])), html(abilityText(state.right?.["能力2"]))),
        row("覺醒能力", html(abilityText(state.left?.["覺醒能力"])), html(abilityText(state.right?.["覺醒能力"]))),
        row("才能", html(talentSummary(state.left)), html(talentSummary(state.right)))
      ])
    ].join("");
  }

  function suggestionItem(ranger, side) {
    const id = getId(ranger);
    const active = (side === "left" ? state.left : state.right) && getId(side === "left" ? state.left : state.right) === id;
    return `
      <button class="compare-suggestion compare-suggestion-text ${active ? "active" : ""}" type="button" data-id="${html(id)}" data-side="${side}">
        <div>
          <div class="compare-suggestion-name">${html(getName(ranger))}</div>
          <div class="compare-suggestion-meta">${html([ranger["Ranger星數"], ranger["類型"], ranger["屬性"], id].filter(Boolean).join(" / "))}</div>
        </div>
      </button>
    `;
  }

  function filterRows(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return state.rows.filter((ranger) => ranger.__search.includes(q)).slice(0, MAX_SUGGESTIONS);
  }

  function renderSuggestions(side) {
    const input = side === "left" ? els.leftInput : els.rightInput;
    const target = side === "left" ? els.leftSuggestions : els.rightSuggestions;
    const rows = filterRows(input.value);

    if (!input.value.trim()) {
      target.innerHTML = `<div class="empty-state small">輸入關鍵字後顯示候選角色。</div>`;
      return;
    }

    target.innerHTML = rows.length
      ? rows.map((ranger) => suggestionItem(ranger, side)).join("")
      : `<div class="empty-state small">找不到角色。</div>`;
  }

  function selectRanger(side, id) {
    const ranger = state.rowMap.get(id);
    if (!ranger) return;
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

  function debounce(fn, delay = 120) {
    let timer = 0;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  async function init() {
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      state.rows = (Array.isArray(rows) ? rows : [])
        .map((ranger, index) => ({ ...ranger, __index: index, __date: parseDate(ranger["登場時間"]), __search: searchable(ranger) }))
        .sort((a, b) => (b.__date - a.__date) || (a.__index - b.__index));
      state.rowMap = new Map(state.rows.map((ranger) => [getId(ranger), ranger]));

      renderSuggestions("left");
      renderSuggestions("right");
      renderResult();
    } catch (error) {
      els.result.innerHTML = `<div class="compare-empty">Rangers 資料載入失敗，請稍後再試。</div>`;
      console.error(error);
    }
  }

  els.leftInput.addEventListener("input", debounce(() => renderSuggestions("left")));
  els.rightInput.addEventListener("input", debounce(() => renderSuggestions("right")));

  els.leftSuggestions.addEventListener("click", (event) => {
    const button = event.target.closest(".compare-suggestion");
    if (button) selectRanger(button.dataset.side, button.dataset.id);
  });

  els.rightSuggestions.addEventListener("click", (event) => {
    const button = event.target.closest(".compare-suggestion");
    if (button) selectRanger(button.dataset.side, button.dataset.id);
  });

  init();
})();
