(() => {
  const path = window.location.pathname;
  const rootPath = path.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const detailMatch = path.match(/^(?:\/rangerbook)?\/ranger\/ranger\/([^/]+)\/?$/);

  if (detailMatch) {
    const rangerId = decodeURIComponent(detailMatch[1]);
    window.location.replace(`${rootPath}ranger/ranger/?detail=${encodeURIComponent(rangerId)}`);
    return;
  }

  const isRangerPage = /^(?:\/rangerbook)?\/ranger\/ranger\/?$/.test(path);
  if (isRangerPage) {
    if (!document.querySelector('link[data-ranger-page-mode]')) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = `${rootPath}assets/css/ranger-page-mode.css`;
      stylesheet.dataset.rangerPageMode = "";
      document.head.appendChild(stylesheet);
    }

    if (!document.querySelector('script[data-ranger-page-mode]')) {
      const script = document.createElement("script");
      script.src = `${rootPath}assets/js/ranger-page-mode.js`;
      script.dataset.rangerPageMode = "";
      document.body.appendChild(script);
    }
  }

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
