(function (root, factory) {
  const api = factory(
    root && root.RangerAnimationProjectileEngine,
    root && root.RangerAnimationProjectileEngineAdapter,
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RangerAnimationProjectileShadow = api;
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
  const SUPPORTED_FAMILIES = new Set(["LINEAR", "CURVE", "RETURN"]);
  const DATA_KEY_BY_CLIP = Object.freeze({
    attack: "normal",
    skill1: "skill1",
    skill2: "skill2",
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

  function point(value, fallback = { x: 0, y: 0 }) {
    return {
      x: finiteNumber(value?.x, fallback.x),
      y: finiteNumber(value?.y, fallback.y),
    };
  }

  function pointDistance(first, second) {
    if (!first || !second) return Infinity;
    return Math.hypot(
      finiteNumber(first.x) - finiteNumber(second.x),
      finiteNumber(first.y) - finiteNumber(second.y),
    );
  }

  function movementDuration(distance, moveSpeed) {
    const speed = positiveNumber(moveSpeed, 0);
    if (!speed) return 0;
    return Math.max(0, finiteNumber(distance, 0)) / (speed * NATIVE_ACTION_FPS);
  }

  function defaultHitPointRate(family) {
    if (family === "CURVE") return 0;
    if (family === "LINEAR" || family === "RETURN") return 0.25;
    return null;
  }

  function effectiveHitPointRate(meta, dataKey, family) {
    const key = HIT_RATE_KEY_BY_DATA_KEY[dataKey];
    const raw = finiteNumber(meta?.projectileData?.hitTiming?.[key], NaN);
    const fallback = defaultHitPointRate(family);
    if (!Number.isFinite(raw)) return fallback;
    if (raw > 10 && SUPPORTED_FAMILIES.has(family)) return fallback;
    return raw;
  }

  function projectileForAttack(attack, dataKey) {
    return {
      config: attack,
      motionType: String(attack?.attackType || "").toUpperCase(),
      moveSpeed: positiveNumber(attack?.moveSpeed, 0),
      finishDuration: 0,
      rotationMode: String(attack?.motion?.rotation || "FIXED").toUpperCase(),
      isBasicAttack: dataKey === "normal",
    };
  }

  function deriveGeometry(meta, dataKey, scene, target, dependencies = {}, mode = "native") {
    const projectileEngine = dependencies.engine || engine;
    const projectileAdapter = dependencies.adapter || adapter;
    if (!projectileEngine || !projectileAdapter) {
      return { supported: false, reason: "shadow-dependencies-unavailable" };
    }

    const attack = meta?.projectileData?.[dataKey];
    if (!attack || typeof attack !== "object") {
      return { supported: false, reason: "projectile-data-unavailable" };
    }

    const projectile = projectileForAttack(attack, dataKey);
    const family = projectileAdapter.familyForProjectile(projectile, projectileEngine);
    if (!SUPPORTED_FAMILIES.has(family)) {
      return { supported: false, reason: `family-not-shadowed:${family}`, family };
    }

    if (meta?.actorProjectileGround?.attacks?.[dataKey]) {
      return { supported: false, reason: "actor-ground-heuristic-active", family };
    }

    const rawStartX = Number(attack?.start?.x);
    const rawStartY = Number(attack?.start?.y);
    if (!Number.isFinite(rawStartX) || !Number.isFinite(rawStartY)) {
      return { supported: false, reason: "database-start-unavailable", family };
    }

    const sceneScale = positiveNumber(scene?.sceneScale, 0);
    const bodyOriginX = Number(scene?.bodyOriginX);
    const bodyOriginY = Number(scene?.bodyOriginY);
    const targetX = Number(scene?.targetX);
    const targetBaseY = Number(scene?.targetBaseY);
    if (
      !sceneScale ||
      !Number.isFinite(bodyOriginX) || !Number.isFinite(bodyOriginY) ||
      !Number.isFinite(targetX) || !Number.isFinite(targetBaseY)
    ) {
      return { supported: false, reason: "scene-geometry-unavailable", family };
    }

    const targetHeight = positiveNumber(target?.contentHeight, 0);
    if (!targetHeight) {
      return { supported: false, reason: "target-profile-unavailable", family };
    }

    const coordinateScale = positiveNumber(
      meta?.projectileData?.coordinateScale,
      DEFAULT_COORDINATE_SCALE,
    );
    const facing = finiteNumber(scene?.facing, 1) < 0 ? -1 : 1;
    const startLocal = {
      x: rawStartX * coordinateScale,
      y: rawStartY * coordinateScale,
    };
    const start = {
      x: bodyOriginX + facing * startLocal.x * sceneScale,
      y: bodyOriginY - startLocal.y * sceneScale,
    };

    const rawEndOffset = {
      x: finiteNumber(attack?.end?.x, 0) * coordinateScale,
      y: finiteNumber(attack?.end?.y, 0) * coordinateScale,
    };

    /*
     * Native migration v1:
     * - LINEAR / CURVE do not use projectileEndX/Y as generic target offsets.
     * - RETURN still preserves the existing endpoint interpretation here until
     *   its dedicated two-leg payload migration is landed separately.
     * - viewer mode intentionally reproduces current production behavior so
     *   the migration delta remains observable instead of being hidden.
     */
    const viewerMode = mode === "viewer";
    const applyGenericEndOffset = viewerMode || family === "RETURN";
    const appliedEndOffset = applyGenericEndOffset
      ? rawEndOffset
      : { x: 0, y: 0 };
    const baseEnd = {
      x: targetX + facing * appliedEndOffset.x * sceneScale,
      y: targetBaseY - appliedEndOffset.y * sceneScale,
    };
    const hitPointRate = effectiveHitPointRate(meta, dataKey, family);
    const end = {
      x: baseEnd.x,
      y: baseEnd.y - targetHeight * finiteNumber(hitPointRate, 0) * sceneScale,
    };

    const nativeDistance = Math.hypot(
      baseEnd.x - start.x,
      baseEnd.y - start.y,
    ) / sceneScale;
    const flightDuration = movementDuration(nativeDistance, attack?.moveSpeed);

    const rawSecondStart = point(attack?.secondStart, attack?.start || { x: 0, y: 0 });
    const secondStart = {
      x: rawSecondStart.x * coordinateScale,
      y: rawSecondStart.y * coordinateScale,
    };
    const returnEnd = {
      x: bodyOriginX + facing * secondStart.x * sceneScale,
      y: bodyOriginY - secondStart.y * sceneScale,
    };
    const returnNativeDistance = Math.hypot(
      returnEnd.x - end.x,
      returnEnd.y - end.y,
    ) / sceneScale;
    const returnDuration = movementDuration(returnNativeDistance, attack?.moveSpeed);

    return {
      supported: true,
      reason: null,
      family,
      projectile,
      geometryModel: viewerMode ? "viewer-current" : "native-v1",
      geometry: {
        startX: start.x,
        startY: start.y,
        baseEndX: baseEnd.x,
        baseEndY: baseEnd.y,
        endX: end.x,
        endY: end.y,
        nativeDistance,
        flightDuration,
        returnEndX: returnEnd.x,
        returnEndY: returnEnd.y,
        returnNativeDistance,
        returnDuration,
        facing,
      },
      rawEndOffset,
      appliedEndOffset,
      hitPointRate,
      coordinateScale,
    };
  }

  function deriveViewerGeometry(meta, dataKey, scene, target, dependencies = {}) {
    return deriveGeometry(meta, dataKey, scene, target, dependencies, "viewer");
  }

  function deriveNativeGeometry(meta, dataKey, scene, target, dependencies = {}) {
    return deriveGeometry(meta, dataKey, scene, target, dependencies, "native");
  }

  // Compatibility entry point used by the Step B3 authority layer. From the
  // native geometry migration onward it intentionally resolves to native-v1.
  function deriveLegacyGeometry(meta, dataKey, scene, target, dependencies = {}) {
    return deriveNativeGeometry(meta, dataKey, scene, target, dependencies);
  }

  function geometryMigrationDelta(viewer, nativeGeometry) {
    if (!viewer?.supported || !nativeGeometry?.supported) return null;
    return {
      baseEndDelta: pointDistance(
        { x: viewer.geometry.baseEndX, y: viewer.geometry.baseEndY },
        { x: nativeGeometry.geometry.baseEndX, y: nativeGeometry.geometry.baseEndY },
      ),
      endpointDelta: pointDistance(
        { x: viewer.geometry.endX, y: viewer.geometry.endY },
        { x: nativeGeometry.geometry.endX, y: nativeGeometry.geometry.endY },
      ),
      durationDelta: Math.abs(
        finiteNumber(viewer.geometry.flightDuration) -
        finiteNumber(nativeGeometry.geometry.flightDuration)
      ),
      returnDurationDelta: Math.abs(
        finiteNumber(viewer.geometry.returnDuration) -
        finiteNumber(nativeGeometry.geometry.returnDuration)
      ),
    };
  }

  function buildShadowReport(input, dependencies = {}) {
    const projectileEngine = dependencies.engine || engine;
    const projectileAdapter = dependencies.adapter || adapter;
    const dataKey = input?.dataKey;
    const nativeGeometry = deriveNativeGeometry(
      input?.meta,
      dataKey,
      input?.scene,
      input?.target,
      { engine: projectileEngine, adapter: projectileAdapter },
    );

    if (!nativeGeometry.supported) {
      return {
        supported: false,
        reason: nativeGeometry.reason,
        unitId: input?.unitId || "",
        clip: input?.clip || "",
        dataKey: dataKey || "",
        family: nativeGeometry.family || null,
      };
    }

    const viewerGeometry = deriveViewerGeometry(
      input?.meta,
      dataKey,
      input?.scene,
      input?.target,
      { engine: projectileEngine, adapter: projectileAdapter },
    );
    const migrationDelta = geometryMigrationDelta(viewerGeometry, nativeGeometry);

    const rawLegacyImpactTime = input?.legacyImpactTime;
    const legacyImpactTime = rawLegacyImpactTime === null || rawLegacyImpactTime === undefined
      ? NaN
      : Number(rawLegacyImpactTime);
    const viewerFlightDuration = viewerGeometry.supported
      ? viewerGeometry.geometry.flightDuration
      : nativeGeometry.geometry.flightDuration;
    const spawnTime = Number.isFinite(legacyImpactTime)
      ? Math.max(0, legacyImpactTime - viewerFlightDuration)
      : 0;
    const comparison = projectileAdapter.compareMovingSimulation(
      nativeGeometry.projectile,
      nativeGeometry.geometry,
      {
        engine: projectileEngine,
        sceneScale: positiveNumber(input?.scene?.sceneScale, 1),
        spawnTime,
        samples: 17,
      },
    );

    if (!comparison.supported) {
      return {
        supported: false,
        reason: comparison.reason,
        unitId: input?.unitId || "",
        clip: input?.clip || "",
        dataKey,
        family: nativeGeometry.family,
      };
    }

    const impactDelta = Number.isFinite(legacyImpactTime)
      ? Math.abs(finiteNumber(comparison.impactTime) - legacyImpactTime)
      : null;

    // withinTolerance now means engine-vs-native-model consistency. Deliberate
    // viewer migration differences are reported separately and do not block
    // feature-flagged native authority.
    const withinTolerance =
      comparison.maxPositionDelta <= POSITION_TOLERANCE_PX &&
      comparison.durationDelta <= TIME_TOLERANCE_SECONDS &&
      comparison.returnDurationDelta <= TIME_TOLERANCE_SECONDS;
    const viewerWithinTolerance = Boolean(
      migrationDelta &&
      migrationDelta.baseEndDelta <= POSITION_TOLERANCE_PX &&
      migrationDelta.endpointDelta <= POSITION_TOLERANCE_PX &&
      migrationDelta.durationDelta <= TIME_TOLERANCE_SECONDS &&
      migrationDelta.returnDurationDelta <= TIME_TOLERANCE_SECONDS &&
      (impactDelta === null || impactDelta <= TIME_TOLERANCE_SECONDS)
    );

    return {
      supported: true,
      reason: null,
      unitId: input?.unitId || "",
      clip: input?.clip || "",
      dataKey,
      attackType: comparison.attackType,
      family: comparison.family,
      geometryModel: nativeGeometry.geometryModel,
      legacyImpactTime: Number.isFinite(legacyImpactTime) ? legacyImpactTime : null,
      engineImpactTime: comparison.impactTime,
      impactDelta,
      maxPositionDelta: comparison.maxPositionDelta,
      durationDelta: comparison.durationDelta,
      returnDurationDelta: comparison.returnDurationDelta,
      withinTolerance,
      viewerWithinTolerance,
      viewerMigrationDelta: migrationDelta,
      viewerGeometry: viewerGeometry.supported ? viewerGeometry.geometry : null,
      nativeGeometry: nativeGeometry.geometry,
      geometry: nativeGeometry.geometry,
      rawEndOffset: nativeGeometry.rawEndOffset,
      appliedEndOffset: nativeGeometry.appliedEndOffset,
      simulationInput: comparison.input,
    };
  }

  function sharedBridge(rootObject, name) {
    if (rootObject[name]?.get && rootObject[name]?.set) return rootObject[name];
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
    rootObject[name] = bridge;
    return bridge;
  }

  function install(rootObject) {
    if (rootObject.__RANGER_PROJECTILE_SHADOW_INSTALLED__) return;
    rootObject.__RANGER_PROJECTILE_SHADOW_INSTALLED__ = true;

    const shadowBridge = sharedBridge(rootObject, "RangerAnimationProjectileShadowBridge");
    const boundSections = new WeakSet();
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
      shadowBridge.set(section, report);
      section.dispatchEvent(new rootObject.CustomEvent(
        "ranger-animation-projectile-shadow-report",
        { detail: report },
      ));
      if (report.supported && !report.withinTolerance) {
        rootObject.console?.warn?.("Projectile engine/native geometry mismatch", report);
      }
    }

    async function analyze(section, suppliedPlan = null) {
      const plan = suppliedPlan || rootObject.RangerAnimationPlaybackBridge?.get?.(section);
      if (!plan) return;
      const clip = String(plan.selectedClip || "");
      const dataKey = DATA_KEY_BY_CLIP[clip];
      if (!dataKey) {
        publish(section, {
          supported: false,
          reason: "clip-not-shadowed",
          unitId: section.dataset.animationUnitId || "",
          clip,
          dataKey: "",
          family: null,
        });
        return;
      }

      const unitId = section.dataset.animationUnitId || "";
      const [meta, scene, target] = await Promise.all([
        loadMeta(unitId),
        Promise.resolve(rootObject.RangerAnimationSceneBridge?.get?.(section) || null),
        Promise.resolve(rootObject.RangerAnimationTargetBridge?.get?.(section) || null),
      ]);
      if (!meta) {
        publish(section, {
          supported: false,
          reason: "animation-meta-unavailable",
          unitId,
          clip,
          dataKey,
          family: null,
        });
        return;
      }

      publish(section, buildShadowReport({
        unitId,
        clip,
        dataKey,
        meta,
        scene,
        target,
        legacyImpactTime: plan.impactTime,
      }));
    }

    function bindSection(section) {
      if (!section || boundSections.has(section)) return;
      boundSections.add(section);
      section.addEventListener("ranger-animation-playback-plan", (event) => {
        analyze(section, event.detail || null);
      });
      section.addEventListener("ranger-animation-target-change", () => {
        analyze(section);
      });
      queueMicrotask(() => analyze(section));
    }

    function patchAll() {
      rootObject.document
        .querySelectorAll(".ranger-animation-section")
        .forEach(bindSection);
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
    effectiveHitPointRate,
    deriveViewerGeometry,
    deriveNativeGeometry,
    deriveLegacyGeometry,
    geometryMigrationDelta,
    buildShadowReport,
    install,
  });
});
