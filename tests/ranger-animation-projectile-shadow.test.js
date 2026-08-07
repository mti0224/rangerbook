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
  assert.equal(result.geometryModel, "native-v2");
  assert.deepEqual(result.rawEndOffset, { x: 25, y: 10 });
  assert.deepEqual(result.appliedOutboundEndOffset, { x: 0, y: 0 });
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
  assert.deepEqual(result.appliedOutboundEndOffset, { x: 0, y: 0 });
  assert.deepEqual(
    { x: result.geometry.baseEndX, y: result.geometry.baseEndY },
    { x: 460, y: 200 },
  );
});

test("native RETURN uses projectileEndX/Y for inbound endpoint, not outbound target", () => {
  const result = shadow.deriveNativeGeometry(
    meta("RETURN", { end: { x: 50, y: 20 }, secondStart: { x: 999, y: 999 } }),
    "normal",
    scene(),
    target(),
    { engine, adapter },
  );

  assert.equal(result.supported, true);
  assert.equal(result.family, "RETURN");
  assert.equal(result.geometryModel, "native-v2");
  assert.deepEqual(result.appliedOutboundEndOffset, { x: 0, y: 0 });
  assert.deepEqual(result.appliedReturnEndOffset, { x: 25, y: 10 });
  assert.deepEqual(
    { x: result.geometry.baseEndX, y: result.geometry.baseEndY },
    { x: 460, y: 200 },
  );
  assert.deepEqual(
    { x: result.geometry.returnEndX, y: result.geometry.returnEndY },
    { x: 190, y: 160 },
  );
});

test("RETURN with zero end offset returns to the original projectile spawn", () => {
  const result = shadow.deriveNativeGeometry(
    meta("RETURN", { end: { x: 0, y: 0 }, secondStart: { x: 999, y: 999 } }),
    "normal",
    scene(),
    target(),
    { engine, adapter },
  );

  assert.deepEqual(
    { x: result.geometry.returnEndX, y: result.geometry.returnEndY },
    { x: result.geometry.startX, y: result.geometry.startY },
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
  assert.equal(report.geometryModel, "native-v2");
  assert.ok(report.maxPositionDelta < 1e-9);
  assert.equal(report.durationDelta, 0);
  assert.equal(report.withinTolerance, true);
  assert.equal(report.viewerWithinTolerance, false);
  assert.ok(report.viewerMigrationDelta.endpointDelta > 0);
  assert.ok(report.viewerMigrationDelta.durationDelta > 0);
  assert.ok(report.impactDelta > 0);
  assert.deepEqual(report.appliedOutboundEndOffset, { x: 0, y: 0 });
});

test("zero end-offset remains viewer-equivalent for LINEAR", () => {
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

test("RETURN shadow exposes outbound and inbound viewer migration", () => {
  const returnMeta = meta("RETURN", {
    end: { x: 50, y: 20 },
    secondStart: { x: 20, y: 10 },
  });
  const viewer = shadow.deriveViewerGeometry(returnMeta, "normal", scene(), target(), { engine, adapter });
  const report = shadow.buildShadowReport({
    unitId: "u-return",
    clip: "attack",
    dataKey: "normal",
    meta: returnMeta,
    scene: scene(),
    target: target(),
    legacyImpactTime: 0.3 + viewer.geometry.flightDuration,
  }, { engine, adapter });

  assert.equal(report.supported, true);
  assert.equal(report.family, "RETURN");
  assert.ok(report.maxPositionDelta < 1e-9);
  assert.equal(report.durationDelta, 0);
  assert.equal(report.returnDurationDelta, 0);
  assert.equal(report.withinTolerance, true);
  assert.equal(report.viewerWithinTolerance, false);
  assert.ok(report.viewerMigrationDelta.endpointDelta > 0);
  assert.ok(report.viewerMigrationDelta.returnEndpointDelta > 0);
});

test("compatibility deriveLegacyGeometry now resolves to native-v2", () => {
  const result = shadow.deriveLegacyGeometry(
    meta("WEAPON", { end: { x: 50, y: 20 } }),
    "normal",
    scene(),
    target(),
    { engine, adapter },
  );
  assert.equal(result.geometryModel, "native-v2");
  assert.deepEqual(result.appliedOutboundEndOffset, { x: 0, y: 0 });
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
