/* Test-site only: install/update controls, with no offline cache or fetch interception. */
(() => {
  'use strict';
  if (window.top !== window || window.RangerbookPwa) return;
  const root = new URL('../../', document.currentScript.src);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const iosBrowser = ios && /Safari\\//.test(navigator.userAgent) && !/FBAN|FBAV|Instagram|Line\\//i.test(navigator.userAgent);
  let prompt, registration;
  const text = key => {
    const full = 'pwa.' + key;
    const value = window.RangerbookI18n?.t(full, '');
    return value && value !== full ? value : '';
  };
  function refresh() {
    const panel = document.getElementById('pwaSettings');
    if (!panel) return;
    const button = panel.querySelector('[data-pwa-install]');
    if (button) button.hidden = standalone() || !prompt;
    const iosHelp = panel.querySelector('[data-pwa-ios]');
    if (iosHelp) iosHelp.hidden = standalone() || !iosBrowser;
    const availability = panel.querySelector('[data-pwa-availability]');
    if (availability) {
      const key = standalone() ? 'installed' : (prompt || iosBrowser ? 'installHelp' : 'browserHelp');
      availability.dataset.i18n = 'pwa.' + key;
      availability.textContent = text(key) || availability.textContent;
    }
  }
  async function install() {
    if (!prompt) return;
    const pending = prompt;
    prompt = null;
    refresh();
    try { await pending.prompt(); await pending.userChoice; } catch (_) {}
    refresh();
  }
  async function checkUpdate() {
    if (registration && navigator.onLine) {
      try { await registration.update(); } catch (_) {}
    }
  }
  window.RangerbookPwa = { checkUpdate, get standalone() { return standalone(); } };
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    prompt = event;
    refresh();
  });
  window.addEventListener('appinstalled', () => { prompt = null; refresh(); });
  window.addEventListener('rangerbook:locale-ready', refresh);
  window.addEventListener('pageshow', checkUpdate);
  async function start() {
    const panel = document.getElementById('pwaSettings');
    panel?.querySelector('[data-pwa-install]')?.addEventListener('click', install);
    const home = document.querySelector('[data-pwa-home]');
    if (home) home.href = root.href;
    document.querySelector('[data-pwa-retry]')?.addEventListener('click', () => location.reload());
    refresh();
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    try {
      registration = await navigator.serviceWorker.register(new URL('sw.js', root), {
        scope: root.pathname,
        updateViaCache: 'none'
      });
      await checkUpdate();
    } catch (_) { /* Basic Auth may require a new sign-in; normal pages still work. */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
