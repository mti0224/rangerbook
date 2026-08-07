(function (root, factory) {
  const api = factory(
    root && root.RangerAnimationProjectileEngine,
    root && root.RangerAnimationProjectileEngineAdapter,
    root && root.RangerAnimationProjectileShadow,
    root && root.RangerAnimationProjectileDoubleShadow,
    root && root.RangerAnimationProjectileAuthority,
    root && root.RangerAnimationProjectileDoubleAuthority,
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RangerAnimationSimulation = api;
    if (root.document) api.install(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  engine,
  adapter,
  shadow,
  doubleShadow,
  authority,
  doubleAuthority,
) {
  "use strict";

  const INDEX_URL = "https://res.warmycat.com/animation_meta/index.json";
  const META_BASE = "https://res.warmycat.com/animation_meta/";
  const STANDARD_FAMILIES = new Set(["LINEAR", "CURVE", "RETURN"]);
  const DOUBLE_FAMILIES = new Set(["DOUBLE_LINEAR", "DOUBLE_CURVE"]);

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function getAnim(part, names) {
    if (!part) return null;
    for (const name of names || []) {
      const animation = part.animations?.[name];
      if (animation?.frames?.length) return { name, anim: animation };
    }
    return null;
  }

  function animationDuration(part, animationResult) {
    if (!animationResult) return 0;
    return animationResult.anim.frame_count / Math.max(1, part?.anim_rate || 24);
  }

  function familyForAttack(attack, projectileEngine = engine, projectileAdapter = adapter) {
    if (!attack || !projectileAdapter?.familyForProjectile) return "UNKNOWN";
    return projectileAdapter.familyForProjectile({
      config: attack,
      motionType: String(attack.attackType || "").toUpperCase(),
    }, projectileEngine);
  }

  function verifiedReportForFamily(family, standardReport, doubleReport) {
    const report = DOUBLE_FAMILIES.has(family) ? doubleReport : standardReport;
    if (!report?.supported || !report?.withinTolerance) return null;
    return String(report.family || "").toUpperCase() === family ? report : null;
  }

  function playbackSpawnTime(meta, plan, spec) {
    const bodyPart = meta?.parts?.body;
    const bodyAnimation = getAnim(bodyPart, spec?.body);
    const clipDuration = animationDuration(bodyPart, bodyAnimation);
    if (!bodyAnimation || !clipDuration || !authority?.nativeProjectileSpawnTime) return null;
    return authority.nativeProjectileSpawnTime(bodyPart, bodyAnimation.name, spec, clipDuration);
  }

  function normalizePlan(simulation, plan, unitId, family, authoritative) {
    const events = Array.isArray(simulation?.events) ? simulation.events.map((event) => ({ ...event })) : [];
    const impactEvents = events.filter((event) => event.type === "projectile-impact" || event.type === "beam-impact" || event.type === "direct-hit" || event.type === "skill-hit");
    return {
      source: "engine",
      authoritative: Boolean(authoritative),
      unitId: unitId || "",
      selectedClip: String(plan?.selectedClip || ""),
      startedAt: finiteNumber(plan?.startedAt, 0),
      cycleDuration: Math.max(0, finiteNumber(plan?.cycleDuration, 0)),
      family,
      attackType: simulation?.sourceAttackType || "NONE",
      events,
      impactEvents,
      primaryImpactTime: impactEvents[0]?.time ?? null,
      simulation,
    };
  }

  function buildSimulationPlan(input, dependencies = {}) {
    const projectileEngine = dependencies.engine || engine;
    const projectileAdapter = dependencies.adapter || adapter;
    const projectileShadow = dependencies.shadow || shadow;
    const projectileDoubleShadow = dependencies.doubleShadow || doubleShadow;
    const projectileAuthority = dependencies.authority || authority;
    const projectileDoubleAuthority = dependencies.doubleAuthority || doubleAuthority;
    const meta = input?.meta;
    const plan = input?.plan;
    const clip = String(plan?.selectedClip || "");
    const spec = projectileAuthority?.CLIP_SPECS?.[clip];
    if (!meta || !plan || !spec) {
      return { supported: false, reason: "simulation-context-unavailable" };
    }

    const attack = meta?.projectileData?.[spec.dataKey];
    const family = familyForAttack(attack, projectileEngine, projectileAdapter);
    if (!STANDARD_FAMILIES.has(family) && !DOUBLE_FAMILIES.has(family)) {
      return { supported: false, reason: `simulation-family-not-supported:${family}`, family };
    }

    const report = verifiedReportForFamily(family, input?.standardReport, input?.doubleReport);
    if (!report) return { supported: false, reason: "simulation-shadow-not-verified", family };

    const spawnTime = playbackSpawnTime(meta, plan, spec);
    if (!Number.isFinite(spawnTime)) {
      return { supported: false, reason: "simulation-spawn-time-unavailable", family };
    }

    const sceneScale = Math.max(0.0001, finiteNumber(input?.scene?.sceneScale, 1));
    let derived;
    let geometry;
    if (DOUBLE_FAMILIES.has(family)) {
      if (!projectileDoubleShadow?.deriveDoubleGeometry) {
        return { supported: false, reason: "double-simulation-geometry-unavailable", family };
      }
      derived = projectileDoubleShadow.deriveDoubleGeometry(
        meta,
        spec.dataKey,
        input?.scene,
        input?.target,
        { engine: projectileEngine, adapter: projectileAdapter },
        "native",
      );
      if (!derived.supported) return { supported: false, reason: derived.reason, family };
      geometry = {
        ...derived.geometry,
        second: {
          ...derived.geometry.second,
          spawnTime: spawnTime + derived.secondSpawnDelay,
        },
      };
    } else {
      if (!projectileShadow?.deriveNativeGeometry) {
        return { supported: false, reason: "simulation-native-geometry-unavailable", family };
      }
      derived = projectileShadow.deriveNativeGeometry(
        meta,
        spec.dataKey,
        input?.scene,
        input?.target,
        { engine: projectileEngine, adapter: projectileAdapter },
      );
      if (!derived.supported) return { supported: false, reason: derived.reason, family };
      geometry = derived.geometry;
    }

    const adapted = projectileAdapter.createSimulationInput(
      derived.projectile,
      geometry,
      { engine: projectileEngine, sceneScale, spawnTime },
    );
    if (!adapted.supported || !adapted.input) {
      return { supported: false, reason: adapted.reason || "simulation-input-unavailable", family };
    }

    let simulation;
    try {
      simulation = projectileEngine.createProjectileSimulation(adapted.input);
    } catch (error) {
      return { supported: false, reason: `simulation-engine-error:${error?.message || String(error)}`, family };
    }

    const flagEnabled = input?.featureFlagEnabled === true;
    const authoritative = DOUBLE_FAMILIES.has(family)
      ? Boolean(projectileDoubleAuthority?.shouldTakeAuthority?.(report, flagEnabled))
      : Boolean(projectileAuthority?.shouldTakeAuthority?.(report, flagEnabled));
    return {
      supported: true,
      reason: null,
      family,
      report,
      plan: normalizePlan(simulation, plan, input?.unitId, family, authoritative),
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
    if (rootObject.__RANGER_ANIMATION_SIMULATION_BRIDGE_INSTALLED__) return;
    rootObject.__RANGER_ANIMATION_SIMULATION_BRIDGE_INSTALLED__ = true;
    const bridge = sharedBridge(rootObject, "RangerAnimationSimulationBridge");
    const bound = new WeakSet();
    const sequence = new WeakMap();
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

    function publish(section, value) {
      bridge.set(section, value);
      section.dispatchEvent(new rootObject.CustomEvent("ranger-animation-simulation-plan", { detail: value }));
    }

    async function analyze(section) {
      const token = (sequence.get(section) || 0) + 1;
      sequence.set(section, token);
      const plan = rootObject.RangerAnimationPlaybackBridge?.get?.(section);
      if (!plan) {
        publish(section, null);
        return;
      }
      const unitId = section.dataset.animationUnitId || "";
      const meta = await loadMeta(unitId);
      if (sequence.get(section) !== token) return;
      if (!meta) {
        publish(section, { source: "viewer", authoritative: false, reason: "simulation-meta-unavailable" });
        return;
      }
      let flagEnabled = false;
      try {
        flagEnabled = Boolean(authority?.featureFlagEnabled?.(rootObject));
      } catch (_) {
        flagEnabled = false;
      }
      const result = buildSimulationPlan({
        unitId,
        meta,
        plan,
        scene: rootObject.RangerAnimationSceneBridge?.get?.(section) || null,
        target: rootObject.RangerAnimationTargetBridge?.get?.(section) || null,
        standardReport: rootObject.RangerAnimationProjectileShadowBridge?.get?.(section) || null,
        doubleReport: rootObject.RangerAnimationProjectileDoubleShadowBridge?.get?.(section) || null,
        featureFlagEnabled: flagEnabled,
      });
      if (result.supported) {
        publish(section, result.plan);
      } else {
        publish(section, {
          source: "viewer",
          authoritative: false,
          selectedClip: String(plan.selectedClip || ""),
          startedAt: finiteNumber(plan.startedAt, 0),
          cycleDuration: Math.max(0, finiteNumber(plan.cycleDuration, 0)),
          family: result.family || null,
          reason: result.reason,
        });
      }
    }

    function schedule(section) {
      queueMicrotask(() => analyze(section));
    }

    function bind(section) {
      if (!section || bound.has(section)) return;
      bound.add(section);
      [
        "ranger-animation-playback-plan",
        "ranger-animation-target-change",
        "ranger-animation-projectile-shadow-report",
        "ranger-animation-projectile-double-shadow-report",
      ].forEach((eventName) => section.addEventListener(eventName, () => schedule(section)));
      schedule(section);
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
    STANDARD_FAMILIES,
    DOUBLE_FAMILIES,
    familyForAttack,
    verifiedReportForFamily,
    playbackSpawnTime,
    normalizePlan,
    buildSimulationPlan,
    install,
  });
});
