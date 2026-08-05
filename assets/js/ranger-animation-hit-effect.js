(() => {
  const SITE_ROOT = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const ANIMATION_META_BASE = "https://res.warmycat.com/animation_meta/";
  const ANIMATION_INDEX_URL = `${ANIMATION_META_BASE}index.json`;
  const PROJECTILE_DATA_URL = `${SITE_ROOT}res/projectile_data.json`;
  const HIT_EFFECT_BASE = `${SITE_ROOT}assets/hit_effect/`;
  const HIT_EFFECT_META_URL = `${HIT_EFFECT_BASE}eff_hit_strong_pretty.json`;
  const HIT_EFFECT_SEGMENT = "basic";
  const ATTACK_BODY_NAMES = ["attack_all", "attack", "attack_a", "attack_b"];
  const ATTACK_READY_NAMES = ["attack_ready"];
  const ATTACK_TRIGGER_NAMES = ["attack", "attack_a", "attack_b"];
  const FULL_SEQUENCE = [
    ["move", ["walk"]],
    ["idle", ["idle", "wait"]],
    ["attack", ATTACK_BODY_NAMES],
    ["skill1", ["s_attack_all", "s_action_attack_all", "s_attack", "s_attack_a", "s_attack_b", "s_action_attack_2", "s_action_attack_3"]],
    ["skill2", ["s2_attack_all", "s2_attack", "s2_attack_a", "s2_attack_b", "skill"]],
    ["knockback", ["knockback"]],
  ];

  const sectionStates = new WeakMap();
  const metaCache = new Map();
  const imageCache = new Map();
  let indexPromise = null;
  let projectileDataPromise = null;
  let effectMetaPromise = null;
  let patchScheduled = false;

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

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

  function loadIndex() {
    if (!indexPromise) indexPromise = loadJson(ANIMATION_INDEX_URL);
    return indexPromise;
  }

  function loadProjectileData() {
    if (!projectileDataPromise) projectileDataPromise = loadJson(PROJECTILE_DATA_URL);
    return projectileDataPromise;
  }

  function loadEffectMeta() {
    if (!effectMetaPromise) effectMetaPromise = loadJson(HIT_EFFECT_META_URL);
    return effectMetaPromise;
  }

  function loadEffectImage(filename) {
    const name = text(filename);
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

  async function loadUnitMeta(unitId) {
    if (!unitId) return null;
    if (metaCache.has(unitId)) return metaCache.get(unitId);
    const promise = Promise.all([loadIndex(), loadProjectileData()]).then(async ([index, projectileData]) => {
      const entry = index?.units?.[unitId];
      if (!entry?.meta) return null;
      const filename = text(entry.meta).split("/").pop() || `${unitId}.json`;
      const meta = await loadJson(`${ANIMATION_META_BASE}${encodeURIComponent(filename)}`);
      if (meta && !meta.projectileData) {
        const unitData = projectileData?.units?.[unitId];
        if (unitData) {
          meta.projectileData = {
            hitTiming: unitData.hitTiming || null,
          };
        }
      }
      return meta;
    });
    metaCache.set(unitId, promise);
    return promise;
  }

  function getAnimation(part, names) {
    for (const name of names || []) {
      const animation = part?.animations?.[name];
      if (animation?.frames?.length) return { name, animation };
    }
    return null;
  }

  function animationDuration(part, animationName) {
    const animation = part?.animations?.[animationName];
    if (!animation?.frame_count) return 0;
    return animation.frame_count / Math.max(1, part.anim_rate || 24);
  }

  function attackImpactTime(bodyPart, bodyAnimation, bodyDuration) {
    const virtualClip = bodyPart?.virtual_clips?.[bodyAnimation.name];
    if (Array.isArray(virtualClip?.segments)) {
      let cursor = 0;
      for (const segmentName of virtualClip.segments) {
        if (ATTACK_TRIGGER_NAMES.includes(segmentName)) return clamp(cursor, 0, bodyDuration);
        cursor += animationDuration(bodyPart, segmentName);
      }
    }

    if (bodyAnimation.name === "_all" && Array.isArray(bodyPart?.timeline?.labels)) {
      const label = bodyPart.timeline.labels.find((item) => ATTACK_TRIGGER_NAMES.includes(item.name));
      if (label) return clamp(finiteNumber(label.seconds, 0), 0, bodyDuration);
    }

    for (const readyName of ATTACK_READY_NAMES) {
      const readyDuration = animationDuration(bodyPart, readyName);
      if (readyDuration > 0) return clamp(readyDuration, 0, bodyDuration);
    }

    return clamp(bodyDuration * 0.5, 0, bodyDuration);
  }

  function clipBodyDuration(bodyPart, names) {
    const result = getAnimation(bodyPart, names);
    if (!result) return 0;
    return Math.max(animationDuration(bodyPart, result.name), 1);
  }

  function buildPlaybackPlan(meta, selectedClip) {
    const bodyPart = meta?.parts?.body;
    if (!bodyPart) return null;
    const attackAnimation = getAnimation(bodyPart, ATTACK_BODY_NAMES);
    if (!attackAnimation) return null;
    const attackDuration = Math.max(animationDuration(bodyPart, attackAnimation.name), 1);
    const localImpact = attackImpactTime(bodyPart, attackAnimation, attackDuration);

    if (selectedClip === "attack") {
      return { cycleDuration: attackDuration, impactTime: localImpact };
    }

    if (selectedClip !== "full") return null;
    let cursor = 0;
    let impactTime = null;
    for (const [key, names] of FULL_SEQUENCE) {
      const duration = clipBodyDuration(bodyPart, names);
      if (!duration) continue;
      if (key === "attack") impactTime = cursor + localImpact;
      cursor += duration;
    }
    return impactTime === null ? null : { cycleDuration: Math.max(cursor, 1), impactTime };
  }

  function normalizedHitPointRate(meta) {
    const raw = finiteNumber(meta?.projectileData?.hitTiming?.normalHitPointRate, NaN);
    if (!Number.isFinite(raw)) return 0.5;
    return clamp(raw > 1 ? raw / 100 : raw, 0, 1);
  }

  function installStyles() {
    if (document.getElementById("ranger-animation-hit-effect-styles")) return;
    const style = document.createElement("style");
    style.id = "ranger-animation-hit-effect-styles";
    style.textContent = `
      .ranger-animation-hit-effect-canvas {
        position: absolute;
        inset: 0;
        z-index: 3;
        display: block;
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

  async function drawEffectFrame(context, age, x, y, scale) {
    const meta = await loadEffectMeta();
    const animation = meta?.animations?._all;
    if (!animation?.frames?.length) return;
    const segment = (meta.segments || []).find((item) => item?.name === HIT_EFFECT_SEGMENT);
    const start = Math.max(0, Math.trunc(finiteNumber(segment?.start, 0)));
    const end = Math.min(animation.frame_count, Math.trunc(finiteNumber(segment?.end, animation.frame_count)));
    const frameIndex = start + Math.floor(age * Math.max(1, meta.anim_rate || 30));
    if (frameIndex < start || frameIndex >= end) return;
    const frame = animation.frames[frameIndex] || [];
    for (const item of frame) {
      const [, resourceNumber, objectMatrix, color] = item || [];
      const imageDefinition = meta.images?.[resourceNumber];
      if (!imageDefinition || !Array.isArray(objectMatrix) || !Array.isArray(imageDefinition.m)) continue;
      const image = await loadEffectImage(imageDefinition.name);
      if (image) drawSprite(context, image, objectMatrix, imageDefinition.m, color, x, y, scale);
    }
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
    if (!state.plan || !state.meta) return;

    const elapsed = (performance.now() - state.startedAt) / 1000;
    const time = state.plan.cycleDuration > 0 ? elapsed % state.plan.cycleDuration : elapsed;
    const age = time - state.plan.impactTime;
    if (age < 0) return;

    const scene = window.RangerAnimationSceneBridge?.get(section);
    if (!scene) return;
    const target = window.RangerAnimationTargetBridge?.get(section);
    const targetHeight = Math.max(1, finiteNumber(target?.contentHeight, state.meta?.parts?.body?.canvas?.h || 240));
    const scale = Math.max(0.001, finiteNumber(scene.sceneScale, 1));
    const x = finiteNumber(scene.targetX, canvas.width * 0.9);
    const y = finiteNumber(scene.targetBaseY, canvas.height * 0.8)
      - targetHeight * state.hitPointRate * scale;
    await drawEffectFrame(context, age, x, y, scale);
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

  async function rebuildPlan(state, resetTime) {
    if (resetTime) state.startedAt = performance.now();
    if (!state.meta) state.meta = await loadUnitMeta(state.unitId);
    state.plan = buildPlaybackPlan(state.meta, state.select.value);
    state.hitPointRate = normalizedHitPointRate(state.meta);
  }

  function patchSection(section) {
    if (sectionStates.has(section)) return;
    const stack = section.querySelector(".ranger-animation-canvas-stack");
    const select = section.querySelector(".ranger-animation-select");
    if (!stack || !select) return;
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
      select,
      canvas,
      unitId: text(section.dataset.animationUnitId),
      meta: null,
      plan: null,
      hitPointRate: 0.5,
      startedAt: performance.now(),
      rendering: false,
      rafId: 0,
    };
    sectionStates.set(section, state);
    select.addEventListener("change", () => rebuildPlan(state, true));
    section.querySelector(".ranger-animation-target-select")?.addEventListener("change", () => rebuildPlan(state, false));
    rebuildPlan(state, false);
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
