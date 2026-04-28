(() => {
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseSkillMeta(text) {
    const get = (label) => {
      const match = text.match(new RegExp(`${label}：([^・]+)`));
      return match ? match[1].trim() : "-";
    };

    return {
      rate: get("發動率"),
      cooldown: get("技能冷卻時間"),
      trigger: get("觸發基準")
    };
  }

  function renderMetaTable(meta) {
    return `
      <div class="table-scroll skill-meta-table-wrap enemy-skill-meta-table-wrap">
        <table class="skill-meta-table enemy-skill-meta-table">
          <thead>
            <tr>
              <th>發動率</th>
              <th>技能冷卻時間</th>
              <th>觸發基準</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${escapeHtml(meta.rate)}</td>
              <td>${escapeHtml(meta.cooldown)}</td>
              <td>${escapeHtml(meta.trigger)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function applyEnemySkillMetaTables() {
    const modal = document.getElementById("enemyModal");
    const content = document.getElementById("enemyModalContent");
    if (!modal || modal.hidden || !content) return;

    content.querySelectorAll(".ranger-skill-card").forEach((card) => {
      if (card.querySelector(".skill-meta-table-wrap")) return;

      const info = [...card.querySelectorAll(".ranger-icon-title p")]
        .find((p) => p.textContent.includes("發動率") || p.textContent.includes("技能冷卻時間") || p.textContent.includes("觸發基準"));
      if (!info) return;

      const meta = parseSkillMeta(info.textContent);
      info.remove();

      const titleArea = card.querySelector(".ranger-icon-title");
      if (titleArea) titleArea.insertAdjacentHTML("afterend", renderMetaTable(meta));
    });
  }

  let timer = 0;
  const target = document.getElementById("enemyModalContent");
  if (target) {
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(applyEnemySkillMetaTables, 20);
    }).observe(target, { childList: true, subtree: true });
  }
})();
