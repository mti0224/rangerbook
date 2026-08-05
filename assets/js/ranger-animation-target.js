(() => {
  const ANIMATION_META_BASE = "https://res.warmycat.com/animation_meta/";
  const INDEX_URL = `${ANIMATION_META_BASE}index.json`;
  const RESOURCE_PRIMARY_BASE = "https://res.warmycat.com/";
  const RESOURCE_FALLBACK_BASE = "https://rangers.lerico.net/res/";
  const OLD_PRIMARY_PREFIX = "res_from_emulator/";
  const VIEWER_RESOURCE_SCALE = 2.28;
  const NORMAL_STAGE_INITIAL_SCALE = 0.85;
  const TARGET_X_RATIO = 0.90;
  const GROUND_Y_RATIO = 0.80;

  const TARGET_OPTIONS = [
    { id: "", label: "無" },
    { id: "u1174hsk-cony", label: "賭徒兔兔的拉霸機（超進化）" },
    { id: "u1276sk-cony", label: "賭徒兔兔的拉霸機（九星）" },
    { id: "u1138sk-james", label: "紫衣詹姆士的雕像" },
    { id: "u1352hsk-brown", label: "冥界熊大的幽魂鬼怪（超進化）" },
    { id: "u1353sk-brown", label: "冥界熊大的幽魂鬼怪（九星）" },
  ];

  const sectionStates = new WeakMap();
  const metaCache = new Map();
  const imageCache = new Map();
  const spriteCache = new Map();
  let indexPromise = null;
  let patchScheduled = false;

  function normalizeResourcePath(path) {
    return String(path || "")
      .replace(/^\/+/, "")
      .replace(new RegExp(`^${OLD_PRIMARY_PREFIX}`), "");
  }

  function resourceUrl(path) {
    return `${RESOURCE_PRIMARY_BASE}${normalizeResourcePath(path)}`;
  }

  function legacyResourceUrl(path) {
    return `${RESOURCE_FALLBACK_BASE}${normalizeResourcePath(path)}`;
  }

  function animationMetaUrl(metaPath, unitId) {
    const raw = String(metaPath || "").trim();
    const filename = raw ? raw.split("/").pop() : `${unitId}.json`;
    return `${ANIMATION_META_BASE}${encodeURIComponent(filename)}`;
  }

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = window.fetch(INDEX_URL)
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
    }
    return indexPromise;
  }

  async function loadTargetMeta(unitId) {
    if (!unitId) return null;
    if (metaCache.has(unitId)) return metaCache.get(unitId);
    const promise = (async () => {
      const index = await loadIndex();
      const entry = index?.units?.[unitId];
      if (!entry?.meta) return null;
      return window.fetch(animationMetaUrl(entry.meta, unitId))
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
    })();
    metaCache.set(unitId, promise);
    return promise;
  }

  function loadImage(path) {
    const normalizedPath = normalizeResourcePath(path);
    if (imageCache.has(normalizedPath)) return imageCache.get(normalizedPath);
    const promise = new Promise((resolve) => {
      const image = new Image();
      let usedFallback = false;
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => {
        if (!usedFallback) {
          usedFallback = true;
          image.src = legacyResourceUrl(normalizedPath);
          return;
        }
        resolve(null);
      };
      image.src = resourceUrl(normalizedPath);
    });
    imageCache.set(normalizedPath, promise);
    return promise;
  }

  function getSpriteCanvas(part, atlas, imageName) {
    const cacheKey = `${normalizeResourcePath(part?.png)}|${imageName}`;
    if (spriteCache.has(cacheKey)) return spriteCache.get(cacheKey);
    const sprite = part?.sprites?.[imageName];
    const [sourceX, sourceY, width, height] = sprite?.rect || [];
    if (!width || !height) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    if (sprite.rotated) {
      context.translate(width / 2, height / 2);
      context.rotate(-Math.PI / 2);
      context.drawImage(atlas, sourceX, sourceY, height, width, -height / 2, -width / 2, height, width);
    } else {
      context.drawImage(atlas, sourceX, sourceY, width, height, 0, 0, width, height);
    }
    spriteCache.set(cacheKey, canvas);
    return canvas;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function drawSprite(context, spriteCanvas, objectMatrix, imageMatrix, color, originX, originY, scaleX, scaleY) {
    const [m00, m01, m10, m11, m02, m12] = objectMatrix;
    const [i00, i01, i10, i11, i02, i12] = imageMatrix;
    const width = spriteCanvas.width;
    const height = spriteCanvas.height;
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const imageCenterX = i00 * centerX + i01 * centerY + i02;
    const imageCenterY = i10 * centerX + i11 * centerY + i12;
    const worldCenterX = m00 * imageCenterX + m01 * imageCenterY + m02;
    const worldCenterY = m10 * imageCenterX + m11 * imageCenterY + m12;
    const f00 = m00 * i00 + m01 * i10;
    const f01 = m00 * i01 + m01 * i11;
    const f10 = m10 * i00 + m11 * i10;
    const f11 = m10 * i01 + m11 * i11;
    const determinant = f00 * f11 - f01 * f10;
    const localScaleX = Math.hypot(f00, f10);
    const localScaleY = Math.hypot(f01, f11);
    const flipX = determinant < 0;
    const angle = flipX ? Math.atan2(-f10, -f00) : Math.atan2(f10, f00);
    const alpha = Array.isArray(color) ? Number(color[3] ?? 255) / 255 : 1;

    context.save();
    context.globalAlpha = clamp(alpha, 0, 1);
    context.translate(originX + worldCenterX * scaleX, originY + worldCenterY * scaleY);
    context.rotate(angle);
    context.scale((flipX ? -1 : 1) * localScaleX * scaleX, localScaleY * scaleY);
    context.drawImage(spriteCanvas, -width / 2, -height / 2);
    context.restore();
  }

  function targetAnimation(part) {
    const preferred = ["wait", "idle", "stand", "_all"];
    for (const name of preferred) {
      const animation = part?.animations?.[name];
      if (animation?.frames?.length) return { name, animation };
    }
    for (const [name, animation] of Object.entries(part?.animations || {})) {
      if (animation?.frames?.length) return { name, animation };
    }
    return null;
  }

  function frameGeometry(part, frame) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let facingScore = 0;

    for (const item of frame || []) {
      const [, resourceNumber, objectMatrix, color] = item || [];
      const alpha = Array.isArray(color) ? Number(color[3] ?? 255) : 255;
      const imageDefinition = part?.images?.[resourceNumber];
      const sprite = part?.sprites?.[imageDefinition?.name];
      const [width, height] = [Number(sprite?.rect?.[2]), Number(sprite?.rect?.[3])];
      if (alpha === 0 || !width || !height || !Array.isArray(objectMatrix) || !Array.isArray(imageDefinition?.m)) continue;

      const [m00, m01, m10, m11, m02, m12] = objectMatrix;
      const [i00, i01, i10, i11, i02, i12] = imageDefinition.m;
      const f00 = m00 * i00 + m01 * i10;
      const f01 = m00 * i01 + m01 * i11;
      const f10 = m10 * i00 + m11 * i10;
      const f11 = m10 * i01 + m11 * i11;
      const tx = m00 * i02 + m01 * i12 + m02;
      const ty = m10 * i02 + m11 * i12 + m12;
      facingScore += f00;

      for (const [x, y] of [[0, 0], [width, 0], [0, height], [width, height]]) {
        const worldX = f00 * x + f01 * y + tx;
        const worldY = f10 * x + f11 * y + ty;
        minX = Math.min(minX, worldX);
        minY = Math.min(minY, worldY);
        maxX = Math.max(maxX, worldX);
        maxY = Math.max(maxY, worldY);
      }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
    return { minX, minY, maxX, maxY, facesLeft: facingScore < 0 };
  }

  async function drawTarget(state, elapsed) {
    const { overlay, baseCanvas, meta } = state;
    const context = overlay.getContext("2d");
    if (!context) return;
    if (overlay.width !== baseCanvas.width) overlay.width = baseCanvas.width;
    if (overlay.height !== baseCanvas.height) overlay.height = baseCanvas.height;
    context.clearRect(0, 0, overlay.width, overlay.height);

    const part = meta?.parts?.body;
    const selectedAnimation = targetAnimation(part);
    if (!part || !selectedAnimation) return;
    const atlas = await loadImage(part.png);
    if (!atlas || state.meta !== meta) return;

    const frameCount = Math.max(1, selectedAnimation.animation.frame_count || selectedAnimation.animation.frames.length);
    const frameRate = Math.max(1, Number(part.anim_rate) || 24);
    const frameIndex = Math.floor(elapsed * frameRate) % frameCount;
    const frame = selectedAnimation.animation.frames[frameIndex] || [];
    const geometry = frameGeometry(part, frame);
    if (!geometry) return;

    const zoom = Number(state.zoomInput?.value) || 1;
    const sizeRatioValue = Number(meta?.projectileData?.render?.sizeRatio);
    const sizeRatio = Number.isFinite(sizeRatioValue) && sizeRatioValue > 0 ? sizeRatioValue : 1;
    const targetScale = Math.min(overlay.width / 1400, overlay.height / 750) *
      VIEWER_RESOURCE_SCALE * NORMAL_STAGE_INITIAL_SCALE * zoom * sizeRatio;
    const scaleX = geometry.facesLeft ? targetScale : -targetScale;
    const targetX = overlay.width * TARGET_X_RATIO + state.panX;
    const targetBaseY = overlay.height * GROUND_Y_RATIO + state.panY;
    const scaledMinX = Math.min(geometry.minX * scaleX, geometry.maxX * scaleX);
    const scaledMaxX = Math.max(geometry.minX * scaleX, geometry.maxX * scaleX);
    const originX = targetX - (scaledMinX + scaledMaxX) * 0.5;
    const originY = targetBaseY - geometry.maxY * targetScale;

    for (const item of frame) {
      const [, resourceNumber, objectMatrix, color] = item || [];
      const imageDefinition = part.images?.[resourceNumber];
      if (!imageDefinition || !Array.isArray(objectMatrix) || !Array.isArray(imageDefinition.m)) continue;
      const spriteCanvas = getSpriteCanvas(part, atlas, imageDefinition.name);
      if (!spriteCanvas) continue;
      drawSprite(
        context,
        spriteCanvas,
        objectMatrix,
        imageDefinition.m,
        color,
        originX,
        originY,
        scaleX,
        targetScale,
      );
    }
  }

  function stopTargetLoop(state) {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = 0;
    const context = state.overlay.getContext("2d");
    context?.clearRect(0, 0, state.overlay.width, state.overlay.height);
  }

  function startTargetLoop(state) {
    stopTargetLoop(state);
    if (!state.meta) return;
    state.startedAt = performance.now();
    const loop = () => {
      if (!state.section.isConnected || !state.meta) {
        stopTargetLoop(state);
        return;
      }
      if (!state.rendering) {
        state.rendering = true;
        drawTarget(state, (performance.now() - state.startedAt) / 1000)
          .finally(() => { state.rendering = false; });
      }
      state.rafId = requestAnimationFrame(loop);
    };
    state.rafId = requestAnimationFrame(loop);
  }

  async function selectTarget(state, unitId) {
    const token = ++state.loadToken;
    stopTargetLoop(state);
    state.meta = null;
    state.select.title = "";
    if (!unitId) return;
    state.select.disabled = true;
    const meta = await loadTargetMeta(unitId);
    if (token !== state.loadToken) return;
    state.select.disabled = false;
    if (!meta?.parts?.body) {
      state.select.title = `無法載入目標動畫：${unitId}`;
      console.warn("Target animation metadata unavailable:", unitId);
      return;
    }
    state.meta = meta;
    startTargetLoop(state);
  }

  function bindTargetPan(state) {
    const canvas = state.baseCanvas;
    canvas.addEventListener("pointerdown", (event) => {
      state.dragging = true;
      state.dragStartX = event.clientX;
      state.dragStartY = event.clientY;
      state.dragPanX = state.panX;
      state.dragPanY = state.panY;
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!state.dragging) return;
      state.panX = state.dragPanX + event.clientX - state.dragStartX;
      state.panY = state.dragPanY + event.clientY - state.dragStartY;
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
      canvas.addEventListener(eventName, () => { state.dragging = false; });
    });
  }

  function targetOptionsHtml() {
    return TARGET_OPTIONS
      .map(({ id, label }) => `<option value="${id}">${label}</option>`)
      .join("");
  }

  function installStyles() {
    if (document.getElementById("ranger-animation-target-styles")) return;
    const style = document.createElement("style");
    style.id = "ranger-animation-target-styles";
    style.textContent = `
      .ranger-animation-canvas-stack {
        position: relative;
        width: 100%;
        overflow: hidden;
        border-radius: 14px;
      }
      .ranger-animation-target-canvas {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }
      .ranger-animation-controls.simplified.ranger-animation-target-enabled {
        grid-template-columns: minmax(150px, 0.8fr) minmax(220px, 1.2fr) minmax(180px, 0.7fr);
      }
      @media (max-width: 860px) {
        .ranger-animation-controls.simplified.ranger-animation-target-enabled {
          grid-template-columns: 1fr;
        }
        .ranger-animation-controls.simplified.ranger-animation-target-enabled label:first-child {
          grid-column: auto;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function patchSection(section) {
    if (sectionStates.has(section)) return;
    const baseCanvas = section.querySelector(".ranger-animation-canvas");
    const controls = section.querySelector(".ranger-animation-controls");
    if (!baseCanvas || !controls) return;

    installStyles();
    const stack = document.createElement("div");
    stack.className = "ranger-animation-canvas-stack";
    baseCanvas.parentNode.insertBefore(stack, baseCanvas);
    stack.appendChild(baseCanvas);

    const overlay = document.createElement("canvas");
    overlay.className = "ranger-animation-target-canvas";
    overlay.width = baseCanvas.width;
    overlay.height = baseCanvas.height;
    overlay.setAttribute("aria-hidden", "true");
    stack.appendChild(overlay);

    const label = document.createElement("label");
    label.className = "ranger-animation-target-label";
    label.innerHTML = `<span>目標</span><select class="ranger-animation-target-select">${targetOptionsHtml()}</select>`;
    const zoomLabel = controls.querySelector(".ranger-animation-zoom-label");
    controls.insertBefore(label, zoomLabel || null);
    controls.classList.add("ranger-animation-target-enabled");

    const select = label.querySelector("select");
    const state = {
      section,
      baseCanvas,
      overlay,
      select,
      zoomInput: controls.querySelector(".ranger-animation-zoom"),
      meta: null,
      rafId: 0,
      startedAt: 0,
      rendering: false,
      loadToken: 0,
      panX: 0,
      panY: 0,
      dragging: false,
      dragStartX: 0,
      dragStartY: 0,
      dragPanX: 0,
      dragPanY: 0,
    };
    sectionStates.set(section, state);
    bindTargetPan(state);
    select.addEventListener("change", () => selectTarget(state, select.value));
  }

  function patchAllSections() {
    document.querySelectorAll(".ranger-animation-section").forEach(patchSection);
  }

  function schedulePatch() {
    if (patchScheduled) return;
    patchScheduled = true;
    queueMicrotask(() => {
      patchScheduled = false;
      patchAllSections();
    });
  }

  const observer = new MutationObserver(schedulePatch);
  window.addEventListener("DOMContentLoaded", () => {
    observer.observe(document.body, { childList: true, subtree: true });
    patchAllSections();
  });
})();
