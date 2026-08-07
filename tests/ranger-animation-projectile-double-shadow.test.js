const test = require("node:test");
const assert = require("node:assert/strict");

const engine = require("../assets/js/ranger-animation-projectile-engine.js");
globalThis.RangerAnimationProjectileEngine = engine;
const adapter = require("../assets/js/ranger-animation-projectile-engine-adapter.js");
globalThis.RangerAnimationProjectileEngineAdapter = adapter;
const doubleShadow = require("../assets/js/ranger-animation-projectile-double-shadow.js");

function meta(attackType = "DOUBLE", overrides = {}) {
  return {
    parts: {
      body: {
        anim_rate: 20,
        animations: {
          attack_a: { frame_count: 6 },
          s_attack_a: { frame_count: 8 },
          s2_attack_a: { frame_count: 10 },
        },
      },
    },
    projectileData: {
      coordinateScale: 0.5,
      hitTiming: {
        normalHitPointRate: 0.25,
        skill1HitPointRate: 0.25,
        skill2HitPointRate: 0.25,
      },
      normal: {
        attackType,
        start: { x: 40, y: 20 },
        secondStart: { x: 80, y: 40 },
        end: { x: 30, y: -10 },
        moveSpeed: 6,
        motion: { rotation: attackType === "DOUBLEC" ? "ANGLE_LERP" : "FIXED" },
        angle: { start: 10, end: 50 },
        ...overrides,
      },
      skill1: {
        attackType,
        start: { x: 40, y: 20 },
        secondStart: { x: 80, y: 40 },
        end: { x: 0, y: 0 },
        moveSpeed: 6,
      },
      skill2: {
        attackType,
        start: { x: 40, y: 20 },
        secondStart: { x: 80, y: 40 },
        end: { x: 0, y: 0 },
        moveSpeed: 6,
      },
    },
  };
}

function scene() {
  return {
    bodyOriginX: 100,
    bodyOriginY: 200,
    targetX: 500,
    targetBaseY: 200,
    sceneScale: 2,
    facing: 1,
  };
}

function target() {
  return { contentHeight: 80 };
}

test("DOUBLE second spawn delay is attack_a duration", () => {
  assert.equal(doubleShadow.secondSpawnDelay(meta(), "normal"), 6 / 20);
  assert.equal(doubleShadow.secondSpawnDelay(meta(), "skill1"), 8 / 20);
  assert.equal(doubleShadow.secondSpawnDelay(meta(), "skill2"), 10 / 20);
});

test("DOUBLE native geometry uses independent first and second starts", () => {
  const result = doubleShadow.deriveDoubleGeometry(
    meta("DOUBLE"), "normal", scene(), target(), { engine, adapter }, "native",
  );
  assert.equal(result.supported, true);
  assert.equal(result.family, "DOUBLE_LINEAR");
  assert.deepEqual(
    { x: result.geometry.startX, y: result.geometry.startY },
    { x: 140, y: 180 },
  );
  assert.deepEqual(
    { x: result.geometry.second.startX, y: result.geometry.second.startY },
    { x: 180, y: 160 },
  );
  assert.equal(result.geometry.second.spawnTime, 0.3);
});

test("native DOUBLE ignores projectileEndX/Y for outbound endpoint", () => {
  const native = doubleShadow.deriveDoubleGeometry(
    meta("DOUBLE"), "normal", scene(), target(), { engine, adapter }, "native",
  );
  const viewer = doubleShadow.deriveDoubleGeometry(
    meta("DOUBLE"), "normal", scene(), target(), { engine, adapter }, "viewer",
  );
  assert.equal(native.geometry.baseEndX, 500);
  assert.equal(native.geometry.baseEndY, 200);
  assert.notEqual(viewer.geometry.baseEndX, native.geometry.baseEndX);
  assert.notEqual(viewer.geometry.baseEndY, native.geometry.baseEndY);
});

test("DOUBLE uses native linear sentinel hit rate fallback", () => {
  const data = meta("DOUBLE");
  data.projectileData.hitTiming.normalHitPointRate = 100;
  assert.equal(doubleShadow.effectiveHitPointRate(data, "normal", "DOUBLE_LINEAR"), 0.25);
});

test("DOUBLEC uses native curve sentinel hit rate fallback", () => {
  const data = meta("DOUBLEC");
  data.projectileData.hitTiming.normalHitPointRate = 100;
  assert.equal(doubleShadow.effectiveHitPointRate(data, "normal", "DOUBLE_CURVE"), 0);
});

test("DOUBLE shadow validates both projectiles against engine", () => {
  const report = doubleShadow.buildDoubleShadowReport({
    unitId: "u-double",
    clip: "attack",
    dataKey: "normal",
    meta: meta("DOUBLE"),
    scene: scene(),
    target: target(),
  }, { engine, adapter });
  assert.equal(report.supported, true);
  assert.equal(report.family, "DOUBLE_LINEAR");
  assert.equal(report.withinTolerance, true);
  assert.ok(report.maxPositionDelta < 1e-9);
  assert.equal(report.durationDelta, 0);
  assert.equal(report.secondDurationDelta, 0);
  assert.ok(report.secondImpactTime > report.firstImpactTime || report.secondSpawnDelay > 0);
});

test("DOUBLEC shadow validates both Bezier projectiles", () => {
  const report = doubleShadow.buildDoubleShadowReport({
    unitId: "u-doublec",
    clip: "attack",
    dataKey: "normal",
    meta: meta("DOUBLEC"),
    scene: scene(),
    target: target(),
  }, { engine, adapter });
  assert.equal(report.supported, true);
  assert.equal(report.family, "DOUBLE_CURVE");
  assert.equal(report.withinTolerance, true);
  assert.ok(report.maxPositionDelta < 1e-9);
});

test("missing second SAM segment fails closed", () => {
  const data = meta("DOUBLE");
  delete data.parts.body.animations.attack_a;
  const result = doubleShadow.deriveDoubleGeometry(
    data, "normal", scene(), target(), { engine, adapter }, "native",
  );
  assert.equal(result.supported, false);
  assert.equal(result.reason, "double-second-sam-boundary-unavailable");
});

test("missing secondStart fails closed", () => {
  const data = meta("DOUBLE");
  delete data.projectileData.normal.secondStart;
  const result = doubleShadow.deriveDoubleGeometry(
    data, "normal", scene(), target(), { engine, adapter }, "native",
  );
  assert.equal(result.supported, false);
  assert.equal(result.reason, "double-start-geometry-unavailable");
});
