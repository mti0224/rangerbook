(function (root, factory) {
  const api = factory(root && root.RangerAnimationProjectileEngine);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RangerAnimationProjectileEngineAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (engine) {
  "use strict";

  const EPSILON = 1e-9;
  const MOVING_FAMILIES = new Set(["LINEAR", "CURVE", "RETURN"]);

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function point(x, y) {
    return { x: finiteNumber(x, 0), y: finiteNumber(y, 0) };
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
    if (["ENERGYC", "WEAPONC"].includes(attackType)) return "CURVE";
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

  function createSimulationInput(projectile, geometry, options = {}) {
    if (!projectile || !geometry) {
      return { supported: false, reason: "missing-projectile-or-geometry", input: null };
    }

    const projectileEngine = options.engine || engine;
    const attackType = attackTypeForProjectile(projectile);
    const family = familyForProjectile(projectile, projectileEngine);
    const kind = projectile.isBasicAttack === true ? "normal" : "skill";
    const spawnTime = Math.max(0, finiteNumber(options.spawnTime, 0));
    const start = point(geometry.startX, geometry.startY);
    const end = point(geometry.endX, geometry.endY);
    const distance = Math.max(0, finiteNumber(geometry.nativeDistance, 0));
    const moveSpeed = Math.max(0, finiteNumber(projectile.moveSpeed, 0));
    const finishDuration = Math.max(0, finiteNumber(projectile.finishDuration, 0));

    if (family === "UNKNOWN" || family === "NONE") {
      return { supported: false, reason: `unsupported-family:${family}`, input: null };
    }

    if (["DOUBLE_LINEAR", "DOUBLE_CURVE"].includes(family)) {
      return {
        supported: false,
        reason: "double-requires-native-second-projectile-geometry",
        input: null,
      };
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
      start,
      end,
      distance,
      moveSpeed,
      finishDuration,
      ...rotationConfig(projectile),
    };

    if (family === "CURVE") {
      input.curve = nativeCurve(projectile, geometry, options.sceneScale);
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
    const t = Math.min(1, Math.max(0, finiteNumber(progress, 0)));
    return {
      x: finiteNumber(geometry?.startX) + (finiteNumber(geometry?.endX) - finiteNumber(geometry?.startX)) * t,
      y: finiteNumber(geometry?.startY) + (finiteNumber(geometry?.endY) - finiteNumber(geometry?.startY)) * t,
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
      };
    }

    const simulation = shadow.simulation;
    const family = simulation.family;
    const samples = Math.max(2, Math.trunc(finiteNumber(options.samples, 9)));
    let maxPositionDelta = 0;

    if (family === "LINEAR") {
      for (let index = 0; index < samples; index += 1) {
        const progress = index / (samples - 1);
        const time = simulation.spawnTime + simulation.outboundDuration * progress;
        maxPositionDelta = Math.max(
          maxPositionDelta,
          distance(simulation.positionAt(time), legacyLinearPosition(geometry, progress)),
        );
      }
    }

    return {
      supported: true,
      reason: null,
      family,
      attackType: simulation.sourceAttackType,
      maxPositionDelta,
      durationDelta: Math.abs(
        finiteNumber(simulation.outboundDuration) - finiteNumber(geometry?.flightDuration)
      ),
      impactTime: simulation.impactTime,
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
    compareMovingSimulation,
  });
});
