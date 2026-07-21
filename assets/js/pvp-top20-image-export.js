(() => {
  const ADMIN_MODE_KEY = "rangerbook-admin-mode";
  const DATA_URL = "https://pvp-data.warmycat.com/usage.json";
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;
  const COLUMNS = 4;
  const ROWS_PER_COLUMN = 5;
  const TOP_COUNT = COLUMNS * ROWS_PER_COLUMN;
  const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", "Microsoft JhengHei", sans-serif';

  const actions = document.getElementById("pvpAdminExportActions");
  const button = document.getElementById("downloadPvpTop20ImageBtn");
  if (!actions || !button) return;

  if (localStorage.getItem(ADMIN_MODE_KEY) !== "true") return;
  actions.hidden = false;

  const numberFormat = new Intl.NumberFormat("zh-Hant");

  function loadImage(src) {
    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });
  }

  function roundRectPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawImageContain(ctx, image, x, y, width, height) {
    if (!image || !image.naturalWidth || !image.naturalHeight) return;
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const drawX = x + (width - drawWidth) / 2;
    const drawY = y + (height - drawHeight) / 2;
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  }

  function setFittedText(ctx, text, maxWidth, startSize, minSize = 20) {
    let size = startSize;
    while (size > minSize) {
      ctx.font = `800 ${size}px ${FONT_FAMILY}`;
      if (ctx.measureText(text).width <= maxWidth) return text;
      size -= 1;
    }

    ctx.font = `800 ${minSize}px ${FONT_FAMILY}`;
    if (ctx.measureText(text).width <= maxWidth) return text;

    let output = text;
    while (output.length > 1 && ctx.measureText(`${output}…`).width > maxWidth) {
      output = output.slice(0, -1);
    }
    return `${output}…`;
  }

  async function buildCanvas(rangers) {
    const width = 1600;
    const height = 1100;
    const outer = 54;
    const gapX = 24;
    const gapY = 18;
    const cellWidth = (width - outer * 2 - gapX * (COLUMNS - 1)) / COLUMNS;
    const cellHeight = (height - outer * 2 - gapY * (ROWS_PER_COLUMN - 1)) / ROWS_PER_COLUMN;
    const imageBoxSize = 126;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);

    const imageEntries = await Promise.all(
      rangers.map(async (row) => {
        const id = String(row.rangerId || row.unitCode || "");
        return [id, await loadImage(RANGER_IMAGE(id))];
      })
    );
    const images = new Map(imageEntries);

    rangers.forEach((row, index) => {
      const column = Math.floor(index / ROWS_PER_COLUMN);
      const rowIndex = index % ROWS_PER_COLUMN;
      const x = outer + column * (cellWidth + gapX);
      const y = outer + rowIndex * (cellHeight + gapY);

      roundRectPath(ctx, x, y, cellWidth, cellHeight, 24);
      ctx.fillStyle = "#172033";
      ctx.fill();
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 2;
      ctx.stroke();

      const rankWidth = 58;
      const rankHeight = 32;
      const rankX = x + 16;
      const rankY = y + 14;
      roundRectPath(ctx, rankX, rankY, rankWidth, rankHeight, 16);
      ctx.fillStyle = "#294a78";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 18px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`#${index + 1}`, rankX + rankWidth / 2, rankY + rankHeight / 2);
      ctx.textAlign = "left";

      const id = String(row.rangerId || row.unitCode || "");
      const image = images.get(id);
      const imageX = x + 22;
      const imageY = y + 54;
      const imageHeight = cellHeight - 70;

      roundRectPath(ctx, imageX, imageY, imageBoxSize, imageHeight, 20);
      ctx.fillStyle = "#111827";
      ctx.fill();

      if (image) {
        ctx.save();
        roundRectPath(ctx, imageX, imageY, imageBoxSize, imageHeight, 20);
        ctx.clip();
        drawImageContain(ctx, image, imageX + 6, imageY + 6, imageBoxSize - 12, imageHeight - 12);
        ctx.restore();
      }

      const copyX = imageX + imageBoxSize + 20;
      const copyWidth = cellWidth - (copyX - x) - 20;
      const name = String(row.name || id || "-");
      const count = Number(row.playerCount) || 0;

      ctx.fillStyle = "#f8fafc";
      const displayName = setFittedText(ctx, name, copyWidth, 28, 20);
      ctx.textBaseline = "middle";
      ctx.fillText(displayName, copyX, y + cellHeight * 0.45);

      ctx.fillStyle = "#93c5fd";
      ctx.font = `800 28px ${FONT_FAMILY}`;
      ctx.fillText(`${numberFormat.format(count)} 人`, copyX, y + cellHeight * 0.69);
    });

    return canvas;
  }

  async function exportImage() {
    const previousText = button.textContent;
    button.disabled = true;
    button.textContent = "產生圖片中…";

    try {
      const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const rangers = (Array.isArray(data.rangers) ? [...data.rangers] : [])
        .sort((a, b) => (Number(a.rank) || 999999) - (Number(b.rank) || 999999)
          || (Number(b.playerCount) || 0) - (Number(a.playerCount) || 0))
        .slice(0, TOP_COUNT);

      if (rangers.length < TOP_COUNT) {
        throw new Error(`角色資料不足：${rangers.length}/${TOP_COUNT}`);
      }

      const canvas = await buildCanvas(rangers);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("無法產生 PNG");

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pvp_legend_top20_rangers_${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error("PvP Top 20 image export failed:", error);
      alert("前 20 名角色圖片產生失敗，請重新整理後再試。");
    } finally {
      button.disabled = false;
      button.textContent = previousText;
    }
  }

  button.addEventListener("click", exportImage);
})();