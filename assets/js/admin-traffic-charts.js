(() => {
  "use strict";
  // Self-contained SVG charts: no third-party scripts or extra requests.
  const ui = value => window.RangerbookI18n?.uiText(String(value)) || String(value);
  const f = (key,args,fallback) => window.RangerbookI18n?.format(key,args,fallback) || fallback;
  const views = value => f("traffic.viewCount",[format(value)],format(value)+" 次瀏覽");
  const sessions = value => f("traffic.sessionCount",[format(value)],format(value)+" 次工作階段");
  const NS = "http://www.w3.org/2000/svg";
  const colors = ["#2563eb", "#16a34a", "#9333ea", "#ea580c", "#db2777", "#0891b2", "#ca8a04", "#64748b"];
  const format = n => Number(n).toLocaleString("zh-TW");
  const node = (name, attrs = {}, value) => {
    const element = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([key, content]) => element.setAttribute(key, String(content)));
    if (value !== undefined) element.textContent = String(value);
    return element;
  };
  const empty = (container, message) => {
    container.replaceChildren();
    const p = document.createElement("p");
    p.className = "admin-muted traffic-chart-empty";
    p.textContent = message;
    container.append(p);
  };
  const validRows = (rows, key) => (Array.isArray(rows) ? rows : [])
    .map(item => ({ label: String(item?.[key] ?? ""), value: Number(item?.views ?? 0) }))
    .filter(item => item.label && Number.isFinite(item.value) && item.value >= 0);
  function niceStep(max) {
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, max / 4))));
    const unit = max / 4 / magnitude;
    return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * magnitude;
  }

  function renderDaily(container, rows) {
    if (!container) return;
    const points = validRows(rows, "date").sort((a, b) => a.label.localeCompare(b.label));
    if (!points.length) return empty(container, "這個日期範圍尚無每日瀏覽資料");
    const width = 820, height = 320;
    const left = 66, right = 22, top = 22, bottom = 58;
    const plotW = width - left - right, plotH = height - top - bottom;
    const step = niceStep(Math.max(...points.map(p => p.value)));
    const limit = Math.max(step * 4, Math.ceil(Math.max(...points.map(p => p.value)) / step) * step);
    const x = index => left + (points.length === 1 ? plotW / 2 : index * plotW / (points.length - 1));
    const y = value => top + plotH * (1 - value / limit);
    const wrapper = document.createElement("div");
    wrapper.className = "traffic-line-interactive";
    const svg = node("svg", {
      class: "traffic-line-svg", viewBox: "0 0 " + width + " " + height,
      role: "img", "aria-label": f("traffic.dailyChart",[points.length],"每日瀏覽次數折線圖，共 " + points.length + " 天"),
      preserveAspectRatio: "xMidYMid meet"
    });
    svg.append(node("title", {}, ui("每日瀏覽次數趨勢")));
    for (let i = 0; i <= 4; i++) {
      const value = limit * i / 4;
      const position = y(value);
      svg.append(node("line", { x1: left, x2: width - right, y1: position, y2: position, class: "traffic-chart-gridline" }));
      svg.append(node("text", { x: left - 12, y: position + 5, "text-anchor": "end", class: "traffic-chart-axis-label" }, format(value)));
    }
    const tickCount = Math.min(7, points.length);
    const ticks = new Set(Array.from({ length: tickCount }, (_, i) =>
      Math.round(i * (points.length - 1) / Math.max(1, tickCount - 1))));
    for (const i of ticks) {
      svg.append(node("text", { x: x(i), y: height - 22, "text-anchor": "middle", class: "traffic-chart-axis-label" },
        points[i].label.slice(5).replace("-", "/")));
    }
    svg.append(node("path", {
      d: points.map((point, i) => (i ? "L" : "M") + x(i).toFixed(2) + " " + y(point.value).toFixed(2)).join(" "),
      class: "traffic-chart-line", fill: "none"
    }));
    const crosshair = node("line", {
      class: "traffic-chart-crosshair", x1: 0, x2: 0, y1: top, y2: top + plotH,
      visibility: "hidden"
    });
    const highlighted = node("circle", {
      class: "traffic-chart-active-point", cx: 0, cy: 0, r: 7, visibility: "hidden"
    });
    svg.append(crosshair, highlighted);
    points.forEach((point, i) => {
      const marker = node("circle", {
        cx: x(i).toFixed(2), cy: y(point.value).toFixed(2), r: points.length > 35 ? 2.8 : 4,
        class: "traffic-chart-point", tabindex: "0",
        "aria-label": point.label + " · " + views(point.value)
      });
      marker.append(node("title", {}, point.label + ": " + views(point.value)));
      marker.addEventListener("focus", () => showPoint(i));
      marker.addEventListener("blur", hidePoint);
      svg.append(marker);
    });
    const tooltip = document.createElement("div");
    tooltip.className = "traffic-line-tooltip";
    tooltip.hidden = true;
    tooltip.setAttribute("aria-hidden", "true");
    const tooltipDate = document.createElement("span");
    tooltipDate.className = "traffic-line-tooltip-date";
    const tooltipValue = document.createElement("strong");
    tooltipValue.className = "traffic-line-tooltip-value";
    tooltip.append(tooltipDate, tooltipValue);

    function showPoint(i) {
      const point = points[i];
      if (!point) return;
      const px = x(i);
      crosshair.setAttribute("x1", px);
      crosshair.setAttribute("x2", px);
      crosshair.setAttribute("visibility", "visible");
      highlighted.setAttribute("cx", px);
      highlighted.setAttribute("cy", y(point.value));
      highlighted.setAttribute("visibility", "visible");
      tooltipDate.textContent = point.label;
      tooltipValue.textContent = views(point.value);
      tooltip.hidden = false;
      const scaledWidth = wrapper.getBoundingClientRect().width;
      const factor = scaledWidth / width;
      const tipWidth = tooltip.offsetWidth || 160;
      const leftPx = Math.min(Math.max(px * factor - tipWidth / 2, 4), scaledWidth - tipWidth - 4);
      tooltip.style.left = Math.max(4, leftPx) + "px";
      tooltip.style.top = Math.max(4, y(point.value) * factor - tooltip.offsetHeight - 15) + "px";
    }
    function hidePoint() {
      crosshair.setAttribute("visibility", "hidden");
      highlighted.setAttribute("visibility", "hidden");
      tooltip.hidden = true;
    }
    svg.addEventListener("pointermove", event => {
      if (event.pointerType === "touch") return;
      const bounds = svg.getBoundingClientRect();
      if (!bounds.width) return;
      const position = (event.clientX - bounds.left) / bounds.width * width;
      const index = points.length === 1 ? 0 :
        Math.max(0, Math.min(points.length - 1,
          Math.round((position - left) / plotW * (points.length - 1))));
      showPoint(index);
    });
    svg.addEventListener("pointerleave", hidePoint);
    wrapper.append(svg, tooltip);
    container.replaceChildren(wrapper);
  }

  function renderSources(container, rows) {
    if (!container) return;
    const sources = (Array.isArray(rows) ? rows : [])
      .map(item => ({ label: String(item?.source ?? ""), value: Number(item?.sessions ?? 0) }))
      .filter(item => item.label && Number.isFinite(item.value) && item.value > 0)
      .sort((a, b) => b.value - a.value);
    if (!sources.length) return empty(container, "這個日期範圍尚無流量來源資料");
    const items = sources.slice(0, 7);
    if (sources.length > 7) {
      const extra = sources.slice(7).reduce((sum, item) => sum + item.value, 0);
      if (extra) items.push({ label: "其他", value: extra });
    }
    const total = items.reduce((sum, item) => sum + item.value, 0);
    const wrapper = document.createElement("div");
    wrapper.className = "traffic-pie-layout";
    const svg = node("svg", {
      class: "traffic-pie-svg", viewBox: "0 0 280 280", role: "img",
      "aria-label": f("traffic.sourceChart",[items.length,format(total)],"流量來源圓餅圖，共 " + items.length + " 個分類，" + format(total) + " 個工作階段")
    });
    svg.append(node("title", {}, ui("流量來源佔比")));
    let current = -Math.PI / 2;
    items.forEach((item, i) => {
      const fraction = item.value / total;
      const next = current + Math.PI * 2 * fraction;
      let shape;
      if (items.length === 1) {
        shape = node("circle", { cx: 140, cy: 140, r: 115, fill: colors[i] });
      } else {
        const cx = 140, cy = 140, r = 115;
        const startX = cx + r * Math.cos(current), startY = cy + r * Math.sin(current);
        const endX = cx + r * Math.cos(next), endY = cy + r * Math.sin(next);
        const d = "M " + cx + " " + cy + " L " + startX.toFixed(3) + " " + startY.toFixed(3) +
          " A " + r + " " + r + " 0 " + (fraction > 0.5 ? 1 : 0) + " 1 " +
          endX.toFixed(3) + " " + endY.toFixed(3) + " Z";
        shape = node("path", { d, fill: colors[i] });
      }
      shape.classList.add("traffic-pie-slice");
      shape.append(node("title", {}, ui(item.label) + ": " + sessions(item.value) + " (" +
        (fraction * 100).toFixed(1) + "%)"));
      svg.append(shape);
      current = next;
    });
    wrapper.append(svg);
    const legend = document.createElement("ul");
    legend.className = "traffic-pie-legend";
    items.forEach((item, i) => {
      const line = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = "traffic-pie-swatch";
      swatch.style.backgroundColor = colors[i];
      const name = document.createElement("span");
      name.className = "traffic-pie-name";
      name.textContent = ui(item.label);
      const count = document.createElement("strong");
      count.textContent = (100 * item.value / total).toFixed(1) + "%";
      const detail = document.createElement("small");
      detail.textContent = sessions(item.value);
      line.append(swatch, name, count, detail);
      legend.append(line);
    });
    wrapper.append(legend);
    container.replaceChildren(wrapper);
  }
  window.RangerbookTrafficCharts = { renderDaily, renderSources };
})();
