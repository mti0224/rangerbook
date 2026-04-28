(() => {
  const ICON_BASE = "../assets/tlt_icon/";

  function normalizeText(value) {
    return (value || "").replace(/\s+/g, "").trim();
  }

  function iconHtml(index) {
    return `<img class="talent-icon talent-inline-icon" src="${ICON_BASE}tlt${index}.png" alt="" onerror="this.remove();">`;
  }

  function fixTalentCards(root = document) {
    const cards = root.querySelectorAll(".ranger-talent-card");

    cards.forEach((card) => {
      const title = card.querySelector(".talent-title-with-icon span");
      const titleText = normalizeText(title?.textContent);
      if (!titleText.includes("強化才能")) return;

      const titleIcon = card.querySelector(":scope > .talent-title-with-icon > .talent-icon");
      if (titleIcon) titleIcon.remove();

      const rows = card.querySelectorAll(":scope > dl > div");
      rows.forEach((row, index) => {
        const dt = row.querySelector("dt");
        const dd = row.querySelector("dd");
        if (!dd || dd.dataset.tltFixed === "1") return;

        if (dt) dt.remove();
        dd.dataset.tltFixed = "1";
        dd.classList.add("talent-boost-value");
        dd.innerHTML = `${iconHtml(index + 2)}<span>${dd.innerHTML}</span>`;
      });
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) fixTalentCards(node);
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", () => fixTalentCards());
})();
