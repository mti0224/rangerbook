(function (root, factory) {
  const api = factory(root && root.RangerAnimationProjectileEngine);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RangerAnimationProjectileEngineAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (engine) {
  "use strict";

  const EPSILON = 1e-9;
  const MOVING_FAMILIES = new Set([
    "LINEAR",
    "CURVE",
    "RETURN",
    "DOUBLE_LINEAR",
    "DOUBLE_CURVE",
  ]);

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function point(x, y) {
    return { x: finiteNumber(x, 0), y: finiteNumber(y, 0) };
  }

  function clamp01(value) {
    return Math.min(1, Math.max(0, finiteNumber(value, 0)));
  }

  function attackTypeForProjectile(projectile) {
    const raw = String(
      projectile?.config?.attackType ||
      projectile?.attackType ||
      projectile?.motionType ||
      "NONE"
    ).trim().toUpperCase();
    return raw || "NONE";
  }

  function familyForProjectile(projectile, projectileEngine = engine) {
    const attackType = attackTypeForProjectile(projectile);
    if (projectileEngine?.familyForAttackType) {
      return projectileEngine.familyForAttackType(attackType);
    }
    if (["ENERGY", "WEAPON"].includes(attackType)) return "LINEAR";
    if (attackType === "DOUBLE") return "DOUBLE_LINEAR";
    if (["ENERGYC", "WEAPONC"].includes(attackType)) return "CURVE";
    if (attackType === "DOUBLEC") return "DOUBLE_CURVE";
    if (attackType === "RETURN") return "RETURN";
    if (attackType === "BEAM") return "BEAM";
    if (["PUNCH", "KICK", "SWING", "STAB", "LASER"].includes(attackType)) return "DIRECT";
    return "UNKNOWN";
  }

  function nativeCurve(projectile, geometry, sceneScale) {
    const scale = Math.max(EPSILON, Math.abs(finiteNumber(sceneScale, 1)));
    const start = point(geometry?.startX, geometry?.startY);
    const end = point(geometry?.endX, geometry?.endY);
    const facing = finiteNumber(geometry?.facing, 1) < 0 ? -1 : 1;
    const nativeDistance = Math.max(0, finiteNumber(geometry?.nativeDistance, 0));
    const handle = nativeDistance * scale * 0.4;
    return {
      control1: { ...start },
      control2: {
        x: (start.x + end.x) * 0.5 + facing * handle,
        y: (start.y + end.y) * 0.5 - handle,
      },
    };
  }

  function rotationConfig(projectile) {
    if (String(projectile?.rotationMode || "").toUpperCase() !== "ANGLE_LERP") {
      return {};
    }
    const start = Number(projectile?.config?.angle?.start);
    const end = Number(projectile?.config?.angle?.end);
    return {
      startAngle: Number.isFinite(start) ? start : 0,
      endAngle: Number.isFinite(end) ? end : (Number.isFinite(start) ? start : 0),
    };
  }

  function movingInput(projectile, geometry, options, family) {
    const input = {
      start: point(geometry.startX, geometry.startY),
      end: point(geometry.endX, geometry.endY),
      distance: Math.max(0, finiteNumber(geometry.nativeDistance, 0)),
      moveSpeed: Math.max(0, finiteNumber(projectile.moveSpeed, 0)),
      ...rotationConfig(projectile),
    };
    if (["CURVE", "DOUBLE_CURVE"].includes(family)) {
      input.curve = nativeCurve(projectile, geometry, options.sceneScale);
    }
    return input;
  }

  function createSimulationInput(projectile, geometry, options = {}) {
    if (!projectile || !geometry) {
      return { supported: false, reason: "missing-projectile-or-geometry", input: null };
    }

    const projectileEngine = options.engine || engine;
    const attackType = attackTypeForProjectile(projectile);
    const family = familyForProjectile(projectile, projectileEngine);
    const kind = projectile.isBasicAttack === true ? "normal" : "skill";
    const spawnTime = Math.max(0, finiteNumber(options.spawnTime, 0));
    const finishDuration = Math.max(0, finiteNumber(projectile.finishDuration, 0));

    if (family === "UNKNOWN" || family === "NONE") {
      return { supported: false, reason: `unsupported-family:${family}`, input: null };
    }

    if (family === "DIRECT" || family === "ACTION") {
      return {
        supported: false,
        reason: "timing-not-owned-by-geometry-adapter",
        input: null,
      };
    }

    if (family === "BEAM") {
      return {
        supported: true,
        reason: null,
        input: {
          attackType,
          kind,
          spawnTime,
          bulDuration: Math.max(0, finiteNumber(projectile.beamDuration, 0)),
        },
      };
    }

    const input = {
      attackType,
      kind,
      spawnTime,
      finishDuration,
      ...movingInput(projectile, geometry, options, family),
    };

    if (["DOUBLE_LINEAR", "DOUBLE_CURVE"].includes(family)) {
      const secondGeometry = geometry.second;
      if (!secondGeometry) {
        return {
          supported: false,
          reason: "double-requires-native-second-projectile-geometry",
          input: null,
        };
      }
      const rawSecondSpawnTime = secondGeometry.spawnTime ?? options.secondSpawnTime;
      const secondSpawnTime = Number(rawSecondSpawnTime);
      if (!Number.isFinite(secondSpawnTime) || secondSpawnTime < spawnTime) {
        return {
          supported: false,
          reason: "double-requires-second-spawn-time",
          input: null,
        };
      }
      input.second = {
        spawnTime: secondSpawnTime,
        ...movingInput(projectile, secondGeometry, options, family),
      };
    }

    if (family === "RETURN") {
      input.returnEnd = point(geometry.returnEndX, geometry.returnEndY);
      input.returnDistance = Math.max(0, finiteNumber(geometry.returnNativeDistance, 0));
    }

    return { supported: MOVING_FAMILIES.has(family), reason: null, input };
  }

  function buildShadowSimulation(projectile, geometry, options = {}) {
    const projectileEngine = options.engine || engine;
    if (!projectileEngine?.createProjectileSimulation) {
      return {
        supported: false,
        reason: "projectile-engine-unavailable",
        simulation: null,
        input: null,
      };
    }

    const adapted = createSimulationInput(projectile, geometry, {
      ...options,
      engine: projectileEngine,
    });
    if (!adapted.supported || !adapted.input) {
      return { ...adapted, simulation: null };
    }

    try {
      return {
        supported: true,
        reason: null,
        input: adapted.input,
        simulation: projectileEngine.createProjectileSimulation(adapted.input),
      };
    } catch (error) {
      return {
        supported: false,
        reason: `engine-error:${error?.message || String(error)}`,
        input: adapted.input,
        simulation: null,
      };
    }
  }

  function distance(a, b) {
    if (!a || !b) return Infinity;
    return Math.hypot(finiteNumber(a.x) - finiteNumber(b.x), finiteNumber(a.y) - finiteNumber(b.y));
  }

  function legacyLinearPosition(geometry, progress) {
    const t = clamp01(progress);
    return {
      x: finiteNumber(geometry?.startX) + (finiteNumber(geometry?.endX) - finiteNumber(geometry?.startX)) * t,
      y: finiteNumber(geometry?.startY) + (finiteNumber(geometry?.endY) - finiteNumber(geometry?.startY)) * t,
    };
  }

  function legacyCubicBezierPoint(point0, point1, point2, point3, progress) {
    const t = clamp01(progress);
    const u = 1 - t;
    return {
      x: u * u * u * point0.x + 3 * u * u * t * point1.x + 3 * u * t * t * point2.x + t * t * t * point3.x,
      y: u * u * u * point0.y + 3 * u * u * t * point1.y + 3 * u * t * t * point2.y + t * t * t * point3.y,
    };
  }

  function legacyCurvePosition(projectile, geometry, sceneScale, progress) {
    const start = point(geometry?.startX, geometry?.startY);
    const end = point(geometry?.endX, geometry?.endY);
    const curve = nativeCurve(projectile, geometry, sceneScale);
    return legacyCubicBezierPoint(start, curve.control1, curve.control2, end, progress);
  }

  function legacyReturnPosition(geometry, progress) {
    const t = clamp01(progress);
    return {
      x: finiteNumber(geometry?.endX) + (finiteNumber(geometry?.returnEndX) - finiteNumber(geometry?.endX)) * t,
      y: finiteNumber(geometry?.endY) + (finiteNumber(geometry?.returnEndY) - finiteNumber(geometry?.endY)) * t,
    };
  }

  function compareOneMovingProjectile(projectile, simulatedProjectile, geometry, family, options, samples) {
    let maxPositionDelta = 0;
    const curveFamily = ["CURVE", "DOUBLE_CURVE"].includes(family);
    for (let index = 0; index < samples; index += 1) {
      const progress = index / (samples - 1);
      const time = simulatedProjectile.spawnTime + simulatedProjectile.outboundDuration * progress;
      const expected = curveFamily
        ? legacyCurvePosition(projectile, geometry, options.sceneScale, progress)
        : legacyLinearPosition(geometry, progress);
      maxPositionDelta = Math.max(
        maxPositionDelta,
        distance(simulatedProjectile.positionAt(time), expected),
      );
    }
    return {
      maxPositionDelta,
      durationDelta: Math.abs(
        finiteNumber(simulatedProjectile.outboundDuration) - finiteNumber(geometry?.flightDuration)
      ),
    };
  }

  function compareMovingSimulation(projectile, geometry, options = {}) {
    const shadow = buildShadowSimulation(projectile, geometry, options);
    if (!shadow.supported || !shadow.simulation) {
      return {
        supported: false,
        reason: shadow.reason,
        maxPositionDelta: null,
        durationDelta: null,
        secondDurationDelta: null,
        returnDurationDelta: null,
      };
    }

    const simulation = shadow.simulation;
    const family = simulation.family;
    const samples = Math.max(2, Math.trunc(finiteNumber(options.samples, 9)));
    let maxPositionDelta = 0;
    let durationDelta = 0;
    let secondDurationDelta = 0;

    if (["LINEAR", "CURVE", "RETURN"].includes(family)) {
      const result = compareOneMovingProjectile(
        projectile,
        simulation.projectiles[0],
        geometry,
        family,
        options,
        samples,
      );
      maxPositionDelta = result.maxPositionDelta;
      durationDelta = result.durationDelta;
    }

    if (["DOUBLE_LINEAR", "DOUBLE_CURVE"].includes(family)) {
      const firstResult = compareOneMovingProjectile(
        projectile,
        simulation.projectiles[0],
        geometry,
        family,
        options,
        samples,
      );
      const secondResult = compareOneMovingProjectile(
        projectile,
        simulation.projectiles[1],
        geometry.second,
        family,
        options,
        samples,
      );
      maxPositionDelta = Math.max(firstResult.maxPositionDelta, secondResult.maxPositionDelta);
      durationDelta = firstResult.durationDelta;
      secondDurationDelta = secondResult.durationDelta;
    }

    if (family === "RETURN") {
      for (let index = 0; index < samples; index += 1) {
        const progress = index / (samples - 1);
        const time = simulation.impactTime + simulation.returnDuration * progress;
        maxPositionDelta = Math.max(
          maxPositionDelta,
          distance(simulation.positionAt(time), legacyReturnPosition(geometry, progress)),
        );
      }
    }

    return {
      supported: true,
      reason: null,
      family,
      attackType: simulation.sourceAttackType,
      maxPositionDelta,
      durationDelta,
      secondDurationDelta,
      returnDurationDelta: family === "RETURN"
        ? Math.abs(finiteNumber(simulation.returnDuration) - finiteNumber(geometry?.returnDuration))
        : 0,
      impactTime: simulation.impactTime,
      secondImpactTime: simulation.projectiles[1]?.impactTime ?? null,
      cleanupTime: simulation.cleanupTime,
      input: shadow.input,
      simulation,
    };
  }

  return Object.freeze({
    attackTypeForProjectile,
    familyForProjectile,
    nativeCurve,
    createSimulationInput,
    buildShadowSimulation,
    legacyLinearPosition,
    legacyCurvePosition,
    legacyReturnPosition,
    compareMovingSimulation,
  });
});
