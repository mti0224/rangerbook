(() => {
  const COLUMNS = ["機率", "時機", "場合", "條件", "效果"];

  function escapeHtml(value) {
    return (value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function extractEffect(effectEl) {
    const row = {};
    effectEl.querySelectorAll("dl > div").forEach((item) => {
      const key = (item.querySelector("dt")?.textContent || "").trim();
      const value = (item.querySelector("dd")?.textContent || "").trim();
      if (key) row[key] = value;
    });
    return row;
  }

  function mergeAbilityEffects(root = document) {
    const lists = root.querySelectorAll(".ability-effect-list");

    lists.forEach((list) => {
      if (list.dataset.mergedAbilityEffects === "1") return;

      const effects = [...list.querySelectorAll(":scope > .ability-effect")];
      if (!effects.length) return;

      const rows = effects.map(extractEffect);
      list.dataset.mergedAbilityEffects = "1";
      list.innerHTML = `
        <div class="table-scroll ability-effect-table-wrap">
          <table class="ability-effect-table">
            <thead>
              <tr>${COLUMNS.map((col) => `<th>${escapeHtml(col)}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  ${COLUMNS.map((col) => `<td>${escapeHtml(row[col] || "-")}</td>`).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) mergeAbilityEffects(node);
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", () => mergeAbilityEffects());
})();