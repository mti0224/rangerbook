const test = require("node:test");
const assert = require("node:assert/strict");

const engine = require("../assets/js/ranger-animation-projectile-engine.js");
globalThis.RangerAnimationProjectileEngine = engine;
const adapter = require("../assets/js/ranger-animation-projectile-engine-adapter.js");

function geometry(overrides = {}) {
  return {
    startX: 100,
    startY: 200,
    baseEndX: 460,
    baseEndY: 200,
    endX: 460,
    endY: 160,
    nativeDistance: 360,
    flightDuration: 1,
    returnEndX: 120,
    returnEndY: 200,
    returnNativeDistance: 340,
    returnDuration: 340 / 360,
    facing: 1,
    ...overrides,
  };
}

function projectile(attackType, overrides = {}) {
  return {
    config: { attackType },
    motionType: attackType,
    moveSpeed: 6,
    finishDuration: 0.25,
    beamDuration: 0.4,
    rotationMode: "FIXED",
    isBasicAttack: true,
    ...overrides,
  };
}

test("adapter preserves the original attackType", () => {
  assert.equal(adapter.attackTypeForProjectile(projectile("WEAPON")), "WEAPON");
  assert.equal(adapter.attackTypeForProjectile(projectile("ENERGYC")), "ENERGYC");
  assert.equal(adapter.familyForProjectile(projectile("WEAPON"), engine), "LINEAR");
  assert.equal(adapter.familyForProjectile(projectile("ENERGYC"), engine), "CURVE");
});

test("LINEAR shadow uses native distance instead of screen displacement for duration", () => {
  const g = geometry({
    endX: 820,
    endY: 120,
    nativeDistance: 360,
    flightDuration: 1,
  });
  const result = adapter.compareMovingSimulation(projectile("WEAPON"), g, {
    engine,
    sceneScale: 2,
  });

  assert.equal(result.supported, true);
  assert.equal(result.family, "LINEAR");
  assert.equal(result.durationDelta, 0);
  assert.ok(result.maxPositionDelta < 1e-9);
});

test("LINEAR input remains in screen coordinates while duration remains native", () => {
  const adapted = adapter.createSimulationInput(projectile("ENERGY"), geometry(), {
    engine,
    sceneScale: 2.5,
  });

  assert.equal(adapted.supported, true);
  assert.deepEqual(adapted.input.start, { x: 100, y: 200 });
  assert.deepEqual(adapted.input.end, { x: 460, y: 160 });
  assert.equal(adapted.input.distance, 360);
  assert.equal(adapted.input.moveSpeed, 6);
});

test("CURVE adapter reproduces native control point construction", () => {
  const g = geometry({ nativeDistance: 300, facing: 1 });
  const curve = adapter.nativeCurve(projectile("WEAPONC"), g, 2);

  assert.deepEqual(curve.control1, { x: 100, y: 200 });
  assert.equal(curve.control2.x, 520);
  assert.equal(curve.control2.y, -60);
});

test("CURVE shadow is built as CURVE and preserves rotation input", () => {
  const p = projectile("ENERGYC", {
    rotationMode: "ANGLE_LERP",
    config: {
      attackType: "ENERGYC",
      angle: { start: 15, end: 75 },
    },
  });
  const shadow = adapter.buildShadowSimulation(p, geometry(), {
    engine,
    sceneScale: 1,
  });

  assert.equal(shadow.supported, true);
  assert.equal(shadow.simulation.family, "CURVE");
  assert.equal(shadow.simulation.rotationAt(0), 15);
  assert.equal(shadow.simulation.rotationAt(shadow.simulation.impactTime), 75);
});

test("RETURN adapter keeps outbound impact separate from inbound cleanup", () => {
  const g = geometry();
  const shadow = adapter.buildShadowSimulation(projectile("RETURN"), g, {
    engine,
    sceneScale: 1,
  });

  assert.equal(shadow.supported, true);
  assert.equal(shadow.simulation.family, "RETURN");
  assert.equal(shadow.simulation.impactTime, 1);
  assert.ok(shadow.simulation.cleanupTime > shadow.simulation.impactTime);
  assert.deepEqual(
    shadow.simulation.positionAt(shadow.simulation.cleanupTime),
    { x: g.returnEndX, y: g.returnEndY },
  );
});

test("BEAM shadow keeps impact immediate at spawn", () => {
  const shadow = adapter.buildShadowSimulation(projectile("BEAM"), geometry(), {
    engine,
  });

  assert.equal(shadow.supported, true);
  assert.equal(shadow.simulation.family, "BEAM");
  assert.equal(shadow.simulation.impactTime, shadow.simulation.spawnTime);
  assert.equal(shadow.simulation.cleanupTime, 0.4);
});

test("DOUBLE is refused until native second-projectile geometry is supplied", () => {
  const adapted = adapter.createSimulationInput(projectile("DOUBLE"), geometry(), {
    engine,
  });

  assert.equal(adapted.supported, false);
  assert.equal(adapted.reason, "double-requires-native-second-projectile-geometry");
});

test("DIRECT is refused rather than inventing impact timing", () => {
  const adapted = adapter.createSimulationInput(projectile("PUNCH"), geometry(), {
    engine,
  });

  assert.equal(adapted.supported, false);
  assert.equal(adapted.reason, "timing-not-owned-by-geometry-adapter");
});

test("missing engine fails closed", () => {
  const shadow = adapter.buildShadowSimulation(projectile("WEAPON"), geometry(), {
    engine: {},
  });

  assert.equal(shadow.supported, false);
  assert.equal(shadow.reason, "projectile-engine-unavailable");
});
