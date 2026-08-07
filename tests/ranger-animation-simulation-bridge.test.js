const test = require("node:test");
const assert = require("node:assert/strict");

const engine = require("../assets/js/ranger-animation-projectile-engine.js");
globalThis.RangerAnimationProjectileEngine = engine;
const adapter = require("../assets/js/ranger-animation-projectile-engine-adapter.js");
globalThis.RangerAnimationProjectileEngineAdapter = adapter;
const shadow = require("../assets/js/ranger-animation-projectile-shadow.js");
globalThis.RangerAnimationProjectileShadow = shadow;
const doubleShadow = require("../assets/js/ranger-animation-projectile-double-shadow.js");
globalThis.RangerAnimationProjectileDoubleShadow = doubleShadow;
const authority = require("../assets/js/ranger-animation-projectile-authority.js");
globalThis.RangerAnimationProjectileAuthority = authority;
const doubleAuthority = require("../assets/js/ranger-animation-projectile-double-authority.js");
globalThis.RangerAnimationProjectileDoubleAuthority = doubleAuthority;
const simulationBridge = require("../assets/js/ranger-animation-simulation-bridge.js");

function body() {
  return {
    anim_rate: 20,
    animations: {
      attack_ready: { frame_count: 6, frames: Array.from({ length: 6 }, () => []) },
      attack: { frame_count: 12, frames: Array.from({ length: 12 }, () => []) },
      attack_a: { frame_count: 5, frames: Array.from({ length: 5 }, () => []) },
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

function plan() {
  return {
    selectedClip: "attack",
    startedAt: 1000,
    cycleDuration: 2,
  };
}

function standardMeta() {
  return {
    parts: { body: body() },
    projectileData: {
      coordinateScale: 0.5,
      hitTiming: { normalHitPointRate: 0.25 },
      normal: {
        attackType: "WEAPON",
        start: { x: 40, y: 20 },
        end: { x: 0, y: 0 },
        moveSpeed: 6,
        motion: { rotation: "FIXED" },
      },
    },
  };
}

function doubleMeta() {
  return {
    parts: { body: body() },
    projectileData: {
      coordinateScale: 0.5,
      hitTiming: { normalHitPointRate: 0.25 },
      normal: {
        attackType: "DOUBLE",
        start: { x: 40, y: 20 },
        secondStart: { x: 80, y: 30 },
        end: { x: 0, y: 0 },
        moveSpeed: 6,
        motion: { rotation: "FIXED" },
      },
    },
  };
}

function verifiedStandardReport() {
  return { supported: true, withinTolerance: true, family: "LINEAR" };
}

function verifiedDoubleReport() {
  return { supported: true, withinTolerance: true, family: "DOUBLE_LINEAR" };
}

test("verified LINEAR builds an engine event plan on the playback timeline", () => {
  const result = simulationBridge.buildSimulationPlan({
    unitId: "u-test",
    meta: standardMeta(),
    plan: plan(),
    scene: scene(),
    target: target(),
    standardReport: verifiedStandardReport(),
    doubleReport: null,
    featureFlagEnabled: true,
  }, { engine, adapter, shadow, doubleShadow, authority, doubleAuthority });

  assert.equal(result.supported, true);
  assert.equal(result.family, "LINEAR");
  assert.equal(result.plan.source, "engine");
  assert.equal(result.plan.authoritative, true);
  assert.equal(result.plan.impactEvents.length, 1);
  assert.equal(result.plan.impactEvents[0].projectileIndex, 0);
  assert.ok(result.plan.primaryImpactTime > 0);
});

test("SimulationBridge keeps engine events observational when feature flag is off", () => {
  const result = simulationBridge.buildSimulationPlan({
    meta: standardMeta(),
    plan: plan(),
    scene: scene(),
    target: target(),
    standardReport: verifiedStandardReport(),
    featureFlagEnabled: false,
  }, { engine, adapter, shadow, doubleShadow, authority, doubleAuthority });

  assert.equal(result.supported, true);
  assert.equal(result.plan.source, "engine");
  assert.equal(result.plan.authoritative, false);
});

test("DOUBLE publishes two independently indexed projectile impact events", () => {
  const result = simulationBridge.buildSimulationPlan({
    unitId: "u-double",
    meta: doubleMeta(),
    plan: plan(),
    scene: scene(),
    target: target(),
    standardReport: null,
    doubleReport: verifiedDoubleReport(),
    featureFlagEnabled: true,
  }, { engine, adapter, shadow, doubleShadow, authority, doubleAuthority });

  assert.equal(result.supported, true);
  assert.equal(result.family, "DOUBLE_LINEAR");
  assert.equal(result.plan.authoritative, true);
  assert.equal(result.plan.impactEvents.length, 2);
  assert.deepEqual(
    result.plan.impactEvents.map((event) => event.projectileIndex),
    [0, 1],
  );
  assert.ok(result.plan.impactEvents[1].time > result.plan.impactEvents[0].time - 1);
});

test("unverified shadow fails closed before publishing an engine plan", () => {
  const result = simulationBridge.buildSimulationPlan({
    meta: standardMeta(),
    plan: plan(),
    scene: scene(),
    target: target(),
    standardReport: { supported: true, withinTolerance: false, family: "LINEAR" },
  }, { engine, adapter, shadow, doubleShadow, authority, doubleAuthority });

  assert.equal(result.supported, false);
  assert.equal(result.reason, "simulation-shadow-not-verified");
});

test("unsupported DIRECT family stays on viewer fallback", () => {
  const meta = standardMeta();
  meta.projectileData.normal.attackType = "PUNCH";
  const result = simulationBridge.buildSimulationPlan({
    meta,
    plan: plan(),
    scene: scene(),
    target: target(),
    standardReport: { supported: true, withinTolerance: true, family: "DIRECT" },
  }, { engine, adapter, shadow, doubleShadow, authority, doubleAuthority });

  assert.equal(result.supported, false);
  assert.equal(result.reason, "simulation-family-not-supported:DIRECT");
});
