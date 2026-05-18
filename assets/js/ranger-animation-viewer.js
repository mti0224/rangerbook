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
    spriteCache: new Map(),
    rafId: 0,
    playing: false,
    startedAt: 0,
    activeCanvas: null,
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
    const preferred = ["body", "bul", "bul2", "bul3"];
    preferred.forEach((partName) => {
      const part = meta?.parts?.[partName];
      if (!part) return;
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

  function getSpriteCanvas(part, atlas, imageName) {
    const cacheKey = `${part.png}|${imageName}`;
    if (state.spriteCache.has(cacheKey)) return state.spriteCache.get(cacheKey);

    const sprite = part.sprites?.[imageName];
    if (!sprite) return null;
    const [sx, sy, sw, sh] = sprite.rect || [];
    if (!sw || !sh) return null;

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    if (sprite.rotated) {
      ctx.translate(sw / 2, sh / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(atlas, sx, sy, sh, sw, -sh / 2, -sw / 2, sh, sw);
    } else {
      ctx.drawImage(atlas, sx, sy, sw, sh, 0, 0, sw, sh);
    }

    state.spriteCache.set(cacheKey, canvas);
    return canvas;
  }

  function drawSpriteLikePygame(ctx, spriteCanvas, objectMatrix, imageMatrix, color, originX, originY, zoom) {
    const [m00, m01, m10, m11, m02, m12] = objectMatrix;
    const [i00, i01, i10, i11, i02, i12] = imageMatrix;
    const w = spriteCanvas.width;
    const h = spriteCanvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;

    const postCx = i00 * cx + i01 * cy + i02;
    const postCy = i10 * cx + i11 * cy + i12;
    const worldCx = m00 * postCx + m01 * postCy + m02;
    const worldCy = m10 * postCx + m11 * postCy + m12;

    const f00 = m00 * i00 + m01 * i10;
    const f01 = m00 * i01 + m01 * i11;
    const f10 = m10 * i00 + m11 * i10;
    const f11 = m10 * i01 + m11 * i11;
    const det = f00 * f11 - f01 * f10;
    const scaleX = Math.hypot(f00, f10);
    const scaleY = Math.hypot(f01, f11);
    const flipX = det < 0;
    const angle = flipX ? Math.atan2(-f10, -f00) : Math.atan2(f10, f00);
    const alpha = Array.isArray(color) ? Number(color[3] ?? 255) / 255 : 1;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.translate(originX + worldCx * zoom, originY + worldCy * zoom);
    ctx.rotate(angle);
    ctx.scale((flipX ? -1 : 1) * scaleX * zoom, scaleY * zoom);
    ctx.drawImage(spriteCanvas, -w / 2, -h / 2);
    ctx.restore();
  }

  async function drawFrame(canvas, meta, partName, animName, frameIndex) {
    const ctx = canvas.getContext("2d");
    const part = meta?.parts?.[partName];
    const anim = part?.animations?.[animName];
    if (!ctx || !part || !anim?.frames?.length) return;

    const atlas = await loadImage(part.png);
    if (!atlas) return;

    const width = canvas.width;
    const height = canvas.height;
    const zoom = state.zoom || 1;
    const originX = width * 0.5 + DEFAULT_BODY_OFFSET_X * zoom;
    const originY = height * 0.78 + DEFAULT_BODY_OFFSET_Y * zoom;
    const frame = anim.frames[frameIndex % anim.frames.length] || [];

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(0, Math.round(height * 0.78), width, 1);
    ctx.restore();

    for (const item of frame) {
      const [, resNum, objectMatrix, color] = item;
      const imageDef = part.images?.[resNum];
      if (!imageDef || !Array.isArray(objectMatrix) || !Array.isArray(imageDef.m)) continue;
      const spriteCanvas = getSpriteCanvas(part, atlas, imageDef.name);
      if (!spriteCanvas) continue;
      drawSpriteLikePygame(ctx, spriteCanvas, objectMatrix, imageDef.m, color, originX, originY, zoom);
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
