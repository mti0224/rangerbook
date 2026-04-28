(() => {
  const DATA_URL = "../res/Rangers_data.json";
  let rangerMapPromise = null;

  function clean(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return "";
    return String(value).replaceAll("\\n", "\n").trim();
  }

  function escapeHtml(value) {
    return clean(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isNone(value) {
    const text = clean(value);
    return !text || text === "無" || text === "(無)" || text.toLowerCase() === "undefined";
  }

  function getByKeys(obj, keys) {
    if (!obj || typeof obj !== "object") return undefined;
    const entries = Object.entries(obj);
    for (const wanted of keys) {
      const found = entries.find(([key]) => clean(key) === wanted);
      if (found) return found[1];
    }
    for (const wanted of keys) {
      const found = entries.find(([key]) => clean(key).includes(wanted));
      if (found) return found[1];
    }
    return undefined;
  }

  function toText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value !== "object") return clean(value);
    if (Array.isArray(value)) return value.map(toText).filter(Boolean).join("、");
    return Object.entries(value)
      .filter(([key, val]) => !["觸發機率", "發動機率", "機率"].includes(clean(key)) && !isNone(val))
      .map(([key, val]) => {
        const child = toText(val);
        return /^\d+$/.test(clean(key)) ? child : `${clean(key)}${child}`;
      })
      .filter(Boolean)
      .join("、");
  }

  function appendTime(effect, time) {
    const effectText = clean(effect);
    const timeText = clean(time);
    if (!effectText || !timeText || effectText.includes(timeText)) return effectText;
    return `${effectText}(${timeText})`;
  }

  function parseEffectRows(value, parentProbability = "-") {
    if (isNone(value)) return [];

    if (Array.isArray(value)) {
      return value.flatMap((entry) => parseEffectRows(entry, parentProbability));
    }

    if (typeof value === "object") {
      const probability = clean(getByKeys(value, ["觸發機率", "發動機率", "機率"])) || parentProbability || "-";
      const nested = getByKeys(value, ["增益效果", "效果", "觸發效果", "效果列表"]);

      if (nested && typeof nested === "object") {
        return parseEffectRows(nested, probability);
      }

      const effect = clean(nested) || clean(getByKeys(value, ["內容", "文字", "名稱"])) || toText(value);
      const time = getByKeys(value, ["有效時間", "時間", "持續時間"]);
      const display = appendTime(effect, time);

      return display ? [{ probability, effect: display }] : [];
    }

    return clean(value)
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((effect) => ({ probability: parentProbability || "-", effect }));
  }

  function loadRangers() {
    if (!rangerMapPromise) {
      rangerMapPromise = fetch(DATA_URL)
        .then((res) => res.ok ? res.json() : [])
        .then((rows) => {
          const map = new Map();
          if (Array.isArray(rows)) {
            rows.forEach((ranger) => {
              const id = clean(ranger.ranger_id || ranger.unitCode || ranger.id || "");
              if (id) map.set(id, ranger);
            });
          }
          return map;
        })
        .catch(() => new Map());
    }
    return rangerMapPromise;
  }

  function currentRangerId() {
    const src = document.querySelector("#rangerModalContent .ranger-detail-image")?.getAttribute("src") || "";
    const match = src.match(/\/res\/([^/]+)\//);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function getMainTalent(ranger) {
    const talent = ranger?.["才能"];
    if (!talent || typeof talent !== "object" || Array.isArray(talent)) return null;
    const entry = Object.entries(talent).find(([key]) => clean(key).includes("主要才能"));
    return entry && entry[1] && typeof entry[1] === "object" ? entry[1] : null;
  }

  function renderEffectTable(rows) {
    if (!rows.length) return "";
    return `
      <div class="table-scroll talent-main-effect-wrap">
        <table class="talent-main-effect-table">
          <colgroup>
            <col class="talent-main-prob-col">
            <col class="talent-main-condition-col">
          </colgroup>
          <thead><tr><th>機率</th><th>增益效果</th></tr></thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td class="talent-prob-cell">${escapeHtml(row.probability || "-")}</td>
                <td>${escapeHtml(row.effect || "-")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  async function apply() {
    const modal = document.getElementById("rangerModal");
    const content = document.getElementById("rangerModalContent");
    if (!modal || modal.hidden || !content) return;

    const id = currentRangerId();
    if (!id) return;

    const ranger = (await loadRangers()).get(id);
    const mainTalent = getMainTalent(ranger);
    if (!mainTalent) return;

    const card = [...content.querySelectorAll(".ranger-talent-card")]
      .find((el) => el.querySelector(".talent-title-with-icon span")?.textContent.trim().includes("主要才能"));
    if (!card || card.dataset.effectFixedFor === id) return;

    const parentProbability = clean(getByKeys(mainTalent, ["觸發機率", "發動機率", "機率"])) || "-";
    const effectValue = getByKeys(mainTalent, ["增益效果", "效果", "觸發效果", "效果列表"]);
    const rows = parseEffectRows(effectValue, parentProbability);
    if (!rows.length) return;

    card.querySelector(".talent-main-effect-wrap")?.remove();
    const conditionTable = card.querySelector(".talent-main-table-wrap");
    if (conditionTable) conditionTable.insertAdjacentHTML("afterend", renderEffectTable(rows));
    else card.insertAdjacentHTML("beforeend", renderEffectTable(rows));

    card.dataset.effectFixedFor = id;
  }

  let timer = 0;
  const target = document.getElementById("rangerModalContent");
  if (target) {
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(apply, 40);
    }).observe(target, { childList: true, subtree: true });
  }
})();