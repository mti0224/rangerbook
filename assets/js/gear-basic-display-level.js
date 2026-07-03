(() => {
  const DATA_URL = "../res/%E8%A3%9D%E5%82%99%E8%B3%87%E6%96%99%E5%BA%AB.json";
  const group = document.getElementById("gearBasicDisplayLevel");
  const list = document.getElementById("gearList");
  const resetBtn = document.getElementById("gearResetBtn");
  if (!group || !list) return;

  let selectedLevel = 0;
  let gearMapPromise = null;
  let applying = false;
  let timer = 0;

  function text(value) {
    if (value === null || value === undefined) return "";
    return String(value).replaceAll("\\n", "\n").trim();
  }

  function getId(gear) {
    return text(gear?.id || gear?.gear_id || gear?.code || "");
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

  function formatSigned1(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    const output = number.toFixed(1);
    return number > 0 ? `+${output}` : output;
  }

  function scaleValue(value, level) {
    const factor = level + 1;
    if (typeof value === "number") return formatSigned1(value * factor);
    return text(value).replace(/[+\-]?\d+(?:\.\d+)?/g, (token) => {
      const number = Number(token);
      return Number.isFinite(number) ? formatSigned1(number * factor) : token;
    });
  }

  async function applyLevel() {
    if (applying) return;
    applying = true;
    try {
      const gearMap = await loadGearMap();
      list.querySelectorAll(".gear-card[data-gear-id]").forEach((card) => {
        const gear = gearMap.get(card.dataset.gearId || "");
        const stats = card.querySelector(".gear-mini-stats");
        if (!gear || !stats) return;
        const effects = gear["基本效果"] && typeof gear["基本效果"] === "object"
          ? Object.entries(gear["基本效果"]).slice(0, 3)
          : [];
        stats.innerHTML = effects
          .map(([name, value]) => `<span>${escapeHtml(`${name} ${scaleValue(value, selectedLevel)}`)}</span>`)
          .join("");
      });
    } finally {
      applying = false;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  group.addEventListener("change", (event) => {
    const input = event.target.closest?.("input[name='gearBasicDisplayLevel']");
    if (!input) return;
    selectedLevel = Number(input.value) || 0;
    applyLevel();
  });

  resetBtn?.addEventListener("click", () => {
    selectedLevel = 0;
    const zero = group.querySelector("input[value='0']");
    if (zero) zero.checked = true;
    window.setTimeout(applyLevel, 0);
  });

  new MutationObserver(() => {
    if (applying) return;
    clearTimeout(timer);
    timer = window.setTimeout(applyLevel, 30);
  }).observe(list, { childList: true });

  applyLevel();
})();
