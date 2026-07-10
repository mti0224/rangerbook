(() => {
  const ROOT = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const DATA_URL = `${ROOT}res/%E8%A3%9D%E5%82%99%E8%B3%87%E6%96%99%E5%BA%AB.json`;
  const GEAR_ICON = (id) => `https://rangers.lerico.net/res/gear_icon/${encodeURIComponent(id)}_icon.png`;

  const root = document.getElementById("gearModalContent");
  if (!root) return;

  let dataPromise;
  let applying = false;
  let timer = 0;
  let renderedId = "";

  const text = (value) => {
    if (value === null || value === undefined || typeof value === "object") return "";
    return String(value).replaceAll("\\n", "\n").trim();
  };

  const escapeHtml = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const normalize = (value) => text(value)
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "")
    .toLowerCase();

  function loadData() {
    if (!dataPromise) {
      dataPromise = fetch(DATA_URL)
        .then((response) => response.ok ? response.json() : [])
        .then((rows) => Array.isArray(rows) ? rows : [])
        .catch(() => []);
    }
    return dataPromise;
  }

  function getId(gear) {
    return text(gear?.id || gear?.gear_id || gear?.code);
  }

  function getName(gear) {
    return text(gear?.["裝備名稱"] || gear?.name || getId(gear));
  }

  function getTypeValue(gear) {
    return gear?.["裝備種類"]
      ?? gear?.["種類"]
      ?? gear?.["類型"]
      ?? gear?.type
      ?? gear?.gearType;
  }

  function getType(gear) {
    return normalize(getTypeValue(gear));
  }

  function getTypeLabel(gear) {
    return text(getTypeValue(gear));
  }

  function getStar(gear) {
    return text(gear?.["裝備星級"] || gear?.["星數"] || gear?.star);
  }

  function basicKeys(gear) {
    const basic = gear?.["基本效果"];
    if (!basic || typeof basic !== "object" || Array.isArray(basic)) return [];
    return Object.getOwnPropertyNames(basic)
      .map(normalize)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "zh-Hant", { numeric: true }));
  }

  function sameBasicEffects(a, b) {
    const left = basicKeys(a);
    const right = basicKeys(b);
    return left.length > 0 && left.length === right.length && left.every((key, index) => key === right[index]);
  }

  function currentGearId() {
    const src = root.querySelector(".gear-detail-image")?.getAttribute("src") || "";
    const match = src.match(/gear_icon\/([^/]+)_icon\.png/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function sectionTitle(section) {
    const heading = section?.querySelector(":scope > h3");
    return heading?.querySelector(":scope > span")?.textContent.trim()
      || heading?.childNodes?.[0]?.textContent?.trim()
      || "";
  }

  function findSection(title) {
    return [...root.querySelectorAll(":scope > .detail-section")]
      .find((section) => sectionTitle(section) === title) || null;
  }

  function findSimilarSection() {
    return findSection("相似的裝備") || findSection("類型相似的裝備");
  }

  function insertAfterAnchor(section) {
    const spec = findSection("Spec+");
    const skill = findSection("Skill+");
    const advanced = findSection("高級效果");
    const basic = findSection("基本效果");
    const anchor = spec || skill || advanced || basic;
    if (anchor) anchor.insertAdjacentElement("afterend", section);
    else root.appendChild(section);
  }

  function sortGear(a, b) {
    const starDiff = Number(getStar(b)) - Number(getStar(a));
    if (starDiff) return starDiff;
    return getName(a).localeCompare(getName(b), "zh-Hant", { numeric: true });
  }

  function gearCard(gear) {
    const id = getId(gear);
    const name = getName(gear);
    const tags = [getStar(gear) ? `${getStar(gear)}星` : "", getTypeLabel(gear)].filter(Boolean);
    return `<a class="gear-similar-card" href="${ROOT}gear/${encodeURIComponent(id)}" title="${escapeHtml(name)}">
      <img src="${GEAR_ICON(id)}" alt="${escapeHtml(name)}" loading="lazy">
      <span class="gear-similar-name">${escapeHtml(name)}</span>
      <span class="gear-similar-tags">${tags.map((tag) => escapeHtml(tag)).join("／")}</span>
    </a>`;
  }

  function ensureStyles() {
    if (document.getElementById("gearSimilarTypeStyles")) return;
    const style = document.createElement("style");
    style.id = "gearSimilarTypeStyles";
    style.textContent = `
      .gear-similar-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:.75rem}
      .gear-similar-card{display:flex;flex-direction:column;align-items:center;gap:.45rem;padding:.7rem;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:inherit;text-align:center;text-decoration:none;min-width:0}
      .gear-similar-card img{width:72px;height:72px;object-fit:contain;display:block}
      .gear-similar-name{width:100%;font-size:.85rem;font-weight:700;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .gear-similar-tags{width:100%;color:var(--muted);font-size:.75rem;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      @media(max-width:700px){.gear-similar-list{grid-template-columns:repeat(4,minmax(0,1fr));gap:.55rem}.gear-similar-card{padding:.45rem}.gear-similar-card img{width:58px;height:58px}.gear-similar-name{font-size:.74rem}.gear-similar-tags{font-size:.68rem}}
    `;
    document.head.appendChild(style);
  }

  function renderSection(matches) {
    return `<h3>相似的裝備</h3>${matches.length
      ? `<div class="ranger-talent-list"><article class="ranger-talent-card"><div class="gear-similar-list">${matches.map(gearCard).join("")}</div></article></div>`
      : `<div class="empty-state small">沒有相似的裝備。</div>`}`;
  }

  async function apply() {
    if (applying || !document.body.classList.contains("gear-detail-page") || !root.querySelector(".gear-detail-head")) return;
    const id = currentGearId();
    if (!id) return;

    const existing = findSimilarSection();
    if (renderedId === id && existing) return;

    applying = true;
    try {
      const rows = await loadData();
      const current = rows.find((gear) => getId(gear) === id);
      if (!current) return;

      const currentType = getType(current);
      const matches = rows
        .filter((gear) => getId(gear) && getId(gear) !== id)
        .filter((gear) => currentType && getType(gear) === currentType && sameBasicEffects(gear, current))
        .sort(sortGear);

      let section = findSimilarSection();
      if (!section) {
        section = document.createElement("section");
        section.className = "detail-section gear-similar-section";
        insertAfterAnchor(section);
      }
      section.innerHTML = renderSection(matches);
      renderedId = id;
    } finally {
      applying = false;
    }
  }

  ensureStyles();
  new MutationObserver(() => {
    if (applying) return;
    const id = currentGearId();
    if (!id || (id === renderedId && findSimilarSection())) return;
    clearTimeout(timer);
    timer = window.setTimeout(apply, 120);
  }).observe(root, { childList: true, subtree: false });

  [0, 150, 450, 900].forEach((delay) => window.setTimeout(apply, delay));
})();
