(() => {
  if (window.__RANGER_DETAIL_TABLE_RENDERER_ENTRYPOINT__) return;
  window.__RANGER_DETAIL_TABLE_RENDERER_ENTRYPOINT__ = true;

  const current = document.currentScript;
  const fallbackName = "ranger-talent-render-fix.js";
  const src = current?.src
    ? new URL(fallbackName, current.src).href
    : `../assets/js/${fallbackName}`;

  if ([...document.scripts].some((script) => script.src === src && script !== current)) return;

  const script = document.createElement("script");
  script.src = src;
  script.defer = true;
  script.dataset.loadedBy = "ranger-detail-table-renderer";
  document.head.appendChild(script);
})();
