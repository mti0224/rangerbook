(() => {
  const DATA_URL = "../res/%E8%A3%9D%E5%82%99%E8%B3%87%E6%96%99%E5%BA%AB.json";
  let gearMapPromise = null;

  function text(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return "";
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
    if (typeof value !== "object") return !text(value) || text(value) === "無" || text(value) === "(無)";
    if (Array.isArray(value)) return value.length === 0;
    return Object.keys(value).length === 0;
  }

  function getId(gear) {
    return text(gear.id || gear.gear_id || gear.code || "");
  }

  function getCurrentGearId() {
    const src = document.querySelector("#gearModalContent .gear-detail-image")?.getAttribute("src") || "";
    const match = src.match(/gear_icon\/([^/]+)_icon\.png/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function getSkillPlus(gear) {
    if (!gear || typeof gear !== "object") return null;
    const exactKeys = ["Skill+", "Skill＋", "skill+", "skillPlus", "Skill Plus", "技能+", "技能＋"];
    for (const key of exactKeys) {
      if (Object.prototype.hasOwnProperty.call(gear, key)) return gear[key];
    }
    const found = Object.entries(gear).find(([key]) => text(key).toLowerCase().replaceAll(" ", "").includes("skill+"));
    return found ? found[1] : null;
  }

  function loadGears() {
    if (!gearMapPromise) {
      gearMapPromise = fetch(DATA_URL)
        .then((res) => res.ok ? res.json() : [])
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

  function scalar(value) {
    if (value === null || value === undefined) return "-";
    if (typeof value !== "object") return text(value) || "-";
    return "";
  }

  function collectRows(obj, prefix = "") {
    if (isEmpty(obj)) return [];
    if (typeof obj !== "object") return [[prefix || "效果", scalar(obj)]];
    if (Array.isArray(obj)) {
      return obj.flatMap((item, index) => collectRows(item, prefix ? `${prefix} ${index + 1}` : `項目 ${index + 1}`));
    }

    const rows = [];
    Object.entries(obj).forEach(([key, value]) => {
      const label = prefix ? `${prefix} / ${key}` : key;
      if (isEmpty(value)) return;
      if (typeof value === "object") rows.push(...collectRows(value, label));
      else rows.push([label, scalar(value)]);
    });
    return rows;
  }

  function renderRows(rows) {
    if (!rows.length) return `<div class="empty-state small">沒有Skill+資料。</div>`;
    return `
      <div class="table-scroll gear-effect-table-wrap">
        <table class="gear-effect-table">
          <thead><tr><th>項目</th><th>數值</th></tr></thead>
          <tbody>
            ${rows.map(([key, value]) => `
              <tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderSkillPlus(skillPlus) {
    if (isEmpty(skillPlus)) return `<div class="empty-state small">沒有Skill+資料。</div>`;

    if (typeof skillPlus !== "object") {
      return renderRows([["效果", skillPlus]]);
    }

    if (Array.isArray(skillPlus)) {
      return renderRows(collectRows(skillPlus));
    }

    const topEntries = Object.entries(skillPlus).filter(([, value]) => !isEmpty(value));
    const hasNestedGroups = topEntries.some(([, value]) => value && typeof value === "object" && !Array.isArray(value));

    if (!hasNestedGroups) return renderRows(collectRows(skillPlus));

    return topEntries.map(([title, value]) => {
      if (typeof value !== "object") return renderRows([[title, value]]);
      return `
        <article class="gear-skillplus-group">
          <h4>${escapeHtml(title)}</h4>
          ${renderRows(collectRows(value))}
        </article>
      `;
    }).join("");
  }

  async function applySkillPlus() {
    const modal = document.getElementById("gearModal");
    const content = document.getElementById("gearModalContent");
    if (!modal || modal.hidden || !content) return;

    const id = getCurrentGearId();
    if (!id || content.dataset.skillPlusFixedFor === id) return;

    const gear = (await loadGears()).get(id);
    if (!gear) return;

    const section = [...content.querySelectorAll(".detail-section")]
      .find((el) => el.querySelector("h3")?.textContent.trim() === "Skill+");
    if (!section) return;

    section.innerHTML = `<h3>Skill+</h3>${renderSkillPlus(getSkillPlus(gear))}`;
    content.dataset.skillPlusFixedFor = id;
  }

  let timer = 0;
  const target = document.getElementById("gearModalContent");
  if (target) {
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(applySkillPlus, 30);
    }).observe(target, { childList: true, subtree: true });
  }
})();
