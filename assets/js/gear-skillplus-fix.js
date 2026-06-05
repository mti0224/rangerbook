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

  function readByKeys(obj, keys) {
    if (!obj || typeof obj !== "object") return "";
    const entries = Object.entries(obj);
    for (const wanted of keys) {
      const found = entries.find(([key]) => text(key) === wanted);
      if (found) return found[1];
    }
    for (const wanted of keys) {
      const found = entries.find(([key]) => text(key).includes(wanted));
      if (found) return found[1];
    }
    return "";
  }

  function normalizeSkillPlusRows(skillPlus) {
    if (isEmpty(skillPlus)) return [];

    if (Array.isArray(skillPlus)) {
      return skillPlus.flatMap(normalizeSkillPlusRows);
    }

    if (typeof skillPlus !== "object") {
      return [{ effect: text(skillPlus), factor: "-", duration: "-" }];
    }

    const directEffect = readByKeys(skillPlus, ["技能效果", "效果", "skillEffect", "effect"]);
    const directFactor = readByKeys(skillPlus, ["係數", "倍率", "數值", "factor", "value"]);
    const directDuration = readByKeys(skillPlus, ["有效時間", "時間", "持續時間", "duration", "time"]);

    if (!isEmpty(directEffect) || !isEmpty(directFactor) || !isEmpty(directDuration)) {
      return [{
        effect: text(directEffect) || "-",
        factor: text(directFactor) || "-",
        duration: text(directDuration) || "-"
      }];
    }

    return Object.values(skillPlus).flatMap((value) => normalizeSkillPlusRows(value));
  }

  function renderSkillPlusTable(rows) {
    if (!rows.length) return `<div class="empty-state small">沒有Skill+資料。</div>`;
    return `
      <div class="table-scroll gear-effect-table-wrap">
        <table class="gear-effect-table gear-skillplus-table">
          <thead>
            <tr>
              <th>技能效果</th>
              <th>係數</th>
              <th>有效時間</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.effect || "-")}</td>
                <td>${escapeHtml(row.factor || "-")}</td>
                <td>${escapeHtml(row.duration || "-")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderSkillPlus(skillPlus) {
    return renderSkillPlusTable(normalizeSkillPlusRows(skillPlus));
  }

  async function applySkillPlus() {
    const modal = document.getElementById("gearModal");
    const content = document.getElementById("gearModalContent");
    if (!modal || modal.hidden || !content) return;

    const id = getCurrentGearId();
    if (!id) return;

    const section = [...content.querySelectorAll(".detail-section")]
      .find((el) => el.querySelector("h3")?.textContent.trim() === "Skill+");
    if (!section) return;
    if (content.dataset.skillPlusFixedFor === id && section.dataset.skillPlusFixed === "true") return;

    const gear = (await loadGears()).get(id);
    if (!gear) return;

    section.innerHTML = `<h3>Skill+</h3>${renderSkillPlus(getSkillPlus(gear))}`;
    section.dataset.skillPlusFixed = "true";
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
