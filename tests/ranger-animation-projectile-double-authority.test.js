const test = require("node:test");
const assert = require("node:assert/strict");

const engine = require("../assets/js/ranger-animation-projectile-engine.js");
globalThis.RangerAnimationProjectileEngine = engine;
const adapter = require("../assets/js/ranger-animation-projectile-engine-adapter.js");
globalThis.RangerAnimationProjectileEngineAdapter = adapter;
const doubleShadow = require("../assets/js/ranger-animation-projectile-double-shadow.js");
globalThis.RangerAnimationProjectileDoubleShadow = doubleShadow;
const authority = require("../assets/js/ranger-animation-projectile-double-authority.js");

function report(overrides = {}) {
  return {
    supported: true,
    withinTolerance: true,
    family: "DOUBLE_LINEAR",
    secondSpawnDelay: 0.25,
    simulationInput: {
      attackType: "DOUBLE",
      kind: "normal",
      spawnTime: 0,
      finishDuration: 0,
      start: { x: 10, y: 20 },
      end: { x: 310, y: 20 },
      distance: 300,
      moveSpeed: 10,
      second: {
        spawnTime: 0.25,
        start: { x: 30, y: 40 },
        end: { x: 310, y: 20 },
        distance: 280,
        moveSpeed: 10,
      },
    },
    ...overrides,
  };
}

test("DOUBLE authority is gated by feature flag, shadow support, and tolerance", () => {
  assert.equal(authority.shouldTakeAuthority(report(), true), true);
  assert.equal(authority.shouldTakeAuthority(report(), false), false);
  assert.equal(authority.shouldTakeAuthority(report({ supported: false }), true), false);
  assert.equal(authority.shouldTakeAuthority(report({ withinTolerance: false }), true), false);
  assert.equal(authority.shouldTakeAuthority(report({ family: "LINEAR" }), true), false);
});

test("runtime input shifts both projectile spawn times onto the playback timeline", () => {
  const input = authority.runtimeInput(report(), 0.6, 0.2);
  assert.ok(input);
  assert.equal(input.spawnTime, 0.6);
  assert.equal(input.second.spawnTime, 0.85);
  assert.equal(input.finishDuration, 0.2);
});

test("runtime input fails closed without a native second projectile", () => {
  const missing = report({ simulationInput: { attackType: "DOUBLE" } });
  assert.equal(authority.runtimeInput(missing, 0.4, 0), null);
});

test("engine receives two independent projectiles after authority timeline shift", () => {
  const input = authority.runtimeInput(report(), 0.5, 0.1);
  const simulation = engine.createProjectileSimulation(input);
  assert.equal(simulation.family, "DOUBLE_LINEAR");
  assert.equal(simulation.projectiles.length, 2);
  assert.equal(simulation.projectiles[0].spawnTime, 0.5);
  assert.equal(simulation.projectiles[1].spawnTime, 0.75);
  assert.notDeepEqual(
    simulation.projectiles[0].positionAt(0.5),
    simulation.projectiles[1].positionAt(0.75),
  );
  assert.ok(simulation.projectiles[1].impactTime > simulation.projectiles[1].spawnTime);
});

test("DOUBLE_CURVE remains eligible for the same authority gate", () => {
  assert.equal(authority.shouldTakeAuthority(report({ family: "DOUBLE_CURVE" }), true), true);
});

test("projectile phase exposes independent moving and finish windows", () => {
  const projectile = {
    spawnTime: 1,
    impactTime: 2,
    finishEndTime: 2.4,
    cleanupTime: 2.4,
  };
  assert.equal(authority.projectilePhase(projectile, 0.9), "before");
  assert.equal(authority.projectilePhase(projectile, 1.5), "moving");
  assert.equal(authority.projectilePhase(projectile, 2.2), "finish");
  assert.equal(authority.projectilePhase(projectile, 2.5), "after");
});

test("native projectile spawn follows the SAM ready boundary", () => {
  const body = {
    anim_rate: 20,
    animations: {
      attack_ready: { frame_count: 6, frames: Array.from({ length: 6 }, () => []) },
      attack: { frame_count: 10, frames: Array.from({ length: 10 }, () => []) },
    },
  };
  const spec = authority.CLIP_SPECS.attack;
  assert.equal(authority.nativeProjectileSpawnTime(body, "attack", spec, 1), 0);
  assert.equal(authority.nativeProjectileSpawnTime(body, "attack_all", spec, 1), 0.3);
});
