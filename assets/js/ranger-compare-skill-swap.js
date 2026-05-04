(() => {
  const ROOT = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const DATA_URL = `${ROOT}res/Rangers_data.json`;
  const MAX_APPLY_DELAY = 80;

  let swapLeftSkills = false;
  let fullPromise = null;
  let fullMap = new Map();
  let applying = false;
  let scheduled = 0;

  const raw = (value) => value === null || value === undefined ? "" : String(value);
  const text = (value) => raw(value).replaceAll("\\n", "\n").trim();
  const html = (value) => raw(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function fmt(value) {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "number") return value.toLocaleString("zh-Hant");
    const t = text(value);
    const n = Number(t.replaceAll(",", ""));
    if (Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(t.replaceAll(",", ""))) return n.toLocaleString("zh-Hant");
    return html(t || "-");
  }

  function parseNumber(value) {
    const match = text(value).replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : null;
  }

  function getId(ranger) {
    return text(ranger?.ranger_id || ranger?.unitCode || ranger?.id || "");
  }

  function getSkill(ranger, key) {
    const skill = ranger?.[key];
    return skill && typeof skill === "object" && !Array.isArray(skill) ? skill : null;
  }

  function getSkillEffects(skill) {
    return skill && Array.isArray(skill["技能組"]) ? skill["技能組"] : [];
  }

  function skillRange(skill) {
    const ranges = getSkillEffects(skill).map((effect) => text(effect?.["範圍"])).filter((value) => value && value !== "-");
    if (!ranges.length) return "-";
    const numeric = ranges.map((value) => ({ value, n: parseNumber(value) })).filter((item) => item.n !== null);
    if (!numeric.length) return html(ranges[0]);
    const max = numeric.reduce((best, item) => item.n > best.n ? item : best, numeric[0]);
    return html(max.value);
  }

  function skillMetaValue(skill, field) {
    if (!skill) return "-";
    if (field === "名稱") return fmt(skill["技能名稱"] || skill.name || "-");
    if (field === "發動率") return fmt(skill["發動機率"] || skill["技能發動率"] || skill["技能發動機率"]);
    if (field === "冷卻") return fmt(skill["技能冷卻時間"] || skill["冷卻時間"]);
    if (field === "觸發基準") return fmt(skill["觸發基準"] || skill["觸發條件"] || skill["基準"]);
    if (field === "技能範圍") return skillRange(skill);
    return "-";
  }

  function effectCell(effect, field) {
    if (!effect) return "-";
    if (field === "效果") return fmt(effect["效果"] || "-");
    if (field === "係數") return fmt(effect["係數"] || "-");
    if (field === "時間") return fmt(effect["有效時間"] || effect["時間"] || "-");
    return "-";
  }

  function selectedIds() {
    const cards = Array.from(document.querySelectorAll("#compareSelected .compare-selected-card"));
    return cards.map((card) => {
      const meta = card.querySelector(".compare-suggestion-meta");
      const value = text(meta?.textContent || "");
      return value && !value.includes("請從上方") ? value : "";
    });
  }

  async function loadFullData() {
    if (fullMap.size) return true;
    if (fullPromise) return fullPromise;
    fullPromise = fetch(DATA_URL, { cache: "force-cache" })
      .then((res) => {
        if (!res.ok) throw new Error(`Rangers_data.json HTTP ${res.status}`);
        return res.json();
      })
      .then((rows) => {
        fullMap = new Map((Array.isArray(rows) ? rows : []).map((ranger) => [getId(ranger), ranger]));
        return true;
      })
      .catch((error) => {
        console.error(error);
        return false;
      });
    return fullPromise;
  }

  function skillTitleHtml(title) {
    if (title !== "技能1") return html(title);
    return `
      <span>${html(title)}</span>
      <label class="compare-skill-swap-control">
        <input id="compareSwapLeftSkill12" type="checkbox" ${swapLeftSkills ? "checked" : ""}>
        <span>若勾選，角色A的技能1資料將與技能2資料對調</span>
      </label>
    `;
  }

  function renderSkillSection(title, leftSkill, rightSkill) {
    const metaFields = ["名稱", "發動率", "冷卻", "觸發基準", "技能範圍"];
    const leftEffects = getSkillEffects(leftSkill);
    const rightEffects = getSkillEffects(rightSkill);
    const effectCount = Math.max(leftEffects.length, rightEffects.length);
    const metaRows = metaFields.map((field) => `<tr><th>${html(field)}</th><td colspan="3">${skillMetaValue(leftSkill, field)}</td><td colspan="3">${skillMetaValue(rightSkill, field)}</td></tr>`);
    const effectRows = [];

    if (effectCount) {
      effectRows.push(`<tr class="compare-skill-subhead"><th>技能效果</th><td>效果</td><td>係數</td><td>時間</td><td>效果</td><td>係數</td><td>時間</td></tr>`);
      for (let i = 0; i < effectCount; i += 1) {
        const left = leftEffects[i];
        const right = rightEffects[i];
        effectRows.push(`<tr><th>效果 ${i + 1}</th><td>${effectCell(left, "效果")}</td><td>${effectCell(left, "係數")}</td><td>${effectCell(left, "時間")}</td><td>${effectCell(right, "效果")}</td><td>${effectCell(right, "係數")}</td><td>${effectCell(right, "時間")}</td></tr>`);
      }
    } else {
      effectRows.push(`<tr><th>技能效果</th><td colspan="3">-</td><td colspan="3">-</td></tr>`);
    }

    return `<section class="compare-section compare-skill-section" data-skill-title="${html(title)}"><h3>${skillTitleHtml(title)}</h3><div class="compare-table-wrap"><table class="compare-table compare-skill-table"><tbody>${[...metaRows, ...effectRows].join("")}</tbody></table></div></section>`;
  }

  function getSkillSections() {
    const sections = Array.from(document.querySelectorAll(".compare-skill-section"));
    const skill1 = sections.find((section) => text(section.dataset.skillTitle || section.querySelector("h3")?.textContent || "").startsWith("技能1"));
    const skill2 = sections.find((section) => text(section.dataset.skillTitle || section.querySelector("h3")?.textContent || "").startsWith("技能2"));
    return { skill1, skill2 };
  }

  function bindCheckbox() {
    const checkbox = document.getElementById("compareSwapLeftSkill12");
    if (!checkbox || checkbox.dataset.bound === "1") return;
    checkbox.dataset.bound = "1";
    checkbox.checked = swapLeftSkills;
    checkbox.addEventListener("change", () => {
      swapLeftSkills = checkbox.checked;
      applySkillSwap(true);
    });
  }

  function injectStyle() {
    if (document.getElementById("compareSkillSwapStyle")) return;
    const style = document.createElement("style");
    style.id = "compareSkillSwapStyle";
    style.textContent = `
      .compare-skill-section h3 {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.6rem;
      }
      .compare-skill-swap-control {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        color: var(--muted);
        font-size: 0.82rem;
        font-weight: 800;
        line-height: 1.35;
        cursor: pointer;
      }
      .compare-skill-swap-control input {
        flex: 0 0 1rem;
        width: 1rem;
        height: 1rem;
        margin: 0;
        accent-color: var(--primary);
      }
      html[data-theme="dark"] .compare-skill-swap-control {
        color: #bfdbfe !important;
      }
    `;
    document.head.appendChild(style);
  }

  async function applySkillSwap(forceRender = false) {
    if (applying) return;
    const { skill1, skill2 } = getSkillSections();
    if (!skill1 || !skill2) return;

    injectStyle();

    const alreadyCustom = skill1.dataset.skillSwapRendered === "1" && skill2.dataset.skillSwapRendered === "1";
    if (!swapLeftSkills && !alreadyCustom && !forceRender) {
      if (!skill1.querySelector("#compareSwapLeftSkill12")) {
        const h3 = skill1.querySelector("h3");
        if (h3) h3.innerHTML = skillTitleHtml("技能1");
      }
      bindCheckbox();
      return;
    }

    if (!await loadFullData()) return;

    const [leftId, rightId] = selectedIds();
    const left = fullMap.get(leftId) || null;
    const right = fullMap.get(rightId) || null;
    if (!left && !right) return;

    applying = true;
    const nextLeftSkill1 = getSkill(left, swapLeftSkills ? "技能2" : "技能1");
    const nextLeftSkill2 = getSkill(left, swapLeftSkills ? "技能1" : "技能2");
    const nextRightSkill1 = getSkill(right, "技能1");
    const nextRightSkill2 = getSkill(right, "技能2");

    skill1.outerHTML = renderSkillSection("技能1", nextLeftSkill1, nextRightSkill1);
    const nextSkill2 = getSkillSections().skill2;
    if (nextSkill2) nextSkill2.outerHTML = renderSkillSection("技能2", nextLeftSkill2, nextRightSkill2);

    const rendered = getSkillSections();
    if (rendered.skill1) rendered.skill1.dataset.skillSwapRendered = "1";
    if (rendered.skill2) rendered.skill2.dataset.skillSwapRendered = "1";
    bindCheckbox();
    applying = false;
  }

  function scheduleApply() {
    clearTimeout(scheduled);
    scheduled = setTimeout(() => applySkillSwap(false), MAX_APPLY_DELAY);
  }

  const observer = new MutationObserver(() => {
    if (!applying) scheduleApply();
  });

  observer.observe(document.getElementById("compareResult") || document.body, { childList: true, subtree: true });
  window.addEventListener("load", scheduleApply);
  scheduleApply();
})();
