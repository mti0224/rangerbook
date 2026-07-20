(() => {
  const isGuildWar = Boolean(document.getElementById("guildUsageModal"));
  const modalContent = document.getElementById(isGuildWar ? "guildUsageModalContent" : "pvpUsageModalContent");
  if (!modalContent) return;

  const DATA_URL = isGuildWar
    ? "https://pvp-data.warmycat.com/guildwar_usage.json"
    : "https://pvp-data.warmycat.com/usage.json";
  const ID_DICT_URL = "../../res/id_dict.json";
  const GEAR_ICON = (id) => `https://rangers.lerico.net/res/gear_icon/${encodeURIComponent(id)}_icon.png`;
  const PAGE_SIZE = 5;
  const NONE_CODE = "__NONE__";

  let dataSet = {};
  let gearNames = {};
  let currentRangerId = "";
  let currentPage = 0;
  let renderQueued = false;

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const num = (value) => Number.isFinite(Number(value))
    ? Number(value).toLocaleString("zh-Hant", { maximumFractionDigits: 2 })
    : "-";

  function gearCode(value) {
    if (value == null || value === "") return NONE_CODE;
    if (typeof value === "object") {
      return String(value.equipItemCode || value.itemCode || value.code || NONE_CODE);
    }
    return String(value);
  }

  function comboSlot(item, slot) {
    const lower = slot.toLowerCase();
    return gearCode(
      item?.[slot]
      ?? item?.[lower]
      ?? item?.[`${lower}Code`]
      ?? item?.equipment?.[slot]
      ?? item?.combination?.[slot]
    );
  }

  function gearName(code) {
    if (!code || code === NONE_CODE) return "未裝備";
    return gearNames[code] || code;
  }

  function findCurrentRow(rangerId) {
    if (!rangerId) return null;
    let rows = [];

    if (isGuildWar) {
      const scopeKey = document.getElementById("guildUsageScope")?.value || "50";
      rows = dataSet.scopes?.[scopeKey]?.rangers || (scopeKey === "50" ? dataSet.rangers || [] : []);
    } else {
      const scopeKey = document.getElementById("pvpUsageTopN")?.value || "all";
      rows = scopeKey === "all" ? (dataSet.rangers || []) : (dataSet.scopes?.[scopeKey]?.rangers || []);
    }

    return rows.find((row) => String(row.rangerId || row.unitCode || "") === String(rangerId)) || null;
  }

  function normalizeCombinations(row) {
    const source = Array.isArray(row?.equipmentCombinationUsage) ? row.equipmentCombinationUsage : [];
    return source.map((item) => {
      const count = Number(item.count) || 0;
      const denominator = Number(row?.appearanceCount) || 0;
      const rate = Number.isFinite(Number(item.rate))
        ? Number(item.rate)
        : (denominator > 0 ? Math.round(count * 10000 / denominator) / 100 : 0);
      return {
        weapon: comboSlot(item, "WEAPON"),
        armor: comboSlot(item, "ARMOR"),
        acc: comboSlot(item, "ACC"),
        count,
        rate,
      };
    }).sort((a, b) => b.count - a.count || b.rate - a.rate || `${a.weapon}|${a.armor}|${a.acc}`.localeCompare(`${b.weapon}|${b.armor}|${b.acc}`));
  }

  function gearChip(code, label) {
    const name = gearName(code);
    const icon = code && code !== NONE_CODE
      ? `<img class="pvp-combo-gear-icon" src="${GEAR_ICON(code)}" alt="" loading="lazy" onerror="this.remove();">`
      : `<span class="pvp-combo-gear-icon pvp-combo-gear-empty" aria-hidden="true">—</span>`;
    return `<div class="pvp-combo-gear">${icon}<div><span>${esc(label)}</span><strong title="${esc(name)}">${esc(name)}</strong></div></div>`;
  }

  function renderSection(row) {
    const combinations = normalizeCombinations(row);
    const totalPages = Math.max(1, Math.ceil(combinations.length / PAGE_SIZE));
    currentPage = Math.max(0, Math.min(totalPages - 1, currentPage));
    const visible = combinations.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

    const body = combinations.length
      ? `<div class="pvp-combo-list">${visible.map((combo, index) => {
          const rank = currentPage * PAGE_SIZE + index + 1;
          return `<div class="pvp-combo-row">
            <span class="pvp-combo-rank">${rank}</span>
            <div class="pvp-combo-gears">
              ${gearChip(combo.weapon, "武器")}
              ${gearChip(combo.armor, "防具")}
              ${gearChip(combo.acc, "飾品")}
            </div>
            <div class="pvp-combo-stats"><strong>${esc(num(combo.rate))}%</strong><span>${esc(num(combo.count))} 次</span></div>
          </div>`;
        }).join("")}</div>`
      : `<div class="pvp-modal-empty">裝備組合統計尚未產生，需等待下一次完整${isGuildWar ? "公會戰" : " PvP"}資料更新。</div>`;

    const pagination = totalPages > 1
      ? `<div class="pvp-option-pagination pvp-combo-pagination">
          <button type="button" data-combo-page="${currentPage - 1}" ${currentPage <= 0 ? "disabled" : ""}>‹</button>
          <span>${currentPage + 1} / ${totalPages}</span>
          <button type="button" data-combo-page="${currentPage + 1}" ${currentPage >= totalPages - 1 ? "disabled" : ""}>›</button>
        </div>`
      : "";

    return `<section class="pvp-modal-section pvp-equipment-combination-section" data-equipment-combination-ranking>
      <div class="pvp-modal-section-heading"><h3>裝備組合排名</h3></div>
      ${body}${pagination}
    </section>`;
  }

  function rangerIdFromModal() {
    const href = modalContent.querySelector(".pvp-modal-detail-link")?.getAttribute("href") || "";
    const parts = href.split("/").filter(Boolean);
    return parts.length ? decodeURIComponent(parts[parts.length - 1]) : "";
  }

  function injectOrRefresh() {
    renderQueued = false;
    const rangerId = rangerIdFromModal();
    if (!rangerId) return;
    if (currentRangerId !== rangerId) {
      currentRangerId = rangerId;
      currentPage = 0;
    }
    const row = findCurrentRow(rangerId);
    if (!row) return;

    const html = renderSection(row);
    const existing = modalContent.querySelector("[data-equipment-combination-ranking]");
    if (existing) {
      existing.outerHTML = html;
      return;
    }

    const equipmentSection = [...modalContent.querySelectorAll(".pvp-modal-section")]
      .find((section) => section.querySelector("h3")?.textContent?.trim() === "配裝情況");
    if (equipmentSection) equipmentSection.insertAdjacentHTML("afterend", html);
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(injectOrRefresh);
  }

  modalContent.addEventListener("click", (event) => {
    const button = event.target.closest("[data-combo-page]");
    if (!button || button.disabled) return;
    const next = Number(button.dataset.comboPage);
    if (!Number.isFinite(next)) return;
    currentPage = next;
    injectOrRefresh();
  });

  new MutationObserver(queueRender).observe(modalContent, { childList: true, subtree: true });

  Promise.all([
    fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" }).then((res) => res.ok ? res.json() : {}),
    fetch(ID_DICT_URL).then((res) => res.ok ? res.json() : {}).catch(() => ({})),
  ]).then(([data, idDict]) => {
    dataSet = data && typeof data === "object" ? data : {};
    gearNames = Object.fromEntries(Object.entries(idDict || {}).map(([name, code]) => [String(code), String(name)]));
    queueRender();
  }).catch(() => {});
})();
