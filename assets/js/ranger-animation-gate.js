(() => {
  const params = new URLSearchParams(window.location.search);
  const prettyDetailPath = /\/ranger\/ranger\/[^/?#]+\/?$/.test(window.location.pathname);
  const isDetailPage = params.has("detail") || prettyDetailPath;

  window.__RANGER_DETAIL_MODE__ = isDetailPage;
  if (isDetailPage) return;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.startsWith("https://res.warmycat.com/animation_meta/")) {
      return Promise.resolve(new Response('{"units":{}}', {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));
    }
    return nativeFetch(input, init);
  };
})();
