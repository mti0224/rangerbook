(() => {
  const root = document.getElementById("gearModalContent");
  if (!root) return;

  let timer = 0;
  let applying = false;

  function titleOf(section) {
    const heading = section?.querySelector(":scope > h3");
    return heading?.querySelector(":scope > span")?.textContent.trim()
      || heading?.childNodes?.[0]?.textContent?.trim()
      || "";
  }

  function findSection(title) {
    return [...root.querySelectorAll(":scope > .detail-section")]
      .find((section) => titleOf(section) === title) || null;
  }

  function hasTableRows(section, selectors) {
    return selectors.some((selector) => section.querySelector(`${selector} tbody tr`));
  }

  function hasAdvancedData(section) {
    if (hasTableRows(section, [".gear-effect-table"])) return true;
    const condition = section.querySelector(".gear-condition")?.textContent.trim() || "";
    return Boolean(condition && !condition.endsWith("：") && !condition.endsWith(":"));
  }

  function hasSpecData(section) {
    return hasTableRows(section, [
      ".gear-specplus-basic-table",
      ".gear-specplus-condition-table",
      ".gear-specplus-effect-table"
    ]);
  }

  function replaceWithEmpty(section, message, className) {
    const heading = section.querySelector(":scope > h3");
    [...section.children].forEach((child) => {
      if (child !== heading) child.remove();
    });

    const empty = document.createElement("div");
    empty.className = `empty-state small ${className}`;
    empty.textContent = message;
    section.appendChild(empty);
  }

  function apply() {
    if (applying) return;
    applying = true;
    try {
      const advanced = findSection("高級效果");
      if (advanced && !hasAdvancedData(advanced)) {
        replaceWithEmpty(advanced, "沒有高級效果資料。", "gear-advanced-empty-state");
      }

      const spec = findSection("Spec+");
      if (spec && !hasSpecData(spec)) {
        replaceWithEmpty(spec, "沒有Spec+資料。", "gear-specplus-empty-state");
      }
    } finally {
      applying = false;
    }
  }

  new MutationObserver(() => {
    if (applying) return;
    clearTimeout(timer);
    timer = window.setTimeout(apply, 80);
  }).observe(root, { childList: true, subtree: true });

  [100, 250, 600].forEach((delay) => window.setTimeout(apply, delay));
})();
