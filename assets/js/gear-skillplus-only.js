(() => {
  const DATA_URL = "../res/%E8%A3%9D%E5%82%99%E8%B3%87%E6%96%99%E5%BA%AB.json";
  let gearMapPromise = null;
  let timer = 0;
  let applying = false;

  function text(value) {
    if (value === null || value === undefined || typeof value === "object") return "";
    return String(value).replaceAll("\\n", "\n").trim();
  }

  function escapeHtml(value) {
    return text(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") return Object.keys(value).length === 0;
    const valueText = text(value);
    return !valueText || valueText === "無" || valueText === "(無)";
  }

  function getId(gear) {
    return text(gear?.id || gear?.gear_id || gear?.code || "");
  }

  function currentGearId() {
    const src = document.querySelector("#gearModalContent .gear-detail-image")?.getAttribute("src") || "";
    const match = src.match(/gear_icon\/([^/]+)_icon\.png/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function loadGearMap() {
    if (!gearMapPromise) {
      gearMapPromise = fetch(DATA_URL)
        .then((response) => response.ok ? response.json() : [])
        .then((rows) => {
          const map = new Map();
          if (Array.isArray(rows)) {
            rows.forEach((gear) => {
              const id = getId(gear);
              if (id) map.set(id, gear);
            });
          }
          return map;
        })
        .catch(() => new Map());
    }
    return gearMapPromise;
  }

  function getSkillPlus(gear) {
    if (!gear || typeof gear !== "object") return null;
    return gear["Skill+"] ?? gear["Skill＋"] ?? gear.skillPlus ?? null;
  }

  function readValue(source, keys) {
    if (!source || typeof source !== "object") return "";
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
    }
    return "";
  }

  function normalizeRows(value) {
    if (isEmpty(value)) return [];
    if (Array.isArray(value)) return value.flatMap(normalizeRows);
    if (typeof value !== "object") {
      return [{ effect: text(value) || "-", factor: "-", duration: "-" }];
    }

    const effect = readValue(value, ["技能效果", "效果", "skillEffect", "effect"]);
    const factor = readValue(value, ["係數", "倍率", "數值", "factor", "value"]);
    const duration = readValue(value, ["有效時間", "時間", "持續時間", "duration", "time"]);

    if (!isEmpty(effect) || !isEmpty(factor) || !isEmpty(duration)) {
      return [{
        effect: text(effect) || "-",
        factor: text(factor) || "-",
        duration: text(duration) || "-"
      }];
    }

    return Object.values(value).flatMap(normalizeRows);
  }

  function renderTable(rows) {
    if (!rows.length) return `<div class="empty-state small">沒有Skill+資料。</div>`;
    return `
      <div class="table-scroll gear-effect-table-wrap">
        <table class="gear-effect-table gear-skillplus-table">
          <thead><tr><th>技能效果</th><th>係數</th><th>有效時間</th></tr></thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.effect)}</td>
                <td>${escapeHtml(row.factor)}</td>
                <td>${escapeHtml(row.duration)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function findSkillSection(content) {
    return [...content.querySelectorAll(":scope > .detail-section")].find((section) => {
      return section.querySelector(":scope > h3")?.textContent.trim() === "Skill+";
    });
  }

  async function applySkillPlus() {
    if (applying) return;
    const content = document.getElementById("gearModalContent");
    const id = currentGearId();
    if (!content || !id || !content.children.length) return;

    const section = findSkillSection(content);
    if (!section || section.dataset.skillPlusOnlyFor === id) return;

    applying = true;
    try {
      const gear = (await loadGearMap()).get(id);
      if (!gear) return;
      section.innerHTML = `<h3>Skill+</h3>${renderTable(normalizeRows(getSkillPlus(gear)))}`;
      section.dataset.skillPlusOnlyFor = id;
    } finally {
      applying = false;
    }
  }

  const content = document.getElementById("gearModalContent");
  if (content) {
    new MutationObserver((mutations) => {
      if (applying) return;
      const replaced = mutations.some((mutation) => mutation.target === content);
      if (!replaced) return;
      clearTimeout(timer);
      timer = window.setTimeout(applySkillPlus, 30);
    }).observe(content, { childList: true });
  }

  applySkillPlus();
})();
