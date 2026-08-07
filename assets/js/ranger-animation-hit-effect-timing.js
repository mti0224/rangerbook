(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RangerAnimationHitEffectTiming = api;
    if (root.document) api.install(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STANDARD_FAMILIES = new Set(["LINEAR", "CURVE", "RETURN"]);
  const DOUBLE_FAMILIES = new Set(["DOUBLE_LINEAR", "DOUBLE_CURVE"]);

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function authorityStatusAllowsEngine(simulationPlan, standardStatus, doubleStatus) {
    if (simulationPlan?.source !== "engine" || simulationPlan?.authoritative !== true) return false;
    const family = String(simulationPlan?.family || "").toUpperCase();
    const status = DOUBLE_FAMILIES.has(family)
      ? doubleStatus
      : (STANDARD_FAMILIES.has(family) ? standardStatus : null);
    if (!status || status.active !== true) return false;
    const statusFamily = String(status.family || "").toUpperCase();
    return statusFamily === family;
  }

  function effectiveSimulationPlan(simulationPlan, standardStatus, doubleStatus) {
    if (simulationPlan?.source !== "engine" || simulationPlan?.authoritative !== true) {
      return simulationPlan || null;
    }
    if (authorityStatusAllowsEngine(simulationPlan, standardStatus, doubleStatus)) {
      return simulationPlan;
    }
    return {
      ...simulationPlan,
      authoritative: false,
      authorityReason: "renderer-authority-inactive",
    };
  }

  function engineImpactEvents(simulationPlan) {
    if (
      simulationPlan?.source !== "engine" ||
      simulationPlan?.authoritative !== true ||
      simulationPlan?.selectedClip !== "attack"
    ) return [];
    return (simulationPlan.impactEvents || [])
      .filter((event) => Number.isFinite(Number(event?.time)))
      .map((event, index) => ({
        time: Number(event.time),
        projectileIndex: Number.isInteger(event.projectileIndex) ? event.projectileIndex : index,
      }));
  }

  function resolveImpactSchedule(playbackPlan, simulationPlan) {
    const engineEvents = engineImpactEvents(simulationPlan);
    const samePlayback =
      engineEvents.length > 0 &&
      finiteNumber(simulationPlan?.startedAt, NaN) === finiteNumber(playbackPlan?.startedAt, NaN);
    if (samePlayback) {
      return {
        source: "engine",
        startedAt: finiteNumber(simulationPlan.startedAt, 0),
        cycleDuration: Math.max(0, finiteNumber(simulationPlan.cycleDuration, 0)),
        impacts: engineEvents,
      };
    }
    if (
      playbackPlan?.source === "viewer" &&
      playbackPlan?.selectedClip === "attack" &&
      Number.isFinite(Number(playbackPlan?.impactTime))
    ) {
      return {
        source: "viewer",
        startedAt: finiteNumber(playbackPlan.startedAt, 0),
        cycleDuration: Math.max(0, finiteNumber(playbackPlan.cycleDuration, 0)),
        impacts: [{ time: Number(playbackPlan.impactTime), projectileIndex: 0 }],
      };
    }
    return null;
  }

  function activeImpacts(schedule, elapsed, effectDuration) {
    if (!schedule || !Array.isArray(schedule.impacts)) return [];
    const duration = Math.max(0, finiteNumber(effectDuration, 0));
    const cycleDuration = Math.max(0, finiteNumber(schedule.cycleDuration, 0));
    const absoluteElapsed = Math.max(0, finiteNumber(elapsed, 0));
    const cycleIndex = cycleDuration > 0 ? Math.floor(absoluteElapsed / cycleDuration) : 0;
    const time = cycleDuration > 0 ? absoluteElapsed - cycleIndex * cycleDuration : absoluteElapsed;
    const active = [];
    for (const impact of schedule.impacts) {
      let impactCycleIndex = cycleIndex;
      let age = time - impact.time;
      if (age < 0 && cycleDuration > 0 && absoluteElapsed >= cycleDuration) {
        age += cycleDuration;
        impactCycleIndex -= 1;
      }
      if (age < 0 || age >= duration) continue;
      active.push({
        ...impact,
        age,
        cycleIndex: impactCycleIndex,
        key: `${schedule.source}:${schedule.startedAt}:${impact.projectileIndex}:${impact.time}:${impactCycleIndex}`,
      });
    }
    return active;
  }

  function install(rootObject) {
    if (rootObject.__RANGER_ANIMATION_HIT_EFFECT_AUTHORITY_GATE_INSTALLED__) return;
    rootObject.__RANGER_ANIMATION_HIT_EFFECT_AUTHORITY_GATE_INSTALLED__ = true;
    const bridge = rootObject.RangerAnimationSimulationBridge;
    if (!bridge?.get || !bridge?.set || bridge.__liveAuthorityGate) return;

    const rawGet = bridge.get.bind(bridge);
    const rawSet = bridge.set.bind(bridge);
    rootObject.RangerAnimationSimulationBridge = {
      __liveAuthorityGate: true,
      get(section) {
        const plan = rawGet(section);
        if (!section) return plan;
        const standardStatus = rootObject.RangerAnimationProjectileAuthorityBridge?.get?.(section) || null;
        const doubleStatus = rootObject.RangerAnimationProjectileDoubleAuthorityBridge?.get?.(section) || null;
        return effectiveSimulationPlan(plan, standardStatus, doubleStatus);
      },
      set(section, value) {
        return rawSet(section, value);
      },
    };
  }

  return Object.freeze({
    STANDARD_FAMILIES,
    DOUBLE_FAMILIES,
    authorityStatusAllowsEngine,
    effectiveSimulationPlan,
    engineImpactEvents,
    resolveImpactSchedule,
    activeImpacts,
    install,
  });
});
