(function (root, factory) {
  const api = factory(
    root && root.RangerAnimationProjectileEngine,
    root && root.RangerAnimationProjectileEngineAdapter,
    root && root.RangerAnimationProjectileDoubleShadow,
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RangerAnimationProjectileDoubleAuthority = api;
    if (root.document) api.install(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (engine, adapter, doubleShadow) {
  "use strict";

  const INDEX_URL = "https://res.warmycat.com/animation_meta/index.json";
  const META_BASE = "https://res.warmycat.com/animation_meta/";
  const RESOURCE_PRIMARY_BASE = "https://res.warmycat.com/";
  const RESOURCE_FALLBACK_BASE = "https://rangers.lerico.net/res/";
  const OLD_PRIMARY_PREFIX = "res_from_emulator/";
  const DOUBLE_FAMILIES = new Set(["DOUBLE_LINEAR", "DOUBLE_CURVE"]);

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
      body: ["s_attack_all", "s_attack", "s_attack_a", "s_attack_b"],
      ready: ["s_attack_ready"],
      trigger: ["s_attack", "s_attack_a", "s_attack_b"],
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
      DOUBLE_FAMILIES.has(String(report?.family || "").toUpperCase())
    );
  }

  function runtimeInput(report, firstSpawnTime, finishDuration = 0) {
    if (!shouldTakeAuthority(report, true) || !report?.simulationInput?.second) return null;
    const firstSpawn = Math.max(0, finiteNumber(firstSpawnTime, 0));
    const secondDelay = Math.max(0, finiteNumber(report.secondSpawnDelay, NaN));
    if (!Number.isFinite(secondDelay)) return null;
    return {
      ...report.simulationInput,
      spawnTime: firstSpawn,
      finishDuration: Math.max(0, finiteNumber(finishDuration, 0)),
      second: {
        ...report.simulationInput.second,
        spawnTime: firstSpawn + secondDelay,
      },
    };
  }

  function projectilePhase(projectile, time) {
    if (!projectile || !Number.isFinite(time) || time < projectile.spawnTime) return "before";
    if (time <= projectile.impactTime) return "moving";
    if (
      Number.isFinite(projectile.finishEndTime) &&
      projectile.finishEndTime > projectile.impactTime &&
      time <= projectile.finishEndTime
    ) return "finish";
    return time <= projectile.cleanupTime ? "cleanup" : "after";
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
      if (label) return clamp(finiteNumber(label.seconds, 0), 0, Math.max(0, clipDuration - 0.001));
    }
    for (const readyName of spec.ready || []) {
      const duration = namedAnimationDuration(bodyPart, readyName);
      if (duration > 0) return clamp(duration, 0, Math.max(0, clipDuration - 0.001));
    }
    return 0;
  }

  function projectileAnimations(meta, spec, attack) {
    const requestedPartName = text(attack?.animationPart) || spec.bullet;
    const bulletPart = meta?.parts?.[requestedPartName] || meta?.parts?.[spec.bullet];
    if (!bulletPart) return null;
    const outbound = getAnim(bulletPart, ["normal", "idle", "wait", "shot", "fire", "attack", "_all"]);
    if (!outbound) return null;
    const finish = getAnim(bulletPart, ["finish", "hit", "end"]);
    return { bulletPart, outbound, finish };
  }

  function frameIndex(part, animationName, elapsed, loop) {
    const animation = part?.animations?.[animationName];
    if (!animation?.frames?.length) return 0;
    const rawFrame = Math.floor(Math.max(0, elapsed) * Math.max(1, part?.anim_rate || 24));
    return loop
      ? ((rawFrame % animation.frame_count) + animation.frame_count) % animation.frame_count
      : clamp(rawFrame, 0, animation.frame_count - 1);
  }

  function spriteDimensions(part, imageName) {
    const sprite = part?.sprites?.[imageName];
    const [, , width, height] = sprite?.rect || [];
    return width && height ? { width, height } : null;
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
        atlas, sourceX, sourceY, dimensions.height, dimensions.width,
        -dimensions.height / 2, -dimensions.width / 2,
        dimensions.height, dimensions.width,
      );
    } else {
      context.drawImage(atlas, sourceX, sourceY, dimensions.width, dimensions.height, 0, 0, dimensions.width, dimensions.height);
    }
    return canvas;
  }

  function drawSprite(context, spriteCanvas, objectMatrix, imageMatrix, color, originX, originY, scale) {
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
    context.translate(originX + worldCenterX * scale, originY + worldCenterY * scale);
    context.rotate(angle);
    context.scale((flipX ? -1 : 1) * localScaleX * scale, localScaleY * scale);
    context.drawImage(spriteCanvas, -width / 2, -height / 2);
    context.restore();
  }

  function install(rootObject) {
    if (rootObject.__RANGER_PROJECTILE_DOUBLE_AUTHORITY_INSTALLED__) return;
    rootObject.__RANGER_PROJECTILE_DOUBLE_AUTHORITY_INSTALLED__ = true;
    const enabled = featureFlagEnabled(rootObject);
    if (!enabled) return;
    if (!engine?.createProjectileSimulation || !adapter?.createSimulationInput || !doubleShadow?.deriveDoubleGeometry) {
      console.warn("DOUBLE projectile authority disabled: dependencies unavailable");
      return;
    }

    const states = new Set();
    const sectionStates = new WeakMap();
    const metaCache = new Map();
    const imageCache = new Map();
    const spriteCache = new Map();
    let indexPromise = null;
    let rafId = 0;

    function statusBridge() {
      if (rootObject.RangerAnimationProjectileDoubleAuthorityBridge?.get && rootObject.RangerAnimationProjectileDoubleAuthorityBridge?.set) {
        return rootObject.RangerAnimationProjectileDoubleAuthorityBridge;
      }
      const values = new WeakMap();
      rootObject.RangerAnimationProjectileDoubleAuthorityBridge = {
        get(section) { return section ? values.get(section) || null : null; },
        set(section, value) {
          if (!section) return;
          if (value === null || value === undefined) values.delete(section);
          else values.set(section, value);
        },
      };
      return rootObject.RangerAnimationProjectileDoubleAuthorityBridge;
    }
    const bridge = statusBridge();

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
      const promise = new Promise((resolve) => {
        const image = new rootObject.Image();
        let fallbackUsed = false;
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => {
          if (!fallbackUsed) {
            fallbackUsed = true;
            image.src = `${RESOURCE_FALLBACK_BASE}${normalizedPath}`;
            return;
          }
          resolve(null);
        };
        image.src = `${RESOURCE_PRIMARY_BASE}${normalizedPath}`;
      });
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

    async function drawSamFrame(context, part, animationName, elapsed, originX, originY, scale, rotation, loop) {
      const animation = part?.animations?.[animationName];
      if (!animation?.frames?.length) return false;
      const atlas = await loadImage(part.png);
      if (!atlas) return false;
      const frame = animation.frames[frameIndex(part, animationName, elapsed, loop)] || [];
      context.save();
      context.translate(originX, originY);
      if (rotation) context.rotate(rotation * Math.PI / 180);
      for (const item of frame) {
        const [, resourceNumber, objectMatrix, color] = item || [];
        const imageDefinition = part.images?.[resourceNumber];
        if (!imageDefinition || !Array.isArray(objectMatrix) || !Array.isArray(imageDefinition.m)) continue;
        const sprite = spriteCanvas(part, atlas, imageDefinition.name);
        if (!sprite) continue;
        drawSprite(context, sprite, objectMatrix, imageDefinition.m, color, 0, 0, scale);
      }
      context.restore();
      return true;
    }

    function ensureOverlay(state) {
      const mainCanvas = state.section.querySelector(".ranger-animation-canvas");
      if (!mainCanvas) return null;
      let overlay = state.section.querySelector(".ranger-animation-engine-double-projectile-canvas");
      if (!overlay) {
        overlay = rootObject.document.createElement("canvas");
        overlay.className = "ranger-animation-engine-double-projectile-canvas";
        overlay.setAttribute("aria-hidden", "true");
        overlay.style.position = "absolute";
        overlay.style.inset = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.pointerEvents = "none";
        overlay.style.zIndex = "3";
        mainCanvas.parentElement?.appendChild(overlay);
      }
      if (overlay.width !== mainCanvas.width) overlay.width = mainCanvas.width;
      if (overlay.height !== mainCanvas.height) overlay.height = mainCanvas.height;
      return overlay;
    }

    function legacyCanvas(state) {
      return state.section.querySelector(".ranger-animation-projectile-canvas");
    }

    function release(state, reason) {
      const legacy = legacyCanvas(state);
      if (legacy) legacy.style.visibility = "";
      const context = state.overlay?.getContext("2d");
      context?.clearRect(0, 0, state.overlay.width, state.overlay.height);
      state.active = false;
      bridge.set(state.section, {
        active: false,
        family: state.report?.family || null,
        reason,
      });
    }

    async function prepare(section, report) {
      let state = sectionStates.get(section);
      if (!state) {
        state = { section, active: false, report: null, plan: null, token: 0 };
        sectionStates.set(section, state);
        states.add(state);
      }
      state.report = report;
      const plan = rootObject.RangerAnimationPlaybackBridge?.get?.(section);
      state.plan = plan;
      if (!shouldTakeAuthority(report, enabled) || !plan) {
        release(state, "double-shadow-not-authoritative");
        return;
      }

      const token = ++state.token;
      const unitId = section.dataset.animationUnitId || "";
      const meta = await loadMeta(unitId);
      if (!meta || token !== state.token) return;
      const spec = CLIP_SPECS[String(plan.selectedClip || "")];
      if (!spec || spec.dataKey !== report.dataKey) {
        release(state, "double-clip-spec-unavailable");
        return;
      }
      const scene = rootObject.RangerAnimationSceneBridge?.get?.(section);
      const target = rootObject.RangerAnimationTargetBridge?.get?.(section);
      const live = doubleShadow.deriveDoubleGeometry(meta, spec.dataKey, scene, target, { engine, adapter }, "native");
      if (!live.supported || live.family !== report.family) {
        release(state, live.reason || "double-live-geometry-mismatch");
        return;
      }

      const bodyPart = meta?.parts?.body;
      const bodyAnimation = getAnim(bodyPart, spec.body);
      const clipDuration = animationDuration(bodyPart, bodyAnimation);
      if (!bodyAnimation || !clipDuration) {
        release(state, "double-body-animation-unavailable");
        return;
      }
      const firstSpawnTime = nativeProjectileSpawnTime(bodyPart, bodyAnimation.name, spec, clipDuration);
      const animations = projectileAnimations(meta, spec, meta?.projectileData?.[spec.dataKey]);
      if (!animations) {
        release(state, "double-projectile-animation-unavailable");
        return;
      }
      const finishDuration = animationDuration(animations.bulletPart, animations.finish);
      const geometry = {
        ...live.geometry,
        second: {
          ...live.geometry.second,
          spawnTime: firstSpawnTime + live.secondSpawnDelay,
        },
      };
      const projectile = { ...live.projectile, finishDuration };
      const adapted = adapter.createSimulationInput(projectile, geometry, {
        engine,
        sceneScale: finiteNumber(scene?.sceneScale, 1),
        spawnTime: firstSpawnTime,
      });
      if (!adapted.supported || !adapted.input?.second) {
        release(state, adapted.reason || "double-runtime-input-unavailable");
        return;
      }
      const simulation = engine.createProjectileSimulation(adapted.input);
      if (simulation.projectiles?.length !== 2) {
        release(state, "double-runtime-projectile-count-invalid");
        return;
      }

      state.meta = meta;
      state.scene = scene;
      state.geometry = geometry;
      state.simulation = simulation;
      state.animations = animations;
      state.overlay = ensureOverlay(state);
      state.active = Boolean(state.overlay);
      bridge.set(section, {
        active: state.active,
        family: simulation.family,
        reason: state.active ? null : "double-overlay-unavailable",
        firstSpawnTime,
        secondSpawnTime: simulation.projectiles[1].spawnTime,
        firstImpactTime: simulation.projectiles[0].impactTime,
        secondImpactTime: simulation.projectiles[1].impactTime,
        cleanupTime: simulation.cleanupTime,
      });
      startLoop();
    }

    async function drawState(state, now) {
      if (!state.active || !state.overlay || !state.simulation || !state.plan) return;
      const context = state.overlay.getContext("2d");
      if (!context) {
        release(state, "double-overlay-context-unavailable");
        return;
      }
      const cycleDuration = Math.max(0, finiteNumber(state.plan.cycleDuration, 0));
      const startedAt = finiteNumber(state.plan.startedAt, 0);
      if (!cycleDuration || !startedAt) {
        release(state, "double-playback-clock-unavailable");
        return;
      }
      const elapsed = Math.max(0, (now - startedAt) / 1000);
      const cycleTime = elapsed % cycleDuration;
      const firstSpawn = state.simulation.projectiles[0].spawnTime;
      const cleanup = state.simulation.cleanupTime;
      const controlled = cycleTime >= firstSpawn && cycleTime <= cleanup;
      const legacy = legacyCanvas(state);
      if (!controlled) {
        if (legacy) legacy.style.visibility = "";
        context.clearRect(0, 0, state.overlay.width, state.overlay.height);
        return;
      }

      if (legacy) legacy.style.visibility = "hidden";
      context.clearRect(0, 0, state.overlay.width, state.overlay.height);
      const scale = finiteNumber(state.scene?.sceneScale, 1);
      const geometries = [state.geometry, state.geometry.second];
      for (let index = 0; index < state.simulation.projectiles.length; index += 1) {
        const projectile = state.simulation.projectiles[index];
        const phase = projectilePhase(projectile, cycleTime);
        if (phase === "moving") {
          const position = projectile.positionAt(cycleTime);
          if (!position) continue;
          const rotation = finiteNumber(projectile.rotationAt(cycleTime), 0);
          await drawSamFrame(
            context,
            state.animations.bulletPart,
            state.animations.outbound.name,
            cycleTime - projectile.spawnTime,
            position.x,
            position.y,
            scale,
            rotation,
            true,
          );
        } else if (phase === "finish" && state.animations.finish) {
          const geometry = geometries[index];
          await drawSamFrame(
            context,
            state.animations.bulletPart,
            state.animations.finish.name,
            cycleTime - projectile.impactTime,
            geometry.endX,
            geometry.endY,
            scale,
            0,
            false,
          );
        }
      }
    }

    function startLoop() {
      if (rafId) return;
      const tick = (now) => {
        rafId = rootObject.requestAnimationFrame(tick);
        for (const state of states) {
          drawState(state, now).catch((error) => {
            console.warn("DOUBLE projectile authority failed closed", error);
            release(state, "double-runtime-error");
          });
        }
      };
      rafId = rootObject.requestAnimationFrame(tick);
    }

    function bind(section) {
      if (!section || section.__rangerDoubleAuthorityBound) return;
      section.__rangerDoubleAuthorityBound = true;
      section.addEventListener("ranger-animation-projectile-double-shadow-report", (event) => {
        prepare(section, event.detail || null).catch((error) => {
          console.warn("DOUBLE projectile authority preparation failed", error);
          const state = sectionStates.get(section);
          if (state) release(state, "double-prepare-error");
        });
      });
      section.addEventListener("ranger-animation-playback-plan", () => {
        const report = rootObject.RangerAnimationProjectileDoubleShadowBridge?.get?.(section);
        if (report) prepare(section, report);
      });
    }

    function patchAll() {
      rootObject.document.querySelectorAll(".ranger-animation-section").forEach(bind);
    }
    const observer = new rootObject.MutationObserver(patchAll);
    const start = () => {
      observer.observe(rootObject.document.body, { childList: true, subtree: true });
      patchAll();
    };
    if (rootObject.document.readyState === "loading") {
      rootObject.document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }

  return Object.freeze({
    DOUBLE_FAMILIES,
    CLIP_SPECS,
    featureFlagEnabled,
    shouldTakeAuthority,
    runtimeInput,
    projectilePhase,
    nativeProjectileSpawnTime,
    install,
  });
});
