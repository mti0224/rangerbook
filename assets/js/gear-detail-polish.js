(() => {
  const root = document.getElementById("gearModalContent");
  if (!root) return;

  function apply() {
    root.querySelectorAll(".gear-effect-table tbody th").forEach((cell) => {
      cell.style.fontWeight = "400";
    });
    root.querySelectorAll(".gear-specplus-basic-table td:first-child, .gear-specplus-effect-table td:nth-child(2)").forEach((cell) => {
      cell.style.fontWeight = "400";
    });
    root.querySelectorAll(".gear-specplus-table-divider").forEach((divider) => {
      divider.hidden = true;
    });
    const conditionHeaders = root.querySelectorAll(".gear-specplus-condition-table thead th");
    if (conditionHeaders[0]) conditionHeaders[0].textContent = "\u6a5f\u7387";
    if (conditionHeaders[1]) conditionHeaders[1].textContent = "\u689d\u4ef6";
    const effectHeaders = root.querySelectorAll(".gear-specplus-effect-table thead th");
    if (effectHeaders[0]) effectHeaders[0].textContent = "\u6a5f\u7387";
    if (effectHeaders[1]) effectHeaders[1].textContent = "\u6548\u679c";
  }

  new MutationObserver(apply).observe(root, { childList: true, subtree: true });
  apply();
})();
