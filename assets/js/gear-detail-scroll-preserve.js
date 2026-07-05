(() => {
  let restoreTimers = [];

  function clearRestoreTimers() {
    restoreTimers.forEach((timer) => window.clearTimeout(timer));
    restoreTimers = [];
  }

  function restorePosition(selector, originalTop, originalScrollY) {
    const replacement = document.querySelector(selector);
    if (replacement) {
      const delta = replacement.getBoundingClientRect().top - originalTop;
      if (Math.abs(delta) > 0.5) window.scrollBy({ top: delta, behavior: "auto" });
      return;
    }
    window.scrollTo({ top: originalScrollY, behavior: "auto" });
  }

  document.addEventListener("change", (event) => {
    const select = event.target.closest?.("body.gear-detail-page .gear-level-select");
    if (!select) return;

    clearRestoreTimers();
    const originalTop = select.getBoundingClientRect().top;
    const originalScrollY = window.scrollY;
    const gearId = CSS.escape(select.dataset.gearId || "");
    const section = CSS.escape(select.dataset.gearLevelSection || "");
    const className = select.classList.contains("gear-skillplus-level-select")
      ? ".gear-skillplus-level-select"
      : ".gear-level-select";
    const selector = section
      ? `body.gear-detail-page ${className}[data-gear-id="${gearId}"][data-gear-level-section="${section}"]`
      : `body.gear-detail-page ${className}[data-gear-id="${gearId}"]`;

    [0, 40, 120, 250, 450].forEach((delay) => {
      restoreTimers.push(window.setTimeout(() => {
        restorePosition(selector, originalTop, originalScrollY);
      }, delay));
    });
  }, true);
})();
