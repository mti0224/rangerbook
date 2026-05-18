(() => {
  const DATA_URL = "../res/Rangers_data.json";
  const ANIMATION_INDEX_URL = "../res/animation_meta/index.json";
  const SKILL_ICON = (icon) => `https://rangers.lerico.net/res/skill_icon/${encodeURIComponent(icon)}`;
  const TLT_ICON = (index) => `../assets/tlt_icon/tlt${index}.png`;
  let rowsPromise = null;
  let animationIndexPromise = null;
  const animationMetaCache = new Map();

  function text(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value.replaceAll("\\n", "\n").trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
  }

  function html(value) {
    return text(value)
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

  function loadRows() {
    if (!rowsPromise) {
      rowsPromise = fetch(DATA_URL)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((raw) => Array.isArray(raw) ? raw : [])
        .catch((error) => {
          console.error("Detail layout fix failed to load ranger data", error);
          return [];
        });
    }
    return rowsPromise;
  }

  function loadAnimationIndex() {
    if (!animationIndexPromise) {
      animationIndexPromise = fetch(ANIMATION_INDEX_URL)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .catch(() => null);
    }
    return animationIndexPromise;
  }

  async function loadAnimationMeta(unitId) {
    if (!unitId) return null;
    if (animationMetaCache.has(unitId)) return animationMetaCache.get(unitId);
    const index = await loadAnimationIndex();
    const metaPath = index?.units?.[unitId]?.meta;
    if (!metaPath) {
      animationMetaCache.set(unitId, null);
      return null;
    }
    const meta = await fetch(`../${metaPath}`)
      .then((res) => res.ok ? res.json() : null)
      .catch(() => null);
    animationMetaCache.set(unitId, meta);
    return meta;
  }

  function startupSeconds(meta, skillIndex) {
    const key = skillIndex === 0 ? "skill_1" : "skill_2";
    const seconds = Number(meta?.startup?.[key]?.seconds || 0);
    return seconds ? seconds.toFixed(2) : "-";
  }

  function inferUnitIdFromModal(modalContent) {
    const img = modalContent.querySelector(".ranger-detail-image");
    const src = img?.getAttribute("src") || img?.src || "";
    const match = src.match(/res(?:_from_emulator)?\/([^/]+)\//) || src.match(/\/([^/]+)\/[^/]+-thum/i);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function findSection(modalContent, title) {
    return [...modalContent.querySelectorAll(".detail-section")]
      .find((section) => text(section.querySelector("h3")?.textContent) === title);
  }

  function table(headers, rows, className = "skill-effect-table") {
    return `
      <div class="table-scroll detail-table-scroll">
        <table class="${className}">
          <thead><tr>${headers.map((header) => `<th>${html(header)}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows.map((row) => `<tr>${row.map((cell) => `<td>${html(cell || "-")}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function getSkill(ranger, key) {
    const value = ranger?.[key];
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  }

  function renderSkillCard(skill, index, animationMeta) {
    const effects = Array.isArray(skill?.["技能組"]) ? skill["技能組"] : [];
    const icon = text(skill?.icon);
    const meta = table(
      ["發動率", "技能冷卻時間", "觸發基準", "技能前搖時間(秒)"],
      [[skill?.["發動機率"], skill?.["技能冷卻時間"], skill?.["觸發基準"], startupSeconds(animationMeta, index)]],
      "skill-effect-table skill-meta-table"
    );
    const effectRows = effects.map((effect) => [
      effect?.["效果"],
      effect?.["係數"],
      effect?.["有效時間"],
      effect?.["範圍"]
    ]);
    const effectTable = effectRows.length
      ? table(["技能效果", "係數", "時間", "範圍"], effectRows, "skill-effect-table skill-detail-table")
      : `<div class="empty-state small">沒有技能效果資料。</div>`;

    return `
      <article class="ranger-skill-card">
        <div class="ranger-icon-title">
          ${icon ? `<img class="small-icon" src="${SKILL_ICON(icon)}" alt="" onerror="this.remove();">` : ""}
          <h4>技能 ${index + 1}</h4>
        </div>
        ${meta}
        ${effectTable}
      </article>
    `;
  }

  function renderSkills(ranger, animationMeta) {
    const skills = [getSkill(ranger, "技能1"), getSkill(ranger, "技能2")].filter(Boolean);
    if (!skills.length) return `<div class="empty-state small">沒有技能資料。</div>`;
    return skills.map((skill, index) => renderSkillCard(skill, index, animationMeta)).join("");
  }

  function talentTitle(title, withIcon = true) {
    const titleText = text(title).replace(/\d+$/g, "");
    const isMain = text(title).includes("主要才能");
    const icon = withIcon && isMain
      ? `<img class="talent-icon" src="${TLT_ICON(1)}" alt="" onerror="this.remove();">`
      : "";
    return `<h4 class="talent-title-with-icon">${icon}<span>${html(titleText || title)}</span></h4>`;
  }

  function renderMainTalent(title, content) {
    if (!content || typeof content !== "object" || Array.isArray(content)) {
      return `<article class="ranger-talent-card">${talentTitle(title)}<p>${html(content)}</p></article>`;
    }

    const desc = text(content["敘述"]);
    const chance = text(content["觸發機率"] || content["機率"] || content["觸發概率"]);
    const condition = text(content["條件"]);
    const gains = Array.isArray(content["增益效果"]) ? content["增益效果"] : [];
    const conditionTable = (chance || condition)
      ? table(["機率", "條件"], [[chance, condition]], "skill-effect-table talent-main-table")
      : "";
    const gainTables = gains.map((gain) => {
      const gainChance = text(gain?.["觸發機率"] || gain?.["機率"] || chance || "100%");
      const gainText = text(gain?.["效果"] || gain?.["敘述"] || gain?.["效果搜尋分類"]);
      return table(["機率", "增益效果"], [[gainChance, gainText]], "skill-effect-table talent-main-table");
    }).join("");

    return `
      <article class="ranger-talent-card">
        ${talentTitle(title)}
        ${desc ? `<p class="preline">${html(desc)}</p>` : ""}
        ${conditionTable}
        ${gainTables}
      </article>
    `;
  }

  function boostText(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return text(value["效果"] || value["敘述"] || value.value || value.name || "");
    }
    return text(value);
  }

  function renderBoostTalent(title, content) {
    const values = Array.isArray(content)
      ? content
      : (content && typeof content === "object" ? Object.values(content) : [content]);
    const items = values.filter((value) => !isNone(value)).slice(0, 3);
    if (!items.length) {
      return `<article class="ranger-talent-card">${talentTitle(title, false)}<div class="empty-state small">沒有強化才能資料。</div></article>`;
    }

    return `
      <article class="ranger-talent-card">
        ${talentTitle(title, false)}
        <div class="table-scroll detail-table-scroll">
          <table class="skill-effect-table talent-boost-table">
            <thead>
              <tr>${items.map((_, index) => `<th><img class="talent-icon talent-inline-icon" src="${TLT_ICON(index + 2)}" alt="" onerror="this.remove();"></th>`).join("")}</tr>
            </thead>
            <tbody>
              <tr>${items.map((item) => `<td>${html(boostText(item) || "-")}</td>`).join("")}</tr>
            </tbody>
          </table>
        </div>
      </article>
    `;
  }

  function renderTalent(value) {
    if (isNone(value)) return `<div class="empty-state small">沒有才能資料。</div>`;
    if (typeof value === "string") {
      return `<article class="ranger-talent-card">${talentTitle("主要才能")}<p>${html(value)}</p></article>`;
    }
    return `<div class="ranger-talent-list">${Object.entries(value).map(([title, content]) => {
      return text(title).includes("強化才能") ? renderBoostTalent(title, content) : renderMainTalent(title, content);
    }).join("")}</div>`;
  }

  async function patchDetailSections() {
    const modalContent = document.getElementById("rangerModalContent");
    if (!modalContent || !modalContent.children.length || modalContent.dataset.detailLayoutPatchRunning === "true") return;

    const title = text(modalContent.querySelector("#rangerModalTitle")?.textContent);
    const unitId = inferUnitIdFromModal(modalContent);
    const patchKey = `${unitId}|${title}`;
    if (!title || modalContent.dataset.detailLayoutPatchApplied === patchKey) return;

    modalContent.dataset.detailLayoutPatchRunning = "true";
    const [rows, animationMeta] = await Promise.all([loadRows(), loadAnimationMeta(unitId)]);
    const ranger = rows.find((item) => getId(item) === unitId || getName(item) === title);
    if (ranger) {
      const skillSection = findSection(modalContent, "技能");
      if (skillSection) skillSection.innerHTML = `<h3>技能</h3>${renderSkills(ranger, animationMeta)}`;

      const talentSection = findSection(modalContent, "才能");
      if (talentSection) talentSection.innerHTML = `<h3>才能</h3>${renderTalent(ranger["才能"])}`;

      modalContent.dataset.detailLayoutPatchApplied = patchKey;
    }
    modalContent.dataset.detailLayoutPatchRunning = "false";
  }

  const observer = new MutationObserver(() => window.setTimeout(patchDetailSections, 0));

  window.addEventListener("load", () => {
    const modalContent = document.getElementById("rangerModalContent");
    if (modalContent) observer.observe(modalContent, { childList: true, subtree: false });
    patchDetailSections();
  });
})();
