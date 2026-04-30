(() => {
  const DATA_URL = "../res/Rangers_data.json";
  let rangerMapPromise = null;

  const clean = (v) => v == null || typeof v === "object" ? "" : String(v).replaceAll("\\n", "\n").trim();
  const esc = (v) => clean(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function loadRangers() {
    if (!rangerMapPromise) {
      rangerMapPromise = fetch(DATA_URL)
        .then((res) => res.ok ? res.json() : [])
        .then((rows) => {
          const map = new Map();
          if (Array.isArray(rows)) {
            rows.forEach((ranger) => {
              const id = clean(ranger.ranger_id || ranger.unitCode || ranger.id || "");
              if (id) map.set(id, ranger);
            });
          }
          return map;
        })
        .catch(() => new Map());
    }
    return rangerMapPromise;
  }

  function currentId() {
    const src = document.querySelector("#rangerModalContent .ranger-detail-image")?.getAttribute("src") || "";
    const parts = src.split("/res/")[1]?.split("/") || [];
    return parts[0] ? decodeURIComponent(parts[0]) : "";
  }

  function skillsOf(ranger) {
    return [ranger?.["技能1"], ranger?.["技能2"], ranger?.["技能3"]]
      .filter((s) => s && typeof s === "object" && !Array.isArray(s));
  }

  function skillValue(skill, keys) {
    if (!skill || typeof skill !== "object") return "-";
    for (const key of keys) {
      const value = clean(skill[key]);
      if (value) return value;
    }
    return "-";
  }

  function table(skill) {
    return `
      <div class="table-scroll skill-meta-table-wrap">
        <table class="skill-meta-table">
          <thead><tr><th>發動率</th><th>技能冷卻時間</th><th>觸發基準</th></tr></thead>
          <tbody><tr>
            <td>${esc(skillValue(skill, ["發動機率", "技能發動率", "技能發動機率"]))}</td>
            <td>${esc(skillValue(skill, ["技能冷卻時間", "冷卻時間"]))}</td>
            <td>${esc(skillValue(skill, ["觸發基準", "觸發條件", "基準"]))}</td>
          </tr></tbody>
        </table>
      </div>
    `;
  }

  async function apply() {
    const modal = document.getElementById("rangerModal");
    const content = document.getElementById("rangerModalContent");
    if (!modal || modal.hidden || !content) return false;

    const id = currentId();
    if (!id) return false;

    const ranger = (await loadRangers()).get(id);
    if (!ranger) return false;

    const skills = skillsOf(ranger);
    const cards = [...content.querySelectorAll(".ranger-skill-card")];
    if (!cards.length) return false;

    let changed = false;
    cards.forEach((card, index) => {
      if (card.querySelector(".skill-meta-table-wrap")) return;
      const skill = skills[index];
      if (!skill) return;
      const titleBlock = card.querySelector(".ranger-icon-title > div");
      titleBlock?.querySelectorAll("p:not(.ranger-skill-description)").forEach((p) => p.remove());
      card.querySelector(".ranger-icon-title")?.insertAdjacentHTML("afterend", table(skill));
      changed = true;
    });
    return changed;
  }

  function scheduleApply(delay = 30) {
    window.clearTimeout(scheduleApply.timer);
    scheduleApply.timer = window.setTimeout(() => { apply(); }, delay);
  }

  function applyForAWhile() {
    let count = 0;
    const timer = window.setInterval(() => {
      apply();
      count += 1;
      const modal = document.getElementById("rangerModal");
      if (count >= 12 || !modal || modal.hidden) window.clearInterval(timer);
    }, 120);
  }

  const target = document.getElementById("rangerModalContent");
  if (target) {
    new MutationObserver(() => scheduleApply(20)).observe(target, { childList: true, subtree: true });
  }

  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest(".ranger-card")) {
      window.setTimeout(applyForAWhile, 0);
    }
  }, true);

  document.addEventListener("DOMContentLoaded", () => scheduleApply(120));
  window.addEventListener("load", () => scheduleApply(120));
})();