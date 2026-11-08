/* Shared game identity icons. Asset names follow the English game catalog. */
(() => {
  "use strict";
  const base = new URL("../", document.currentScript.src);
  const elements = {FIRE:"fire", WATER:"water", TREE:"wood", WOOD:"wood", LIGHT:"light", DARK:"dark",
    "火":"fire", "水":"water", "木":"wood", "光":"light", "暗":"dark"};
  const types = {STR:"strength", AGI:"agility", INT:"intelligence", STRENGTH:"strength", AGILITY:"agility", INTELLIGENCE:"intelligence",
    "力量":"strength", "力量型":"strength", "敏捷":"agility", "敏捷型":"agility", "智慧":"intelligence", "智慧型":"intelligence"};
  const keys = {strength:"str", agility:"agi", intelligence:"int"};
  const labels = {fire:"火",water:"水",wood:"木",light:"光",dark:"暗",strength:"力量型",agility:"敏捷型",intelligence:"智慧型"};
  const escape = value => String(value).replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  function icon(kind, value) {
    const name = (kind === "element" ? elements : types)[String(value || "").trim().toUpperCase()];
    if (!name) return ""; // Neutral Rangers have no element badge.
    const key = "tag." + (keys[name] || name);
    const label = window.RangerbookI18n?.t(key, labels[name]) || labels[name];
    return `<img class="ranger-${kind}-icon" src="${new URL(kind+"/"+name+".png",base).href}" alt="${escape(label)}" title="${escape(label)}" data-unit-icon-label="${key}" decoding="async">`;
  }
  function element(row) {
    return icon("element", typeof row === "object" && row ? row.__v2?.elementType || row.elementType || row["屬性"] || row.element || row.unitElement : row);
  }
  function type(row) {
    return icon("type", typeof row === "object" && row ? row.__v2?.roleType || row.roleType || row["類型"] || row.type : row);
  }
  // Standalone category choices are separate from portrait overlays (NONE is a
  // real filter category but deliberately has no portrait badge).
  function category(kind, value, label = "") {
    const raw = String(value ?? "").trim();
    const code = raw.toUpperCase();
    let content = "";
    if (kind === "star") {
      const grade = Number(raw.match(/\d+/)?.[0]);
      if (Number.isInteger(grade) && grade >= 1 && grade <= 9) {
        const hyper = /超進化|HYPER/i.test(raw), ultra = /終極進化|ULTRA|ULTIMATE/i.test(raw);
        // Native 4/5-star evolved Rangers still use the gold star assets.
        const level = hyper && grade === 8 ? "04" : ultra && grade >= 6 && grade <= 8 ? "02" : "01";
        const description = label || raw;
        content = `<img class="ranger-star-icon" src="${new URL("star_layer/com_level"+level+"_star"+String(grade).padStart(2,"0")+".png",base).href}" alt="${escape(description)}" title="${escape(description)}" decoding="async">`;
        if (ultra && grade < 6) content += `<svg class="ranger-evolution-marker" viewBox="0 0 16 16" role="img" aria-label="${escape(description)}" fill="none" stroke="currentColor" stroke-width="2"><title>${escape(description)}</title><path d="m3 9 5-5 5 5M3 13l5-5 5 5"/></svg>`;
      }
    } else if (kind === "element") {
      content = icon("element", value);
      if (["NONE", "無", "無屬性"].includes(code)) {
        content = symbol("neutral", label || window.RangerbookI18n?.uiText("無") || "無");
      }
    } else if (kind === "type") {
      content = icon("type", value);
    } else if (kind === "gear") {
      const slots = {WEAPON:"weapon", ARMOR:"armor", ACC:"accessory", "武器":"weapon", "防具":"armor", "飾品":"accessory"};
      const name = slots[code];
      if (name) content = symbol(name, label || window.RangerbookI18n?.t("tag."+name,raw) || raw);
    }
    return content ? `<span class="ranger-category-icon">${content}</span>` : escape(label || raw);
  }
  function symbol(name, label) {
    const shapes = {
      neutral:'<circle cx="12" cy="12" r="9"/><path d="M6 18 18 6"/>',
      weapon:'<path d="m14 3 7 0 0 7-11 11-7-7 11-11ZM3 21l5-5M5 12l7 7M14 6l4 4"/>',
      armor:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/>',
      accessory:'<circle cx="12" cy="15" r="6"/><path d="m8 5 4-3 4 3-4 5-4-5ZM8 5h8"/>'
    };
    return `<svg class="ranger-category-symbol" viewBox="0 0 24 24" role="img" aria-label="${escape(label)}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><title>${escape(label)}</title>${shapes[name]}</svg>`;
  }
  function stats(attack, hp, minerals, detail = false) {
    const format = value => value === undefined || value === null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("zh-Hant", {maximumFractionDigits:2});
    return `<span class="ranger-mini-stats${detail ? " detail-tags" : ""}">${[["attack","攻擊力",attack],["hp","體力",hp],["minerals","礦物",minerals]].map(([key,label,value]) =>
      `<span data-unit-stat="${key}"><span data-i18n="stats.${key}">${escape(window.RangerbookI18n?.t("stats."+key,label) || label)}</span> ${escape(format(value))}</span>`).join("")}</span>`;
  }
  window.RangerbookUnitIcons = {element, type, stats, category};
  window.addEventListener("rangerbook:locale-ready", () => {
    document.querySelectorAll("[data-unit-icon-label]").forEach(image => {
      const label = window.RangerbookI18n?.t(image.dataset.unitIconLabel, image.alt) || image.alt;
      image.alt = label; image.title = label;
    });
  });
})();
