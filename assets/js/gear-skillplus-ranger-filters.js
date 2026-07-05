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

  function fillSelect(select, label, values) {
    select.innerHTML = "";
    const all = document.createElement("option");
    all.value = "";
    all.textContent = `${label}：全部`;
    select.appendChild(all);
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  function rangerValue(ranger, keys) {
    for (const key of keys) {
      const value = text(ranger?.[key]);
      if (value) return value;
    }
    return "";
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

  function fixPopupDivider() {
    const details = root.querySelector(".gear-advanced-switchable-details");
    const divider = details?.previousElementSibling;
    if (!divider?.classList.contains("gear-advanced-divider")) return;
    divider.classList.toggle("gear-popup-switchable-divider", !document.body.classList.contains("gear-detail-page"));
  }

  async function apply() {
    if (applying) return;
    fixPopupDivider();

    const details = root.querySelector(".gear-skillplus-ranger-details");
    if (!details || details.querySelector(".gear-skillplus-ranger-filters")) return;

    applying = true;
    try {
      const rangerMap = await loadRangerMap();
      const cards = [...details.querySelectorAll(".gear-skillplus-ranger-card")];
      cards.forEach((card) => {
        const id = decodeURIComponent(card.getAttribute("href")?.split("/").filter(Boolean).pop() || "");
        const ranger = rangerMap.get(id);
        card.dataset.star = rangerValue(ranger, ["星數", "Ranger星數", "star"]);
        card.dataset.type = rangerValue(ranger, ["類型", "type"]);
        card.dataset.element = rangerValue(ranger, ["屬性", "attribute", "element"]);
      });

      const filters = document.createElement("div");
      filters.className = "gear-skillplus-ranger-filters";
      filters.innerHTML = `
        <select aria-label="篩選星數"></select>
        <select aria-label="篩選類型"></select>
        <select aria-label="篩選屬性"></select>
      `;
      const [starSelect, typeSelect, elementSelect] = filters.querySelectorAll("select");
      fillSelect(starSelect, "星數", unique(cards.map((card) => card.dataset.star)));
      fillSelect(typeSelect, "類型", unique(cards.map((card) => card.dataset.type)));
      fillSelect(elementSelect, "屬性", unique(cards.map((card) => card.dataset.element)));

      const grid = details.querySelector(".gear-skillplus-ranger-grid");
      details.insertBefore(filters, grid || details.children[1] || null);

      let empty = details.querySelector(".gear-skillplus-ranger-filter-empty");
      if (!empty) {
        empty = document.createElement("div");
        empty.className = "empty-state small gear-skillplus-ranger-filter-empty";
        empty.textContent = "沒有符合篩選條件的角色。";
        empty.hidden = true;
        details.appendChild(empty);
      }
      bindFilters(details);
    } finally {
      applying = false;
    }
  }

  root.addEventListener("click", (event) => {
    if (event.target.closest?.(".gear-skillplus-ranger-summary")) {
      [0, 50, 150].forEach((delay) => window.setTimeout(apply, delay));
    }
  });

  new MutationObserver(() => {
    if (applying) return;
    clearTimeout(timer);
    timer = window.setTimeout(apply, 50);
  }).observe(root, { childList: true, subtree: true });

  [0, 120, 300, 700, 1200, 1800].forEach((delay) => window.setTimeout(apply, delay));
})();
