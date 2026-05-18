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

  function displayKey(key) {
    return text(key)
      .replace("條件搜尋分類", "條件搜尋分類")
      .replace("效果搜尋分類", "效果搜尋分類");
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

    const headers = [...new Set(rows.flatMap((item) => Object.keys(item).filter((key) => !isNone(item[key]))))];
    if (!headers.length) return "-";

    return `
      <div class="table-scroll">
        <table class="skill-effect-table talent-effect-table">
          <thead>
            <tr>${headers.map((key) => `<th>${html(displayKey(key))}</th>`).join("")}</tr>
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
    const rows = Object.entries(value || {}).filter(([, item]) => !isNone(item));
    if (!rows.length) return "-";
    return `<dl>${rows.map(([key, item]) => `<div><dt>${html(displayKey(key))}</dt><dd>${renderValue(item)}</dd></div>`).join("")}</dl>`;
  }

  function renderValue(value) {
    if (isNone(value)) return "-";
    if (Array.isArray(value)) return renderArrayAsTable(value);
    if (typeof value === "object") return renderObjectAsDefinition(value);
    return renderPrimitive(value);
  }

  function renderBoostTalent(title, content) {
    if (typeof content !== "object" || Array.isArray(content)) {
      return `<article class="ranger-talent-card">${talentTitle(title, false)}<p>${renderPrimitive(content)}</p></article>`;
    }

    const rows = Object.entries(content).filter(([, value]) => !isNone(value));
    return `
      <article class="ranger-talent-card">
        ${talentTitle(title, false)}
        <dl>
          ${rows.map(([key, value], index) => `
            <div class="talent-boost-row">
              <dd class="talent-boost-value">
                <img class="talent-icon talent-inline-icon" src="${TLT_ICON(index + 2)}" alt="" onerror="this.remove();">
                <span>${/^\d+$/.test(text(key)) ? renderValue(value) : `${html(key)}${renderValue(value)}`}</span>
              </dd>
            </div>
          `).join("")}
        </dl>
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
