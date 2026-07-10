(() => {
  const ROOT = location.pathname.includes('/rangerbook/') ? '/rangerbook/' : '/';
  const DATA_URL = `${ROOT}res/%E8%A3%9D%E5%82%99%E8%B3%87%E6%96%99%E5%BA%AB.json`;
  const GEAR_ICON = (id) => `https://rangers.lerico.net/res/gear_icon/${encodeURIComponent(id)}_icon.png`;
  const root = document.getElementById('gearModalContent');
  if (!root) return;

  let rowsPromise;
  let lastId = '';
  let busy = false;
  const text = (v) => v == null || typeof v === 'object' ? '' : String(v).replaceAll('\\n', '\n').trim();
  const esc = (v) => text(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const norm = (v) => text(v).replace(/\s+/g, '').replace(/[()（）]/g, '').toLowerCase();

  function loadRows() {
    return rowsPromise ||= fetch(DATA_URL).then((r) => r.ok ? r.json() : []).then((rows) => Array.isArray(rows) ? rows : []).catch(() => []);
  }
  function idOf(g) { return text(g?.id || g?.gear_id || g?.code); }
  function nameOf(g) { return text(g?.['裝備名稱'] || g?.name || idOf(g)); }
  function typeOf(g) { return norm(g?.['裝備種類'] || g?.['種類'] || g?.['類型'] || g?.type || g?.gearType); }
  function typeLabel(g) { return text(g?.['裝備種類'] || g?.['種類'] || g?.['類型'] || g?.type || g?.gearType); }
  function starOf(g) { return text(g?.['裝備星級'] || g?.['星數'] || g?.star); }
  function keysOf(g) {
    const basic = g?.['基本效果'];
    if (!basic || typeof basic !== 'object' || Array.isArray(basic)) return [];
    return Object.getOwnPropertyNames(basic).map(norm).filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true }));
  }
  function sameBasic(a, b) {
    const left = keysOf(a), right = keysOf(b);
    return left.length && left.length === right.length && left.every((key, i) => key === right[i]);
  }
  function currentId() {
    const src = root.querySelector('.gear-detail-image')?.getAttribute('src') || '';
    return decodeURIComponent(src.match(/gear_icon\/([^/]+)_icon\.png/)?.[1] || '');
  }
  function titleOf(section) {
    const h = section?.querySelector(':scope > h3');
    return h?.querySelector(':scope > span')?.textContent.trim() || h?.childNodes?.[0]?.textContent?.trim() || '';
  }
  function findSection(title) {
    return [...root.querySelectorAll(':scope > .detail-section')].find((section) => titleOf(section) === title) || null;
  }
  function similarSection() { return findSection('相似的裝備') || findSection('類型相似的裝備'); }
  function anchor() { return findSection('Spec+') || findSection('Skill+') || findSection('高級效果') || findSection('基本效果'); }
  function card(g) {
    const id = idOf(g), name = nameOf(g), tags = [starOf(g) ? `${starOf(g)}星` : '', typeLabel(g)].filter(Boolean).join('／');
    return `<a class="gear-similar-card" href="${ROOT}gear/${encodeURIComponent(id)}" title="${esc(name)}"><img src="${GEAR_ICON(id)}" alt="${esc(name)}" loading="lazy"><span class="gear-similar-name">${esc(name)}</span><span class="gear-similar-tags">${esc(tags)}</span></a>`;
  }
  function render(matches) {
    return `<h3>相似的裝備</h3>${matches.length ? `<div class="ranger-talent-list"><article class="ranger-talent-card"><div class="gear-similar-list">${matches.map(card).join('')}</div></article></div>` : '<div class="empty-state small">沒有相似的裝備。</div>'}`;
  }
  async function apply(force = false) {
    if (busy || !document.body.classList.contains('gear-detail-page') || !root.querySelector('.gear-detail-head')) return;
    const id = currentId();
    if (!id || (!force && id === lastId && similarSection())) return;
    busy = true;
    try {
      const rows = await loadRows();
      const current = rows.find((g) => idOf(g) === id);
      if (!current) return;
      const t = typeOf(current);
      const matches = rows.filter((g) => idOf(g) && idOf(g) !== id && t && typeOf(g) === t && sameBasic(g, current))
        .sort((a, b) => (Number(starOf(b)) - Number(starOf(a))) || nameOf(a).localeCompare(nameOf(b), 'zh-Hant', { numeric: true }));
      let section = similarSection();
      if (!section) {
        section = document.createElement('section');
        section.className = 'detail-section gear-similar-section';
        const base = anchor();
        if (base) base.insertAdjacentElement('afterend', section);
        else root.appendChild(section);
      }
      section.innerHTML = render(matches);
      lastId = id;
    } finally {
      busy = false;
    }
  }

  new MutationObserver(() => setTimeout(() => apply(false), 80)).observe(root, { childList: true, subtree: false });
  [80, 300, 700, 1200].forEach((delay) => setTimeout(() => apply(true), delay));
})();
