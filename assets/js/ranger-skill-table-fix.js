(() => {
  function fixSkillTables(root = document) {
    const tables = root.querySelectorAll(".skill-effect-table");
    tables.forEach((table) => {
      if (table.dataset.skillTableFixed === "1") return;
      table.dataset.skillTableFixed = "1";

      const headerCells = table.querySelectorAll("thead th");
      if (headerCells[4]) headerCells[4].innerHTML = '<span class="break-header">作用於<br>活動關卡</span>';
      if (headerCells[5]) headerCells[5].innerHTML = '<span class="break-header">作用於<br>副本</span>';
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) fixSkillTables(node);
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", () => fixSkillTables());
})();