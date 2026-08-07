const test = require("node:test");
const assert = require("node:assert/strict");

const engine = require("../assets/js/ranger-animation-projectile-engine.js");
globalThis.RangerAnimationProjectileEngine = engine;
const adapter = require("../assets/js/ranger-animation-projectile-engine-adapter.js");
globalThis.RangerAnimationProjectileEngineAdapter = adapter;
const shadow = require("../assets/js/ranger-animation-projectile-shadow.js");

function meta(attackType = "WEAPON", overrides = {}) {
  return {
    projectileData: {
      coordinateScale: 0.5,
      hitTiming: { normalHitPointRate: 0.25 },
      normal: {
        attackType,
        start: { x: 40, y: 20 },
        end: { x: 0, y: 0 },
        secondStart: { x: 40, y: 20 },
        moveSpeed: 6,
        motion: { rotation: "FIXED" },
        ...overrides,
      },
    },
  };
}

function scene() {
  return {
    bodyOriginX: 100,
    bodyOriginY: 200,
    targetX: 460,
    targetBaseY: 200,
    sceneScale: 2,
    facing: 1,
  };
}

function target() {
  return { contentHeight: 80 };
}

test("viewer geometry still reproduces the current generic end-offset behavior", () => {
  const result = shadow.deriveViewerGeometry(
    meta("WEAPON", { end: { x: 50, y: 20 } }),
    "normal",
    scene(),
    target(),
    { engine, adapter },
  );

  assert.equal(result.supported, true);
  assert.equal(result.geometryModel, "viewer-current");
  assert.deepEqual(
    { x: result.geometry.startX, y: result.geometry.startY },
    { x: 140, y: 180 },
  );
  assert.deepEqual(
    { x: result.geometry.baseEndX, y: result.geometry.baseEndY },
    { x: 510, y: 180 },
  );
  assert.deepEqual(
    { x: result.geometry.endX, y: result.geometry.endY },
    { x: 510, y: 140 },
  );
});

test("native LINEAR geometry ignores projectileEndX/Y as a generic target offset", () => {
  const result = shadow.deriveNativeGeometry(
    meta("WEAPON", { end: { x: 50, y: 20 } }),
    "normal",
    scene(),
    target(),
    { engine, adapter },
  );

  assert.equal(result.supported, true);
  assert.equal(result.geometryModel, "native-v1");
  assert.deepEqual(result.rawEndOffset, { x: 25, y: 10 });
  assert.deepEqual(result.appliedEndOffset, { x: 0, y: 0 });
  assert.deepEqual(
    { x: result.geometry.baseEndX, y: result.geometry.baseEndY },
    { x: 460, y: 200 },
  );
  assert.deepEqual(
    { x: result.geometry.endX, y: result.geometry.endY },
    { x: 460, y: 160 },
  );
});

test("native CURVE geometry also ignores projectileEndX/Y", () => {
  const result = shadow.deriveNativeGeometry(
    meta("WEAPONC", { end: { x: -30, y: 40 } }),
    "normal",
    scene(),
    target(),
    { engine, adapter },
  );

  assert.equal(result.supported, true);
  assert.equal(result.family, "CURVE");
  assert.deepEqual(result.appliedEndOffset, { x: 0, y: 0 });
  assert.deepEqual(
    { x: result.geometry.baseEndX, y: result.geometry.baseEndY },
    { x: 460, y: 200 },
  );
});

test("RETURN keeps the existing end-offset interpretation until its dedicated migration", () => {
  const result = shadow.deriveNativeGeometry(
    meta("RETURN", { end: { x: 50, y: 20 }, secondStart: { x: 20, y: 10 } }),
    "normal",
    scene(),
    target(),
    { engine, adapter },
  );

  assert.equal(result.supported, true);
  assert.equal(result.family, "RETURN");
  assert.deepEqual(result.appliedEndOffset, { x: 25, y: 10 });
  assert.deepEqual(
    { x: result.geometry.baseEndX, y: result.geometry.baseEndY },
    { x: 510, y: 180 },
  );
});

test("shadow report validates engine against native geometry and exposes viewer migration delta", () => {
  const data = meta("WEAPON", { end: { x: 50, y: 20 } });
  const viewer = shadow.deriveViewerGeometry(data, "normal", scene(), target(), { engine, adapter });
  const legacyImpactTime = 0.4 + viewer.geometry.flightDuration;
  const report = shadow.buildShadowReport({
    unitId: "u-offset",
    clip: "attack",
    dataKey: "normal",
    meta: data,
    scene: scene(),
    target: target(),
    legacyImpactTime,
  }, { engine, adapter });

  assert.equal(report.supported, true);
  assert.equal(report.family, "LINEAR");
  assert.equal(report.geometryModel, "native-v1");
  assert.ok(report.maxPositionDelta < 1e-9);
  assert.equal(report.durationDelta, 0);
  assert.equal(report.withinTolerance, true);
  assert.equal(report.viewerWithinTolerance, false);
  assert.ok(report.viewerMigrationDelta.endpointDelta > 0);
  assert.ok(report.viewerMigrationDelta.durationDelta > 0);
  assert.ok(report.impactDelta > 0);
  assert.deepEqual(report.appliedEndOffset, { x: 0, y: 0 });
});

test("zero end-offset remains viewer-equivalent after native migration", () => {
  const derived = shadow.deriveViewerGeometry(
    meta("WEAPON"),
    "normal",
    scene(),
    target(),
    { engine, adapter },
  );
  const legacyImpactTime = 0.4 + derived.geometry.flightDuration;
  const report = shadow.buildShadowReport({
    unitId: "u-test",
    clip: "attack",
    dataKey: "normal",
    meta: meta("WEAPON"),
    scene: scene(),
    target: target(),
    legacyImpactTime,
  }, { engine, adapter });

  assert.equal(report.supported, true);
  assert.ok(report.maxPositionDelta < 1e-9);
  assert.equal(report.durationDelta, 0);
  assert.ok(report.impactDelta < 1e-9);
  assert.equal(report.withinTolerance, true);
  assert.equal(report.viewerWithinTolerance, true);
});

test("shadow report matches CURVE native geometry without inventing impact time", () => {
  const report = shadow.buildShadowReport({
    unitId: "u-curve",
    clip: "skill1",
    dataKey: "normal",
    meta: meta("WEAPONC", { end: { x: 40, y: 10 } }),
    scene: scene(),
    target: target(),
    legacyImpactTime: null,
  }, { engine, adapter });

  assert.equal(report.supported, true);
  assert.equal(report.family, "CURVE");
  assert.ok(report.maxPositionDelta < 1e-9);
  assert.equal(report.legacyImpactTime, null);
  assert.equal(report.impactDelta, null);
  assert.equal(report.withinTolerance, true);
  assert.equal(report.viewerWithinTolerance, false);
});

test("RETURN shadow compares outbound and inbound timing", () => {
  const returnMeta = meta("RETURN", {
    secondStart: { x: 20, y: 10 },
  });
  const report = shadow.buildShadowReport({
    unitId: "u-return",
    clip: "attack",
    dataKey: "normal",
    meta: returnMeta,
    scene: scene(),
    target: target(),
    legacyImpactTime: 1.2,
  }, { engine, adapter });

  assert.equal(report.supported, true);
  assert.equal(report.family, "RETURN");
  assert.ok(report.maxPositionDelta < 1e-9);
  assert.equal(report.durationDelta, 0);
  assert.equal(report.returnDurationDelta, 0);
  assert.equal(report.withinTolerance, true);
  assert.equal(report.viewerWithinTolerance, true);
});

test("compatibility deriveLegacyGeometry now resolves to native-v1", () => {
  const result = shadow.deriveLegacyGeometry(
    meta("WEAPON", { end: { x: 50, y: 20 } }),
    "normal",
    scene(),
    target(),
    { engine, adapter },
  );
  assert.equal(result.geometryModel, "native-v1");
  assert.deepEqual(result.appliedEndOffset, { x: 0, y: 0 });
});

test("actor-ground heuristic is explicitly excluded from native shadow truth", () => {
  const actorMeta = meta("WEAPON");
  actorMeta.actorProjectileGround = {
    attacks: { normal: { motionType: "LINEAR", travelBottom: 100 } },
  };
  const result = shadow.deriveNativeGeometry(
    actorMeta,
    "normal",
    scene(),
    target(),
    { engine, adapter },
  );

  assert.equal(result.supported, false);
  assert.equal(result.reason, "actor-ground-heuristic-active");
});

test("DOUBLE remains unsupported until second native geometry exists", () => {
  const result = shadow.deriveNativeGeometry(
    meta("DOUBLE"),
    "normal",
    scene(),
    target(),
    { engine, adapter },
  );

  assert.equal(result.supported, false);
  assert.equal(result.reason, "family-not-shadowed:DOUBLE_LINEAR");
});

test("missing target profile fails closed instead of using guessed bounds", () => {
  const result = shadow.deriveNativeGeometry(
    meta("WEAPON"),
    "normal",
    scene(),
    null,
    { engine, adapter },
  );

  assert.equal(result.supported, false);
  assert.equal(result.reason, "target-profile-unavailable");
});

test("sentinel hit rate falls back to native moving-projectile defaults", () => {
  const data = meta("WEAPONC");
  data.projectileData.hitTiming.normalHitPointRate = 99;
  assert.equal(shadow.effectiveHitPointRate(data, "normal", "CURVE"), 0);

  data.projectileData.normal.attackType = "WEAPON";
  assert.equal(shadow.effectiveHitPointRate(data, "normal", "LINEAR"), 0.25);
});
