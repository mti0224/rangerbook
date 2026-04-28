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
    return !text || text === "無" || text === "(無)";
  }

  function valueText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value !== "object") return cleanText(value);
    if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join("、");

    return Object.entries(value)
      .filter(([, v]) => !isNone(v))
      .map(([key, v]) => {
        const child = valueText(v);
        if (!child) return "";
        return /^\d+$/.test(cleanText(key)) ? child : `${cleanText(key)}${child}`;
      })
      .filter(Boolean)
      .join("、");
  }

  function formatTalentTitle(title) {
    return cleanText(title).replace(/\d+$/g, "");
  }

  function talentTitle(title, iconIndex = 0) {
    const icon = iconIndex ? `<img class="talent-icon" src="${TLT_ICON(iconIndex)}" alt="" onerror="this.remove();">` : "";
    return `<h4 class="talent-title-with-icon">${icon}<span>${escapeHtml(formatTalentTitle(title))}</span></h4>`;
  }

  function splitRows(value) {
    const text = valueText(value);
    if (!text) return [];
    return text.split(/\n+/).map((row) => row.trim()).filter(Boolean);
  }

  function getObjectValueByKeys(obj, keys) {
    if (!obj || typeof obj !== "object") return undefined;
    const entries = Object.entries(obj);
    for (const wanted of keys) {
      const found = entries.find(([key]) => cleanText(key) === wanted);
      if (found) return found[1];
    }
    for (const wanted of keys) {
      const found = entries.find(([key]) => cleanText(key).includes(wanted));
      if (found) return found[1];
    }
    return undefined;
  }

  function renderMainTalent(title, content) {
    if (isNone(content)) return "";

    if (typeof content !== "object" || content === null) {
      return `<article class="ranger-talent-card">${talentTitle(title, 1)}<p>${escapeHtml(valueText(content))}</p></article>`;
    }

    const probability = valueText(getObjectValueByKeys(content, ["觸發機率", "發動機率", "機率"])) || "-";
    const conditionValue = getObjectValueByKeys(content, ["條件", "觸發條件"]);
    const conditions = splitRows(conditionValue).length ? splitRows(conditionValue) : ["無特定條件"];
    const effectValue = getObjectValueByKeys(content, ["增益效果", "效果"]);
    const effects = splitRows(effectValue);

    const conditionTable = `
      <div class="table-scroll talent-main-table-wrap">
        <table class="talent-main-table">
          <colgroup>
            <col class="talent-main-prob-col">
            <col class="talent-main-condition-col">
          </colgroup>
          <thead>
            <tr><th>機率</th><th>條件</th></tr>
          </thead>
          <tbody>
            ${conditions.map((condition, index) => `
              <tr>
                ${index === 0 ? `<td rowspan="${conditions.length}" class="talent-prob-cell">${escapeHtml(probability)}</td>` : ""}
                <td>${escapeHtml(condition)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    const effectTable = effects.length ? `
      <div class="table-scroll talent-main-effect-wrap">
        <table class="talent-main-effect-table">
          <colgroup>
            <col class="talent-main-prob-col">
            <col class="talent-main-condition-col">
          </colgroup>
          <thead><tr><th>機率</th><th>增益效果</th></tr></thead>
          <tbody>
            ${effects.map((effect, index) => `
              <tr>
                ${index === 0 ? `<td rowspan="${effects.length}" class="talent-prob-cell">${escapeHtml(probability)}</td>` : ""}
                <td>${escapeHtml(effect)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : "";

    return `<article class="ranger-talent-card">${talentTitle(title, 1)}${conditionTable}${effectTable}</article>`;
  }

  function renderNormalTalent(title, content) {
    if (cleanText(title).includes("主要才能")) return renderMainTalent(title, content);
    if (isNone(content)) return "";

    const body = typeof content === "object" && content !== null
      ? `<dl>${Object.entries(content)
          .filter(([, value]) => !isNone(value))
          .map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(valueText(value))}</dd></div>`)
          .join("")}</dl>`
      : `<p>${escapeHtml(valueText(content))}</p>`;

    return `<article class="ranger-talent-card">${talentTitle(title, 0)}${body}</article>`;
  }

  function renderBoostTalent(title, content) {
    if (isNone(content)) return "";

    const rows = typeof content === "object" && content !== null
      ? Object.entries(content).filter(([, value]) => !isNone(value))
      : [["0", content]];

    return `
      <article class="ranger-talent-card">
        ${talentTitle(title, 0)}
        <div class="table-scroll talent-boost-table-wrap">
          <table class="talent-boost-table">
            <tbody>
              <tr class="talent-boost-icon-row">
                ${rows.map(([,], index) => `
                  <td><img class="talent-icon talent-inline-icon" src="${TLT_ICON(index + 2)}" alt="" onerror="this.remove();"></td>
                `).join("")}
              </tr>
              <tr class="talent-boost-text-row">
                ${rows.map(([key, value]) => {
                  const keyText = cleanText(key);
                  const valueDisplay = /^\d+$/.test(keyText) ? valueText(value) : `${keyText}${valueText(value)}`;
                  return `<td>${escapeHtml(valueDisplay)}</td>`;
                }).join("")}
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    `;
  }

  function renderTalent(talent) {
    if (isNone(talent)) return `<div class="empty-state small">沒有才能資料。</div>`;
    if (typeof talent !== "object") return renderNormalTalent("主要才能", talent);

    const html = Object.entries(talent)
      .map(([title, content]) => cleanText(title).includes("強化才能") ? renderBoostTalent(title, content) : renderNormalTalent(title, content))
      .join("");

    return html ? `<div class="ranger-talent-list">${html}</div>` : `<div class="empty-state small">沒有才能資料。</div>`;
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

  function getCurrentRangerId() {
    const img = document.querySelector("#rangerModalContent .ranger-detail-image");
    const src = img?.getAttribute("src") || "";
    const match = src.match(/\/res\/([^/]+)\//);
    return match ? decodeURIComponent(match[1]) : "";
  }

  async function fixTalentSection() {
    const modal = document.getElementById("rangerModal");
    if (!modal || modal.hidden) return;

    const id = getCurrentRangerId();
    if (!id) return;

    const map = await loadRangers();
    const ranger = map.get(id);
    if (!ranger) return;

    const sections = [...document.querySelectorAll("#rangerModalContent .detail-section")];
    const talentSection = sections.find((section) => section.querySelector("h3")?.textContent.trim() === "才能");
    if (!talentSection || talentSection.dataset.talentFixedFor === id) return;

    talentSection.innerHTML = `<h3>才能</h3>${renderTalent(ranger["才能"])}`;
    talentSection.dataset.talentFixedFor = id;
  }

  const observer = new MutationObserver(() => setTimeout(fixTalentSection, 0));
  const modalContent = document.getElementById("rangerModalContent");
  if (modalContent) observer.observe(modalContent, { childList: true, subtree: true });
})();
