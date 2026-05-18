(() => {
  const DATA_URL = "../res/Rangers_data.json";
  const TLT_ICON = (index) => `../assets/tlt_icon/tlt${index}.png`;
  let rowsPromise = null;

  function rawText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
  }

  function text(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value.replaceAll("\\n", "\n").trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
  }

  function html(value) {
    return rawText(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isNone(value) {
    if (value === null || value === undefined) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") return Object.keys(value).length === 0;
    const valueText = text(value);
    return !valueText || valueText === "無" || valueText === "(無)" || valueText === "-";
  }

  function getId(ranger) {
    return text(ranger?.ranger_id || ranger?.unitCode || ranger?.id || "");
  }

  function getName(ranger) {
    return text(ranger?.["Ranger名稱"]) || getId(ranger) || "未命名角色";
  }

  function talentTitle(title, withIcon = true) {
    const titleText = text(title).replace(/\d+$/g, "");
    const isMain = text(title).includes("主要才能");
    const icon = withIcon && isMain
      ? `<img class="talent-icon" src="${TLT_ICON(1)}" alt="" onerror="this.remove();">`
      : "";
    return `<h4 class="talent-title-with-icon">${icon}<span>${html(titleText || title)}</span></h4>`;
  }

  function renderPrimitive(value) {
    const valueText = text(value);
    return valueText ? html(valueText) : "-";
  }

  function renderArrayAsTable(items) {
    const rows = items.filter((item) => item && typeof item === "object" && !Array.isArray(item));
    if (!rows.length) {
      return `<span>${html(items.map(text).filter(Boolean).join("、"))}</span>`;
    }

    const preferred = ["觸發機率", "效果", "效果搜尋分類", "條件", "條件搜尋分類", "敘述"];
    const discovered = [...new Set(rows.flatMap((item) => Object.keys(item).filter((key) => !isNone(item[key]))))];
    const headers = [...preferred.filter((key) => discovered.includes(key)), ...discovered.filter((key) => !preferred.includes(key))];
    if (!headers.length) return "-";

    return `
      <div class="table-scroll">
        <table class="skill-effect-table talent-effect-table">
          <thead>
            <tr>${headers.map((key) => `<th>${html(key)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((item) => `
              <tr>${headers.map((key) => `<td>${renderValue(item[key])}</td>`).join("")}</tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderObjectAsDefinition(value) {
    const preferred = ["敘述", "觸發機率", "條件", "條件搜尋分類", "增益效果", "效果", "效果搜尋分類"];
    const entries = Object.entries(value || {}).filter(([, item]) => !isNone(item));
    const ordered = [
      ...preferred.filter((key) => Object.prototype.hasOwnProperty.call(value || {}, key)).map((key) => [key, value[key]]),
      ...entries.filter(([key]) => !preferred.includes(key))
    ].filter(([, item]) => !isNone(item));
    if (!ordered.length) return "-";

    return `<dl>${ordered.map(([key, item]) => `<div><dt>${html(key)}</dt><dd>${renderValue(item)}</dd></div>`).join("")}</dl>`;
  }

  function renderValue(value) {
    if (isNone(value)) return "-";
    if (Array.isArray(value)) return renderArrayAsTable(value);
    if (typeof value === "object") return renderObjectAsDefinition(value);
    return renderPrimitive(value);
  }

  function renderBoostItem(value, index, key = "") {
    let label = "";
    if (value && typeof value === "object" && !Array.isArray(value)) {
      label = text(value["效果"] || value["敘述"] || value.name || value.value || "");
    } else {
      label = text(value);
    }
    if (!label) label = renderValue(value);
    else label = html(label);
    const prefix = key && !/^\d+$/.test(text(key)) ? html(key) : "";
    return `
      <div class="talent-boost-row">
        <dd class="talent-boost-value">
          <img class="talent-icon talent-inline-icon" src="${TLT_ICON(index + 2)}" alt="" onerror="this.remove();">
          <span>${prefix}${label}</span>
        </dd>
      </div>
    `;
  }

  function renderBoostTalent(title, content) {
    let rows = [];
    if (Array.isArray(content)) {
      rows = content.filter((value) => !isNone(value)).map((value, index) => renderBoostItem(value, index));
    } else if (content && typeof content === "object") {
      rows = Object.entries(content)
        .filter(([, value]) => !isNone(value))
        .map(([key, value], index) => renderBoostItem(value, index, key));
    } else if (!isNone(content)) {
      rows = [renderBoostItem(content, 0)];
    }

    return `
      <article class="ranger-talent-card">
        ${talentTitle(title, false)}
        ${rows.length ? `<dl>${rows.join("")}</dl>` : `<div class="empty-state small">沒有強化才能資料。</div>`}
      </article>
    `;
  }

  function renderMainTalent(title, content) {
    if (typeof content !== "object" || Array.isArray(content)) {
      return `<article class="ranger-talent-card">${talentTitle(title)}<p>${renderPrimitive(content)}</p></article>`;
    }
    return `<article class="ranger-talent-card">${talentTitle(title)}${renderObjectAsDefinition(content)}</article>`;
  }

  function renderTalent(value) {
    if (isNone(value)) return `<div class="empty-state small">沒有才能資料。</div>`;
    if (typeof value === "string") return `<article class="ranger-talent-card">${talentTitle("主要才能")}<p>${html(value)}</p></article>`;

    return `<div class="ranger-talent-list">${Object.entries(value).map(([title, content]) => {
      const isBoost = text(title).includes("強化才能");
      return isBoost ? renderBoostTalent(title, content) : renderMainTalent(title, content);
    }).join("")}</div>`;
  }

  function loadRows() {
    if (!rowsPromise) {
      rowsPromise = fetch(DATA_URL)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((raw) => Array.isArray(raw) ? raw : [])
        .catch((error) => {
          console.error("Talent render fix failed to load ranger data", error);
          return [];
        });
    }
    return rowsPromise;
  }

  function findTalentSection(modalContent) {
    return [...modalContent.querySelectorAll(".detail-section")]
      .find((section) => text(section.querySelector("h3")?.textContent) === "才能");
  }

  async function patchTalentSection() {
    const modalContent = document.getElementById("rangerModalContent");
    if (!modalContent || !modalContent.children.length || modalContent.dataset.talentPatchRunning === "true") return;

    const title = text(modalContent.querySelector("#rangerModalTitle")?.textContent);
    const talentSection = findTalentSection(modalContent);
    if (!title || !talentSection || talentSection.dataset.talentPatchApplied === title) return;

    modalContent.dataset.talentPatchRunning = "true";
    const rows = await loadRows();
    const row = rows.find((ranger) => getName(ranger) === title || getId(ranger) === title);
    if (row) {
      const heading = talentSection.querySelector("h3")?.outerHTML || "<h3>才能</h3>";
      talentSection.innerHTML = `${heading}${renderTalent(row["才能"])}`;
      talentSection.dataset.talentPatchApplied = title;
    }
    modalContent.dataset.talentPatchRunning = "false";
  }

  const observer = new MutationObserver(() => window.setTimeout(patchTalentSection, 0));

  window.addEventListener("load", () => {
    const modalContent = document.getElementById("rangerModalContent");
    if (modalContent) observer.observe(modalContent, { childList: true, subtree: false });
    patchTalentSection();
  });
})();
