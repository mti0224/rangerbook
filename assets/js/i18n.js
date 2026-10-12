/* Rangerbook presentation localization. Never rewrite source data or category values. */
(() => {
  "use strict";
  if (window.RangerbookI18n) return;
  const supported = ["zh-Hant", "en", "th", "jp"];
  const root = location.pathname.startsWith("/rangerbook/") ? "/rangerbook/" : "/";
  const storageKey = "rangerbook-language";
  let saved = null;
  try { saved = localStorage.getItem(storageKey); } catch (_) {}
  const aliases={zh_TW:"zh-Hant",ja:"jp"};
  saved=aliases[saved] || saved;
  if (!supported.includes(saved)) {
    saved=document.cookie.split("; ").find(x=>x.startsWith(storageKey+"="))?.split("=")[1];
  }
  let locale = supported.includes(saved) ? saved : "zh-Hant";
  document.documentElement.lang=locale === "jp" ? "ja" : locale;
  let dictionary = {};
  let englishByChinese = new Map();
  let gameTermsByChinese = new Map();
  let gameTermsByKey = new Map();
  let officialByChinese = new Map();
  let parameterTerms = [];
  const normalize = value => String(value || "").replace(/\s+/g, " ").trim();
  function compileTermTemplate(source, english, key) {
    if (!/%(?:[Nd]\d*|s|n)/.test(source)) return null;
    const tokens = /%(?:[Nd]\d*|s|n)/g, slots=[];
    let regex = "^", last = 0, sequential = 0;
    const escape = value => value.replace(/[.*+?^$()|{}[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
    for (const match of source.matchAll(tokens)) {
      const capture="([+-]?[0-9]+(?:[.,][0-9]+)*(?:\\s*[~～–-]\\s*[+-]?[0-9]+(?:[.,][0-9]+)*)?)";
      regex += escape(source.slice(last, match.index)) + "\\s*" + capture + "\\s*";
      slots.push(/^%[Nd]\d+$/.test(match[0]) ? Number(match[0].slice(2))-1 : sequential++);
      last = match.index + match[0].length;
    }
    regex += escape(source.slice(last)) + "$";
    return {pattern:new RegExp(regex),english,slots,prefix:source.split("%")[0].trim().slice(0,8),length:source.length};
  }
  function installGameTerms(rows) {
    const map = new Map(), keys = new Map(), ambiguous = new Set(), templates = [];
    for (const item of rows || []) {
      if (!item || typeof item.zh_TW !== "string" || typeof item[locale] !== "string" || !item[locale].trim()) continue;
      const source = normalize(item.zh_TW);
      if (typeof item.key === "string") keys.set(item.key, item[locale]);
      if (map.has(source) && map.get(source) !== item[locale]) ambiguous.add(source);
      else map.set(source, item[locale]);
      // Generic semantic templates require explicit Key/args bindings. Their
      // adjacent text slots must never infer matches from arbitrary DOM text.
      const literal=source.replace(/%(?:[Nd]\d*|s|n)/g, "").replace(/[\s%():：（）]/g, "");
      const contextual=literal.length>=2 && !/%(?:[Nd]\d*|s|n)%(?:[Nd]\d*|s|n)/.test(source);
      const template = String(item.key).startsWith("UI:") || contextual
        ? compileTermTemplate(source, item[locale], item.key) : null;
      if (template) templates.push(template);
    }
    ambiguous.forEach(source => map.delete(source));
    gameTermsByChinese = map;
    gameTermsByKey = keys;
    parameterTerms = templates.sort((a,b)=>b.length-a.length);
  }
  async function loadGameTerms() {
    if (locale === "zh-Hant") return;
    try {
      installGameTerms(await json(root + "assets/locales/game-custom.json"));
      translate(document);
      window.dispatchEvent(new CustomEvent("rangerbook:game-terms-ready", {detail:{locale}}));
    } catch (error) { console.warn("Custom localization unavailable", error); }
  }
  function indexOfficialTranslations(localized, chinese) {
    const map = new Map(), ambiguous = new Set();
    for (const kind of ["UNIT","SKILL","ABILITY","EQUIP"]) {
      const translations = localized?.official?.[kind] || {};
      for (const [key, raw] of Object.entries(chinese?.official?.[kind] || {})) {
        if (typeof raw !== "string" || typeof translations[key] !== "string") continue;
        const original = normalize(raw.replaceAll("\\n", " "));
        if (!original) continue;
        if (map.has(original) && map.get(original) !== translations[key]) ambiguous.add(original);
        else map.set(original, translations[key]);
      }
    }
    ambiguous.forEach(source => map.delete(source));
    officialByChinese = map;
  }

  const gameData = {};
  const gamePromises = {};
  const speedWords = {"非常快":"Very Fast","快":"Fast","普通":"Normal","慢":"Slow","非常慢":"Very Slow"};
  const uiPatterns = [
    [/^(\d+)\s*星$/, m => m[1] + " Stars"],
    [/^(非常快|非常慢|快|慢|普通)\s*[(（]\s*(\d+(?:\.\d+)?)\s*點\/秒\s*[)）]$/, m => speedWords[m[1]] + " (" + m[2] + " pt/sec)"],
    [/^(非常快|非常慢|快|慢|普通)\s*[(（]\s*(\d+(?:\.\d+)?)\s*秒\/下\s*[)）]$/, m => speedWords[m[1]] + " (" + m[2] + " sec/attack)"],
    [/^後方敵人\s*[(（]\s*倍率\s*[:：]\s*(\d+(?:\.\d+)?)\s*倍\s*[)）]$/, m => "Rear Enemy (Multiplier: " + m[1] + "×)"],
    [/^超進化\s*(\d+)\s*星$/, m => "Hyper " + m[1] + " Stars"],
    [/^(?:終極進化|究極進化)\s*(\d+)\s*星$/, m => "Ultra " + m[1] + " Stars"],
    [/^(\d+(?:\.\d+)?)\s*點\s*\/\s*秒$/, m => m[1] + " pt/sec"],
    [/^(\d+(?:\.\d+)?)\s*秒\s*\/\s*下$/, m => m[1] + " sec/attack"],
    [/^(\d+(?:\.\d+)?)\s*秒$/, m => m[1] + " sec"],
    [/^排名第\s*([\d,]+)\s*名\s*[·・]\s*([\d,]+)\s*\/\s*([\d,]+)\s*名成員$/, m => "Rank #" + m[1] + " · " + m[2] + " / " + m[3] + " members"],
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
    if (locale === "zh-Hant" || typeof original !== "string") return original;
    const exact = window.RangerbookV2?.translateText(original);
    if (exact && exact !== original) return exact;
    const cleaned = original.replace(/\s+/g, " ").trim();
    if (!cleaned) return original;
    // User-specified evolution naming takes precedence over old generic UI copies.
    const hyper = cleaned.match(/^超進化\s*(\d+)\s*星$/);
    if (hyper && locale === "en") return "Hyper " + hyper[1] + " Stars";
    const ultra = cleaned.match(/^(?:終極進化|究極進化)\s*(\d+)\s*星$/);
    if (ultra && locale === "en") return "Ultra " + ultra[1] + " Stars";
    const direct = englishByChinese.get(cleaned);
    if (direct) return direct;
    const gameTerm = gameTermsByChinese.get(cleaned) || officialByChinese.get(cleaned);
    if (gameTerm) return gameTerm;
    if (/[一-鿿]/.test(cleaned)) {
      for (const item of parameterTerms) {
        if (item.prefix && !cleaned.startsWith(item.prefix)) continue;
        const match = cleaned.match(item.pattern);
        if (!match) continue;
        const args=[];
        item.slots.forEach((slot,i)=>{args[slot]=match[i+1];});
        let sequential=0;
        return item.english.replace(/%(?:[Nd]\d*|s|n)/g, token => {
          const index=/^%[Nd]\d+$/.test(token) ? Number(token.slice(2))-1 : sequential++;
          return args[index] ?? token;
        });
      }
    }
    for (const [pattern, build] of (locale === "en" ? uiPatterns : [])) {
      const match = cleaned.match(pattern);
      if (match) return build(match);
    }
    return original;
  }
  function eligible(element) {
    return Boolean(element) && !element.closest("script,style,noscript,textarea,code,pre,[contenteditable],[data-i18n-ignore]");
  }
  const translatedNodes = new WeakMap();
  function translateTextNode(node) {
    if (!eligible(node.parentElement) || node.parentElement.closest("[data-i18n]")) return;
    const original = node.nodeValue;
    if (translatedNodes.get(node) === original) return;
    const trimmed = original.trim();
    if (!trimmed) return;
    const translated = uiText(trimmed);
    if (translated === trimmed) return;
    const at = original.indexOf(trimmed);
    node.nodeValue = original.slice(0, at) + translated + original.slice(at + trimmed.length);
    translatedNodes.set(node, node.nodeValue);
  }
  function autoTranslate(rootNode) {
    if (locale === "zh-Hant") return;
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
        if (!node.children.length) node.textContent = dictionary[key];
        else {
          const label=[...node.childNodes].find(x=>x.nodeType===3 && x.nodeValue.trim());
          if (label && label.nodeValue.trim()!==dictionary[key]) label.nodeValue=dictionary[key];
        }
      }
      const ariaKey = node.getAttribute("data-i18n-aria-label");
      if (ariaKey && dictionary[ariaKey] !== undefined) node.setAttribute("aria-label",dictionary[ariaKey]);
      const inputKey = node.getAttribute("data-i18n-placeholder");
      if (inputKey && dictionary[inputKey] !== undefined) node.setAttribute("placeholder",dictionary[inputKey]);
    }
    autoTranslate(rootNode);
    document.documentElement.lang = locale === "jp" ? "ja" : locale;
  }
  async function loadUi(selected) {
    try {
      const all = await json(root + "assets/locales/ui.json");
      if (selected !== locale) return;
      const baseline = all["zh-Hant"] || {};
      dictionary = Object.assign({}, baseline, all[selected] || {});
      englishByChinese = new Map();
      if (selected !== "zh-Hant") {
        for (const [key, original] of Object.entries(baseline)) {
          const translated = all[selected]?.[key];
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
        indexOfficialTranslations(localized, chinese);
        if (locale === selected) translate(document);
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
    document.cookie=storageKey+"="+locale+"; Path=/; Max-Age=31536000; SameSite=Lax";
    location.reload();
  }
  const api = {
    supported, setLocale, get locale() { return locale; },
    translate, uiText, t(key, fallback = "") { return dictionary[key] || fallback || key; },
    readyGame, lookup, matchOfficial,
    custom(key, original) {
      return gameTermsByKey.get(key) || gameData[locale]?.custom?.[key] || original;
    },
    unitName(id, original) { return lookup("UNIT", id + "_nm", original); },
    unitDescription(id, original) { return lookup("UNIT", id + "_desc", original); }
  };
  window.RangerbookI18n = api;
  api.ready = Promise.all([loadUi(locale),loadGameTerms()]).finally(() => {
    delete document.documentElement.dataset.rbLocalizing;
  }).then(() => null);
  function refreshSavedLocale() {
    let current;try {current=localStorage.getItem(storageKey);} catch (_) {}
    current=aliases[current] || current;
    if (supported.includes(current) && current!==locale) location.reload();
  }
  window.addEventListener("pageshow",refreshSavedLocale);
  window.addEventListener("storage",event=>{if(event.key===storageKey)refreshSavedLocale();});
  if (locale !== "zh-Hant" && /\/(ranger|gear|ability|hsEnemy|mainstage|hs-stage|endless|labyrinth|pvp|guildwar)\//i.test(location.pathname)) {
    api.ready.then(() => readyGame());
  }
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
      else if (node.nodeType === 3 && locale !== "zh-Hant") translateTextNode(node);
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
