(() => {
  const script = document.currentScript;
  const DATA_URL = script?.dataset.url || "../res/infEnemy_data.json";
  const DATASET_KEY = script?.dataset.key || "bossTagDone";
  const LIST_SELECTOR = script?.dataset.listSelector || "#enemyList .enemy-card";
  const MODAL_ID = script?.dataset.modalId || "enemyModal";
  const MODAL_CONTENT_ID = script?.dataset.modalContentId || "enemyModalContent";
  let enemyMapPromise = null;

  function clean(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function isBoss(value) {
    const normalized = clean(value).toLowerCase();
    return normalized === "是" || normalized === "true" || normalized === "1";
  }

  function getId(enemy) {
    return clean(enemy?.ranger_id || enemy?.enemy_id || enemy?.unitCode || enemy?.id || "");
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

  function idFromImage(content) {
    const src = content.querySelector(".ranger-detail-image")?.getAttribute("src") || "";
    const match = src.match(/\/(?:res|res_from_emulator)\/([^/]+)\//);
    return match ? decodeURIComponent(match[1]) : "";
  }

  async function applyTags() {
    const map = await loadEnemyMap();

    document.querySelectorAll(LIST_SELECTOR).forEach((card) => {
      if (card.dataset[DATASET_KEY] === "1") return;
      const enemy = map.get(clean(card.dataset.enemyId));
      const tags = card.querySelector(".ranger-tags");
      if (!enemy || !tags) return;
      tags.appendChild(makeTag(enemy));
      card.dataset[DATASET_KEY] = "1";
    });

    const modal = document.getElementById(MODAL_ID);
    const content = document.getElementById(MODAL_CONTENT_ID);
    if (!modal || modal.hidden || !content || content.dataset[DATASET_KEY] === "1") return;

    const enemy = map.get(idFromImage(content));
    const tags = content.querySelector(".detail-tags");
    if (enemy && tags) {
      tags.appendChild(makeTag(enemy));
      content.dataset[DATASET_KEY] = "1";
    }
  }

  let timer = 0;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(applyTags, 30);
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener("DOMContentLoaded", () => setTimeout(applyTags, 100));
})();
