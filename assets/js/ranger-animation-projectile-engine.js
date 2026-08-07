(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RangerAnimationProjectileEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const NATIVE_ACTION_FPS = 60;
  const EPSILON = 1e-9;

  const FAMILY_BY_ATTACK_TYPE = Object.freeze({
    PUNCH: "DIRECT",
    KICK: "DIRECT",
    SWING: "DIRECT",
    STAB: "DIRECT",
    LASER: "DIRECT",
    ENERGY: "LINEAR",
    WEAPON: "LINEAR",
    DOUBLE: "DOUBLE_LINEAR",
    ENERGYC: "CURVE",
    WEAPONC: "CURVE",
    DOUBLEC: "DOUBLE_CURVE",
    RETURN: "RETURN",
    BEAM: "BEAM",
    ACTION: "ACTION",
    NONE: "NONE",
  });

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function nonNegativeNumber(value, fallback = 0) {
    return Math.max(0, finiteNumber(value, fallback));
  }

  function point(value, fallback = { x: 0, y: 0 }) {
    return {
      x: finiteNumber(value?.x, fallback.x),
      y: finiteNumber(value?.y, fallback.y),
    };
  }

  function clamp01(value) {
    return Math.min(1, Math.max(0, finiteNumber(value, 0)));
  }

  function normalizeAttackType(value) {
    return String(value || "NONE").trim().toUpperCase() || "NONE";
  }

  function familyForAttackType(value) {
    const attackType = normalizeAttackType(value);
    return FAMILY_BY_ATTACK_TYPE[attackType] || "UNKNOWN";
  }

  function movementDuration(distance, moveSpeed, actionFps = NATIVE_ACTION_FPS) {
    const speed = nonNegativeNumber(moveSpeed, 0);
    const fps = nonNegativeNumber(actionFps, NATIVE_ACTION_FPS);
    if (speed <= EPSILON || fps <= EPSILON) return 0;
    return nonNegativeNumber(distance, 0) / (speed * fps);
  }

  function distanceBetween(a, b) {
    const first = point(a);
    const second = point(b);
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function lerp(a, b, t) {
    const ratio = clamp01(t);
    return a + (b - a) * ratio;
  }

  function lerpPoint(a, b, t) {
    const first = point(a);
    const second = point(b);
    return {
      x: lerp(first.x, second.x, t),
      y: lerp(first.y, second.y, t),
    };
  }

  function cubicBezierPoint(start, control1, control2, end, t) {
    const p0 = point(start);
    const p1 = point(control1, p0);
    const p2 = point(control2, point(end));
    const p3 = point(end);
    const ratio = clamp01(t);
    const inverse = 1 - ratio;
    const a = inverse * inverse * inverse;
    const b = 3 * inverse * inverse * ratio;
    const c = 3 * inverse * ratio * ratio;
    const d = ratio * ratio * ratio;
    return {
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    };
  }

  function explicitOrComputedDuration(config, start, end, prefix = "") {
    const durationKey = prefix ? `${prefix}Duration` : "duration";
    const distanceKey = prefix ? `${prefix}Distance` : "distance";
    const explicit = Number(config?.[durationKey]);
    if (Number.isFinite(explicit) && explicit >= 0) return explicit;
    const distance = Number(config?.[distanceKey]);
    const resolvedDistance = Number.isFinite(distance) && distance >= 0
      ? distance
      : distanceBetween(start, end);
    return movementDuration(resolvedDistance, config?.moveSpeed);
  }

  function event(type, time, projectileIndex, sequence, extra) {
    return {
      type,
      time: nonNegativeNumber(time, 0),
      ...(Number.isInteger(projectileIndex) ? { projectileIndex } : {}),
      ...(extra || {}),
      __sequence: sequence,
    };
  }

  function publicEvents(events) {
    return events
      .slice()
      .sort((a, b) => (a.time - b.time) || (a.__sequence - b.__sequence))
      .map(({ __sequence, ...item }) => item);
  }

  function impactEvents(kind, impactTime, projectileIndex, finishDuration, sequenceStart = 10) {
    const events = [event("projectile-impact", impactTime, projectileIndex, sequenceStart)];
    const hasFinish = finishDuration > EPSILON;
    if (String(kind || "normal").toLowerCase() === "skill") {
      events.push(event("damage-resolution-start", impactTime, projectileIndex, sequenceStart + 1));
      if (hasFinish) events.push(event("projectile-finish-start", impactTime, projectileIndex, sequenceStart + 2));
    } else {
      if (hasFinish) events.push(event("projectile-finish-start", impactTime, projectileIndex, sequenceStart + 1));
      events.push(event("damage-resolution-start", impactTime, projectileIndex, sequenceStart + 2));
    }
    if (hasFinish) {
      events.push(event(
        "projectile-finish-end",
        impactTime + finishDuration,
        projectileIndex,
        sequenceStart + 3,
      ));
    }
    return events;
  }

  function buildMovingProjectile(config, family, projectileIndex) {
    const kind = String(config.kind || "normal").toLowerCase() === "skill" ? "skill" : "normal";
    const spawnTime = nonNegativeNumber(config.spawnTime, 0);
    const start = point(config.start);
    const end = point(config.end, start);
    const outboundDuration = explicitOrComputedDuration(config, start, end);
    const impactTime = spawnTime + outboundDuration;
    const finishDuration = nonNegativeNumber(config.finishDuration, 0);
    const finishTime = impactTime + finishDuration;
    const startAngle = Number(config.startAngle);
    const endAngle = Number(config.endAngle);
    const hasRotation = Number.isFinite(startAngle) || Number.isFinite(endAngle);
    const resolvedStartAngle = Number.isFinite(startAngle) ? startAngle : 0;
    const resolvedEndAngle = Number.isFinite(endAngle) ? endAngle : resolvedStartAngle;
    const events = [event("projectile-spawn", spawnTime, projectileIndex, 0)];
    events.push(...impactEvents(kind, impactTime, projectileIndex, finishDuration));

    function outboundPosition(time) {
      if (outboundDuration <= EPSILON) return { ...end };
      const ratio = (finiteNumber(time, spawnTime) - spawnTime) / outboundDuration;
      if (family === "CURVE") {
        const control1 = config.curve?.control1 || start;
        const control2 = config.curve?.control2 || end;
        return cubicBezierPoint(start, control1, control2, end, ratio);
      }
      return lerpPoint(start, end, ratio);
    }

    function positionAt(time) {
      const now = finiteNumber(time, spawnTime);
      if (now <= spawnTime) return { ...start };
      if (now >= impactTime) return { ...end };
      return outboundPosition(now);
    }

    function rotationAt(time) {
      if (!hasRotation) return null;
      if (outboundDuration <= EPSILON) return resolvedEndAngle;
      const ratio = (finiteNumber(time, spawnTime) - spawnTime) / outboundDuration;
      return lerp(resolvedStartAngle, resolvedEndAngle, ratio);
    }

    return {
      index: projectileIndex,
      sourceAttackType: normalizeAttackType(config.attackType),
      family,
      kind,
      spawnTime,
      movementStartTime: spawnTime,
      impactTime,
      finishStartTime: finishDuration > EPSILON ? impactTime : null,
      finishEndTime: finishDuration > EPSILON ? finishTime : null,
      cleanupTime: finishDuration > EPSILON ? finishTime : impactTime,
      outboundDuration,
      returnDuration: 0,
      events: publicEvents(events),
      positionAt,
      rotationAt,
    };
  }

  function buildReturnProjectile(config, projectileIndex) {
    const kind = String(config.kind || "normal").toLowerCase() === "skill" ? "skill" : "normal";
    const spawnTime = nonNegativeNumber(config.spawnTime, 0);
    const start = point(config.start);
    const end = point(config.end, start);
    const returnEnd = point(config.returnEnd, start);
    const outboundDuration = explicitOrComputedDuration(config, start, end);
    const impactTime = spawnTime + outboundDuration;
    const returnDuration = explicitOrComputedDuration(config, end, returnEnd, "return");
    const cleanupTime = impactTime + returnDuration;
    const finishDuration = nonNegativeNumber(config.finishDuration, 0);
    const events = [event("projectile-spawn", spawnTime, projectileIndex, 0)];
    events.push(...impactEvents(kind, impactTime, projectileIndex, finishDuration));
    events.push(event("projectile-return-start", impactTime, projectileIndex, 20));
    events.push(event("projectile-return-complete", cleanupTime, projectileIndex, 30));
    events.push(event("projectile-cleanup", cleanupTime, projectileIndex, 31));

    function positionAt(time) {
      const now = finiteNumber(time, spawnTime);
      if (now <= spawnTime) return { ...start };
      if (now < impactTime) {
        const ratio = outboundDuration <= EPSILON ? 1 : (now - spawnTime) / outboundDuration;
        return lerpPoint(start, end, ratio);
      }
      if (now >= cleanupTime) return { ...returnEnd };
      const ratio = returnDuration <= EPSILON ? 1 : (now - impactTime) / returnDuration;
      return lerpPoint(end, returnEnd, ratio);
    }

    return {
      index: projectileIndex,
      sourceAttackType: "RETURN",
      family: "RETURN",
      kind,
      spawnTime,
      movementStartTime: spawnTime,
      impactTime,
      finishStartTime: finishDuration > EPSILON ? impactTime : null,
      finishEndTime: finishDuration > EPSILON ? impactTime + finishDuration : null,
      cleanupTime,
      outboundDuration,
      returnDuration,
      events: publicEvents(events),
      positionAt,
      rotationAt: () => null,
    };
  }

  function buildBeam(config, projectileIndex) {
    const spawnTime = nonNegativeNumber(config.spawnTime, 0);
    const lifetime = nonNegativeNumber(config.bulDuration ?? config.visualDuration, 0);
    const cleanupTime = spawnTime + lifetime;
    const kind = String(config.kind || "normal").toLowerCase() === "skill" ? "skill" : "normal";
    const events = [
      event("beam-spawn", spawnTime, projectileIndex, 0),
      event("beam-impact", spawnTime, projectileIndex, 1),
      event("damage-resolution-start", spawnTime, projectileIndex, 2),
      event("beam-hide", cleanupTime, projectileIndex, 3),
      event("projectile-cleanup", cleanupTime, projectileIndex, 4),
    ];
    return {
      index: projectileIndex,
      sourceAttackType: "BEAM",
      family: "BEAM",
      kind,
      spawnTime,
      movementStartTime: spawnTime,
      impactTime: spawnTime,
      finishStartTime: null,
      finishEndTime: null,
      cleanupTime,
      outboundDuration: 0,
      returnDuration: 0,
      events: publicEvents(events),
      positionAt: () => null,
      rotationAt: () => null,
    };
  }

  function buildAction(config, projectileIndex) {
    const spawnTime = nonNegativeNumber(config.spawnTime, 0);
    const phase1Duration = nonNegativeNumber(config.phase1Duration, 0);
    const phase2Duration = nonNegativeNumber(config.phase2Duration, 0);
    const explicitHitTime = Number(config.phase2EndTime);
    const impactTime = Number.isFinite(explicitHitTime)
      ? Math.max(spawnTime, explicitHitTime)
      : spawnTime + phase1Duration + phase2Duration;
    const phase3Duration = nonNegativeNumber(config.phase3Duration, 0);
    const cleanupTime = impactTime + phase3Duration;
    const events = [
      event("action-spawn", spawnTime, projectileIndex, 0),
      event("skill-hit", impactTime, projectileIndex, 10),
      event("damage-resolution-start", impactTime, projectileIndex, 11),
      event("action-phase3-start", impactTime, projectileIndex, 12),
      event("action-finish", cleanupTime, projectileIndex, 20),
    ];
    return {
      index: projectileIndex,
      sourceAttackType: "ACTION",
      family: "ACTION",
      kind: "skill",
      spawnTime,
      movementStartTime: null,
      impactTime,
      finishStartTime: impactTime,
      finishEndTime: cleanupTime,
      cleanupTime,
      outboundDuration: 0,
      returnDuration: 0,
      events: publicEvents(events),
      positionAt: () => null,
      rotationAt: () => null,
    };
  }

  function buildDirect(config, projectileIndex, attackType) {
    const spawnTime = nonNegativeNumber(config.spawnTime, 0);
    const explicitImpact = Number(config.impactTime);
    const impactDelay = nonNegativeNumber(config.impactDelay, 0);
    const impactTime = Number.isFinite(explicitImpact)
      ? Math.max(spawnTime, explicitImpact)
      : spawnTime + impactDelay;
    const kind = String(config.kind || "normal").toLowerCase() === "skill" ? "skill" : "normal";
    return {
      index: projectileIndex,
      sourceAttackType: attackType,
      family: "DIRECT",
      kind,
      spawnTime,
      movementStartTime: null,
      impactTime,
      finishStartTime: null,
      finishEndTime: null,
      cleanupTime: impactTime,
      outboundDuration: 0,
      returnDuration: 0,
      events: publicEvents([
        event("direct-hit", impactTime, projectileIndex, 0),
        event("damage-resolution-start", impactTime, projectileIndex, 1),
      ]),
      positionAt: () => null,
      rotationAt: () => null,
    };
  }

  function buildSingle(config, projectileIndex = 0) {
    const attackType = normalizeAttackType(config.attackType);
    const family = familyForAttackType(attackType);
    if (family === "LINEAR" || family === "CURVE") {
      return buildMovingProjectile({ ...config, attackType }, family, projectileIndex);
    }
    if (family === "RETURN") return buildReturnProjectile(config, projectileIndex);
    if (family === "BEAM") return buildBeam(config, projectileIndex);
    if (family === "ACTION") return buildAction(config, projectileIndex);
    if (family === "DIRECT") return buildDirect(config, projectileIndex, attackType);
    if (family === "NONE") {
      return {
        index: projectileIndex,
        sourceAttackType: attackType,
        family,
        kind: config.kind || "normal",
        spawnTime: nonNegativeNumber(config.spawnTime, 0),
        movementStartTime: null,
        impactTime: null,
        finishStartTime: null,
        finishEndTime: null,
        cleanupTime: null,
        outboundDuration: 0,
        returnDuration: 0,
        events: [],
        positionAt: () => null,
        rotationAt: () => null,
      };
    }
    throw new Error(`Unsupported projectile attackType: ${attackType}`);
  }

  function secondConfig(config) {
    const second = config.second || {};
    const spawnTime = Number(second.spawnTime);
    const spawnDelay = nonNegativeNumber(second.spawnDelay ?? config.secondSpawnDelay, 0);
    return {
      ...config,
      ...second,
      attackType: config.attackType,
      spawnTime: Number.isFinite(spawnTime)
        ? spawnTime
        : nonNegativeNumber(config.spawnTime, 0) + spawnDelay,
      start: second.start || config.secondStart || config.start,
      end: second.end || config.end,
      curve: second.curve || config.secondCurve || config.curve,
      second: undefined,
      secondStart: undefined,
      secondCurve: undefined,
    };
  }

  function createProjectileSimulation(config = {}) {
    const attackType = normalizeAttackType(config.attackType);
    const family = familyForAttackType(attackType);
    const isDouble = family === "DOUBLE_LINEAR" || family === "DOUBLE_CURVE";
    const projectiles = isDouble
      ? [
          buildMovingProjectile(
            { ...config, attackType },
            family === "DOUBLE_LINEAR" ? "LINEAR" : "CURVE",
            0,
          ),
          buildMovingProjectile(
            secondConfig(config),
            family === "DOUBLE_LINEAR" ? "LINEAR" : "CURVE",
            1,
          ),
        ]
      : [buildSingle({ ...config, attackType }, 0)];
    const events = publicEvents(projectiles.flatMap((projectile, index) =>
      projectile.events.map((item, eventIndex) => ({
        ...item,
        __sequence: index * 100 + eventIndex,
      }))
    ));
    const primary = projectiles[0];
    return {
      sourceAttackType: attackType,
      family,
      kind: primary.kind,
      spawnTime: Math.min(...projectiles.map((projectile) => projectile.spawnTime)),
      impactTime: primary.impactTime,
      finishTime: primary.finishEndTime,
      cleanupTime: Math.max(...projectiles.map((projectile) => finiteNumber(projectile.cleanupTime, 0))),
      outboundDuration: primary.outboundDuration,
      returnDuration: primary.returnDuration,
      events,
      projectiles,
      positionAt: primary.positionAt,
      rotationAt: primary.rotationAt,
    };
  }

  return Object.freeze({
    NATIVE_ACTION_FPS,
    FAMILY_BY_ATTACK_TYPE,
    normalizeAttackType,
    familyForAttackType,
    movementDuration,
    cubicBezierPoint,
    createProjectileSimulation,
  });
});
