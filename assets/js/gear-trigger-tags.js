(() => {
  const DATA_URL = "../res/%E8%A3%9D%E5%82%99%E8%B3%87%E6%96%99%E5%BA%AB.json";
  const ATTRIBUTES = ["火", "水", "木", "光", "暗"];
  const TYPES = ["力量型", "敏捷型", "智慧型"];
  let gearMapPromise = null;

  function text(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function getId(gear) {
    return String(gear?.id || gear?.gear_id || gear?.code || "").trim();
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

  function getConditionText(gear) {
    const advanced = gear?.["高級效果"];
    if (!advanced || typeof advanced !== "object") return "";
    return text(advanced["觸發條件"] || advanced["條件"] || "");
  }

  function getTriggerTags(gear) {
    const source = getConditionText(gear);
    const result = [];

    ATTRIBUTES.forEach((attribute) => {
      if (source.includes(`${attribute}屬性`) || source.includes(attribute)) {
        result.push(`${attribute}屬性`);
      }
    });

    TYPES.forEach((type) => {
      if (source.includes(type)) result.push(type);
    });

    return [...new Set(result)];
  }

  async function applyTags() {
    const list = document.getElementById("gearList");
    if (!list) return;

    const gearMap = await loadGearMap();
    list.querySelectorAll(".gear-card[data-gear-id]").forEach((card) => {
      const tags = card.querySelector(".ranger-tags");
      if (!tags) return;

      tags.querySelectorAll(".gear-trigger-condition-tag").forEach((tag) => tag.remove());

      const gear = gearMap.get(card.dataset.gearId || "");
      if (!gear) return;

      getTriggerTags(gear).forEach((label) => {
        const tag = document.createElement("span");
        tag.className = "gear-trigger-condition-tag";
        tag.textContent = label;
        tags.appendChild(tag);
      });
    });
  }

  let timer = 0;
  const list = document.getElementById("gearList");
  if (list) {
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = window.setTimeout(applyTags, 30);
    }).observe(list, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", applyTags);
})();
