(() => {
  const DATA_URL = "../res/Rangers_data.json";
  const EXTRA_STATS = ["命中率", "技能命中率"];
  let rangerMapPromise = null;

  function escapeHtml(value) {
    return String(value ?? "-")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatNumber(value) {
    if (typeof value === "number") return value.toLocaleString("zh-Hant");
    return escapeHtml(value || "-");
  }

  function loadRangerMap() {
    if (!rangerMapPromise) {
      rangerMapPromise = fetch(DATA_URL)
        .then((res) => res.ok ? res.json() : [])
        .then((rows) => {
          const map = new Map();
          if (Array.isArray(rows)) {
            rows.forEach((ranger) => {
              if (ranger?.ranger_id) map.set(String(ranger.ranger_id), ranger);
            });
          }
          return map;
        })
        .catch(() => new Map());
    }
    return rangerMapPromise;
  }

  function getCurrentRangerId(root) {
    const image = root.querySelector(".ranger-detail-image");
    const src = image?.getAttribute("src") || "";
    const match = src.match(/\/res\/([^/]+)\//);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function renderStat(label, value) {
    return `<div class="ranger-stat extra-ranger-stat" data-extra-stat="${escapeHtml(label)}"><span>${escapeHtml(label)}</span><strong>${formatNumber(value)}</strong></div>`;
  }

  async function addExtraStats(root = document) {
    const grid = root.querySelector(".ranger-stat-grid");
    if (!grid || grid.dataset.extraStatsAdded === "1") return;

    const rangerId = getCurrentRangerId(root);
    if (!rangerId) return;

    const map = await loadRangerMap();
    const ranger = map.get(rangerId);
    if (!ranger) return;

    const html = EXTRA_STATS
      .filter((label) => ranger[label] !== undefined && ranger[label] !== null && ranger[label] !== "")
      .map((label) => renderStat(label, ranger[label]))
      .join("");

    if (!html) return;
    grid.insertAdjacentHTML("beforeend", html);
    grid.dataset.extraStatsAdded = "1";
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) addExtraStats(node);
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", () => addExtraStats());
})();
