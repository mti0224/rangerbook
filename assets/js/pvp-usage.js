(() => {
  const DATA_URL = "https://pvp-data.warmycat.com/usage.json";
  const ID_DICT_URL = "../../res/id_dict.json";
  const ABILITY_DATA_URL = "../../res/%E8%83%BD%E5%8A%9B.json";
  const REFRESH_MS = 60 * 60 * 1000;
  const OPTION_PAGE_SIZE = 5;
  const NONE_CODE = "__NONE__";
  const UNKNOWN_CODE = "__UNKNOWN__";
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
  const RANGER_DETAIL = (id) => `../../ranger/ranger/${encodeURIComponent(id)}`;
  const GEAR_ICON = (id) => `https://rangers.lerico.net/res/gear_icon/${encodeURIComponent(id)}_icon.png`;
  const ABILITY_ICON = (icon) => `https://rangers.lerico.net/res/ability_icon/${encodeURIComponent(icon)}`;
  const TALENT_ICON = (grade) => `../../assets/tlt_icon/tlt${encodeURIComponent(grade)}.png`;
  const SLOT_LABELS = {
    WEAPON: "武器",
    ARMOR: "防具",
    ACC: "飾品",
  };

  const elements = {
    updated: document.getElementById("pvpUsageUpdated"),
    league: document.getElementById("pvpUsageLeague"),
    sampleCount: document.getElementById("pvpUsageSampleCount"),
    rankingCount: document.getElementById("pvpUsageRankingCount"),
    status: document.getElementById("pvpUsageStatus"),
    body: document.getElementById("pvpUsageBody"),
    search: document.getElementById("pvpUsageSearch"),
    topN: document.getElementById("pvpUsageTopN"),
    type: document.getElementById("pvpUsageType"),
    element: document.getElementById("pvpUsageElement"),
    modal: document.getElementById("pvpUsageModal"),
    modalContent: document.getElementById("pvpUsageModalContent"),
    modalClose: document.getElementById("pvpUsageModalClose"),
  };

  let dataSet = {};
  let rows = [];
  let gearNameByCode = {};
  let abilityMap = {};
  const modalState = {
    rangerId: "",
    gearPages: { WEAPON: 0, ARMOR: 0, ACC: 0 },
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    return number.toLocaleString("zh-Hant", { maximumFractionDigits: 2 });
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("zh-Hant", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  }

  function fillSelect(select, values, firstLabel) {
    if (!select) return;
    const previous = select.value;
    const unique = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
    select.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>`
      + unique.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
    if (unique.includes(previous)) select.value = previous;
  }

  function renderRows() {
    if (!elements.body) return;
    const query = elements.search?.value.trim().toLowerCase() || "";
    const type = elements.type?.value || "";
    const element = elements.element?.value || "";

    const filtered = rows.filter((row) => {
      if (type && row.type !== type) return false;
      if (element && row.element !== element) return false;
      if (!query) return true;
      return [row.name, row.rangerId, row.star, row.type, row.element]
        .some((value) => String(value ?? "").toLowerCase().includes(query));
    });

    if (!filtered.length) {
      elements.body.innerHTML = `<tr class="pvp-empty-row"><td colspan="5">找不到符合條件的角色。</td></tr>`;
      return;
    }

    elements.body.innerHTML = filtered.map((row) => {
      const usageRate = Math.max(0, Math.min(100, Number(row.usageRate) || 0));
      const rank = Number(row.rank) || "-";
      return `
        <tr>
          <td class="pvp-rank-cell"><span class="pvp-rank-medal">${rank}</span></td>
          <td>
            <button class="pvp-ranger-main pvp-ranger-trigger" type="button" data-ranger-id="${escapeHtml(row.rangerId)}" aria-label="查看 ${escapeHtml(row.name || row.rangerId)} 的配裝、覺醒能力與才能解放狀態">
              <img class="pvp-ranger-thumb" src="${RANGER_IMAGE(row.rangerId)}" alt="" loading="lazy" onerror="this.remove();">
              <span>
                <span class="pvp-ranger-name">${escapeHtml(row.name || row.rangerId)}</span>
                <span class="pvp-ranger-sub">${escapeHtml([row.star, row.type, row.element].filter(Boolean).join(" · "))}</span>
              </span>
            </button>
          </td>
          <td>${escapeHtml(formatNumber(row.playerCount))}</td>
          <td class="pvp-usage-cell">
            <div class="pvp-usage-number"><strong>${escapeHtml(formatNumber(usageRate))}%</strong><span>${escapeHtml(formatNumber(row.playerCount))} 人</span></div>
            <div class="pvp-usage-bar" aria-hidden="true"><span style="--usage-rate:${usageRate}%"></span></div>
          </td>
          <td>${escapeHtml(formatNumber(row.appearanceCount))}</td>
        </tr>`;
    }).join("");
  }

  function renderMetadata(metadata) {
    if (elements.updated) elements.updated.textContent = formatDate(metadata.generatedAtUtc);
    if (elements.league) elements.league.textContent = metadata.league || "LEGEND";
    if (elements.sampleCount) elements.sampleCount.textContent = formatNumber(metadata.sampleCount);
    if (elements.rankingCount) elements.rankingCount.textContent = formatNumber(metadata.rankingCount);
  }

  function setStatus(message = "", error = false) {
    if (!elements.status) return;
    elements.status.hidden = !message;
    elements.status.classList.toggle("error", error);
    elements.status.textContent = message;
  }

  function applyScope() {
    const scopeKey = elements.topN?.value || "all";
    const baseMetadata = dataSet.metadata || {};

    if (scopeKey === "all") {
      rows = Array.isArray(dataSet.rangers) ? dataSet.rangers : [];
      renderMetadata(baseMetadata);
      setStatus();
    } else {
      const scope = dataSet.scopes?.[scopeKey];
      if (!scope || !Array.isArray(scope.rangers)) {
        rows = [];
        renderMetadata({
          ...baseMetadata,
          rankingCount: Number(scopeKey),
          sampleCount: 0,
        });
        setStatus("此前 N 名統計尚未產生，需等待下一次完整 PvP 資料更新。", true);
      } else {
        rows = scope.rangers;
        renderMetadata({
          ...baseMetadata,
          rankingCount: scope.rankingCount,
          sampleCount: scope.sampleCount,
          playerDataFailureCount: scope.playerDataFailureCount,
        });
        setStatus();
      }
    }

    fillSelect(elements.type, rows.map((row) => row.type), "全部類型");
    fillSelect(elements.element, rows.map((row) => row.element), "全部屬性");
    renderRows();
    closeModal();
  }

  function gearName(code) {
    if (code === NONE_CODE) return "未裝備";
    return gearNameByCode[code] || code;
  }

  function abilityInfo(code) {
    if (code === NONE_CODE) {
      return { name: "未設定覺醒能力", icon: "" };
    }
    const info = abilityMap[code] || {};
    return {
      name: info["名稱"] || code,
      icon: info.icon || "",
    };
  }

  function talentInfo(code) {
    if (code === UNKNOWN_CODE) return { name: "才能解放狀態無資料", icon: "", badge: "?" };
    const grade = Number(code);
    if (!Number.isInteger(grade) || grade < 0 || grade > 4) {
      return { name: `才能解放階段 ${code}`, icon: "", badge: String(code) };
    }
    return {
      name: grade === 0 ? "未解放才能" : `才能解放階段 ${grade}`,
      icon: TALENT_ICON(grade),
      badge: String(grade),
    };
  }

  function usageOptionList(items, kind) {
    if (!Array.isArray(items) || !items.length) {
      return `<div class="pvp-modal-empty">目前沒有可顯示的統計資料。</div>`;
    }

    return `<div class="pvp-option-list">${items.map((item) => {
      const code = String(item.code || NONE_CODE);
      const rate = Math.max(0, Math.min(100, Number(item.rate) || 0));
      const isNone = code === NONE_CODE;
      let name;
      let icon = "";
      let badge = "";

      if (kind === "ability") {
        const info = abilityInfo(code);
        name = info.name;
        if (info.icon) icon = ABILITY_ICON(info.icon);
      } else if (kind === "talent") {
        const info = talentInfo(code);
        name = info.name;
        icon = info.icon;
        badge = info.badge;
      } else {
        name = gearName(code);
        if (!isNone) icon = GEAR_ICON(code);
      }

      const iconHtml = icon
        ? `<img class="pvp-option-icon" src="${icon}" alt="" loading="lazy" onerror="this.remove();">`
        : `<span class="pvp-option-icon pvp-option-icon-empty${kind === "talent" ? " pvp-option-icon-talent" : ""}" aria-hidden="true">${escapeHtml(badge || "—")}</span>`;

      return `
        <div class="pvp-option-row">
          ${iconHtml}
          <div class="pvp-option-main">
            <div class="pvp-option-title">${escapeHtml(name)}</div>
            <div class="pvp-option-bar" aria-hidden="true"><span style="--option-rate:${rate}%"></span></div>
          </div>
          <div class="pvp-option-stats">
            <strong>${escapeHtml(formatNumber(rate))}%</strong>
            <span>${escapeHtml(formatNumber(item.count))} 次</span>
          </div>
        </div>`;
    }).join("")}</div>`;
  }

  function renderEquipmentCard(row, slot, label) {
    const items = Array.isArray(row.equipmentUsage?.[slot]) ? row.equipmentUsage[slot] : [];
    const totalPages = Math.max(1, Math.ceil(items.length / OPTION_PAGE_SIZE));
    const page = Math.max(0, Math.min(totalPages - 1, Number(modalState.gearPages[slot]) || 0));
    modalState.gearPages[slot] = page;
    const start = page * OPTION_PAGE_SIZE;
    const visibleItems = items.slice(start, start + OPTION_PAGE_SIZE);
    const pagination = totalPages > 1 ? `
      <div class="pvp-option-pagination" aria-label="${escapeHtml(label)}使用率分頁">
        <button type="button" data-gear-page-slot="${slot}" data-gear-page="${page - 1}" ${page <= 0 ? "disabled" : ""}>‹</button>
        <span>${page + 1} / ${totalPages}</span>
        <button type="button" data-gear-page-slot="${slot}" data-gear-page="${page + 1}" ${page >= totalPages - 1 ? "disabled" : ""}>›</button>
      </div>` : "";

    return `
      <section class="pvp-equipment-card" data-equipment-slot="${slot}">
        <h4>${escapeHtml(label)}</h4>
        ${usageOptionList(visibleItems, "gear")}
        ${pagination}
      </section>`;
  }

  function renderEquipment(row) {
    const equipment = row.equipmentUsage;
    if (!equipment || typeof equipment !== "object") {
      return `<div class="pvp-modal-empty">配裝統計尚未產生，需等待下一次完整 PvP 資料更新。</div>`;
    }

    return `<div class="pvp-equipment-grid">${Object.entries(SLOT_LABELS)
      .map(([slot, label]) => renderEquipmentCard(row, slot, label))
      .join("")}</div>`;
  }

  function openModal(row) {
    if (!elements.modal || !elements.modalContent || !row) return;
    modalState.rangerId = String(row.rangerId || "");
    modalState.gearPages = { WEAPON: 0, ARMOR: 0, ACC: 0 };
    const meta = [row.star, row.type, row.element].filter(Boolean).join(" · ");
    const awakening = Array.isArray(row.awakeningUsage)
      ? usageOptionList(row.awakeningUsage, "ability")
      : `<div class="pvp-modal-empty">覺醒能力統計尚未產生，需等待下一次完整 PvP 資料更新。</div>`;
    const talent = Array.isArray(row.talentUsage)
      ? usageOptionList(row.talentUsage, "talent")
      : `<div class="pvp-modal-empty">才能解放狀態尚未產生，需等待下一次完整 PvP 資料更新。</div>`;

    elements.modalContent.innerHTML = `
      <header class="pvp-modal-ranger-header">
        <img class="pvp-modal-ranger-image" src="${RANGER_IMAGE(row.rangerId)}" alt="" onerror="this.remove();">
        <div class="pvp-modal-ranger-copy">
          <p class="eyebrow">PvP 角色分析</p>
          <h2 id="pvpUsageModalTitle">${escapeHtml(row.name || row.rangerId)}</h2>
          <p>${escapeHtml(meta)}</p>
          <div class="pvp-modal-summary">
            <span><strong>${escapeHtml(formatNumber(row.usageRate))}%</strong> 使用率</span>
            <span><strong>${escapeHtml(formatNumber(row.playerCount))}</strong> 名玩家</span>
            <span><strong>${escapeHtml(formatNumber(row.appearanceCount))}</strong> 次出場</span>
          </div>
        </div>
        <a class="pvp-modal-detail-link" href="${RANGER_DETAIL(row.rangerId)}">查看角色詳細資料</a>
      </header>

      <section class="pvp-modal-section">
        <div class="pvp-modal-section-heading">
          <h3>配裝情況</h3>
        </div>
        ${renderEquipment(row)}
      </section>

      <section class="pvp-modal-section pvp-modal-section--no-divider">
        <div class="pvp-modal-section-heading">
          <h3>覺醒能力使用情況</h3>
          <p>顯示各覺醒能力在此角色出場資料中的使用比例。</p>
        </div>
        ${awakening}
      </section>

      <section class="pvp-modal-section">
        <div class="pvp-modal-section-heading">
          <h3>才能解放狀態</h3>
          <p>顯示各才能解放階段在此角色出場資料中的使用比例。</p>
        </div>
        ${talent}
      </section>`;

    elements.modal.hidden = false;
    document.body.classList.add("modal-open");
    elements.modalClose?.focus();
  }

  function closeModal() {
    if (!elements.modal || elements.modal.hidden) return;
    elements.modal.hidden = true;
    document.body.classList.remove("modal-open");
    modalState.rangerId = "";
  }

  async function optionalJson(url) {
    try {
      const response = await fetch(url);
      return response.ok ? await response.json() : {};
    } catch {
      return {};
    }
  }

  async function load() {
    setStatus("角色使用率資料載入中…");
    try {
      const [response, idDict, abilities] = await Promise.all([
        fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" }),
        optionalJson(ID_DICT_URL),
        optionalJson(ABILITY_DATA_URL),
      ]);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      dataSet = await response.json();
      gearNameByCode = Object.fromEntries(
        Object.entries(idDict || {}).map(([name, code]) => [String(code), String(name)])
      );
      abilityMap = abilities && typeof abilities === "object" ? abilities : {};
      applyScope();
    } catch (error) {
      console.error("PvP usage load failed", error);
      setStatus("角色使用率資料尚未產生或目前無法載入。", true);
      if (elements.body) elements.body.innerHTML = "";
    }
  }

  [elements.search, elements.type, elements.element].forEach((element) => {
    element?.addEventListener("input", renderRows);
    element?.addEventListener("change", renderRows);
  });

  elements.topN?.addEventListener("change", applyScope);

  elements.body?.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-ranger-id]");
    if (!trigger) return;
    const row = rows.find((item) => String(item.rangerId) === trigger.dataset.rangerId);
    openModal(row);
  });

  elements.modalContent?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-gear-page-slot]");
    if (!button || button.disabled) return;
    const slot = button.dataset.gearPageSlot;
    const nextPage = Number(button.dataset.gearPage);
    if (!(slot in SLOT_LABELS) || !Number.isFinite(nextPage)) return;
    const row = rows.find((item) => String(item.rangerId) === modalState.rangerId);
    if (!row) return;
    modalState.gearPages[slot] = nextPage;
    const card = elements.modalContent.querySelector(`[data-equipment-slot="${slot}"]`);
    if (card) card.outerHTML = renderEquipmentCard(row, slot, SLOT_LABELS[slot]);
  });

  elements.modalClose?.addEventListener("click", closeModal);
  elements.modal?.addEventListener("click", (event) => {
    if (event.target.closest("[data-pvp-modal-close]")) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  load();
  window.setInterval(load, REFRESH_MS);
})();
