(function (root, factory) {
  const api = factory(
    root && root.RangerAnimationProjectileEngine,
    root && root.RangerAnimationProjectileEngineAdapter,
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RangerAnimationProjectileDoubleShadow = api;
    if (root.document) api.install(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (engine, adapter) {
  "use strict";

  const INDEX_URL = "https://res.warmycat.com/animation_meta/index.json";
  const META_BASE = "https://res.warmycat.com/animation_meta/";
  const DEFAULT_COORDINATE_SCALE = 0.5;
  const NATIVE_ACTION_FPS = 60;
  const POSITION_TOLERANCE_PX = 0.01;
  const TIME_TOLERANCE_SECONDS = 1 / NATIVE_ACTION_FPS;
  const DOUBLE_FAMILIES = new Set(["DOUBLE_LINEAR", "DOUBLE_CURVE"]);
  const DATA_KEY_BY_CLIP = Object.freeze({ attack: "normal", skill1: "skill1", skill2: "skill2" });
  const SECOND_SEGMENT_BY_DATA_KEY = Object.freeze({
    normal: "attack_a",
    skill1: "s_attack_a",
    skill2: "s2_attack_a",
  });
  const HIT_RATE_KEY_BY_DATA_KEY = Object.freeze({
    normal: "normalHitPointRate",
    skill1: "skill1HitPointRate",
    skill2: "skill2HitPointRate",
  });

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function positiveNumber(value, fallback = 0) {
    const number = finiteNumber(value, fallback);
    return number > 0 ? number : fallback;
  }

  function movementDuration(distance, moveSpeed) {
    const speed = positiveNumber(moveSpeed, 0);
    if (!speed) return 0;
    return Math.max(0, finiteNumber(distance, 0)) / (speed * NATIVE_ACTION_FPS);
  }

  function pointDistance(first, second) {
    if (!first || !second) return Infinity;
    return Math.hypot(
      finiteNumber(first.x) - finiteNumber(second.x),
      finiteNumber(first.y) - finiteNumber(second.y),
    );
  }

  function familyForAttack(attack, projectileEngine = engine, projectileAdapter = adapter) {
    if (!attack || !projectileAdapter?.familyForProjectile) return "UNKNOWN";
    return projectileAdapter.familyForProjectile({
      config: attack,
      motionType: String(attack.attackType || "").toUpperCase(),
    }, projectileEngine);
  }

  function secondSpawnDelay(meta, dataKey) {
    const segmentName = SECOND_SEGMENT_BY_DATA_KEY[dataKey];
    const bodyPart = meta?.parts?.body;
    const animation = bodyPart?.animations?.[segmentName];
    const frameCount = Number(animation?.frame_count);
    const frameRate = positiveNumber(bodyPart?.anim_rate, 0);
    if (!segmentName || !Number.isFinite(frameCount) || frameCount <= 0 || !frameRate) return null;
    return frameCount / frameRate;
  }

  function effectiveHitPointRate(meta, dataKey, family) {
    const raw = finiteNumber(meta?.projectileData?.hitTiming?.[HIT_RATE_KEY_BY_DATA_KEY[dataKey]], NaN);
    const fallback = family === "DOUBLE_CURVE" ? 0 : 0.25;
    if (!Number.isFinite(raw) || raw > 10) return fallback;
    return raw;
  }

  function screenStart(rawStart, coordinateScale, sceneScale, bodyOriginX, bodyOriginY, facing) {
    return {
      x: bodyOriginX + facing * finiteNumber(rawStart?.x, 0) * coordinateScale * sceneScale,
      y: bodyOriginY - finiteNumber(rawStart?.y, 0) * coordinateScale * sceneScale,
    };
  }

  function deriveDoubleGeometry(meta, dataKey, scene, target, dependencies = {}, mode = "native") {
    const projectileEngine = dependencies.engine || engine;
    const projectileAdapter = dependencies.adapter || adapter;
    if (!projectileEngine || !projectileAdapter) {
      return { supported: false, reason: "double-shadow-dependencies-unavailable" };
    }

    const attack = meta?.projectileData?.[dataKey];
    const family = familyForAttack(attack, projectileEngine, projectileAdapter);
    if (!DOUBLE_FAMILIES.has(family)) {
      return { supported: false, reason: `family-not-double:${family}`, family };
    }
    if (meta?.actorProjectileGround?.attacks?.[dataKey]) {
      return { supported: false, reason: "actor-ground-heuristic-active", family };
    }

    const rawStart = attack?.start;
    const rawSecondStart = attack?.secondStart;
    if (![rawStart?.x, rawStart?.y, rawSecondStart?.x, rawSecondStart?.y].every((value) => Number.isFinite(Number(value)))) {
      return { supported: false, reason: "double-start-geometry-unavailable", family };
    }

    const delay = secondSpawnDelay(meta, dataKey);
    if (!Number.isFinite(delay) || delay < 0) {
      return { supported: false, reason: "double-second-sam-boundary-unavailable", family };
    }

    const sceneScale = positiveNumber(scene?.sceneScale, 0);
    const bodyOriginX = Number(scene?.bodyOriginX);
    const bodyOriginY = Number(scene?.bodyOriginY);
    const targetX = Number(scene?.targetX);
    const targetBaseY = Number(scene?.targetBaseY);
    const targetHeight = positiveNumber(target?.contentHeight, 0);
    if (!sceneScale || !targetHeight || ![bodyOriginX, bodyOriginY, targetX, targetBaseY].every(Number.isFinite)) {
      return { supported: false, reason: "double-scene-or-target-unavailable", family };
    }

    const coordinateScale = positiveNumber(meta?.projectileData?.coordinateScale, DEFAULT_COORDINATE_SCALE);
    const facing = finiteNumber(scene?.facing, 1) < 0 ? -1 : 1;
    const firstStart = screenStart(rawStart, coordinateScale, sceneScale, bodyOriginX, bodyOriginY, facing);
    const secondStart = screenStart(rawSecondStart, coordinateScale, sceneScale, bodyOriginX, bodyOriginY, facing);
    const rawEndOffset = {
      x: finiteNumber(attack?.end?.x, 0) * coordinateScale,
      y: finiteNumber(attack?.end?.y, 0) * coordinateScale,
    };
    const viewerMode = mode === "viewer";
    const appliedEndOffset = viewerMode ? rawEndOffset : { x: 0, y: 0 };
    const baseEnd = {
      x: targetX + facing * appliedEndOffset.x * sceneScale,
      y: targetBaseY - appliedEndOffset.y * sceneScale,
    };
    const hitPointRate = effectiveHitPointRate(meta, dataKey, family);
    const end = {
      x: baseEnd.x,
      y: baseEnd.y - targetHeight * hitPointRate * sceneScale,
    };

    function projectileGeometry(start, spawnTime) {
      const nativeDistance = Math.hypot(baseEnd.x - start.x, baseEnd.y - start.y) / sceneScale;
      return {
        startX: start.x,
        startY: start.y,
        baseEndX: baseEnd.x,
        baseEndY: baseEnd.y,
        endX: end.x,
        endY: end.y,
        nativeDistance,
        flightDuration: movementDuration(nativeDistance, attack.moveSpeed),
        facing,
        spawnTime,
      };
    }

    const first = projectileGeometry(firstStart, 0);
    const second = projectileGeometry(secondStart, delay);
    const projectile = {
      config: attack,
      motionType: String(attack.attackType || "").toUpperCase(),
      moveSpeed: positiveNumber(attack.moveSpeed, 0),
      finishDuration: 0,
      rotationMode: String(attack?.motion?.rotation || "FIXED").toUpperCase(),
      isBasicAttack: dataKey === "normal",
    };

    return {
      supported: true,
      reason: null,
      family,
      projectile,
      geometryModel: viewerMode ? "viewer-current-double" : "native-double-v1",
      geometry: { ...first, second },
      secondSpawnDelay: delay,
      hitPointRate,
      rawEndOffset,
      appliedEndOffset,
    };
  }

  function geometryMigrationDelta(viewer, nativeGeometry) {
    if (!viewer?.supported || !nativeGeometry?.supported) return null;
    const first = viewer.geometry;
    const second = viewer.geometry.second;
    const nativeFirst = nativeGeometry.geometry;
    const nativeSecond = nativeGeometry.geometry.second;
    return {
      firstEndpointDelta: pointDistance(
        { x: first.endX, y: first.endY },
        { x: nativeFirst.endX, y: nativeFirst.endY },
      ),
      secondEndpointDelta: pointDistance(
        { x: second.endX, y: second.endY },
        { x: nativeSecond.endX, y: nativeSecond.endY },
      ),
      firstDurationDelta: Math.abs(first.flightDuration - nativeFirst.flightDuration),
      secondDurationDelta: Math.abs(second.flightDuration - nativeSecond.flightDuration),
      secondSpawnDelayDelta: Math.abs(second.spawnTime - nativeSecond.spawnTime),
    };
  }

  function buildDoubleShadowReport(input, dependencies = {}) {
    const projectileEngine = dependencies.engine || engine;
    const projectileAdapter = dependencies.adapter || adapter;
    const nativeGeometry = deriveDoubleGeometry(
      input?.meta, input?.dataKey, input?.scene, input?.target,
      { engine: projectileEngine, adapter: projectileAdapter },
      "native",
    );
    if (!nativeGeometry.supported) {
      return {
        supported: false,
        reason: nativeGeometry.reason,
        unitId: input?.unitId || "",
        clip: input?.clip || "",
        dataKey: input?.dataKey || "",
        family: nativeGeometry.family || null,
      };
    }

    const viewerGeometry = deriveDoubleGeometry(
      input?.meta, input?.dataKey, input?.scene, input?.target,
      { engine: projectileEngine, adapter: projectileAdapter },
      "viewer",
    );
    const comparison = projectileAdapter.compareMovingSimulation(
      nativeGeometry.projectile,
      nativeGeometry.geometry,
      {
        engine: projectileEngine,
        sceneScale: positiveNumber(input?.scene?.sceneScale, 1),
        spawnTime: 0,
        samples: 17,
      },
    );
    if (!comparison.supported) {
      return {
        supported: false,
        reason: comparison.reason,
        unitId: input?.unitId || "",
        clip: input?.clip || "",
        dataKey: input?.dataKey || "",
        family: nativeGeometry.family,
      };
    }

    const withinTolerance =
      comparison.maxPositionDelta <= POSITION_TOLERANCE_PX &&
      comparison.durationDelta <= TIME_TOLERANCE_SECONDS &&
      comparison.secondDurationDelta <= TIME_TOLERANCE_SECONDS;

    return {
      supported: true,
      reason: null,
      unitId: input?.unitId || "",
      clip: input?.clip || "",
      dataKey: input?.dataKey || "",
      attackType: comparison.attackType,
      family: comparison.family,
      geometryModel: nativeGeometry.geometryModel,
      secondSpawnDelay: nativeGeometry.secondSpawnDelay,
      firstImpactTime: comparison.impactTime,
      secondImpactTime: comparison.secondImpactTime,
      maxPositionDelta: comparison.maxPositionDelta,
      durationDelta: comparison.durationDelta,
      secondDurationDelta: comparison.secondDurationDelta,
      withinTolerance,
      viewerMigrationDelta: geometryMigrationDelta(viewerGeometry, nativeGeometry),
      viewerGeometry: viewerGeometry.supported ? viewerGeometry.geometry : null,
      nativeGeometry: nativeGeometry.geometry,
      simulationInput: comparison.input,
    };
  }

  function sharedBridge(rootObject, name) {
    if (rootObject[name]?.get && rootObject[name]?.set) return rootObject[name];
    const values = new WeakMap();
    const bridge = {
      get(section) { return section ? values.get(section) || null : null; },
      set(section, value) {
        if (!section) return;
        if (value === null || value === undefined) values.delete(section);
        else values.set(section, value);
      },
    };
    rootObject[name] = bridge;
    return bridge;
  }

  function install(rootObject) {
    if (rootObject.__RANGER_PROJECTILE_DOUBLE_SHADOW_INSTALLED__) return;
    rootObject.__RANGER_PROJECTILE_DOUBLE_SHADOW_INSTALLED__ = true;
    const bridge = sharedBridge(rootObject, "RangerAnimationProjectileDoubleShadowBridge");
    const bound = new WeakSet();
    const metaCache = new Map();
    let indexPromise = null;

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

    function publish(section, report) {
      bridge.set(section, report);
      section.dispatchEvent(new rootObject.CustomEvent(
        "ranger-animation-projectile-double-shadow-report",
        { detail: report },
      ));
      if (report.supported && !report.withinTolerance) {
        console.warn("DOUBLE projectile engine shadow mismatch", report);
      }
    }

    async function analyze(section, suppliedPlan = null) {
      const plan = suppliedPlan || rootObject.RangerAnimationPlaybackBridge?.get?.(section);
      if (!plan) return;
      const clip = String(plan.selectedClip || "");
      const dataKey = DATA_KEY_BY_CLIP[clip];
      if (!dataKey) return;
      const unitId = section.dataset.animationUnitId || "";
      const meta = await loadMeta(unitId);
      if (!meta) return;
      const family = familyForAttack(meta?.projectileData?.[dataKey], engine, adapter);
      if (!DOUBLE_FAMILIES.has(family)) return;
      publish(section, buildDoubleShadowReport({
        unitId,
        clip,
        dataKey,
        meta,
        scene: rootObject.RangerAnimationSceneBridge?.get?.(section) || null,
        target: rootObject.RangerAnimationTargetBridge?.get?.(section) || null,
      }));
    }

    function bindSection(section) {
      if (!section || bound.has(section)) return;
      bound.add(section);
      section.addEventListener("ranger-animation-playback-plan", (event) => analyze(section, event.detail || null));
      section.addEventListener("ranger-animation-target-change", () => analyze(section));
      queueMicrotask(() => analyze(section));
    }

    function patchAll() {
      rootObject.document.querySelectorAll(".ranger-animation-section").forEach(bindSection);
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
    DEFAULT_COORDINATE_SCALE,
    NATIVE_ACTION_FPS,
    POSITION_TOLERANCE_PX,
    TIME_TOLERANCE_SECONDS,
    secondSpawnDelay,
    effectiveHitPointRate,
    deriveDoubleGeometry,
    geometryMigrationDelta,
    buildDoubleShadowReport,
    install,
  });
});
