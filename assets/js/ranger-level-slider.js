(() => {
  if (!window.__RANGER_DETAIL_MODE__) return;

  const ROOT = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const DATA_URL = `${ROOT}res/Rangers_data.json`;
  const STAT_GROWTH = [
    { label: "體力", base: "體力", normal: "hpIncreaseAmount", max: "hpIncreaseAmountMax" },
    { label: "物理攻擊力", base: "物理攻擊力", normal: "attackIncreaseAmount", max: "attackIncreaseAmountMax" },
    { label: "魔法攻擊力", base: "魔法攻擊力", normal: "specialAttackDelta", max: "specialAttackDeltaMax" },
    { label: "物理防禦力", base: "物理防禦力", normal: "generalDefenceDelta", max: "generalDefenceDeltaMax" },
    { label: "魔法防禦力", base: "魔法防禦力", normal: "specialDefenceDelta", max: "specialDefenceDeltaMax" }
  ];

  const selectedLevels = new Map();
  let rangerMapPromise = null;
  let mountVersion = 0;

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function escapeHtml(value) {
    return text(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function numericValue(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const normalized = text(value).replaceAll(",", "");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) return "-";
    return value.toLocaleString("zh-Hant", { maximumFractionDigits: 3 });
  }

  function rangerId(ranger) {
    return text(ranger?.ranger_id || ranger?.unitCode || ranger?.id || "");
  }

  function requestedRangerId() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = text(params.get("detail"));
    if (fromQuery) return fromQuery;
    const match = window.location.pathname.match(/\/ranger\/ranger\/([^/?#]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function renderedRangerId(root) {
    const image = root.querySelector(".ranger-detail-image");
    const src = image?.getAttribute("src") || image?.src || "";
    const match = src.match(/res(?:_from_emulator)?\/([^/]+)\//) || src.match(/\/([^/]+)\/[^/]+-thum/i);
    return match ? decodeURIComponent(match[1]) : requestedRangerId();
  }

  function starNumber(ranger) {
    const match = text(ranger?.["Ranger星數"]).match(/\d+/);
    return match ? Number(match[0]) : 0;
  }

  function isEvolvedRanger(ranger) {
    const label = text(ranger?.["Ranger星數"]).toLowerCase();
    return ["超進化", "終極進化", "究極進化", "ultra", "hyper", "ultimate"]
      .some((token) => label.includes(token));
  }

  function nonEvolvedRegularCap(star) {
    if (star >= 1 && star <= 5) return star * 10 + 10;
    if (star >= 6 && star <= 8) return 60 + (star - 5) * 20;
    if (star === 9) return 160;
    return 0;
  }

  function levelLimits(ranger) {
    const star = starNumber(ranger);
    const baseRegularCap = nonEvolvedRegularCap(star);
    if (!baseRegularCap) return null;
    const evolved = isEvolvedRanger(ranger);
    const regularCap = evolved ? baseRegularCap + 20 : baseRegularCap;
    return {
      star,
      evolved,
      regularCap,
      maxLevel: regularCap + (evolved ? 100 : 20)
    };
  }

  function statAtLevel(ranger, stat, limits, level) {
    const base = numericValue(ranger?.[stat.base]);
    if (base === null) return null;
    const normalGrowth = numericValue(ranger?.[stat.normal]) ?? 0;
    const maxGrowth = numericValue(ranger?.[stat.max]) ?? normalGrowth;
    if (level <= limits.regularCap) return base + (level - 1) * normalGrowth;
    return base
      + (limits.regularCap - 1) * normalGrowth
      + (level - limits.regularCap) * maxGrowth;
  }

  function levelProgress(level, maxLevel) {
    if (maxLevel <= 1) return 0;
    return ((level - 1) / (maxLevel - 1)) * 100;
  }

  function loadRangerMap() {
    if (!rangerMapPromise) {
      rangerMapPromise = fetch(DATA_URL)
        .then((response) => response.ok ? response.json() : [])
        .then((rows) => {
          const map = new Map();
          if (Array.isArray(rows)) rows.forEach((ranger) => {
            const id = rangerId(ranger);
            if (id) map.set(id, ranger);
          });
          return map;
        })
        .catch((error) => {
          console.error("Ranger level data failed to load", error);
          return new Map();
        });
    }
    return rangerMapPromise;
  }

  function findBasicSection(root) {
    return [...root.querySelectorAll(":scope > .detail-section")]
      .find((section) => section.querySelector(":scope > h3")?.textContent.trim() === "基本數值");
  }

  function levelControlHtml(id, limits, level) {
    return `
      <div class="ranger-level-control" data-ranger-level-control data-ranger-id="${escapeHtml(id)}" style="--level-progress:${levelProgress(level, limits.maxLevel)}%">
        <label class="ranger-level-label" for="rangerLevelRange">等級：<output class="ranger-level-output" for="rangerLevelRange">${level}/${limits.maxLevel}</output></label>
        <div class="ranger-level-range-wrap">
          <input id="rangerLevelRange" class="ranger-level-range" type="range" min="1" max="${limits.maxLevel}" step="1" value="${level}" aria-label="角色等級">
        </div>
      </div>`;
  }

  function updateStats(root, ranger, limits, level) {
    const control = root.querySelector("[data-ranger-level-control]");
    if (!control) return;
    const output = control.querySelector(".ranger-level-output");
    const range = control.querySelector(".ranger-level-range");
    if (output) output.textContent = `${level}/${limits.maxLevel}`;
    if (range) range.setAttribute("aria-valuetext", `${level}等，共${limits.maxLevel}等`);
    control.style.setProperty("--level-progress", `${levelProgress(level, limits.maxLevel)}%`);

    const statElements = [...root.querySelectorAll(".ranger-stat")];
    STAT_GROWTH.forEach((stat) => {
      const item = statElements.find((element) => element.querySelector("span")?.textContent.trim() === stat.label);
      const valueElement = item?.querySelector("strong");
      if (!valueElement) return;
      const value = statAtLevel(ranger, stat, limits, level);
      if (value !== null) valueElement.textContent = formatNumber(value);
    });
  }

  async function mountLevelControl() {
    const root = document.getElementById("rangerModalContent");
    if (!root?.children.length) return;
    const id = renderedRangerId(root);
    if (!id) return;

    const version = ++mountVersion;
    const ranger = (await loadRangerMap()).get(id);
    if (version !== mountVersion || !ranger || renderedRangerId(root) !== id) return;
    const limits = levelLimits(ranger);
    const section = findBasicSection(root);
    if (!limits || !section) return;

    const previous = section.querySelector("[data-ranger-level-control]");
    if (previous?.dataset.rangerId !== id) previous?.remove();
    if (!section.querySelector("[data-ranger-level-control]")) {
      const level = Math.min(limits.maxLevel, Math.max(1, selectedLevels.get(id) ?? 1));
      section.querySelector(":scope > h3")?.insertAdjacentHTML("afterend", levelControlHtml(id, limits, level));
      const range = section.querySelector(".ranger-level-range");
      range?.addEventListener("input", () => {
        const selected = Math.min(limits.maxLevel, Math.max(1, Number(range.value) || 1));
        selectedLevels.set(id, selected);
        updateStats(root, ranger, limits, selected);
      });
      updateStats(root, ranger, limits, level);
    }
  }

  const root = document.getElementById("rangerModalContent");
  if (!root) return;
  loadRangerMap();
  new MutationObserver(() => window.setTimeout(mountLevelControl, 0))
    .observe(root, { childList: true });
  mountLevelControl();
})();
