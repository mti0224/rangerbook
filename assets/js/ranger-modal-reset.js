(() => {
  function resetRangerModalScroll() {
    const modal = document.getElementById("rangerModal");
    const panel = modal?.querySelector(".modal-panel");
    const content = document.getElementById("rangerModalContent");

    if (modal) modal.scrollTop = 0;
    if (panel) panel.scrollTop = 0;
    if (content) content.scrollTop = 0;
  }

  document.addEventListener("click", (event) => {
    const card = event.target.closest?.(".ranger-card");
    if (!card) return;

    requestAnimationFrame(() => {
      resetRangerModalScroll();
      requestAnimationFrame(resetRangerModalScroll);
    });
  });

  const modal = document.getElementById("rangerModal");
  if (modal) {
    const observer = new MutationObserver(() => {
      if (!modal.hidden) resetRangerModalScroll();
    });
    observer.observe(modal, { attributes: true, attributeFilter: ["hidden"] });
  }
})();
