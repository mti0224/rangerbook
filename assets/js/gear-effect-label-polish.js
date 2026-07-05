(() => {
  const root = document.getElementById("gearModalContent");
  if (!root) return;

  let applying = false;
  let timer = 0;

  const style = document.createElement("style");
  style.textContent = `
    .gear-skillplus-effect-title,
    .gear-skillplus-ranger-summary,
    .gear-advanced-switchable-summary,
    .gear-condition-label {
      color: var(--primary-dark) !important;
    }
    .gear-skillplus-effect-title {
      margin: 0 0 .65rem;
      font-size: 1rem;
      font-weight: 800;
    }
    .gear-skillplus-ranger-summary {
      justify-content: flex-start !important;
      gap: .35rem !important;
    }
    .gear-skillplus-ranger-summary::after {
      content: none !important;
    }
  `;
  document.head.appendChild(style);

  function addSkillPlusTitle() {
    const card = root.querySelector(".gear-skillplus-card");
    const table = card?.querySelector(":scope > .gear-effect-table-wrap");
    if (!card || !table || card.querySelector(":scope > .gear-skillplus-effect-title")) return;
    const title = document.createElement("h4");
    title.className = "gear-skillplus-effect-title";
    title.textContent = "技能效果";
    table.before(title);
  }

  function normalizeSkillPlusSummary() {
    const details = root.querySelector(".gear-skillplus-ranger-details");
    const summary = details?.querySelector(":scope > .gear-skillplus-ranger-summary");
    if (!details || !summary) return;
    const countMatch = summary.textContent.match(/（(\d+)）/);
    const count = countMatch?.[1] || "0";
    const expected = `${details.open ? "▼" : "►"} 具有此技能效果的角色（${count}）`;
    if (summary.textContent !== expected) summary.textContent = expected;
    if (!details.dataset.arrowBound) {
      details.dataset.arrowBound = "1";
      details.addEventListener("toggle", () => {
        const match = summary.textContent.match(/（(\d+)）/);
        summary.textContent = `${details.open ? "▼" : "►"} 具有此技能效果的角色（${match?.[1] || "0"}）`;
      });
    }
  }

  function apply() {
    if (applying) return;
    applying = true;
    try {
      addSkillPlusTitle();
      normalizeSkillPlusSummary();
    } finally {
      applying = false;
    }
  }

  new MutationObserver(() => {
    if (applying) return;
    clearTimeout(timer);
    timer = window.setTimeout(apply, 30);
  }).observe(root, { childList: true, subtree: true });

  [0, 100, 300, 700].forEach((delay) => window.setTimeout(apply, delay));
})();
