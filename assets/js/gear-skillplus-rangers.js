(() => {
  const ROOT = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const GEAR_DATA_URL = `${ROOT}res/%E8%A3%9D%E5%82%99%E8%B3%87%E6%96%99%E5%BA%AB.json`;
  const RANGER_DATA_URL = `${ROOT}res/Rangers_data.json`;
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum-140.png`;

  const root = document.getElementById("gearModalContent");
  if (!root) return;

  let gearPromise;
  let rangerPromise;
  let timer = 0;
  let applying = false;

  const text = (value) => value == null || typeof value === "object" ? "" : String(value).replaceAll("\\n", "\n").trim();
  const escapeHtml = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function loadGearMap() {
    if (!gearPromise) {
      gearPromise = fetch(GEAR_DATA_URL)
        .then((response) => response.ok ? response.json() : [])
        .then((rows) => new Map((Array.isArray(rows) ? rows : []).map((gear) => [
          text(gear?.id || gear?.gear_id || gear?.code), gear
        ])))
        .catch(() => new Map());
    }
    return gearPromise;
  }

  function loadRangers() {
    if (!rangerPromise) {
      rangerPromise = fetch(RANGER_DATA_URL)
        .then((response) => response.ok ? response.json() : [])
        .then((rows) => Array.isArray(rows) ? rows : [])
        .catch(() => []);
    }
    return rangerPromise;
  }

  function currentGearId() {
    const src = root.querySelector(".gear-detail-image")?.getAttribute("src") || "";
    const match = src.match(/gear_icon\/([^/]+)_icon\.png/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function findSkillPlusSection() {
    return [...root.querySelectorAll(":scope > .detail-section")].find((section) => {
      const heading = section.querySelector(":scope > h3");
      return heading?.querySelector(":scope > span")?.textContent.trim() === "Skill+"
        || heading?.childNodes?.[0]?.textContent?.trim() === "Skill+";
    }) || null;
  }

  function skillPlusEffects(gear) {
    const items = Array.isArray(gear?.["Skill+"]) ? gear["Skill+"] : [];
    return [...new Set(items.map((item) => text(item?.["技能效果"] ?? item?.["效果"])).filter(Boolean))];
  }

  function rangerSkillBlob(ranger) {
    return ["技能1", "技能2"].map((key) => {
      const skill = ranger?.[key];
      if (!skill || typeof skill !== "object") return "";
      const group = Array.isArray(skill["技能組"]) ? skill["技能組"] : [];
      return JSON.stringify(group).replaceAll("\\n", "\n");
    }).join(" ");
  }

  function matchesAnyEffect(ranger, effects) {
    const blob = rangerSkillBlob(ranger);
    if (!blob) return false;
    return effects.some((effect) => blob.includes(effect));
  }

  function card(ranger) {
    const id = text(ranger?.["ranger_id"] || ranger?.id || ranger?.unitCode);
    const name = text(ranger?.["Ranger名稱"] || ranger?.name || id) || id;
    if (!id) return "";
    return `<a class="gear-skillplus-ranger-card" href="${ROOT}ranger/ranger/${encodeURIComponent(id)}" title="${escapeHtml(name)}"><img src="${RANGER_IMAGE(id)}" alt="${escapeHtml(name)}" loading="lazy"><span>${escapeHtml(name)}</span></a>`;
  }

  function ensureStyles() {
    if (document.getElementById("gearSkillPlusRangerStyles")) return;
    const style = document.createElement("style");
    style.id = "gearSkillPlusRangerStyles";
    style.textContent = `
      .gear-skillplus-ranger-details{margin-top:1rem;border-top:1px solid var(--line);padding-top:.75rem}
      .gear-skillplus-ranger-summary{cursor:pointer;font-weight:800;list-style:none;padding:.35rem 0;display:flex;align-items:center;justify-content:space-between;gap:.75rem}
      .gear-skillplus-ranger-summary::-webkit-details-marker{display:none}
      .gear-skillplus-ranger-summary::after{content:"展開";font-size:.82rem;color:var(--muted);font-weight:700}
      .gear-skillplus-ranger-details[open]>.gear-skillplus-ranger-summary::after{content:"收合"}
      .gear-skillplus-ranger-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:.75rem;margin-top:.8rem}
      .gear-skillplus-ranger-card{display:flex;flex-direction:column;align-items:center;gap:.45rem;padding:.65rem;border:1px solid var(--line);border-radius:14px;background:var(--surface);text-decoration:none;color:inherit;text-align:center;min-width:0}
      .gear-skillplus-ranger-card img{width:72px;height:72px;object-fit:contain;display:block}
      .gear-skillplus-ranger-card span{width:100%;font-size:.82rem;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .gear-skillplus-ranger-empty{margin-top:.75rem}
      @media (max-width:700px){.gear-skillplus-ranger-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:.55rem}.gear-skillplus-ranger-card{padding:.45rem}.gear-skillplus-ranger-card img{width:58px;height:58px}.gear-skillplus-ranger-card span{font-size:.74rem}}
    `;
    document.head.appendChild(style);
  }

  async function apply() {
    if (applying || !root.querySelector(".gear-detail-head")) return;
    const section = findSkillPlusSection();
    const id = currentGearId();
    if (!section || !id) return;

    applying = true;
    try {
      section.querySelector(":scope > .gear-skillplus-ranger-details")?.remove();
      const gear = (await loadGearMap()).get(id);
      const effects = skillPlusEffects(gear);
      if (!effects.length || !section.querySelector(".gear-skillplus-table tbody tr")) return;

      const rangers = (await loadRangers()).filter((ranger) => matchesAnyEffect(ranger, effects));
      const details = document.createElement("details");
      details.className = "gear-skillplus-ranger-details";
      details.innerHTML = `<summary class="gear-skillplus-ranger-summary">具有此 Skill+ 效果的角色（${rangers.length}）</summary>${rangers.length ? `<div class="gear-skillplus-ranger-grid">${rangers.map(card).join("")}</div>` : `<div class="empty-state small gear-skillplus-ranger-empty">沒有符合的角色資料。</div>`}`;
      section.appendChild(details);
    } finally {
      applying = false;
    }
  }

  ensureStyles();
  new MutationObserver((mutations) => {
    if (applying || !mutations.some((mutation) => mutation.target === root)) return;
    clearTimeout(timer);
    timer = window.setTimeout(apply, 100);
  }).observe(root, { childList: true });

  [0, 150, 400, 900].forEach((delay) => window.setTimeout(apply, delay));
})();
