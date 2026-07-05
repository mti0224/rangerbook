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
    .gear-skillplus-ranger-summary,
    .gear-advanced-switchable-summary {
      display: list-item !important;
      list-style: revert !important;
    }
    .gear-skillplus-ranger-summary::-webkit-details-marker,
    .gear-advanced-switchable-summary::-webkit-details-marker {
      display: inline !important;
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

  function bindNativeSummary(details, summary, label) {
    if (!details || !summary) return;
    summary.textContent = label;
    if (details.dataset.nativeMarkerBound) return;
    details.dataset.nativeMarkerBound = "1";
    details.addEventListener("toggle", () => {
      summary.textContent = label;
    });
  }

  function normalizeSummaries() {
    const advancedSummary = root.querySelector(".gear-advanced-switchable-summary");
    bindNativeSummary(
      advancedSummary?.closest("details"),
      advancedSummary,
      "可切換效果"
    );

    const skillPlusSummary = root.querySelector(".gear-skillplus-ranger-summary");
    if (skillPlusSummary) {
      const count = skillPlusSummary.textContent.match(/（(\d+)）/)?.[1] || "0";
      bindNativeSummary(
        skillPlusSummary.closest("details"),
        skillPlusSummary,
        `具有此技能效果的角色（${count}）`
      );
    }
  }

  function apply() {
    if (applying) return;
    applying = true;
    try {
      addSkillPlusTitle();
      normalizeSummaries();
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
