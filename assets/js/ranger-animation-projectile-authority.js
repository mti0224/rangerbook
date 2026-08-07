(function (root, factory) {
  const api = factory(
    root && root.RangerAnimationProjectileEngine,
    root && root.RangerAnimationProjectileEngineAdapter,
    root && root.RangerAnimationProjectileShadow,
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RangerAnimationProjectileAuthority = api;
    if (root.document) api.install(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (engine, adapter, shadow) {
  "use strict";

  const INDEX_URL = "https://res.warmycat.com/animation_meta/index.json";
  const META_BASE = "https://res.warmycat.com/animation_meta/";
  const RESOURCE_PRIMARY_BASE = "https://res.warmycat.com/";
  const RESOURCE_FALLBACK_BASE = "https://rangers.lerico.net/res/";
  const OLD_PRIMARY_PREFIX = "res_from_emulator/";
  const NATIVE_ACTION_FPS = 60;
  const POSITION_TOLERANCE_PX = 0.01;
  const TIME_TOLERANCE_SECONDS = 1 / NATIVE_ACTION_FPS;
  const SUPPORTED_FAMILIES = new Set(["LINEAR", "CURVE", "RETURN"]);

  const CLIP_SPECS = Object.freeze({
    attack: {
      dataKey: "normal",
      bullet: "bul",
      body: ["attack_all", "attack", "attack_a", "attack_b"],
      ready: ["attack_ready"],
      trigger: ["attack", "attack_a", "attack_b"],
    },
    skill1: {
      dataKey: "skill1",
      bullet: "bul2",
      body: [
        "s_attack_all", "s_action_attack_all", "s_attack", "s_attack_a",
        "s_attack_b", "s_action_attack_2", "s_action_attack_3",
      ],
      ready: ["s_attack_ready", "s_action_attack_1"],
      trigger: ["s_attack", "s_attack_a", "s_attack_b", "s_action_attack_2", "s_action_attack_3"],
    },
    skill2: {
      dataKey: "skill2",
      bullet: "bul3",
      body: ["s2_attack_all", "s2_attack", "s2_attack_a", "s2_attack_b", "skill"],
      ready: ["s2_attack_ready"],
      trigger: ["s2_attack", "s2_attack_a", "s2_attack_b", "skill"],
    },
  });

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function normalizeResourcePath(path) {
    return String(path || "")
      .replace(/^\/+/, "")
      .replace(new RegExp(`^${OLD_PRIMARY_PREFIX}`), "");
  }

  function featureFlagEnabled(rootObject) {
    try {
      const params = new rootObject.URLSearchParams(rootObject.location?.search || "");
      const queryValue = text(params.get("projectileEngine")).toLowerCase();
      if (["1", "true", "engine", "native"].includes(queryValue)) return true;
      if (["0", "false", "legacy"].includes(queryValue)) return false;
    } catch (_) {
      // Fall through to localStorage.
    }
    try {
      return rootObject.localStorage?.getItem("ranger-animation-projectile-engine") === "1";
    } catch (_) {
      return false;
    }
  }

  function shouldTakeAuthority(report, enabled = true) {
    return Boolean(
      enabled &&
      report?.supported === true &&
      report?.withinTolerance === true &&
      SUPPORTED_FAMILIES.has(String(report?.family || "").toUpperCase())
    );
  }

  function getAnim(part, names) {
    if (!part) return null;
    for (const name of names || []) {
      const animation = part.animations?.[name];
      if (animation?.frames?.length) return { name, anim: animation };
    }
    return null;
  }

  function namedAnimationDuration(part, name) {
    const animation = part?.animations?.[name];
    return animation?.frame_count
      ? animation.frame_count / Math.max(1, part?.anim_rate || 24)
      : 0;
  }

  function animationDuration(part, animationResult) {
    if (!animationResult) return 0;
    return animationResult.anim.frame_count / Math.max(1, part?.anim_rate || 24);
  }

  function nativeProjectileSpawnTime(bodyPart, bodyAnimName, spec, clipDuration) {
    const virtualClip = bodyPart?.virtual_clips?.[bodyAnimName];
    if (Array.isArray(virtualClip?.segments)) {
      let cursor = 0;
      for (const segmentName of virtualClip.segments) {
        if ((spec.trigger || []).includes(segmentName)) {
          return clamp(cursor, 0, Math.max(0, clipDuration - 0.001));
        }
        cursor += namedAnimationDuration(bodyPart, segmentName);
      }
    }

    if ((spec.trigger || []).includes(bodyAnimName)) return 0;

    if (bodyAnimName === "_all" && Array.isArray(bodyPart?.timeline?.labels)) {
      const label = bodyPart.timeline.labels.find((item) => (spec.trigger || []).includes(item.name));
      if (label) {
        return clamp(finiteNumber(label.seconds, 0), 0, Math.max(0, clipDuration - 0.001));
      }
    }

    for (const readyName of spec.ready || []) {
      const duration = namedAnimationDuration(bodyPart, readyName);
      if (duration > 0) {
        return clamp(duration, 0, Math.max(0, clipDuration - 0.001));
      }
    }
    return 0;
  }

  function projectileAnimations(meta, spec, attack, family) {
    const requestedPartName = text(attack?.animationPart) || spec.bullet;
    const bulletPart = meta?.parts?.[requestedPartName] || meta?.parts?.[spec.bullet];
    if (!bulletPart) return null;
    const standardNormal = getAnim(bulletPart, ["normal", "idle", "wait", "shot", "fire", "attack", "_all"]);
    if (!standardNormal) return null;
    const outbound = family === "RETURN"
      ? (getAnim(bulletPart, ["normal_a"]) || standardNormal)
      : standardNormal;
    const inbound = family === "RETURN"
      ? (getAnim(bulletPart, ["normal_b"]) || outbound)
      : null;
    return {
      partName: bulletPart === meta?.parts?.[requestedPartName] ? requestedPartName : spec.bullet,
      bulletPart,
      outbound,
      inbound,
    };
  }

  function frameIndex(part, animationName, elapsed, loop = true) {
    const animation = part?.animations?.[animationName];
    if (!animation?.frames?.length) return 0;
    const rawFrame = Math.floor(Math.max(0, elapsed) * Math.max(1, part?.anim_rate || 24));
    return loop
      ? ((rawFrame % animation.frame_count) + animation.frame_count) % animation.frame_count
      : clamp(rawFrame, 0, animation.frame_count - 1);
  }

  function spriteDimensions(part, imageName) {
    const sprite = part?.sprites?.[imageName];
    if (!sprite) return null;
    const [, , width, height] = sprite.rect || [];
    return width && height ? { width, height } : null;
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

  function createSpriteCanvas(part, atlas, imageName) {
    const sprite = part?.sprites?.[imageName];
    const dimensions = spriteDimensions(part, imageName);
    if (!sprite || !dimensions) return null;
    const [sourceX, sourceY] = sprite.rect || [];
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    if (sprite.rotated) {
      context.translate(dimensions.width / 2, dimensions.height / 2);
      context.rotate(-Math.PI / 2);
      context.drawImage(
        atlas,
        sourceX,
        sourceY,
        dimensions.height,
        dimensions.width,
        -dimensions.height / 2,
        -dimensions.width / 2,
        dimensions.height,
        dimensions.width,
      );
    } else {
      context.drawImage(
        atlas,
        sourceX,
        sourceY,
        dimensions.width,
        dimensions.height,
        0,
        0,
        dimensions.width,
        dimensions.height,
      );
    }
    return canvas;
  }

  function createAuthorityStatus(rootObject) {
    if (rootObject.RangerAnimationProjectileAuthorityBridge?.get && rootObject.RangerAnimationProjectileAuthorityBridge?.set) {
      return rootObject.RangerAnimationProjectileAuthorityBridge;
    }
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
    rootObject.RangerAnimationProjectileAuthorityBridge = bridge;
    return bridge;
  }

  function install(rootObject) {
    if (rootObject.__RANGER_PROJECTILE_AUTHORITY_INSTALLED__) return;
    rootObject.__RANGER_PROJECTILE_AUTHORITY_INSTALLED__ = true;

    const enabled = featureFlagEnabled(rootObject);
    const authorityBridge = createAuthorityStatus(rootObject);
    if (!enabled) return;
    if (!engine?.createProjectileSimulation || !adapter?.createSimulationInput || !shadow?.deriveLegacyGeometry) {
      console.warn("Projectile engine authority disabled: dependencies unavailable");
      return;
    }

    const imageCache = new Map();
    const spriteCache = new Map();
    const metaCache = new Map();
    const states = new Set();
    const sectionStates = new WeakMap();
    const boundSections = new WeakSet();
    let indexPromise = null;
    let rafId = 0;

    function loadIndex() {
      if (!indexPromise) {
        indexPromise = rootObject.fetch(INDEX_URL)
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null);
      }
      return indexPromise;
    }

    async function loadMeta(unitId) {
      if (!unitId) return null;
      if (metaCache.has(unitId)) return metaCache.get(unitId);
      const promise = (async () => {
        const index = await loadIndex();
        const entry = index?.units?.[unitId];
        if (!entry?.meta) return null;
        const filename = String(entry.meta).split("/").pop() || `${unitId}.json`;
        return rootObject.fetch(`${META_BASE}${encodeURIComponent(filename)}`)
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null);
      })();
      metaCache.set(unitId, promise);
      return promise;
    }

    function loadImage(path) {
      const normalizedPath = normalizeResourcePath(path);
      if (imageCache.has(normalizedPath)) return imageCache.get(normalizedPath);
      const promise = new Promise((resolve, reject) => {
        const image = new rootObject.Image();
        const primary = `${RESOURCE_PRIMARY_BASE}${normalizedPath}`;
        const fallback = `${RESOURCE_FALLBACK_BASE}${normalizedPath}`;
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => {
          if (image.src !== fallback) {
            image.src = fallback;
            return;
          }
          reject(new Error(`Image failed: ${normalizedPath}`));
        };
        image.src = primary;
      }).catch(() => null);
      imageCache.set(normalizedPath, promise);
      return promise;
    }

    function spriteCanvas(part, atlas, imageName) {
      const key = `${normalizeResourcePath(part?.png)}|${imageName}`;
      if (spriteCache.has(key)) return spriteCache.get(key);
      const canvas = createSpriteCanvas(part, atlas, imageName);
      spriteCache.set(key, canvas);
      return canvas;
    }

    async function drawSamFrame(context, part, animationName, elapsed, originX, originY, scale, rotationDegrees = 0) {
      const animation = part?.animations?.[animationName];
      if (!animation?.frames?.length) return false;
      const atlas = await loadImage(part.png);
      if (!atlas) return false;
      const frame = animation.frames[frameIndex(part, animationName, elapsed, true)] || [];
      let drawn = false;

      context.save();
      context.translate(originX, originY);
      if (rotationDegrees) context.rotate(rotationDegrees * Math.PI / 180);
      for (const item of frame) {
        const [, resourceNumber, objectMatrix, color] = item || [];
        const imageDefinition = part.images?.[resourceNumber];
        if (!imageDefinition || !Array.isArray(objectMatrix) || !Array.isArray(imageDefinition.m)) continue;
        const sprite = spriteCanvas(part, atlas, imageDefinition.name);
        if (!sprite) continue;
        drawSprite(context, sprite, objectMatrix, imageDefinition.m, color, 0, 0, scale, scale);
        drawn = true;
      }
      context.restore();
      return drawn;
    }

    function ensureOverlay(state) {
      const mainCanvas = state.section.querySelector(".ranger-animation-canvas");
      if (!mainCanvas) return null;
      let overlay = state.section.querySelector(".ranger-animation-engine-projectile-canvas");
      if (!overlay) {
        overlay = rootObject.document.createElement("canvas");
        overlay.className = "ranger-animation-engine-projectile-canvas";
        overlay.setAttribute("aria-hidden", "true");
        const parent = mainCanvas.parentElement || state.section;
        if (rootObject.getComputedStyle?.(parent)?.position === "static") parent.style.position = "relative";
        overlay.style.position = "absolute";
        overlay.style.inset = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.pointerEvents = "none";
        overlay.style.zIndex = "3";
        parent.appendChild(overlay);
      }
      if (overlay.width !== mainCanvas.width) overlay.width = mainCanvas.width;
      if (overlay.height !== mainCanvas.height) overlay.height = mainCanvas.height;
      state.overlay = overlay;
      return overlay;
    }

    function legacyCanvas(state) {
      return state.section.querySelector(".ranger-animation-projectile-canvas");
    }

    function setLegacyHidden(state, hidden) {
      const legacy = legacyCanvas(state);
      if (!legacy) return;
      if (state.legacyVisibility === undefined) state.legacyVisibility = legacy.style.visibility;
      legacy.style.visibility = hidden ? "hidden" : state.legacyVisibility;
    }

    function clearOverlay(state) {
      const overlay = ensureOverlay(state);
      overlay?.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height);
    }

    function release(state, reason) {
      state.active = false;
      setLegacyHidden(state, false);
      clearOverlay(state);
      authorityBridge.set(state.section, {
        enabled: true,
        active: false,
        reason: reason || "legacy-fallback",
        family: state.report?.family || null,
      });
    }

    async function activateFromReport(section, report) {
      let state = sectionStates.get(section);
      if (!state) {
        state = { section, active: false, report: null, meta: null, unitId: section.dataset.animationUnitId || "" };
        sectionStates.set(section, state);
        states.add(state);
      }
      state.report = report;
      if (!shouldTakeAuthority(report, enabled)) {
        release(state, report?.reason || "shadow-not-verified");
        return;
      }
      state.meta = await loadMeta(state.unitId);
      if (!state.meta) {
        release(state, "animation-meta-unavailable");
        return;
      }
      state.active = true;
      authorityBridge.set(section, {
        enabled: true,
        active: true,
        reason: null,
        family: report.family,
      });
    }

    function currentSimulation(state) {
      const plan = rootObject.RangerAnimationPlaybackBridge?.get?.(state.section);
      const scene = rootObject.RangerAnimationSceneBridge?.get?.(state.section);
      const target = rootObject.RangerAnimationTargetBridge?.get?.(state.section);
      const clip = text(plan?.selectedClip);
      const spec = CLIP_SPECS[clip];
      if (!plan || !scene || !target || !spec || clip !== state.report?.clip) {
        return { supported: false, reason: "current-playback-not-shadowed" };
      }

      const derived = shadow.deriveLegacyGeometry(
        state.meta,
        spec.dataKey,
        scene,
        target,
        { engine, adapter },
      );
      if (!derived.supported) return derived;
      if (derived.family !== state.report.family) {
        return { supported: false, reason: "shadow-family-changed" };
      }

      const bodyPart = state.meta?.parts?.body;
      const bodyAnimation = getAnim(bodyPart, spec.body);
      if (!bodyAnimation) return { supported: false, reason: "body-animation-unavailable" };
      const clipDuration = animationDuration(bodyPart, bodyAnimation);
      const spawnTime = nativeProjectileSpawnTime(bodyPart, bodyAnimation.name, spec, clipDuration);

      const comparison = adapter.compareMovingSimulation(
        derived.projectile,
        derived.geometry,
        {
          engine,
          sceneScale: scene.sceneScale,
          spawnTime,
          samples: 17,
        },
      );
      if (!comparison.supported) return comparison;
      if (
        comparison.maxPositionDelta > POSITION_TOLERANCE_PX ||
        comparison.durationDelta > TIME_TOLERANCE_SECONDS ||
        comparison.returnDurationDelta > TIME_TOLERANCE_SECONDS
      ) {
        return { supported: false, reason: "live-shadow-mismatch", comparison };
      }

      const adapted = adapter.createSimulationInput(
        derived.projectile,
        derived.geometry,
        { engine, sceneScale: scene.sceneScale, spawnTime },
      );
      if (!adapted.supported || !adapted.input) return adapted;

      const simulation = engine.createProjectileSimulation(adapted.input);
      const attack = state.meta?.projectileData?.[spec.dataKey];
      const animations = projectileAnimations(state.meta, spec, attack, derived.family);
      if (!animations) return { supported: false, reason: "projectile-animation-unavailable" };
      return {
        supported: true,
        plan,
        scene,
        target,
        spec,
        derived,
        simulation,
        animations,
      };
    }

    async function renderState(state) {
      if (!state.active || !state.meta || !state.report) {
        if (state.overlay) clearOverlay(state);
        return;
      }
      const current = currentSimulation(state);
      if (!current.supported) {
        release(state, current.reason || "engine-simulation-unavailable");
        return;
      }

      const overlay = ensureOverlay(state);
      const context = overlay?.getContext("2d");
      if (!overlay || !context) {
        release(state, "authority-canvas-unavailable");
        return;
      }
      context.clearRect(0, 0, overlay.width, overlay.height);

      const plan = current.plan;
      const elapsed = Math.max(0, (rootObject.performance.now() - finiteNumber(plan.startedAt, 0)) / 1000);
      const nativeElapsed = Math.floor(elapsed * NATIVE_ACTION_FPS) / NATIVE_ACTION_FPS;
      const cycleDuration = Math.max(0, finiteNumber(plan.cycleDuration, 0));
      const cycleTime = cycleDuration > 0 ? nativeElapsed % cycleDuration : nativeElapsed;
      const simulation = current.simulation;
      const family = simulation.family;
      const controlledEnd = family === "RETURN" ? simulation.cleanupTime : simulation.impactTime;

      if (cycleTime < simulation.spawnTime || cycleTime >= controlledEnd) {
        setLegacyHidden(state, false);
        authorityBridge.set(state.section, {
          enabled: true,
          active: true,
          controlling: false,
          reason: "outside-engine-motion-window",
          family,
        });
        return;
      }

      const position = simulation.positionAt(cycleTime);
      if (!position) {
        release(state, "engine-position-unavailable");
        return;
      }

      const outbound = cycleTime < simulation.impactTime;
      const animation = family === "RETURN" && !outbound
        ? current.animations.inbound
        : current.animations.outbound;
      const animationAge = outbound
        ? cycleTime - simulation.spawnTime
        : cycleTime - simulation.impactTime;
      const rotation = finiteNumber(simulation.rotationAt?.(cycleTime), 0);
      const sceneScale = Math.max(0.0001, finiteNumber(current.scene.sceneScale, 1));

      setLegacyHidden(state, true);
      await drawSamFrame(
        context,
        current.animations.bulletPart,
        animation.name,
        animationAge,
        position.x,
        position.y,
        sceneScale,
        rotation,
      );
      authorityBridge.set(state.section, {
        enabled: true,
        active: true,
        controlling: true,
        reason: null,
        family,
        attackType: simulation.sourceAttackType,
        cycleTime,
        spawnTime: simulation.spawnTime,
        impactTime: simulation.impactTime,
        cleanupTime: simulation.cleanupTime,
        position,
        rotation,
      });
    }

    async function tick() {
      for (const state of states) {
        try {
          await renderState(state);
        } catch (error) {
          release(state, `authority-error:${error?.message || String(error)}`);
        }
      }
      rafId = rootObject.requestAnimationFrame(tick);
    }

    function bindSection(section) {
      if (!section || boundSections.has(section)) return;
      boundSections.add(section);
      section.addEventListener("ranger-animation-projectile-shadow-report", (event) => {
        activateFromReport(section, event.detail || null);
      });
    }

    function patchAll() {
      rootObject.document.querySelectorAll(".ranger-animation-section").forEach(bindSection);
    }

    const observer = new rootObject.MutationObserver(patchAll);
    const start = () => {
      observer.observe(rootObject.document.body, { childList: true, subtree: true });
      patchAll();
      if (!rafId) rafId = rootObject.requestAnimationFrame(tick);
    };
    if (rootObject.document.readyState === "loading") {
      rootObject.document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }

  return Object.freeze({
    NATIVE_ACTION_FPS,
    POSITION_TOLERANCE_PX,
    TIME_TOLERANCE_SECONDS,
    SUPPORTED_FAMILIES,
    CLIP_SPECS,
    featureFlagEnabled,
    shouldTakeAuthority,
    nativeProjectileSpawnTime,
    projectileAnimations,
    install,
  });
});
