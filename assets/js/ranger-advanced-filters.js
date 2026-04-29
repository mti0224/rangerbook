(() => {
  const $ = (id) => document.getElementById(id);
  const advancedToggleBtn = $("rangerAdvancedToggleBtn");
  const advancedFilters = $("rangerAdvancedFilters");

  if (!advancedToggleBtn || !advancedFilters) return;

  advancedToggleBtn.addEventListener("click", () => {
    const isOpen = advancedFilters.hidden;
    advancedFilters.hidden = !isOpen;
    advancedToggleBtn.setAttribute("aria-expanded", String(isOpen));
    advancedToggleBtn.textContent = isOpen ? "收合進階篩選 ▲" : "進階篩選 ▼";
  });
})();
