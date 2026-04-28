(() => {
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function readEffectCard(card) {
    const data = {};
    card.querySelectorAll("dl > div").forEach((row) => {
      const key = row.querySelector("dt")?.textContent.trim() || "";
      const value = row.querySelector("dd")?.textContent.trim() || "-";
      if (key) data[key] = value;
    });
    return data;
  }

  function renderEffectTable(rows) {
    return `
      <div class="ability-effect-list">
        <div class="table-scroll ability-effect-table-wrap">
          <table class="ability-effect-table">
            <thead>
              <tr>
                <th>機率</th>
                <th>時機</th>
                <th>場合</th>
                <th>條件</th>
                <th>效果</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  <td>${escapeHtml(row["機率"] || "-")}</td>
                  <td>${escapeHtml(row["時機"] || "-")}</td>
                  <td>${escapeHtml(row["場合"] || "-")}</td>
                  <td>${escapeHtml(row["條件"] || "-")}</td>
                  <td>${escapeHtml(row["效果"] || "-")}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function applyAbilityDetailTable() {
    const modal = document.getElementById("abilityModal");
    const content = document.getElementById("modalContent");
    if (!modal || modal.hidden || !content) return;

    const sections = [...content.querySelectorAll(".detail-section")];
    const effectSection = sections.find((section) => section.querySelector("h3")?.textContent.trim() === "效果資料");
    if (!effectSection || effectSection.dataset.tableFixed === "1") return;

    const cards = [...effectSection.querySelectorAll(".effect-card")];
    if (!cards.length) return;

    const rows = cards.map(readEffectCard);
    effectSection.querySelectorAll(".effect-card").forEach((card) => card.remove());
    effectSection.insertAdjacentHTML("beforeend", renderEffectTable(rows));
    effectSection.dataset.tableFixed = "1";
  }

  let timer = 0;
  const target = document.getElementById("modalContent");
  if (target) {
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(applyAbilityDetailTable, 20);
    }).observe(target, { childList: true, subtree: true });
  }
})();
