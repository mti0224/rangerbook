(() => {
  const ROOT = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const DATA_URL = `${ROOT}res/Rangers_data.json`;
  const root = document.getElementById("gearModalContent");
  if (!root) return;

  let rangerMapPromise;
  let applying = false;
  let timer = 0;

  const text = (value) => value == null ? "" : String(value).trim();

  function loadRangerMap() {
    if (!rangerMapPromise) {
      rangerMapPromise = fetch(DATA_URL)
        .then((response) => response.ok ? response.json() : [])
        .then((rows) => new Map((Array.isArray(rows) ? rows : []).map((ranger) => [
          text(ranger?.ranger_id || ranger?.id || ranger?.unitCode), ranger
        ])))
        .catch(() => new Map());
    }
    return rangerMapPromise;
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant", { numeric: true }));
  }

  function fillSelect(select, values) {
    select.innerHTML = `<option value="">全部</option>${values.map((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      return option.outerHTML;
    }).join("")}`;
  }

  function bindFilters(details) {
    const controls = details.querySelector(".gear-skillplus-ranger-filters");
    if (!controls || controls.dataset.bound) return;
    controls.dataset.bound = "1";

    const selects = [...controls.querySelectorAll("select")];
    const cards = [...details.querySelectorAll(".gear-skillplus-ranger-card")];
    const empty = details.querySelector(".gear-skillplus-ranger-filter-empty");

    const applyFilter = () => {
      const [star, type, element] = selects.map((select) => select.value);
      let visible = 0;
      cards.forEach((card) => {
        const match = (!star || card.dataset.star === star)
          && (!type || card.dataset.type === type)
          && (!element || card.dataset.element === element);
        card.hidden = !match;
        if (match) visible += 1;
      });
      if (empty) empty.hidden = visible > 0;
    };

    selects.forEach((select) => select.addEventListener("change", applyFilter));
  }

  async function apply() {
    if (applying || !document.body.classList.contains("gear-detail-page")) return;
    const details = root.querySelector(".gear-skillplus-ranger-details");
    if (!details || details.querySelector(".gear-skillplus-ranger-filters")) return;

    applying = true;
    try {
      const rangerMap = await loadRangerMap();
      const cards = [...details.querySelectorAll(".gear-skillplus-ranger-card")];
      cards.forEach((card) => {
        const id = decodeURIComponent(card.getAttribute("href")?.split("/").filter(Boolean).pop() || "");
        const ranger = rangerMap.get(id);
        card.dataset.star = text(ranger?.["Ranger星數"]);
        card.dataset.type = text(ranger?.["類型"]);
        card.dataset.element = text(ranger?.["屬性"]);
      });

      const filters = document.createElement("div");
      filters.className = "gear-skillplus-ranger-filters";
      filters.innerHTML = `
        <select aria-label="篩選星數"></select>
        <select aria-label="篩選類型"></select>
        <select aria-label="篩選屬性"></select>
      `;
      const [starSelect, typeSelect, elementSelect] = filters.querySelectorAll("select");
      fillSelect(starSelect, unique(cards.map((card) => card.dataset.star)));
      fillSelect(typeSelect, unique(cards.map((card) => card.dataset.type)));
      fillSelect(elementSelect, unique(cards.map((card) => card.dataset.element)));

      const grid = details.querySelector(".gear-skillplus-ranger-grid");
      details.insertBefore(filters, grid || details.children[1] || null);

      const empty = document.createElement("div");
      empty.className = "empty-state small gear-skillplus-ranger-filter-empty";
      empty.textContent = "沒有符合篩選條件的角色。";
      empty.hidden = true;
      details.appendChild(empty);
      bindFilters(details);
    } finally {
      applying = false;
    }
  }

  new MutationObserver(() => {
    if (applying) return;
    clearTimeout(timer);
    timer = window.setTimeout(apply, 50);
  }).observe(root, { childList: true, subtree: true });

  [0, 120, 300, 700].forEach((delay) => window.setTimeout(apply, delay));
})();
