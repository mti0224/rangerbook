/* Evolution relationships come only from explicit official unit targets. */
(() => {
  "use strict";
  const root = location.pathname.startsWith("/rangerbook/") ? "/rangerbook/" : "/";
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const label = (key, fallback) => window.RangerbookI18n?.t(key, fallback) || fallback;
  let rows = new Map(), graph = new Map(), next = new Map(), failed = false, pending;

  function build(records, edges) {
    rows = new Map(records.map(row => [row.rangerCode, row]));
    graph = new Map(); next = new Map();
    for (const {from, to} of edges) {
      if (from === to || !rows.has(from) || !rows.has(to)) continue;
      for (const [a,b] of [[from,to],[to,from]]) {
        if (!graph.has(a)) graph.set(a, new Set());
        graph.get(a).add(b);
      }
      if (!next.has(from)) next.set(from, new Set());
      next.get(from).add(to);
    }
  }
  function stages(id) {
    if (!rows.has(id)) return [];
    const found = new Set([id]), queue = [id];
    for (let i=0; i<queue.length; i++) for (const to of graph.get(queue[i]) || []) {
      if (!found.has(to)) { found.add(to); queue.push(to); }
    }
    const order = {NORMAL:0,ULTRA:1,HYPER:2};
    return [...found].map(code => rows.get(code)).sort((a,b) =>
      a.starGrade-b.starGrade || order[a.evolution]-order[b.evolution] || a.rangerCode.localeCompare(b.rangerCode));
  }
  function ready() {
    if (!pending) pending = (async () => {
      const records = window.RangerbookV2.evolutionRows ? await window.RangerbookV2.evolutionRows()
        : (await window.RangerbookV2.data("rangers")).rangers;
      // The compiler extension keeps future official refreshes authoritative.
      // The checked snapshot supports the current publisher during rollout.
      const edges = records.every(row => Array.isArray(row.evolutionTargets))
        ? records.flatMap(row => row.evolutionTargets.map(target => ({from:row.rangerCode,to:target.rangerCode})))
        : (await (await fetch(root+"assets/data/ranger-evolution.json")).json()).edges;
      if (!Array.isArray(edges)) throw new Error("Invalid evolution relationships");
      build(records, edges);
    })().catch(error => { failed = true; console.error("Evolution data unavailable", error); });
    return pending;
  }
  function name(row) {
    return window.RangerbookV2.render(row.nameKey, window.RangerbookV2.locale) || row.rangerCode;
  }
  function link(code) {
    return root+"ranger/ranger/?detail="+encodeURIComponent(code);
  }
  function render(ranger) {
    const id = ranger.ranger_id || ranger.__v2?.code;
    const records = stages(id);
    let body;
    if (failed || !records.length) body = `<p class="empty-state small">${escape(label("site.evolution.unavailable","進化階段資料暫時無法載入。"))}</p>`;
    else body = `<ul class="ranger-evolution-list gear-skillplus-ranger-grid">${records.map(row => {
      const code = row.rangerCode, current = code === id;
      const star = (row.evolution === "ULTRA" ? "終極進化" : row.evolution === "HYPER" ? "超進化" : "")+row.starGrade+"星";
      const targets = [...(next.get(code) || [])];
      return `<li class="ranger-evolution-stage${current ? " is-current" : ""}" data-evolution-id="${escape(code)}">
        <a class="ranger-evolution-character gear-skillplus-ranger-card" href="${escape(link(code))}" title="${escape(name(row))}"${current ? ' aria-current="page"' : ""}>
          <img src="https://res.warmycat.com/${encodeURIComponent(code)}/${encodeURIComponent(code)}-thum.png" alt="" loading="lazy">
          <span>${escape(name(row))}</span>
        </a>
        <span class="ranger-evolution-grade">${escape(window.RangerbookI18n?.uiText(star) || star)}</span>
        ${current ? `<span class="ranger-evolution-current">${escape(label("site.evolution.current","目前角色"))}</span>` : ""}
        ${targets.length ? `<div class="ranger-evolution-targets"><span>${escape(label("site.evolution.next","可進化為"))}</span>${targets.map(to => `<a href="${escape(link(to))}" data-evolution-target="${escape(to)}">${escape(name(rows.get(to)))}</a>`).join("")}</div>` : ""}
      </li>`;
    }).join("")}</ul>${records.length === 1 ? `<p class="ranger-evolution-note">${escape(label("site.evolution.none","官方資料無其他進化階段。"))}</p>` : ""}`;
    return `<section class="detail-section ranger-evolution-section"><h3 data-i18n="site.evolution.title">${escape(label("site.evolution.title","進化階段"))}</h3>${body}</section>`;
  }
  window.RangerbookEvolution = {ready, render, stages};
})();
