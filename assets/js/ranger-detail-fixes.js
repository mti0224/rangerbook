/* Combined Rangers detail post-processors.
 * Source files merged:
 * - ranger-talent-object-fix.js
 * - ranger-description-fix.js
 * - ranger-skill-meta-table.js
 * - ranger-talent-effect-fix.js
 */

(() => {
  const DATA_URL = "../res/Rangers_data.json";
  const TLT_ICON = (index) => `../assets/tlt_icon/tlt${index}.png`;
  let rangerMapPromise = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cleanText(value) {
    if (value === null || value === undefined) return "";
    return String(value).replaceAll("\\n", "\n").trim();
  }

  function isNone(value) {
    const text = cleanText(value);
    return !text || text === "無" || text === "(無)" || text.toLowerCase() === "undefined";
  }

  function valueText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value !== "object") return cleanText(value);
    if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join("、");

    return Object.entries(value)
      .filter(([key, v]) => {
        const k = cleanText(key);
        if (k.includes("搜尋分類")) return false;
        return !isNone(v);
      })
      .map(([key, v]) => {
        const child = valueText(v);
        if (!child) return "";
        return /^\d+$/.test(cleanText(key)) ? child : `${cleanText(key)}${child}`;
      })
      .filter(Boolean)
      .join("、");
  }

  function loadRangers() {
    if (!rangerMapPromise) {
      rangerMapPromise = fetch(DATA_URL)
        .then((res) => res.ok ? res.json() : [])
        .then((rows) => {
          const map = new Map();
          if (Array.isArray(rows)) {
            rows.forEach((ranger) => {
              const id = cleanText(ranger.ranger_id || ranger.unitCode || ranger.id || "");
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
    if (match) return decodeURIComponent(match[1]);
    const parts = src.split("/res/")[1]?.split("/") || [];
    return parts[0] ? decodeURIComponent(parts[0]) : "";
  }

  function getExactValue(obj, keys) {
    if (!obj || typeof obj !== "object") return undefined;
    const entries = Object.entries(obj);
    for (const wanted of keys) {
      const found = entries.find(([key]) => cleanText(key) === wanted);
      if (found) return found[1];
    }
    return undefined;
  }

  function getFirstText(obj, keys) {
    if (!obj || typeof obj !== "object") return "";
    for (const key of keys) {
      if (!isNone(obj[key])) return obj[key];
    }
    const found = Object.entries(obj).find(([key, value]) => keys.some((k) => cleanText(key).includes(k)) && !isNone(value));
    return found ? found[1] : "";
  }

  function talentTitle(title, iconIndex = 0) {
    const label = cleanText(title).replace(/\d+$/g, "");
    const icon = iconIndex ? `<img class="talent-icon" src="${TLT_ICON(iconIndex)}" alt="" onerror="this.remove();">` : "";
    return `<h4 class="talent-title-with-icon">${icon}<span>${escapeHtml(label)}</span></h4>`;
  }

  function splitRows(value) {
    const text = valueText(value);
    return text ? text.split(/\n+/).map((row) => row.trim()).filter(Boolean) : [];
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

  function renderMainTalent(title, content) {
    if (isNone(content)) return "";
    if (typeof content !== "object" || content === null) {
      return `<article class="ranger-talent-card">${talentTitle(title, 1)}<p>${escapeHtml(valueText(content))}</p></article>`;
    }

    const probability = valueText(getExactValue(content, ["觸發機率", "發動機率", "機率"])) || "-";
    const conditions = splitRows(getExactValue(content, ["條件", "觸發條件"]));
    const effectValue = getExactValue(content, ["增益效果", "效果", "觸發效果", "效果列表"]);
    const effects = parseMainTalentEffects(effectValue, probability);
    const conditionRows = conditions.length ? conditions : ["無特定條件"];

    const conditionTable = `
      <div class="table-scroll talent-main-table-wrap">
        <table class="talent-main-table">
          <colgroup><col class="talent-main-prob-col"><col class="talent-main-condition-col"></colgroup>
          <thead><tr><th>機率</th><th>條件</th></tr></thead>
          <tbody>
            ${conditionRows.map((condition, index) => `
              <tr>${index === 0 ? `<td rowspan="${conditionRows.length}" class="talent-prob-cell">${escapeHtml(probability)}</td>` : ""}<td>${escapeHtml(condition)}</td></tr>
            `).join("")}
          </tbody>
        </table>
      </div>`;

    const effectTable = effects.length ? `
      <div class="table-scroll talent-main-effect-wrap">
        <table class="talent-main-effect-table">
          <colgroup><col class="talent-main-prob-col"><col class="talent-main-condition-col"></colgroup>
          <thead><tr><th>機率</th><th>增益效果</th></tr></thead>
          <tbody>
            ${effects.map((effect) => `<tr><td class="talent-prob-cell">${escapeHtml(effect.probability || "-")}</td><td>${escapeHtml(effect.effect || "-")}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>` : "";

    return `<article class="ranger-talent-card">${talentTitle(title, 1)}${conditionTable}${effectTable}</article>`;
  }

  function renderNormalTalent(title, content) {
    if (cleanText(title).includes("主要才能")) return renderMainTalent(title, content);
    if (isNone(content)) return "";
    const body = typeof content === "object" && content !== null
      ? `<dl>${Object.entries(content).filter(([, value]) => !isNone(value)).map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(valueText(value))}</dd></div>`).join("")}</dl>`
      : `<p>${escapeHtml(valueText(content))}</p>`;
    return `<article class="ranger-talent-card">${talentTitle(title, 0)}${body}</article>`;
  }

  function renderBoostTalent(title, content) {
    if (isNone(content)) return "";
    const rows = typeof content === "object" && content !== null ? Object.entries(content).filter(([, value]) => !isNone(value)) : [["0", content]];
    return `
      <article class="ranger-talent-card">
        ${talentTitle(title, 0)}
        <div class="table-scroll talent-boost-table-wrap">
          <table class="talent-boost-table"><tbody>
            <tr class="talent-boost-icon-row">${rows.map(([,], index) => `<td><img class="talent-icon talent-inline-icon" src="${TLT_ICON(index + 2)}" alt="" onerror="this.remove();"></td>`).join("")}</tr>
            <tr class="talent-boost-text-row">${rows.map(([key, value]) => {
              const keyText = cleanText(key);
              const valueDisplay = /^\d+$/.test(keyText) ? valueText(value) : `${keyText}${valueText(value)}`;
              return `<td>${escapeHtml(valueDisplay)}</td>`;
            }).join("")}</tr>
          </tbody></table>
        </div>
      </article>`;
  }

  function renderTalent(talent) {
    if (isNone(talent)) return `<div class="empty-state small">沒有才能資料。</div>`;
    if (typeof talent !== "object") return renderNormalTalent("主要才能", talent);
    const html = Object.entries(talent).map(([title, content]) => cleanText(title).includes("強化才能") ? renderBoostTalent(title, content) : renderNormalTalent(title, content)).join("");
    return html ? `<div class="ranger-talent-list">${html}</div>` : `<div class="empty-state small">沒有才能資料。</div>`;
  }

  async function fixTalentSection() {
    const modal = document.getElementById("rangerModal");
    if (!modal || modal.hidden) return;
    const id = currentRangerId();
    if (!id) return;
    const ranger = (await loadRangers()).get(id);
    if (!ranger) return;
    const talentSection = [...document.querySelectorAll("#rangerModalContent .detail-section")]
      .find((section) => section.querySelector("h3")?.textContent.trim() === "才能");
    if (!talentSection || talentSection.dataset.talentFixedFor === id) return;
    talentSection.innerHTML = `<h3>才能</h3>${renderTalent(ranger["才能"])}`;
    talentSection.dataset.talentFixedFor = id;
  }

  function renderDescription(text, className) {
    return `<p class="${className} preline">${escapeHtml(cleanText(text))}</p>`;
  }

  function getSkillList(ranger) {
    return [ranger?.["技能1"], ranger?.["技能2"], ranger?.["技能3"]].filter((skill) => skill && typeof skill === "object" && !Array.isArray(skill));
  }

  function getMainTalentObject(ranger) {
    const talent = ranger?.["才能"];
    if (!talent || typeof talent !== "object" || Array.isArray(talent)) return null;
    const entry = Object.entries(talent).find(([key]) => cleanText(key).includes("主要才能"));
    return entry && entry[1] && typeof entry[1] === "object" ? entry[1] : null;
  }

  async function applyDescriptions() {
    const modal = document.getElementById("rangerModal");
    const content = document.getElementById("rangerModalContent");
    if (!modal || modal.hidden || !content) return;
    const id = currentRangerId();
    if (!id) return;
    const ranger = (await loadRangers()).get(id);
    if (!ranger) return;

    const head = content.querySelector(".ranger-detail-head > div:last-child");
    if (head && !head.querySelector(".ranger-description") && !isNone(ranger["角色敘述"])) {
      const date = head.querySelector(".ranger-date");
      const html = renderDescription(ranger["角色敘述"], "ranger-description");
      if (date) date.insertAdjacentHTML("afterend", html);
      else head.insertAdjacentHTML("beforeend", html);
    }

    const skills = getSkillList(ranger);
    content.querySelectorAll(".ranger-skill-card").forEach((card, index) => {
      if (card.querySelector(".ranger-skill-description")) return;
      const desc = skills[index]?.["技能敘述"];
      if (isNone(desc)) return;
      card.querySelector(".ranger-icon-title > div")?.insertAdjacentHTML("beforeend", renderDescription(desc, "ranger-skill-description"));
    });

    const mainTalent = getMainTalentObject(ranger);
    const talentDesc = getFirstText(mainTalent, ["主要才能敘述", "敘述", "描述", "說明"]) || getFirstText(ranger, ["主要才能敘述", "敘述", "描述", "說明"]);
    if (!isNone(talentDesc)) {
      const mainTalentCard = [...content.querySelectorAll(".ranger-talent-card")]
        .find((card) => card.querySelector(".talent-title-with-icon span")?.textContent.trim().includes("主要才能"));
      if (mainTalentCard && !mainTalentCard.querySelector(".ranger-talent-description")) {
        mainTalentCard.querySelector(".talent-title-with-icon")?.insertAdjacentHTML("afterend", renderDescription(talentDesc, "ranger-talent-description"));
      }
    }
  }

  function skillValue(skill, keys) {
    if (!skill || typeof skill !== "object") return "-";
    for (const key of keys) {
      const value = cleanText(skill[key]);
      if (value) return value;
    }
    return "-";
  }

  function skillMetaTable(skill) {
    return `
      <div class="table-scroll skill-meta-table-wrap">
        <table class="skill-meta-table">
          <thead><tr><th>發動率</th><th>技能冷卻時間</th><th>觸發基準</th></tr></thead>
          <tbody><tr>
            <td>${escapeHtml(skillValue(skill, ["發動機率", "技能發動率", "技能發動機率"]))}</td>
            <td>${escapeHtml(skillValue(skill, ["技能冷卻時間", "冷卻時間"]))}</td>
            <td>${escapeHtml(skillValue(skill, ["觸發基準", "觸發條件", "基準"]))}</td>
          </tr></tbody>
        </table>
      </div>`;
  }

  async function applySkillMetaTables() {
    const modal = document.getElementById("rangerModal");
    const content = document.getElementById("rangerModalContent");
    if (!modal || modal.hidden || !content) return false;
    const id = currentRangerId();
    if (!id) return false;
    const ranger = (await loadRangers()).get(id);
    if (!ranger) return false;
    const skills = getSkillList(ranger);
    const cards = [...content.querySelectorAll(".ranger-skill-card")];
    let changed = false;
    cards.forEach((card, index) => {
      if (card.querySelector(".skill-meta-table-wrap")) return;
      const skill = skills[index];
      if (!skill) return;
      const titleBlock = card.querySelector(".ranger-icon-title > div");
      titleBlock?.querySelectorAll("p:not(.ranger-skill-description)").forEach((p) => p.remove());
      card.querySelector(".ranger-icon-title")?.insertAdjacentHTML("afterend", skillMetaTable(skill));
      changed = true;
    });
    return changed;
  }

  function effectTableIsAlreadyValid(card) {
    const wrap = card.querySelector(".talent-main-effect-wrap");
    if (!wrap) return false;
    const rows = [...wrap.querySelectorAll("tbody tr")];
    return rows.length && rows.every((row) => {
      const cells = [...row.children].map((cell) => cleanText(cell.textContent));
      const probability = cells[0] || "";
      const effect = cells[1] || "";
      if (!effect) return false;
      if (effect.includes("觸發機率") || effect.includes("效果搜尋分類") || effect.includes("條件搜尋分類")) return false;
      if (probability === "-" && /^\d+(?:\.\d+)?%/.test(effect)) return false;
      return true;
    });
  }

  async function validateMainTalentEffectTable() {
    const modal = document.getElementById("rangerModal");
    const content = document.getElementById("rangerModalContent");
    if (!modal || modal.hidden || !content) return;
    const id = currentRangerId();
    if (!id) return;
    const ranger = (await loadRangers()).get(id);
    const mainTalent = getMainTalentObject(ranger);
    if (!mainTalent) return;
    const card = [...content.querySelectorAll(".ranger-talent-card")]
      .find((el) => el.querySelector(".talent-title-with-icon span")?.textContent.trim().includes("主要才能"));
    if (!card || card.dataset.effectFixedFor === id) return;
    if (effectTableIsAlreadyValid(card)) {
      card.dataset.effectFixedFor = id;
      return;
    }
    const rows = parseMainTalentEffects(getExactValue(mainTalent, ["增益效果", "效果", "觸發效果", "效果列表"]), valueText(getExactValue(mainTalent, ["觸發機率", "發動機率", "機率"])) || "-");
    if (!rows.length) return;
    card.querySelector(".talent-main-effect-wrap")?.remove();
    const table = `
      <div class="table-scroll talent-main-effect-wrap">
        <table class="talent-main-effect-table">
          <colgroup><col class="talent-main-prob-col"><col class="talent-main-condition-col"></colgroup>
          <thead><tr><th>機率</th><th>增益效果</th></tr></thead>
          <tbody>${rows.map((row) => `<tr><td class="talent-prob-cell">${escapeHtml(row.probability || "-")}</td><td>${escapeHtml(row.effect || "-")}</td></tr>`).join("")}</tbody>
        </table>
      </div>`;
    const conditionTable = card.querySelector(".talent-main-table-wrap");
    if (conditionTable) conditionTable.insertAdjacentHTML("afterend", table);
    else card.insertAdjacentHTML("beforeend", table);
    card.dataset.effectFixedFor = id;
  }

  function runAll() {
    fixTalentSection();
    applyDescriptions();
    applySkillMetaTables();
    validateMainTalentEffectTable();
  }

  let timer = 0;
  const target = document.getElementById("rangerModalContent");
  if (target) {
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(runAll, 30);
    }).observe(target, { childList: true, subtree: true });
  }

  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest(".ranger-card")) {
      let count = 0;
      const interval = window.setInterval(() => {
        runAll();
        count += 1;
        const modal = document.getElementById("rangerModal");
        if (count >= 12 || !modal || modal.hidden) window.clearInterval(interval);
      }, 120);
    }
  }, true);

  document.addEventListener("DOMContentLoaded", () => setTimeout(runAll, 120));
  window.addEventListener("load", () => setTimeout(runAll, 120));
})();
