(() => {
  const root = document.getElementById("gearModalContent");
  if (!root) return;

  function apply() {
    const section = [...root.querySelectorAll(":scope > .detail-section")].find((item) => {
      const heading = item.querySelector(":scope > h3");
      return heading?.querySelector(":scope > span")?.textContent.trim() === "Skill+"
        || heading?.childNodes?.[0]?.textContent?.trim() === "Skill+";
    });
    if (!section) return;

    const hasRows = Boolean(section.querySelector(".gear-skillplus-table tbody tr"));
    const emptyState = section.querySelector(":scope > .empty-state");
    if (!hasRows && emptyState?.textContent.includes("沒有Skill+資料")) {
      section.querySelector(":scope > h3 .gear-level-control")?.remove();
    }
  }

  new MutationObserver(() => window.setTimeout(apply, 0))
    .observe(root, { childList: true, subtree: true });

  [0, 80, 200, 500].forEach((delay) => window.setTimeout(apply, delay));
})();
