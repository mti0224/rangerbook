(() => {
  const DATA_URL = "../res/Rangers_data.json";
  const state = { rangerMap: null };

  function toNumber(value) {
    if (typeof value === "number") return value;
    const number = Number(String(value ?? "").replaceAll(",", ""));
    return Number.isFinite(number) ? number : 0;
  }

  function formatNumber(value) {
    if (typeof value === "number") return value.toLocaleString("zh-Hant");
    const number = toNumber(value);
    return number ? number.toLocaleString("zh-Hant") : String(value || "-");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getAttackValue(ranger) {
    const physical = toNumber(ranger["物理攻擊力"]);
    const magical = toNumber(ranger["魔法攻擊力"]);
    return Math.max(physical, magical);
  }

  async function loadRangerMap() {
    if (state.rangerMap) return state.rangerMap;
    const res = await fetch(DATA_URL);
    const rows = res.ok ? await res.json() : [];
    state.rangerMap = new Map();
    if (Array.isArray(rows)) {
      rows.forEach((ranger) => {
        if (ranger?.ranger_id) state.rangerMap.set(String(ranger.ranger_id), ranger);
      });
    }
    return state.rangerMap;
  }

  async function updateCards(root = document) {
    const map = await loadRangerMap();
    root.querySelectorAll?.(".ranger-card").forEach((card) => {
      const id = card.dataset.rangerId;
      const ranger = map.get(String(id));
      if (!ranger) return;

      const box = card.querySelector(".ranger-mini-stats");
      if (!box) return;

      box.innerHTML = `
        <span>攻擊力 ${escapeHtml(formatNumber(getAttackValue(ranger)))}</span>
        <span>體力 ${escapeHtml(formatNumber(ranger["體力"]))}</span>
        <span>礦物 ${escapeHtml(formatNumber(ranger["生產礦物費用"]))}</span>
      `;
    });
  }

  const list = document.getElementById("rangerList");
  if (list) {
    const observer = new MutationObserver(() => updateCards(list));
    observer.observe(list, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", () => updateCards());
})();
