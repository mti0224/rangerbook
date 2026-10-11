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
  let englishByChinese = new Map();
  const gameData = {};
  const gamePromises = {};
  const uiPatterns = [
    [/^第\s*(\d+)\s*\/\s*(\d+)\s*頁，顯示第\s*(\d+)[–-](\d+)\s*筆，共\s*(\d+)\s*筆$/, m => "Page " + m[1] + " / " + m[2] + ", showing " + m[3] + "–" + m[4] + " of " + m[5]],
    [/^第\s*(\d+)\s*關$/, m => "Stage " + m[1]],
    [/^第\s*(\d+)\s*層$/, m => "Floor " + m[1]],
    [/^技能\s*(\d+)$/, m => "Skill " + m[1]],
    [/^效果\s*(\d+)$/, m => "Effect " + m[1]],
    [/^隊伍\s*(\d+)$/, m => "Team " + m[1]],
    [/^(\d+)\s*名玩家$/, m => m[1] + " players"],
    [/^(\d+)\s*次出場$/, m => m[1] + " appearances"],
    [/^困難關卡第\s*(\d+)\s*關$/, m => "Hard Stage " + m[1]],
    [/^迷宮關卡\s*(\d+[-－]\d+)$/, m => "Labyrinth Stage " + m[1]]
  ];
  const uiAttrNames = ["placeholder", "title", "aria-label", "alt"];
  function uiText(original) {
    if (locale !== "en" || typeof original !== "string") return original;
    const cleaned = original.replace(/\s+/g, " ").trim();
    if (!cleaned) return original;
    const direct = englishByChinese.get(cleaned);
    if (direct) return direct;
    for (const [pattern, build] of uiPatterns) {
      const match = cleaned.match(pattern);
      if (match) return build(match);
    }
    return original;
  }
  function eligible(element) {
    return Boolean(element) && !element.closest("script,style,noscript,textarea,code,pre,[contenteditable],[data-i18n-ignore]");
  }
  function translateTextNode(node) {
    if (!eligible(node.parentElement) || node.parentElement.hasAttribute("data-i18n")) return;
    const original = node.nodeValue;
    const trimmed = original.trim();
    if (!trimmed) return;
    const translated = uiText(trimmed);
    if (translated === trimmed) return;
    const at = original.indexOf(trimmed);
    node.nodeValue = original.slice(0, at) + translated + original.slice(at + trimmed.length);
  }
  function autoTranslate(rootNode) {
    if (locale !== "en") return;
    const elements = [];
    if (rootNode.nodeType === 1) elements.push(rootNode);
    rootNode.querySelectorAll?.("*").forEach(el => elements.push(el));
    for (const el of elements) {
      if (!eligible(el)) continue;
      for (const name of uiAttrNames) {
        if ((name === "placeholder" && el.hasAttribute("data-i18n-placeholder")) ||
            (name === "aria-label" && el.hasAttribute("data-i18n-aria-label"))) continue;
        const value = el.getAttribute(name);
        if (!value) continue;
        const translated = uiText(value);
        if (translated !== value) el.setAttribute(name, translated);
      }
    }
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) translateTextNode(node);
  }
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
    autoTranslate(rootNode);
    document.documentElement.lang = locale;
  }
  async function loadUi(selected) {
    try {
      const all = await json(root + "assets/locales/ui.json");
      if (selected !== locale) return;
      const baseline = all["zh-Hant"] || {};
      dictionary = Object.assign({}, baseline, all[selected] || {});
      englishByChinese = new Map();
      if (selected === "en") {
        for (const [key, original] of Object.entries(baseline)) {
          const translated = all.en?.[key];
          if (typeof original !== "string" || !translated || translated === original) continue;
          const normalized = original.replace(/\s+/g, " ").trim();
          if (normalized && !englishByChinese.has(normalized)) englishByChinese.set(normalized, translated);
        }
      }
    } catch (error) {
      console.error("Rangerbook UI catalog unavailable", error);
    }
    if (selected !== locale) return;
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
    translate, uiText, t(key, fallback = "") { return dictionary[key] || fallback || key; },
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
  const pending = new Set();
  let scheduled = false;
  function flush() {
    scheduled = false;
    const batch = Array.from(pending);
    pending.clear();
    for (const node of batch) {
      if (!node.isConnected) continue;
      if (node.nodeType === 1) translate(node);
      else if (node.nodeType === 3 && locale === "en") translateTextNode(node);
    }
  }
  const observer = new MutationObserver(mutations => {
    for (const record of mutations) {
      if (record.type === "characterData") {
        pending.add(record.target);
      } else for (const node of record.addedNodes) {
        if (node.nodeType === 1 || node.nodeType === 3) pending.add(node);
      }
    }
    if (pending.size && !scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  });
  observer.observe(document.documentElement, {subtree:true,childList:true,characterData:true});
})();
