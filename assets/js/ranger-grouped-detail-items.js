(() => {
  const content = document.getElementById("rangerModalContent");
  if (!content) return;

  let applying = false;
  let timer = 0;

  function titleOf(section) {
    return section.querySelector(":scope > h3")?.textContent.trim() || "";
  }

  function groupSkillCards(section) {
    if (section.querySelector(":scope > .ranger-category-box")) return;
    const cards = [...section.querySelectorAll(":scope > .ranger-skill-card")];
    if (!cards.length) return;
    const box = document.createElement("div");
    box.className = "ranger-category-box ranger-skill-group";
    cards[0].before(box);
    cards.forEach((card) => box.appendChild(card));
  }

  function markExistingList(section, selector, className) {
    const list = section.querySelector(`:scope > ${selector}`);
    if (!list) return;
    list.classList.add("ranger-category-box", className);
  }

  function applyGrouping() {
    if (applying || !content.children.length) return;
    applying = true;
    try {
      content.querySelectorAll(":scope > .detail-section").forEach((section) => {
        const title = titleOf(section);
        if (title === "技能") groupSkillCards(section);
        else if (title === "能力") markExistingList(section, ".ranger-ability-list", "ranger-ability-group");
        else if (title === "覺醒能力") markExistingList(section, ".ranger-ability-list", "ranger-awake-ability-group");
        else if (title === "才能") markExistingList(section, ".ranger-talent-list", "ranger-talent-group");
      });
    } finally {
      applying = false;
    }
  }

  new MutationObserver(() => {
    if (applying) return;
    clearTimeout(timer);
    timer = window.setTimeout(applyGrouping, 0);
  }).observe(content, { childList: true, subtree: true });

  applyGrouping();
})();
