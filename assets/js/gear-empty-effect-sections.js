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

  function hasRenderedContent(section) {
    return Boolean(section.querySelector(
      ".gear-advanced-detail, .gear-specplus-detail, .gear-effect-table, .gear-specplus-basic-table, .gear-specplus-condition-table, .gear-specplus-effect-table"
    ));
  }

  function setEmptyState(section, message, className) {
    if (hasRenderedContent(section)) return;
    let empty = section.querySelector(`:scope > .${className}`);
    if (!empty) {
      empty = document.createElement("div");
      empty.className = `empty-state small ${className}`;
      section.appendChild(empty);
    }
    empty.textContent = message;
  }

  function apply() {
    if (applying || !root.querySelector(".gear-detail-head")) return;
    applying = true;
    try {
      const basic = findSection("基本效果");
      let advanced = findSection("高級效果");
      if (!advanced) advanced = createSection("高級效果", basic);
      setEmptyState(advanced, "沒有高級效果資料。", "gear-advanced-empty-state");

      const skillPlus = findSection("Skill+");
      let specPlus = findSection("Spec+");
      if (!specPlus) specPlus = createSection("Spec+", skillPlus || advanced);
      setEmptyState(specPlus, "沒有Spec+資料。", "gear-specplus-empty-state");
    } finally {
      applying = false;
    }
  }

  new MutationObserver((mutations) => {
    if (applying || !mutations.some((mutation) => mutation.target === root)) return;
    clearTimeout(timer);
    timer = window.setTimeout(apply, 60);
  }).observe(root, { childList: true });

  [0, 80, 200, 500].forEach((delay) => window.setTimeout(apply, delay));
})();
