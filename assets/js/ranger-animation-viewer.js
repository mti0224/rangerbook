(() => {
  const INDEX_URL = "../res/animation_meta/index.json";
  const RESOURCE_PRIMARY_BASE = "https://rangerbook.warmycat.com/";
  const RESOURCE_FALLBACK_BASE = "https://rangers.lerico.net/res/";
  const DEFAULT_BODY_OFFSET_X = -130;
  const DEFAULT_BODY_OFFSET_Y = -88;

  const state = {
    indexPromise: null,
    metaCache: new Map(),
    imageCache: new Map(),
    rafId: 0,
    playing: false,
    startedAt: 0,
    activeCanvas: null,
    activeContext: null,
    activeMeta: null,
    activePart: "body",
    activeAnim: "_all",
    activeFrame: 0,
    zoom: 1,
  };

  function text(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function escapeHtml(value) {
    return text(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function rootPrefix() {
    return window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  }

  function absoluteSiteUrl(path) {
    return `${window.location.origin}${rootPrefix()}${String(path || "").replace(/^\/+/, "")}`;
  }

  function resourceUrl(path) {
    return `${RESOURCE_PRIMARY_BASE}${String(path || "").replace(/^\/+/, "")}`;
  }

  function legacyResourceUrl(path) {
    const normalized = String(path || "").replace(/^\/+/, "");
    if (!normalized.startsWith("res_from_emulator/")) return "";
    return RESOURCE_FALLBACK_BASE + normalized.slice("res_from_emulator/".length);
  }

  function loadIndex() {
    if (!state.indexPromise) {
      state.indexPromise = fetch(INDEX_URL)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .catch((error) => {
          console.warn("Animation metadata index is not available yet.", error);
          return null;
        });
    }
    return state.indexPromise;
  }

  async function loadMeta(unitId) {
    if (!unitId) return null;
    if (state.metaCache.has(unitId)) return state.metaCache.get(unitId);
    const index = await loadIndex();
    const entry = index?.units?.[unitId];
    if (!entry?.meta) return null;
    const meta = await fetch(`../${entry.meta}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .catch((error) => {
        console.warn(`Animation metadata failed: ${unitId}`, error);
        return null;
      });
    state.metaCache.set(unitId, meta);
    return meta;
  }

  function loadImage(path) {
    const key = path || "";
    if (state.imageCache.has(key)) return state.imageCache.get(key);
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      const fallback = legacyResourceUrl(path);
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => {
        if (fallback && img.src !== fallback) {
          img.src = fallback;
          return;
        }
        reject(new Error(`Image failed: ${path}`));
      };
      img.src = resourceUrl(path);
    }).catch((error) => {
      console.warn(error);
      return null;
    });
    state.imageCache.set(key, promise);
    return promise;
  }

  function inferUnitIdFromModal(modalContent) {
    const img = modalContent.querySelector(".ranger-detail-image");
    const src = img?.getAttribute("src") || img?.src || "";
    const match = src.match(/res(?:_from_emulator)?\/([^/]+)\//) || src.match(/\/([^/]+)\/[^/]+-thum/i);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function startupRows(meta) {
    const items = [
      ["普通攻擊", meta?.startup?.normal_attack],
      ["技能 1", meta?.startup?.skill_1],
      ["技能 2", meta?.startup?.skill_2],
    ];
    return items.map(([label, item]) => {
      const frames = Number(item?.frames || 0);
      const seconds = Number(item?.seconds || 0);
      const value = frames ? `${frames} 影格 / ${seconds.toFixed(3)} 秒` : "無資料";
      return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
    }).join("");
  }

  function animationOptions(meta) {
    const labels = {
      _all: "全部動畫",
      wait: "待機 wait",
      move: "移動 move",
      attack_ready: "普攻前搖 attack_ready",
      attack: "普攻 attack",
      attack_all: "普攻完整 attack_all",
      s_attack_ready: "技能1前搖 s_attack_ready",
      s_attack: "技能1 s_attack",
      s_attack_all: "技能1完整 s_attack_all",
      s2_attack_ready: "技能2前搖 s2_attack_ready",
      s2_attack: "技能2 s2_attack",
      s2_attack_all: "技能2完整 s2_attack_all",
      normal: "normal",
      finish: "finish",
    };
    const options = [];
    Object.entries(meta?.parts || {}).forEach(([partName, part]) => {
      Object.keys(part.animations || {}).forEach((animName) => {
        const label = `${partName}：${labels[animName] || animName}`;
        options.push(`<option value="${escapeHtml(`${partName}|${animName}`)}">${escapeHtml(label)}</option>`);
      });
    });
    return options.join("");
  }

  function renderPanel(unitId, meta) {
    return `
      <section class="detail-section ranger-animation-section" data-animation-unit-id="${escapeHtml(unitId)}">
        <h3>動畫與技能前搖</h3>
        <div class="ranger-animation-grid">
          <div class="ranger-animation-player">
            <canvas class="ranger-animation-canvas" width="640" height="360" aria-label="角色動畫預覽"></canvas>
            <div class="ranger-animation-controls">
              <label>
                <span>動畫</span>
                <select class="ranger-animation-select">${animationOptions(meta)}</select>
              </label>
              <button class="ranger-animation-play" type="button">播放</button>
              <button class="ranger-animation-prev" type="button">上一影格</button>
              <button class="ranger-animation-next" type="button">下一影格</button>
              <label>
                <span>縮放</span>
                <input class="ranger-animation-zoom" type="range" min="0.4" max="2.5" step="0.1" value="1">
              </label>
            </div>
            <p class="ranger-animation-frame-info">影格：-</p>
          </div>
          <div class="ranger-animation-startup">
            <h4>技能前搖資料</h4>
            <div class="table-scroll">
              <table class="skill-effect-table ranger-startup-table">
                <tbody>${startupRows(meta)}</tbody>
              </table>
            </div>
            <p class="ranger-animation-note">前搖以 body.sam 的 ready 段影格數除以原始 FPS 計算。</p>
          </div>
        </div>
      </section>
    `;
  }

  function fallbackMissingPanel(unitId) {
    return `
      <section class="detail-section ranger-animation-section" data-animation-unit-id="${escapeHtml(unitId)}">
        <h3>動畫與技能前搖</h3>
        <div class="empty-state small">尚未產生此角色的動畫 metadata。請確認 GitHub Actions 已完成 Build animation metadata。</div>
      </section>
    `;
  }

  function multiplyMatrix(a, b) {
    return [
      a[0] * b[0] + a[1] * b[2],
      a[0] * b[1] + a[1] * b[3],
      a[2] * b[0] + a[3] * b[2],
      a[2] * b[1] + a[3] * b[3],
      a[0] * b[4] + a[1] * b[5] + a[4],
      a[2] * b[4] + a[3] * b[5] + a[5],
    ];
  }

  async function drawFrame(canvas, meta, partName, animName, frameIndex) {
    const ctx = canvas.getContext("2d");
    const part = meta?.parts?.[partName];
    const anim = part?.animations?.[animName];
    if (!ctx || !part || !anim?.frames?.length) return;

    const img = await loadImage(part.png);
    if (!img) return;

    const width = canvas.width;
    const height = canvas.height;
    const zoom = state.zoom || 1;
    const originX = width * 0.5 + DEFAULT_BODY_OFFSET_X * zoom;
    const originY = height * 0.76 + DEFAULT_BODY_OFFSET_Y * zoom;
    const frame = anim.frames[frameIndex % anim.frames.length] || [];

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.04)";
    ctx.fillRect(0, height * 0.76, width, 1);
    ctx.restore();

    for (const item of frame) {
      const [, resNum, objectMatrix, color] = item;
      const imageDef = part.images?.[resNum];
      if (!imageDef) continue;
      const sprite = part.sprites?.[imageDef.name];
      if (!sprite) continue;
      const alpha = Array.isArray(color) ? Number(color[3] ?? 255) / 255 : 1;
      if (alpha <= 0) continue;

      const matrix = multiplyMatrix(objectMatrix, imageDef.m);
      const [sx, sy, sw, sh] = sprite.rect;
      const rotated = sprite.rotated;
      const drawW = rotated ? sh : sw;
      const drawH = rotated ? sw : sh;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(originX, originY);
      ctx.scale(zoom, zoom);
      ctx.transform(matrix[0], matrix[2], matrix[1], matrix[3], matrix[4], matrix[5]);

      if (rotated) {
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(img, sx, sy, sh, sw, -drawH / 2, -drawW / 2, drawH, drawW);
      } else {
        ctx.drawImage(img, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
      }
      ctx.restore();
    }
  }

  function stopPlayback() {
    state.playing = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = 0;
    document.querySelectorAll(".ranger-animation-play").forEach((button) => { button.textContent = "播放"; });
  }

  function updateFrameInfo(section, meta, partName, animName, frameIndex) {
    const anim = meta?.parts?.[partName]?.animations?.[animName];
    const info = section.querySelector(".ranger-animation-frame-info");
    if (!info || !anim) return;
    info.textContent = `影格：${frameIndex + 1} / ${anim.frame_count}　FPS：${meta.parts[partName].anim_rate}`;
  }

  function selectAnimation(section, value) {
    const [partName, animName] = value.split("|");
    state.activePart = partName || "body";
    state.activeAnim = animName || "_all";
    state.activeFrame = 0;
    state.startedAt = performance.now();
    stopPlayback();
    state.activeCanvas = section.querySelector(".ranger-animation-canvas");
    drawFrame(state.activeCanvas, state.activeMeta, state.activePart, state.activeAnim, state.activeFrame);
    updateFrameInfo(section, state.activeMeta, state.activePart, state.activeAnim, state.activeFrame);
  }

  function playLoop(section) {
    if (!state.playing || !state.activeCanvas || !state.activeMeta) return;
    const part = state.activeMeta.parts?.[state.activePart];
    const anim = part?.animations?.[state.activeAnim];
    if (!part || !anim?.frame_count) return;
    const elapsed = (performance.now() - state.startedAt) / 1000;
    state.activeFrame = Math.floor(elapsed * Math.max(1, part.anim_rate)) % anim.frame_count;
    drawFrame(state.activeCanvas, state.activeMeta, state.activePart, state.activeAnim, state.activeFrame);
    updateFrameInfo(section, state.activeMeta, state.activePart, state.activeAnim, state.activeFrame);
    state.rafId = requestAnimationFrame(() => playLoop(section));
  }

  function bindPanel(section, meta) {
    const select = section.querySelector(".ranger-animation-select");
    const play = section.querySelector(".ranger-animation-play");
    const prev = section.querySelector(".ranger-animation-prev");
    const next = section.querySelector(".ranger-animation-next");
    const zoom = section.querySelector(".ranger-animation-zoom");
    const canvas = section.querySelector(".ranger-animation-canvas");
    if (!select || !canvas) return;

    state.activeMeta = meta;
    state.activeCanvas = canvas;
    if (!select.value && select.options.length) select.selectedIndex = 0;
    selectAnimation(section, select.value);

    select.addEventListener("change", () => selectAnimation(section, select.value));
    zoom?.addEventListener("input", () => {
      state.zoom = Number(zoom.value) || 1;
      drawFrame(canvas, meta, state.activePart, state.activeAnim, state.activeFrame);
    });
    play?.addEventListener("click", () => {
      state.activeMeta = meta;
      state.activeCanvas = canvas;
      state.startedAt = performance.now() - (state.activeFrame / Math.max(1, meta.parts[state.activePart].anim_rate)) * 1000;
      state.playing = !state.playing;
      play.textContent = state.playing ? "暫停" : "播放";
      if (state.playing) playLoop(section);
      else stopPlayback();
    });
    prev?.addEventListener("click", () => {
      stopPlayback();
      const anim = meta.parts?.[state.activePart]?.animations?.[state.activeAnim];
      if (!anim?.frame_count) return;
      state.activeFrame = (state.activeFrame - 1 + anim.frame_count) % anim.frame_count;
      drawFrame(canvas, meta, state.activePart, state.activeAnim, state.activeFrame);
      updateFrameInfo(section, meta, state.activePart, state.activeAnim, state.activeFrame);
    });
    next?.addEventListener("click", () => {
      stopPlayback();
      const anim = meta.parts?.[state.activePart]?.animations?.[state.activeAnim];
      if (!anim?.frame_count) return;
      state.activeFrame = (state.activeFrame + 1) % anim.frame_count;
      drawFrame(canvas, meta, state.activePart, state.activeAnim, state.activeFrame);
      updateFrameInfo(section, meta, state.activePart, state.activeAnim, state.activeFrame);
    });
  }

  async function patchModal() {
    const modalContent = document.getElementById("rangerModalContent");
    if (!modalContent || !modalContent.children.length) return;
    const unitId = inferUnitIdFromModal(modalContent);
    if (!unitId || modalContent.querySelector(`.ranger-animation-section[data-animation-unit-id="${CSS.escape(unitId)}"]`)) return;

    const meta = await loadMeta(unitId);
    const sectionHtml = meta ? renderPanel(unitId, meta) : fallbackMissingPanel(unitId);
    modalContent.insertAdjacentHTML("beforeend", sectionHtml);
    const section = modalContent.querySelector(`.ranger-animation-section[data-animation-unit-id="${CSS.escape(unitId)}"]`);
    if (section && meta) bindPanel(section, meta);
  }

  const observer = new MutationObserver(() => {
    stopPlayback();
    window.setTimeout(patchModal, 0);
  });

  window.addEventListener("load", () => {
    const modalContent = document.getElementById("rangerModalContent");
    if (modalContent) observer.observe(modalContent, { childList: true });
    patchModal();
  });

  document.addEventListener("click", (event) => {
    if (event.target?.id === "rangerModalCloseBtn" || event.target?.id === "rangerModal") stopPlayback();
  });
})();
