(() => {
  const $ = (id) => document.getElementById(id);

  const searchInput = $("rangerSearchInput");
  const advancedToggleBtn = $("rangerAdvancedToggleBtn");
  const advancedFilters = $("rangerAdvancedFilters");
  const resetBtn = $("rangerResetBtn");

  const extraInputs = [
    $("skillEffectFilter"),
    $("abilityEffectFilter"),
    $("talentConditionFilter"),
    $("talentEffectFilter")
  ].filter(Boolean);

  if (!searchInput || !advancedToggleBtn || !advancedFilters) return;

  let visibleSearchValue = searchInput.value || "";
  let isDispatching = false;

  function normalize(value) {
    return String(value || "").trim();
  }

  function buildMergedSearchValue() {
    const parts = [visibleSearchValue, ...extraInputs.map((input) => input.value)].map(normalize).filter(Boolean);
    return parts.join(" ");
  }

  function dispatchMergedFilter() {
    if (isDispatching) return;

    isDispatching = true;
    const displayValue = visibleSearchValue;
    searchInput.value = buildMergedSearchValue();
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    searchInput.value = displayValue;
    isDispatching = false;
  }

  searchInput.addEventListener("input", () => {
    if (!isDispatching) visibleSearchValue = searchInput.value;
  }, true);

  advancedToggleBtn.addEventListener("click", () => {
    const isOpen = advancedFilters.hidden;
    advancedFilters.hidden = !isOpen;
    advancedToggleBtn.setAttribute("aria-expanded", String(isOpen));
    advancedToggleBtn.textContent = isOpen ? "收合進階篩選 ▲" : "進階篩選 ▼";
  });

  extraInputs.forEach((input) => {
    input.addEventListener("input", dispatchMergedFilter);
    input.addEventListener("change", dispatchMergedFilter);
  });

  resetBtn?.addEventListener("click", () => {
    visibleSearchValue = "";
    extraInputs.forEach((input) => {
      input.value = "";
    });
  }, true);
})();
