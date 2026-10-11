(() => {
  function cleanModalContent(root) {
    if (!root) return;

    root.querySelectorAll(".pvp-modal-section-heading > p").forEach((subtitle) => {
      subtitle.remove();
    });

    if (root.id === "guildUsageModalContent") {
      root.querySelectorAll(".pvp-modal-section").forEach((section) => {
        const heading = section.querySelector(".pvp-modal-section-heading h3");
        if (["常見搭配角色", "Frequently Paired Rangers"].includes(heading?.textContent.trim())) {
          section.remove();
        }
      });
    }
  }

  ["pvpUsageModalContent", "guildUsageModalContent"].forEach((id) => {
    const root = document.getElementById(id);
    if (!root) return;

    cleanModalContent(root);
    new MutationObserver(() => cleanModalContent(root)).observe(root, {
      childList: true,
      subtree: true,
    });
  });
})();
