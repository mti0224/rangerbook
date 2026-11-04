/* Isolated acceptance PWA metadata; never loads production's data-cache adapter. */
(() => {
  'use strict';
  const root = new URL('../../', document.currentScript.src);
  const link = (rel, name, type) => {
    const element = document.createElement('link');
    element.rel = rel;
    element.href = new URL(name, root).href;
    if (type) element.type = type;
    document.head.append(element);
  };
  link('manifest', 'manifest.webmanifest', 'application/manifest+json');
  link('apple-touch-icon', 'assets/pwa/stage-apple-touch-icon.png', 'image/png');
  link('stylesheet', 'assets/css/pwa.css');
  for (const [name, content] of [
    ['theme-color', '#a44b09'],
    ['mobile-web-app-capable', 'yes'],
    ['apple-mobile-web-app-capable', 'yes'],
    ['apple-mobile-web-app-title', 'Rangerbook TEST'],
    ['apple-mobile-web-app-status-bar-style', 'default']
  ]) {
    const meta = document.createElement('meta');
    meta.name = name;
    meta.content = content;
    document.head.append(meta);
  }
  const script = document.createElement('script');
  script.src = new URL('assets/js/pwa.js', root).href;
  script.defer = true;
  document.head.append(script);
})();
