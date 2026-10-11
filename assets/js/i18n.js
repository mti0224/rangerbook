/* Rangerbook presentation localization. Never rewrite source data or category values. */
(() => {
  "use strict";
  if (window.RangerbookI18n) return;
  const supported = ["zh-Hant", "en"];
  const root = location.pathname.startsWith("/rangerbook/") ? "/rangerbook/" : "/";
  const storageKey = "rangerbook-language";
  let saved = null;
  try { saved = localStorage.getItem(storageKey); } catch (_) {}
  let locale = supported.includes(saved) ? saved : "zh-Hant";
  let dictionary = {};
  const gameData = {};
  const gamePromises = {};
  const reverseCache = {};
  function json(url) {
    return fetch(url).then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status + " at " + url);
      return r.json();
    });
  }
  function translate(rootNode) {
    if (!rootNode || !rootNode.querySelectorAll) return;
    const found = [];
    if (rootNode.nodeType === 1 && rootNode.matches("[data-i18n],[data-i18n-placeholder],[data-i18n-aria-label]")) found.push(rootNode);
    rootNode.querySelectorAll("[data-i18n],[data-i18n-placeholder],[data-i18n-aria-label]").forEach(node => found.push(node));
    for (const node of found) {
      const key = node.getAttribute("data-i18n");
      if (key && Object.prototype.hasOwnProperty.call(dictionary,key) && node.textContent !== dictionary[key]) {
        node.textContent = dictionary[key];
      }
      const ariaKey = node.getAttribute("data-i18n-aria-label");
      if (ariaKey && dictionary[ariaKey] !== undefined) node.setAttribute("aria-label",dictionary[ariaKey]);
      const inputKey = node.getAttribute("data-i18n-placeholder");
      if (inputKey && dictionary[inputKey] !== undefined) node.setAttribute("placeholder",dictionary[inputKey]);
    }
    document.documentElement.lang = locale;
  }
  async function loadUi(selected) {
    const load = l => json(root + "assets/locales/" + encodeURIComponent(l) + ".json").catch(() => ({}));
    const [base, language] = await Promise.all([load("zh-Hant"), load(selected)]);
    if (selected !== locale) return;
    dictionary = Object.assign({}, base, language);
    translate(document);
    window.dispatchEvent(new CustomEvent("rangerbook:locale-ready", {detail:{locale}}));
  }
  function readyGame() {
    if (locale === "zh-Hant") return Promise.resolve(null);
    const selected = locale;
    if (!gamePromises[selected]) {
      gamePromises[selected] = Promise.all([
        json(root + "res/i18n/" + encodeURIComponent(selected) + ".json"),
        json(root + "res/i18n/zh-Hant.json")
      ]).then(([localized, chinese]) => {
        gameData[selected] = localized;
        gameData["zh-Hant"] = chinese;
        return localized;
      }).catch(() => null);
    }
    return gamePromises[selected];
  }
  function lookup(kind,key,original) {
    if (locale === "zh-Hant") return original;
    const result = gameData[locale];
    return result?.official?.[kind]?.[key] || original;
  }
  // Exact, unambiguous official Chinese text matches only. Never touch source JSON.
  function matchOfficial(kind, original) {
    if (locale === "zh-Hant" || typeof original !== "string" || !original.trim()) return original;
    const local = gameData[locale]?.official?.[kind];
    const chinese = gameData["zh-Hant"]?.official?.[kind];
    if (!local || !chinese) return original;
    if (!reverseCache[kind]) {
      const found = new Map();
      const duplicates = new Set();
      for (const [key, chineseText] of Object.entries(chinese)) {
        if (!local[key] || !chineseText || !chineseText.trim()) continue;
        const normalized = chineseText.replaceAll("\\\\n", "\\n").trim();
        if (found.has(normalized) && found.get(normalized) !== local[key]) duplicates.add(normalized);
        else found.set(normalized, local[key]);
      }
      duplicates.forEach(key => found.delete(key));
      reverseCache[kind] = found;
    }
    return reverseCache[kind].get(original.replaceAll("\\\\n", "\\n").trim()) || original;
  }
  function setLocale(value) {
    if (!supported.includes(value) || value === locale) return;
    locale = value;
    try { localStorage.setItem(storageKey, locale); } catch (_) {}
    location.reload();
  }
  const api = {
    supported, setLocale, get locale() { return locale; },
    translate, t(key, fallback = "") { return dictionary[key] || fallback || key; },
    readyGame, lookup, matchOfficial,
    custom(key, original) {
      return gameData[locale]?.custom?.[key] || original;
    },
    unitName(id, original) { return lookup("UNIT", id + "_nm", original); },
    unitDescription(id, original) { return lookup("UNIT", id + "_desc", original); }
  };
  window.RangerbookI18n = api;
  api.ready = loadUi(locale);
  document.addEventListener("DOMContentLoaded", () => translate(document));
  const observer = new MutationObserver(mutations => {
    for (const entry of mutations) for (const node of entry.addedNodes) {
      if (node.nodeType === 1) translate(node);
    }
  });
  observer.observe(document.documentElement, {subtree:true,childList:true});
})();
