(() => {
  const root = document.getElementById("gearModalContent");
  if (!root) return;

  let applying = false;
  let timer = 0;

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

  function createSection(title, afterSection) {
    const section = document.createElement("section");
    section.className = "detail-section";
    section.innerHTML = `<h3>${title}</h3>`;
    if (afterSection) afterSection.insertAdjacentElement("afterend", section);
    else root.appendChild(section);
    return section;
  }

  function hasAdvancedData(section) {
    return Boolean(section.querySelector(
      ".gear-advanced-default-section .gear-effect-table tbody tr, .gear-advanced-switchable-section .gear-effect-table tbody tr"
    ));
  }

  function hasSpecPlusData(section) {
    return Boolean(section.querySelector(
      ".gear-specplus-basic-table tbody tr, .gear-specplus-condition-table tbody tr, .gear-specplus-effect-table tbody tr"
    ));
  }

  function showEmptyState(section, title, message, className) {
    if (section.querySelector(`:scope > .${className}`)) return;
    section.innerHTML = `<h3>${title}</h3><div class="empty-state small ${className}">${message}</div>`;
  }

  function apply() {
    if (applying || !root.querySelector(".gear-detail-head")) return;
    applying = true;
    try {
      const basic = findSection("基本效果");
      let advanced = findSection("高級效果");
      if (!advanced) advanced = createSection("高級效果", basic);
      if (!hasAdvancedData(advanced)) {
        showEmptyState(advanced, "高級效果", "沒有高級效果資料。", "gear-advanced-empty-state");
      }

      const skillPlus = findSection("Skill+");
      let specPlus = findSection("Spec+");
      if (!specPlus) specPlus = createSection("Spec+", skillPlus || advanced);
      if (!hasSpecPlusData(specPlus)) {
        showEmptyState(specPlus, "Spec+", "沒有Spec+資料。", "gear-specplus-empty-state");
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

  [0, 100, 250, 500, 900, 1400].forEach((delay) => window.setTimeout(apply, delay));
})();
