(() => {
  const ROOT = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const DATA_URL = `${ROOT}res/%E8%A3%9D%E5%82%99%E8%B3%87%E6%96%99%E5%BA%AB.json`;
  const LEVELS = [0, 1, 2, 3, 4, 5];
  const selected = new Map();
  let dataPromise;
  let rendering = false;
  let timer = 0;

  const text = (value) => value == null || typeof value === "object" ? "" : String(value).replaceAll("\\n", "\n").trim();
  const escapeHtml = (value) => text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const isEmpty = (value) => !text(value) || ["無", "(無)", "-"].includes(text(value));

  function loadData() {
    if (!dataPromise) {
      dataPromise = fetch(DATA_URL)
        .then((response) => response.ok ? response.json() : [])
        .then((rows) => {
          const map = new Map();
          if (Array.isArray(rows)) rows.forEach((gear) => {
            const id = text(gear?.id || gear?.gear_id || gear?.code);
            if (id) map.set(id, gear);
          });
          return map;
        })
        .catch(() => new Map());
    }
    return dataPromise;
  }

  function currentId() {
    const src = document.querySelector("#gearModalContent .gear-detail-image")?.getAttribute("src") || "";
    const match = src.match(/gear_icon\/([^/]+)_icon\.png/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function read(source, keys) {
    if (!source || typeof source !== "object") return "";
    for (const key of keys) if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
    return "";
  }

  function normalizeRows(value) {
    if (value == null) return [];
    if (Array.isArray(value)) return value.flatMap(normalizeRows);
    if (typeof value !== "object") return [];

    const effect = read(value, ["技能效果", "效果", "skillEffect", "effect"]);
    const factor = read(value, ["係數", "倍率", "數值", "factor", "value"]);
    const duration = read(value, ["有效時間", "時間", "持續時間", "duration", "time"]);
    const factorIncrement = read(value, ["每次升級係數增加", "每次升級倍率增加", "factorIncrement"]);
    const durationIncrement = read(value, ["每次升級時間增加", "每次升級有效時間增加", "durationIncrement"]);

    if (!isEmpty(effect) || !isEmpty(factor) || !isEmpty(duration)) {
      return [{
        effect: text(effect) || "-",
        factor: text(factor) || "-",
        duration: text(duration) || "-",
        factorIncrement: text(factorIncrement),
        durationIncrement: text(durationIncrement)
      }];
    }
    return Object.values(value).flatMap(normalizeRows);
  }

  function decimals(token) {
    return token.includes(".") ? token.split(".")[1].length : 0;
  }

  function upgrade(baseValue, incrementValue, level) {
    const source = text(baseValue);
    const increments = text(incrementValue).match(/[+-]?\d+(?:\.\d+)?/g) || [];
    if (!source || source === "-" || !increments.length || level === 0) return source || "-";
    let index = 0;
    return source.replace(/[+-]?\d+(?:\.\d+)?/g, (baseToken) => {
      const incrementToken = increments.length === 1 ? increments[0] : increments[Math.min(index, increments.length - 1)];
      const value = Number(baseToken) + Number(incrementToken) * level;
      const places = Math.max(decimals(baseToken), decimals(incrementToken));
      index += 1;
      const output = value.toFixed(places);
      return baseToken.startsWith("+") && value >= 0 ? `+${output}` : output;
    });
  }

  function findSection(content) {
    return [...content.querySelectorAll(":scope > .detail-section")].find((section) => {
      const heading = section.querySelector(":scope > h3");
      return heading?.querySelector(":scope > span")?.textContent.trim() === "Skill+" || heading?.childNodes?.[0]?.textContent?.trim() === "Skill+";
    });
  }

  function heading(id, level) {
    const options = LEVELS.map((value) => `<option value="${value}"${value === level ? " selected" : ""}>${value === 5 ? "+Max" : `+${value}`}</option>`).join("");
    return `<h3 class="gear-section-heading"><span>Skill+</span><label class="gear-level-control"><span class="sr-only">Skill+強化等級</span><select class="gear-level-select gear-skillplus-level-select" data-gear-id="${escapeHtml(id)}" data-gear-level-section="Skill+" aria-label="Skill+強化等級">${options}</select></label></h3>`;
  }

  function table(items, level) {
    if (!items.length) return `<div class="empty-state small">沒有Skill+資料。</div>`;
    return `<div class="table-scroll gear-effect-table-wrap"><table class="gear-effect-table gear-skillplus-table"><thead><tr><th>技能效果</th><th>係數</th><th>有效時間</th></tr></thead><tbody>${items.map((item) => {
      const factor = isEmpty(item.factor) ? "-" : upgrade(item.factor, item.factorIncrement, level);
      const duration = isEmpty(item.duration) ? "-" : upgrade(item.duration, item.durationIncrement, level);
      return `<tr><td>${escapeHtml(item.effect)}</td><td>${escapeHtml(factor)}</td><td>${escapeHtml(duration)}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  async function render(id = currentId()) {
    if (rendering || !document.body.classList.contains("gear-detail-page")) return;
    const content = document.getElementById("gearModalContent");
    const section = content && findSection(content);
    if (!section || !id) return;
    rendering = true;
    try {
      const gear = (await loadData()).get(id);
      if (!gear) return;
      const level = selected.get(id) ?? 0;
      section.innerHTML = `${heading(id, level)}${table(normalizeRows(gear["Skill+"]), level)}`;
    } finally {
      rendering = false;
    }
  }

  document.addEventListener("change", async (event) => {
    const select = event.target.closest?.(".gear-skillplus-level-select");
    if (!select) return;
    const id = select.dataset.gearId || currentId();
    const level = Number(select.value) || 0;
    selected.set(id, level);
    const gear = (await loadData()).get(id);
    const content = document.getElementById("gearModalContent");
    const section = content && findSection(content);
    if (!gear || !section) return;
    const items = normalizeRows(gear["Skill+"]);
    [...section.querySelectorAll(".gear-skillplus-table tbody tr")].forEach((row, index) => {
      const item = items[index];
      if (!item) return;
      if (row.children[1]) row.children[1].textContent = isEmpty(item.factor) ? "-" : upgrade(item.factor, item.factorIncrement, level);
      if (row.children[2]) row.children[2].textContent = isEmpty(item.duration) ? "-" : upgrade(item.duration, item.durationIncrement, level);
    });
  });

  const content = document.getElementById("gearModalContent");
  if (content) new MutationObserver((mutations) => {
    if (rendering || !mutations.some((mutation) => mutation.target === content)) return;
    clearTimeout(timer);
    timer = window.setTimeout(render, 40);
  }).observe(content, { childList: true });

  render();
})();
