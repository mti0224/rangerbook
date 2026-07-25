(() => {
  const INDEX_URL = "https://pvp-data.warmycat.com/history/index.json";
  const BASE_URL = "https://pvp-data.warmycat.com/history/";
  const ID_DICT_URL = "../../res/id_dict.json";
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
  const MAX_SELECTED = 5;
  const SERIES_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c"];

  const el = {
    scope: document.getElementById("pvpHistoryScope"),
    range: document.getElementById("pvpHistoryRange"),
    search: document.getElementById("pvpHistorySearch"),
    ranger: document.getElementById("pvpHistoryRanger"),
    add: document.getElementById("pvpHistoryAdd"),
    selected: document.getElementById("pvpHistorySelected"),
    status: document.getElementById("pvpHistoryStatus"),
    updated: document.getElementById("pvpHistoryUpdated"),
    canvas: document.getElementById("pvpHistoryChart"),
    tooltip: document.getElementById("pvpHistoryTooltip"),
  };

  let snapshots = [];
  let rangerNames = {};
  let rangerOptions = [];
  let selectedIds = [];
  let pointsBySeries = [];

  function setStatus(message = "", error = false) {
    el.status.hidden = !message;
    el.status.textContent = message;
    el.status.classList.toggle("error", error);
  }

  function rangerName(id) {
    const value = rangerNames[id];
    if (typeof value === "string") return value;
    if (value && typeof value === "object") return value.name || value["名稱"] || id;
    return id;
  }

  function normalizeSnapshot(raw) {
    return {
      date: String(raw.date || ""),
      sourceGeneratedAtUtc: raw.sourceGeneratedAtUtc || "",
      snapshotCreatedAtUtc: raw.snapshotCreatedAtUtc || "",
      scopes: raw.scopes || {},
    };
  }

  async function fetchJson(url) {
    const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  }

  async function loadHistory() {
    const [index, dict] = await Promise.all([
      fetchJson(INDEX_URL),
      fetchJson(ID_DICT_URL).catch(() => ({})),
    ]);
    rangerNames = dict || {};
    const files = Array.isArray(index.files) ? index.files : [];
    if (!files.length) {
      snapshots = [];
      setStatus("尚未建立任何每日歷史快照。");
      drawChart();
      return;
    }

    const monthly = await Promise.all(files.map((file) => fetchJson(BASE_URL + encodeURIComponent(file))));
    snapshots = monthly.flatMap((data) => Array.isArray(data.snapshots) ? data.snapshots : [])
      .map(normalizeSnapshot)
      .filter((item) => item.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    const ids = new Set();
    for (const snap of snapshots) {
      for (const scope of Object.values(snap.scopes || {})) {
        Object.keys(scope?.rangers || {}).forEach((id) => ids.add(id));
      }
    }

    rangerOptions = [...ids].map((id) => ({ id, name: rangerName(id) }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));

    const latest = snapshots.at(-1);
    el.updated.textContent = latest ? `最新快照：${latest.date}` : "-";

    if (!selectedIds.length) {
      const scope = latest?.scopes?.all;
      selectedIds = Object.entries(scope?.rangers || {})
        .sort((a, b) => Number(b[1]?.appearanceCount || 0) - Number(a[1]?.appearanceCount || 0))
        .slice(0, 3)
        .map(([id]) => id);
    }

    filterOptions();
    render();
  }

  function filterOptions() {
    const query = el.search.value.trim().toLowerCase();
    const items = rangerOptions.filter((item) =>
      !selectedIds.includes(item.id)
      && (!query || item.id.toLowerCase().includes(query) || item.name.toLowerCase().includes(query))
    ).slice(0, 100);

    el.ranger.innerHTML = items.length
      ? items.map((item) => `<option value="${item.id}">${item.name} (${item.id})</option>`).join("")
      : `<option value="">找不到角色</option>`;
  }

  function visibleSnapshots() {
    const count = el.range.value === "all" ? snapshots.length : Number(el.range.value);
    return snapshots.slice(Math.max(0, snapshots.length - count));
  }

  function renderChips() {
    el.selected.innerHTML = selectedIds.map((id, index) => `
      <span class="pvp-history-chip" style="border-left:5px solid ${SERIES_COLORS[index]}">
        <img src="${RANGER_IMAGE(id)}" alt="" loading="lazy" onerror="this.remove()">
        <span>${rangerName(id)}</span>
        <button type="button" data-remove-id="${id}" aria-label="移除 ${rangerName(id)}">×</button>
      </span>`).join("");
  }

  function drawChart() {
    const canvas = el.canvas;
    const wrap = canvas.parentElement;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(320, wrap.clientWidth);
    const height = Math.max(300, wrap.clientHeight);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const data = visibleSnapshots();
    const scopeKey = el.scope.value;
    const margins = { left: 58, right: 20, top: 24, bottom: 54 };
    const plotWidth = width - margins.left - margins.right;
    const plotHeight = height - margins.top - margins.bottom;
    const values = [];

    for (const id of selectedIds) {
      for (const snap of data) {
        const row = snap.scopes?.[scopeKey]?.rangers?.[id];
        if (row && Number.isFinite(Number(row.appearanceCount))) values.push(Number(row.appearanceCount));
      }
    }

    const maxValue = Math.max(5, ...values);
    const roundedMax = Math.ceil(maxValue / 5) * 5;
    const xFor = (index) => margins.left + (data.length <= 1 ? plotWidth / 2 : index * plotWidth / (data.length - 1));
    const yFor = (value) => margins.top + plotHeight - (value / roundedMax) * plotHeight;

    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue("--text-color").trim() || "#27313a";
    const gridColor = styles.getPropertyValue("--border-color").trim() || "#dfe3e8";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = textColor;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;

    for (let index = 0; index <= 5; index += 1) {
      const y = margins.top + plotHeight * index / 5;
      const value = Math.round(roundedMax * (1 - index / 5));
      ctx.beginPath();
      ctx.moveTo(margins.left, y);
      ctx.lineTo(width - margins.right, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(String(value), margins.left - 9, y);
    }

    const tickEvery = Math.max(1, Math.ceil(data.length / Math.max(4, Math.floor(plotWidth / 80))));
    data.forEach((snap, index) => {
      if (index % tickEvery !== 0 && index !== data.length - 1) return;
      const x = xFor(index);
      ctx.save();
      ctx.translate(x, height - margins.bottom + 18);
      ctx.rotate(-0.45);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(snap.date.slice(5), 0, 0);
      ctx.restore();
    });

    pointsBySeries = [];
    selectedIds.forEach((id, seriesIndex) => {
      const color = SERIES_COLORS[seriesIndex];
      const points = data.map((snap, index) => {
        const scope = snap.scopes?.[scopeKey];
        const row = scope?.rangers?.[id];
        const value = row && Number.isFinite(Number(row.appearanceCount)) ? Number(row.appearanceCount) : null;
        return {
          x: xFor(index),
          y: value === null ? null : yFor(value),
          value,
          date: snap.date,
          sampleCount: scope?.sampleCount ?? null,
        };
      });

      pointsBySeries.push({ id, points, color });
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2.5;
      let drawing = false;
      ctx.beginPath();
      for (const point of points) {
        if (point.y === null) {
          drawing = false;
          continue;
        }
        if (!drawing) {
          ctx.moveTo(point.x, point.y);
          drawing = true;
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }
      ctx.stroke();

      for (const point of points) {
        if (point.y === null) continue;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    if (!data.length || !selectedIds.length) {
      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.font = "15px system-ui, sans-serif";
      ctx.fillText(!data.length ? "尚無歷史資料" : "請加入至少一名角色", width / 2, height / 2);
    }
  }

  function render() {
    renderChips();
    drawChart();
    if (snapshots.length) setStatus();
  }

  function showTooltip(event) {
    const rect = el.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let nearest = null;

    for (const series of pointsBySeries) {
      for (const point of series.points) {
        if (point.y === null) continue;
        const distance = Math.hypot(point.x - x, point.y - y);
        if (distance <= 16 && (!nearest || distance < nearest.distance)) {
          nearest = { ...point, id: series.id, distance };
        }
      }
    }

    if (!nearest) {
      el.tooltip.hidden = true;
      return;
    }

    el.tooltip.innerHTML = `<strong>${rangerName(nearest.id)}</strong><br>${nearest.date}<br>使用次數：${nearest.value}<br>有效樣本：${nearest.sampleCount ?? "-"}`;
    el.tooltip.hidden = false;
    el.tooltip.style.left = `${Math.min(rect.width - 270, Math.max(4, nearest.x + 12))}px`;
    el.tooltip.style.top = `${Math.max(4, nearest.y - 70)}px`;
  }

  el.add.addEventListener("click", () => {
    const id = el.ranger.value;
    if (!id || selectedIds.includes(id)) return;
    if (selectedIds.length >= MAX_SELECTED) {
      setStatus(`最多同時比較 ${MAX_SELECTED} 名角色。`, true);
      return;
    }
    selectedIds.push(id);
    filterOptions();
    render();
  });

  el.search.addEventListener("input", filterOptions);
  el.scope.addEventListener("change", render);
  el.range.addEventListener("change", render);
  el.selected.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-id]");
    if (!button) return;
    selectedIds = selectedIds.filter((id) => id !== button.dataset.removeId);
    filterOptions();
    render();
  });
  el.canvas.addEventListener("mousemove", showTooltip);
  el.canvas.addEventListener("mouseleave", () => { el.tooltip.hidden = true; });
  window.addEventListener("resize", () => requestAnimationFrame(drawChart));

  loadHistory().catch((error) => {
    console.error(error);
    setStatus(`無法載入歷史資料：${error.message}`, true);
    drawChart();
  });
})();
