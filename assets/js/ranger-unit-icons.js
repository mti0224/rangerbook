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
  function stats(attack, hp, minerals, detail = false) {
    const format = value => value === undefined || value === null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("zh-Hant", {maximumFractionDigits:2});
    return `<span class="ranger-mini-stats${detail ? " detail-tags" : ""}">${[["attack","攻擊力",attack],["hp","體力",hp],["minerals","礦物",minerals]].map(([key,label,value]) =>
      `<span data-unit-stat="${key}"><span data-i18n="stats.${key}">${escape(window.RangerbookI18n?.t("stats."+key,label) || label)}</span> ${escape(format(value))}</span>`).join("")}</span>`;
  }
  window.RangerbookUnitIcons = {element, type, stats};
  window.addEventListener("rangerbook:locale-ready", () => {
    document.querySelectorAll("[data-unit-icon-label]").forEach(image => {
      const label = window.RangerbookI18n?.t(image.dataset.unitIconLabel, image.alt) || image.alt;
      image.alt = label; image.title = label;
    });
  });
})();
