(() => {
  const classMap = new Map([
    ["力量型", "tag-type-power"],
    ["敏捷型", "tag-type-agility"],
    ["智慧型", "tag-type-intelligence"],
    ["火", "tag-element-fire"],
    ["水", "tag-element-water"],
    ["木", "tag-element-wood"],
    ["光", "tag-element-light"],
    ["暗", "tag-element-dark"]
  ]);

  function applyTagColors(root = document) {
    root.querySelectorAll?.(".ranger-card .ranger-tags span").forEach((tag) => {
      const cls = classMap.get(tag.textContent.trim());
      if (cls) tag.classList.add(cls);
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) applyTagColors(node);
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", () => applyTagColors());
})();
