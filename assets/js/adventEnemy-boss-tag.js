(() => {
  const DATA_URL = "../res/adventEnemy_data.json";
  let enemyMapPromise = null;

  function clean(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function isBoss(value) {
    return clean(value) === "是" || clean(value).toLowerCase() === "true" || clean(value) === "1";
  }

  function getId(enemy) {
    return clean(enemy.ranger_id || enemy.enemy_id || enemy.unitCode || enemy.id || "");
  }

  function loadEnemyMap() {
    if (!enemyMapPromise) {
      enemyMapPromise = fetch(DATA_URL)
        .then((res) => res.ok ? res.json() : [])
        .then((rows) => {
          const map = new Map();
          if (Array.isArray(rows)) {
            rows.forEach((enemy) => {
              const id = getId(enemy);
              if (id) map.set(id, enemy);
            });
          }
          return map;
        })
        .catch(() => new Map());
    }
    return enemyMapPromise;
  }

  function makeTag(enemy) {
    const boss = isBoss(enemy?.isBoss);
    const span = document.createElement("span");
    span.className = boss ? "tag-inf-boss" : "tag-inf-normal";
    span.textContent = boss ? "魔王" : "一般";
    return span;
  }

  async function applyTags() {
    const map = await loadEnemyMap();

    document.querySelectorAll("#enemyList .enemy-card").forEach((card) => {
      if (card.dataset.adventTagDone === "1") return;
      const enemy = map.get(clean(card.dataset.enemyId));
      const tags = card.querySelector(".ranger-tags");
      if (!enemy || !tags) return;
      tags.appendChild(makeTag(enemy));
      card.dataset.adventTagDone = "1";
    });

    const modal = document.getElementById("enemyModal");
    const content = document.getElementById("enemyModalContent");
    if (!modal || modal.hidden || !content || content.dataset.adventTagDone === "1") return;

    const src = content.querySelector(".ranger-detail-image")?.getAttribute("src") || "";
    const match = src.match(/\/res\/([^/]+)\//);
    const id = match ? decodeURIComponent(match[1]) : "";
    const enemy = map.get(id);
    const tags = content.querySelector(".detail-tags");
    if (enemy && tags) {
      tags.appendChild(makeTag(enemy));
      content.dataset.adventTagDone = "1";
    }
  }

  let timer = 0;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(applyTags, 30);
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener("DOMContentLoaded", () => setTimeout(applyTags, 100));
})();
