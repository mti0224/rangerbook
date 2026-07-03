(() => {
  document.addEventListener("change", (event) => {
    const select = event.target.closest?.("body.gear-detail-page .gear-level-select");
    if (!select) return;

    const scrollY = window.scrollY;
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, behavior: "auto" });
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: "auto" });
      });
    });
  }, true);
})();
