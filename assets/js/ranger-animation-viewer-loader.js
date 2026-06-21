(() => {
  if (!window.__RANGER_DETAIL_MODE__) return;

  const currentScript = document.currentScript;
  const sourceUrl = currentScript?.src || window.location.href;
  const viewerUrl = new URL("ranger-animation-viewer.js", sourceUrl).href;
  const script = document.createElement("script");
  script.src = viewerUrl;
  script.async = false;
  document.head.appendChild(script);
})();
