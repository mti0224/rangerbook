(() => {
  const content = document.getElementById("gearModalContent");
  if (!content) return;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function currentGearId() {
    const src = content.querySelector(".gear-detail-image")?.getAttribute("src") || "";
    const match = src.match(/gear_icon\/([^/]+)_icon\.png/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function textOf(element) {
    return element?.textContent?.trim() || "";
  }

  function findSection(title) {
    return [...content.querySelectorAll(".detail-section")]
      .find((item) => textOf(item.querySelector("h3")) === title);
  }

  function tableRows(table) {
    return [...(table?.querySelectorAll("tbody tr") || [])].map((row) =>
      [...row.children].map((cell) => textOf(cell))
    );
  }

  function renderBasicTable(rows) {
    if (!rows.length) return `<div class="empty-state small">沒有Spec+基本效果資料。</div>`;
    return `
      <div class="table-scroll talent-main-effect-wrap">
        <table class="talent-main-effect-table gear-specplus-basic-table">
          <colgroup><col class="gear-specplus-basic-name-col"><col class="gear-specplus-basic-value-col"></colgroup>
          <thead><tr><th>效果</th><th>數值</th></tr></thead>
          <tbody>
            ${rows.map(([effect = "-", value = "-"]) => `
              <tr><td>${escapeHtml(effect)}</td><td>${escapeHtml(value)}</td></tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderConditionTable(probability, conditions) {
    const rows = conditions.length ? conditions : ["無特定條件"];
    return `
      <div class="table-scroll talent-main-table-wrap">
        <table class="talent-main-table gear-specplus-condition-table">
          <colgroup><col class="talent-main-prob-col"><col class="talent-main-condition-col"></colgroup>
          <thead><tr><th>觸發機率</th><th>觸發條件</th></tr></thead>
          <tbody>
            ${rows.map((condition, index) => `
              <tr>
                ${index === 0 ? `<td rowspan="${rows.length}" class="talent-prob-cell">${escapeHtml(probability || "-")}</td>` : ""}
                <td>${escapeHtml(condition)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderTriggerTable(rows) {
    if (!rows.length) return `<div class="empty-state small">沒有Spec+觸發效果資料。</div>`;
    return `
      <div class="table-scroll talent-main-effect-wrap">
        <table class="talent-main-effect-table gear-specplus-effect-table">
          <colgroup>
            <col class="gear-specplus-trigger-prob-col">
            <col class="gear-specplus-trigger-effect-col">
            <col class="gear-specplus-trigger-factor-col">
            <col class="gear-specplus-trigger-time-col">
          </colgroup>
          <thead>
            <tr><th>觸發機率</th><th>觸發效果</th><th>係數</th><th>時間</th></tr>
          </thead>
          <tbody>
            ${rows.map(([probability = "-", effect = "-", factor = "-", time = "-"]) => `
              <tr>
                <td class="talent-prob-cell">${escapeHtml(probability)}</td>
                <td>${escapeHtml(effect)}</td>
                <td>${escapeHtml(factor)}</td>
                <td>${escapeHtml(time)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function transformAdvanced() {
    const id = currentGearId();
    if (!id) return;

    const section = findSection("高級效果");
    if (!section || section.dataset.advancedCardFor === id) return;

    const heading = [...section.children].find((node) => node.tagName === "H3");
    const bodyNodes = [...section.children].filter((node) => node !== heading);
    if (!bodyNodes.length) return;

    const list = document.createElement("div");
    list.className = "ranger-talent-list gear-advanced-detail";
    const card = document.createElement("article");
    card.className = "ranger-talent-card gear-advanced-card";

    bodyNodes.forEach((node) => {
      card.appendChild(node);
      if (node.classList?.contains("gear-condition")) {
        const divider = document.createElement("div");
        divider.className = "gear-advanced-divider";
        divider.setAttribute("aria-hidden", "true");
        card.appendChild(divider);
      }
    });

    list.appendChild(card);
    section.appendChild(list);
    section.dataset.advancedCardFor = id;
  }

  function transformSpecPlus() {
    const id = currentGearId();
    if (!id) return;

    const section = findSection("Spec+");
    if (!section || section.dataset.specPlusTalentStyleFor === id) return;

    const detail = section.querySelector(".gear-specplus-detail");
    if (!detail) return;

    const name = textOf(detail.querySelector(".gear-specplus-name strong")) || "Spec+";
    const description = textOf(detail.querySelector(".gear-specplus-description"));
    const blocks = [...detail.querySelectorAll(".gear-specplus-block")];
    const basicRows = tableRows(blocks[0]?.querySelector(".gear-effect-table"));

    const metaRows = [...(blocks[1]?.querySelectorAll(".gear-specplus-meta > div") || [])].map((item) => ({
      label: textOf(item.querySelector("dt")),
      value: textOf(item.querySelector("dd"))
    }));
    const probability = metaRows.find((row) => row.label.includes("機率"))?.value || "-";
    const conditions = metaRows
      .filter((row) => !row.label.includes("機率"))
      .map((row) => row.value)
      .filter(Boolean);
    const triggerRows = tableRows(blocks[1]?.querySelector(".gear-specplus-trigger-table"));

    section.innerHTML = `
      <h3>Spec+</h3>
      <div class="ranger-talent-list gear-specplus-detail">
        <article class="ranger-talent-card gear-specplus-card">
          <h4 class="talent-title-with-icon"><span>${escapeHtml(name)}</span></h4>

          <div class="talent-section gear-specplus-section">
            <h5>基本效果</h5>
            ${renderBasicTable(basicRows)}
          </div>

          <div class="talent-section gear-specplus-section gear-specplus-special-section">
            <h5>特殊效果</h5>
            ${description ? `<p class="ranger-talent-description gear-specplus-special-description">${escapeHtml(description)}</p>` : ""}
            ${renderConditionTable(probability, conditions)}
            ${renderTriggerTable(triggerRows)}
          </div>
        </article>
      </div>
    `;
    section.dataset.specPlusTalentStyleFor = id;
  }

  let timer = 0;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      transformAdvanced();
      transformSpecPlus();
    }, 40);
  }).observe(content, { childList: true, subtree: true });
})();
