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

  function getByAliases(source, aliases) {
    if (!source || typeof source !== "object") return null;
    for (const key of aliases) {
      if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
    }
    const normalizedAliases = aliases.map((key) => text(key).toLowerCase().replaceAll(" ", ""));
    const found = Object.entries(source).find(([key]) => {
      const normalizedKey = text(key).toLowerCase().replaceAll(" ", "");
      return normalizedAliases.some((alias) => normalizedKey.includes(alias));
    });
    return found ? found[1] : null;
  }

  function getSkillPlus(gear) {
    return getByAliases(gear, ["Skill+", "Skill＋", "skill+", "skillPlus", "Skill Plus", "技能+", "技能＋"]);
  }

  function getSpecPlus(gear) {
    return getByAliases(gear, ["Spec+", "Spec＋", "spec+", "specPlus", "Spec Plus", "特化+", "特化＋"]);
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

  function displayValue(value) {
    if (isEmpty(value)) return "-";
    if (Array.isArray(value)) return value.map(displayValue).filter((item) => item !== "-").join("、") || "-";
    if (typeof value === "object") {
      const parts = Object.entries(value)
        .filter(([, child]) => !isEmpty(child))
        .map(([key, child]) => `${text(key)}：${displayValue(child)}`);
      return parts.join("、") || "-";
    }
    return text(value) || "-";
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

  function renderEffectTable(effects) {
    if (isEmpty(effects) || typeof effects !== "object") {
      return `<div class="empty-state small">沒有Spec+基本效果資料。</div>`;
    }
    return `
      <div class="table-scroll gear-effect-table-wrap">
        <table class="gear-effect-table">
          <thead><tr><th>效果</th><th>數值</th></tr></thead>
          <tbody>
            ${Object.entries(effects).map(([key, value]) => `
              <tr><th>${escapeHtml(key)}</th><td>${escapeHtml(displayValue(value))}</td></tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function conditionRows(specialEffect) {
    if (!specialEffect || typeof specialEffect !== "object" || Array.isArray(specialEffect)) return [];
    return Object.entries(specialEffect)
      .filter(([key, value]) => /^(?:觸發)?條件\d*$/.test(text(key)) && !isEmpty(value))
      .map(([key, value]) => ({ label: text(key), value: displayValue(value) }));
  }

  function normalizeTriggerEffects(value, fallbackProbability = "-") {
    if (isEmpty(value)) return [];
    if (Array.isArray(value)) return value.flatMap((item) => normalizeTriggerEffects(item, fallbackProbability));
    if (typeof value !== "object") {
      return [{ probability: fallbackProbability, effect: text(value) || "-", factor: "-", time: "-" }];
    }

    const probability = readByKeys(value, ["觸發機率", "發動機率", "機率", "probability"]);
    const effect = readByKeys(value, ["效果", "技能效果", "名稱", "effect"]);
    const factor = readByKeys(value, ["係數", "倍率", "數值", "factor", "value"]);
    const time = readByKeys(value, ["時間", "有效時間", "持續時間", "duration", "time"]);

    if (!isEmpty(effect) || !isEmpty(factor) || !isEmpty(time) || !isEmpty(probability)) {
      return [{
        probability: displayValue(probability) !== "-" ? displayValue(probability) : fallbackProbability,
        effect: displayValue(effect),
        factor: displayValue(factor),
        time: displayValue(time)
      }];
    }

    return Object.values(value).flatMap((item) => normalizeTriggerEffects(item, fallbackProbability));
  }

  function collectTriggerEffects(specialEffect, fallbackProbability) {
    if (!specialEffect || typeof specialEffect !== "object") return [];
    if (Array.isArray(specialEffect)) {
      return specialEffect.flatMap((item) => collectTriggerEffects(item, fallbackProbability));
    }

    const matched = Object.entries(specialEffect)
      .filter(([key]) => /^觸發效果\d*$/.test(text(key)))
      .flatMap(([, value]) => normalizeTriggerEffects(value, fallbackProbability));

    if (matched.length) return matched;
    return normalizeTriggerEffects(specialEffect, fallbackProbability);
  }

  function renderTriggerEffectTable(rows) {
    if (!rows.length) return `<div class="empty-state small">沒有Spec+特殊效果資料。</div>`;
    return `
      <div class="table-scroll gear-effect-table-wrap">
        <table class="gear-effect-table gear-specplus-trigger-table">
          <thead>
            <tr>
              <th>觸發機率</th>
              <th>效果</th>
              <th>係數</th>
              <th>時間</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.probability || "-")}</td>
                <td>${escapeHtml(row.effect || "-")}</td>
                <td>${escapeHtml(row.factor || "-")}</td>
                <td>${escapeHtml(row.time || "-")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderSpecPlus(specPlus) {
    if (isEmpty(specPlus)) return `<div class="empty-state small">沒有Spec+資料。</div>`;
    if (typeof specPlus !== "object") {
      return `<p class="gear-specplus-description">${escapeHtml(specPlus)}</p>`;
    }

    const name = readByKeys(specPlus, ["名稱", "Spec+名稱", "特化名稱", "name"]);
    const basicEffects = readByKeys(specPlus, ["基本效果", "基礎效果", "basicEffect", "basic"]);
    const specialEffect = readByKeys(specPlus, ["特殊效果", "特化效果", "specialEffect", "special"]);
    const description = readByKeys(specialEffect, ["敘述", "描述", "說明", "description"]);
    const probability = readByKeys(specialEffect, ["觸發機率", "發動機率", "機率", "probability"]);
    const conditions = conditionRows(specialEffect);
    const triggerEffects = collectTriggerEffects(specialEffect, displayValue(probability));

    return `
      <div class="gear-specplus-detail">
        ${!isEmpty(name) ? `<p class="gear-specplus-name"><span>名稱</span><strong>${escapeHtml(name)}</strong></p>` : ""}
        <div class="gear-specplus-block">
          <h4>基本效果</h4>
          ${renderEffectTable(basicEffects)}
        </div>
        <div class="gear-specplus-block">
          <h4>特殊效果</h4>
          ${!isEmpty(description) ? `<p class="gear-specplus-description">${escapeHtml(description)}</p>` : ""}
          ${!isEmpty(probability) || conditions.length ? `
            <dl class="gear-specplus-meta">
              ${!isEmpty(probability) ? `<div><dt>觸發機率</dt><dd>${escapeHtml(displayValue(probability))}</dd></div>` : ""}
              ${conditions.map((row) => `<div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`).join("")}
            </dl>
          ` : ""}
          ${renderTriggerEffectTable(triggerEffects)}
        </div>
      </div>
    `;
  }

  function findSection(content, title) {
    return [...content.querySelectorAll(".detail-section")]
      .find((element) => element.querySelector("h3")?.textContent.trim() === title);
  }

  function ensureSpecPlusSection(content, skillSection) {
    let section = findSection(content, "Spec+");
    if (!section) {
      section = document.createElement("section");
      section.className = "detail-section";
      if (skillSection) skillSection.insertAdjacentElement("afterend", section);
      else content.appendChild(section);
    }
    return section;
  }

  async function applySupplementalDetails() {
    const modal = document.getElementById("gearModal");
    const content = document.getElementById("gearModalContent");
    if (!modal || modal.hidden || !content) return;

    const id = getCurrentGearId();
    if (!id) return;

    const gear = (await loadGears()).get(id);
    if (!gear) return;

    const skillSection = findSection(content, "Skill+");
    if (skillSection && skillSection.dataset.skillPlusFixedFor !== id) {
      skillSection.innerHTML = `<h3>Skill+</h3>${renderSkillPlus(getSkillPlus(gear))}`;
      skillSection.dataset.skillPlusFixedFor = id;
    }

    const specSection = ensureSpecPlusSection(content, skillSection);
    if (specSection.dataset.specPlusRenderedFor !== id) {
      specSection.innerHTML = `<h3>Spec+</h3>${renderSpecPlus(getSpecPlus(gear))}`;
      specSection.dataset.specPlusRenderedFor = id;
    }
  }

  async function markSpecPlusCards() {
    const list = document.getElementById("gearList");
    if (!list) return;
    const gearMap = await loadGears();
    list.querySelectorAll(".gear-card[data-gear-id]").forEach((card) => {
      const gear = gearMap.get(card.dataset.gearId || "");
      if (!gear || isEmpty(getSpecPlus(gear))) return;
      const tags = card.querySelector(".ranger-tags");
      if (tags && !tags.querySelector(".gear-specplus-tag")) {
        const badge = document.createElement("span");
        badge.className = "gear-specplus-tag";
        badge.textContent = "Spec+";
        tags.appendChild(badge);
      }
    });
  }

  let modalTimer = 0;
  const modalTarget = document.getElementById("gearModalContent");
  if (modalTarget) {
    new MutationObserver(() => {
      clearTimeout(modalTimer);
      modalTimer = window.setTimeout(applySupplementalDetails, 30);
    }).observe(modalTarget, { childList: true, subtree: true });
  }

  let listTimer = 0;
  const listTarget = document.getElementById("gearList");
  if (listTarget) {
    new MutationObserver(() => {
      clearTimeout(listTimer);
      listTimer = window.setTimeout(markSpecPlusCards, 30);
    }).observe(listTarget, { childList: true, subtree: true });
  }
})();
