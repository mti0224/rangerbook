(() => {
  const SITE_ROOT = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const HIT_EFFECT_BASE = `${SITE_ROOT}assets/hit_effect/`;
  const HIT_EFFECT_META_URL = `${HIT_EFFECT_BASE}eff_hit_strong_pretty.json`;
  const HIT_EFFECT_SEGMENT = "basic";
  const HIT_EFFECT_DURATION = 19 / 30;
  const NATIVE_ACTION_FPS = 60;

  function sharedBridge(name) {
    if (window[name]?.get && window[name]?.set) return window[name];
    const values = new WeakMap();
    const bridge = {
      get(section) {
        return section ? values.get(section) || null : null;
      },
      set(section, value) {
        if (!section) return;
        if (value === null || value === undefined) values.delete(section);
        else values.set(section, value);
      },
    };
    window[name] = bridge;
    return bridge;
  }

  const playbackBridge = sharedBridge("RangerAnimationPlaybackBridge");
  const sceneBridge = sharedBridge("RangerAnimationSceneBridge");
  const targetBridge = sharedBridge("RangerAnimationTargetBridge");
  const sectionStates = new WeakMap();
  const imageCache = new Map();
  let effectMetaPromise = null;
  let effectAnchorPromise = null;
  let patchScheduled = false;

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function loadJson(url) {
    return fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  }

  function loadEffectMeta() {
    if (!effectMetaPromise) effectMetaPromise = loadJson(HIT_EFFECT_META_URL);
    return effectMetaPromise;
  }

  function loadEffectImage(filename) {
    const name = String(filename || "").trim();
    if (!name) return Promise.resolve(null);
    if (imageCache.has(name)) return imageCache.get(name);
    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Hit effect image failed: ${name}`));
      image.src = `${HIT_EFFECT_BASE}${encodeURIComponent(name)}`;
    }).catch(() => null);
    imageCache.set(name, promise);
    return promise;
  }

  function installStyles() {
    if (document.getElementById("ranger-animation-hit-effect-styles")) return;
    const style = document.createElement("style");
    style.id = "ranger-animation-hit-effect-styles";
    style.textContent = `
      .ranger-animation-hit-effect-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function drawSprite(context, image, objectMatrix, imageMatrix, color, originX, originY, scale) {
    const [m00, m01, m10, m11, m02, m12] = objectMatrix;
    const [i00, i01, i10, i11, i02, i12] = imageMatrix;
    const centerX = image.width * 0.5;
    const centerY = image.height * 0.5;
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
    const alpha = Array.isArray(color) ? finiteNumber(color[3], 255) / 255 : 1;

    context.save();
    context.globalAlpha = clamp(alpha, 0, 1);
    context.translate(originX + worldCenterX * scale, originY + worldCenterY * scale);
    context.rotate(angle);
    context.scale((flipX ? -1 : 1) * localScaleX * scale, localScaleY * scale);
    context.drawImage(image, -image.width / 2, -image.height / 2);
    context.restore();
  }

  async function loadEffectOriginOffset(meta) {
    if (effectAnchorPromise) return effectAnchorPromise;
    effectAnchorPromise = (async () => {
      const animation = meta?.animations?._all;
      const segment = (meta?.segments || []).find((item) => item?.name === HIT_EFFECT_SEGMENT);
      if (!animation?.frames?.length) return { x: 0, y: 0 };
      const start = Math.max(0, Math.trunc(finiteNumber(segment?.start, 0)));
      const end = Math.min(
        animation.frame_count,
        Math.trunc(finiteNumber(segment?.end, animation.frame_count))
      );
      for (let frameIndex = start; frameIndex < end; frameIndex += 1) {
        for (const item of animation.frames[frameIndex] || []) {
          const [, resourceNumber, objectMatrix, color] = item || [];
          const alpha = Array.isArray(color) ? finiteNumber(color[3], 255) : 255;
          const imageDefinition = meta.images?.[resourceNumber];
          if (
            alpha <= 0 || !imageDefinition ||
            !Array.isArray(objectMatrix) || !Array.isArray(imageDefinition.m)
          ) continue;
          const image = await loadEffectImage(imageDefinition.name);
          if (!image) continue;
          const [m00, m01, m10, m11, m02, m12] = objectMatrix;
          const [i00, i01, i10, i11, i02, i12] = imageDefinition.m;
          const centerX = image.width * 0.5;
          const centerY = image.height * 0.5;
          const imageCenterX = i00 * centerX + i01 * centerY + i02;
          const imageCenterY = i10 * centerX + i11 * centerY + i12;
          return {
            x: m00 * imageCenterX + m01 * imageCenterY + m02,
            y: m10 * imageCenterX + m11 * imageCenterY + m12,
          };
        }
      }
      return { x: 0, y: 0 };
    })();
    return effectAnchorPromise;
  }

  async function drawEffectFrame(context, age, x, y, scale) {
    const meta = await loadEffectMeta();
    const animation = meta?.animations?._all;
    if (!animation?.frames?.length) return;
    const segment = (meta.segments || []).find((item) => item?.name === HIT_EFFECT_SEGMENT);
    const start = Math.max(0, Math.trunc(finiteNumber(segment?.start, 0)));
    const end = Math.min(
      animation.frame_count,
      Math.trunc(finiteNumber(segment?.end, animation.frame_count))
    );
    const frameIndex = start + Math.floor(age * Math.max(1, meta.anim_rate || 30));
    if (frameIndex < start || frameIndex >= end) return;
    const frame = animation.frames[frameIndex] || [];
    for (const item of frame) {
      const [, resourceNumber, objectMatrix, color] = item || [];
      const imageDefinition = meta.images?.[resourceNumber];
      if (
        !imageDefinition || !Array.isArray(objectMatrix) ||
        !Array.isArray(imageDefinition.m)
      ) continue;
      const image = await loadEffectImage(imageDefinition.name);
      if (image) {
        drawSprite(
          context, image, objectMatrix, imageDefinition.m,
          color, x, y, scale
        );
      }
    }
  }

  async function effectAnchor(section, scene) {
    const target = targetBridge.get(section);
    const scale = Math.max(0.001, finiteNumber(scene?.sceneScale, 1));
    const anchorTop = finiteNumber(target?.anchorTopY, NaN);
    const anchorBottom = finiteNumber(target?.anchorBaseY, NaN);
    const hasBounds = Number.isFinite(anchorTop) && Number.isFinite(anchorBottom) && anchorBottom > anchorTop;
    const x = finiteNumber(target?.anchorX, finiteNumber(scene?.targetX, 0));
    const centerY = finiteNumber(
      target?.anchorCenterY,
      hasBounds
        ? (anchorTop + anchorBottom) * 0.5
        : finiteNumber(scene?.targetBaseY, 0) - 120 * scale
    );
    const meta = await loadEffectMeta();
    const originOffset = await loadEffectOriginOffset(meta);
    return {
      x: x - originOffset.x * scale,
      y: centerY - originOffset.y * scale,
      scale,
    };
  }

  async function renderFrame(state) {
    const { canvas, section } = state;
    const baseCanvas = section.querySelector(".ranger-animation-canvas");
    if (!baseCanvas) return;
    if (canvas.width !== baseCanvas.width) canvas.width = baseCanvas.width;
    if (canvas.height !== baseCanvas.height) canvas.height = baseCanvas.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);

    const plan = playbackBridge.get(section);
    if (!plan || plan.source !== "viewer" || !Number.isFinite(plan.impactTime)) {
      state.activeEffect = null;
      return;
    }

    const elapsed = Math.floor(
      ((performance.now() - plan.startedAt) / 1000) * NATIVE_ACTION_FPS
    ) / NATIVE_ACTION_FPS;
    const cycleDuration = Math.max(0, finiteNumber(plan.cycleDuration, 0));
    const cycleIndex = cycleDuration > 0 ? Math.floor(elapsed / cycleDuration) : 0;
    const time = cycleDuration > 0 ? elapsed - cycleIndex * cycleDuration : elapsed;
    let impactCycleIndex = cycleIndex;
    let age = time - plan.impactTime;
    if (age < 0 && cycleDuration > 0 && elapsed >= cycleDuration) {
      age += cycleDuration;
      impactCycleIndex -= 1;
    }
    if (age < 0 || age >= HIT_EFFECT_DURATION) return;

    const scene = sceneBridge.get(section);
    if (!scene) return;
    const effectKey = `${plan.startedAt}:${plan.impactTime}:${impactCycleIndex}`;
    if (!state.activeEffect || state.activeEffect.key !== effectKey) {
      state.activeEffect = {
        key: effectKey,
        ...(await effectAnchor(section, scene)),
      };
    }
    await drawEffectFrame(
      context,
      age,
      state.activeEffect.x,
      state.activeEffect.y,
      state.activeEffect.scale,
    );
  }

  function startLoop(state) {
    const loop = async () => {
      if (!document.contains(state.section)) {
        sectionStates.delete(state.section);
        return;
      }
      if (!state.rendering) {
        state.rendering = true;
        try {
          await renderFrame(state);
        } finally {
          state.rendering = false;
        }
      }
      state.rafId = requestAnimationFrame(loop);
    };
    state.rafId = requestAnimationFrame(loop);
  }

  function patchSection(section) {
    if (sectionStates.has(section)) return;
    const stack = section.querySelector(".ranger-animation-canvas-stack");
    if (!stack) return;
    installStyles();
    const canvas = document.createElement("canvas");
    canvas.className = "ranger-animation-hit-effect-canvas";
    const baseCanvas = section.querySelector(".ranger-animation-canvas");
    canvas.width = baseCanvas?.width || 640;
    canvas.height = baseCanvas?.height || 360;
    canvas.setAttribute("aria-hidden", "true");
    stack.appendChild(canvas);
    const state = {
      section,
      canvas,
      activeEffect: null,
      rendering: false,
      rafId: 0,
    };
    sectionStates.set(section, state);
    section.addEventListener("ranger-animation-playback-plan", () => {
      state.activeEffect = null;
    });
    section.addEventListener("ranger-animation-target-change", () => {
      state.activeEffect = null;
    });
    startLoop(state);
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
