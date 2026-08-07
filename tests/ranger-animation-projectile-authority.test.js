const test = require("node:test");
const assert = require("node:assert/strict");

const engine = require("../assets/js/ranger-animation-projectile-engine.js");
globalThis.RangerAnimationProjectileEngine = engine;
const adapter = require("../assets/js/ranger-animation-projectile-engine-adapter.js");
globalThis.RangerAnimationProjectileEngineAdapter = adapter;
const shadow = require("../assets/js/ranger-animation-projectile-shadow.js");
globalThis.RangerAnimationProjectileShadow = shadow;
const authority = require("../assets/js/ranger-animation-projectile-authority.js");

function fakeRoot(search = "", stored = null) {
  return {
    URLSearchParams,
    location: { search },
    localStorage: {
      getItem() {
        return stored;
      },
    },
  };
}

function animation(frameCount = 6) {
  return {
    frame_count: frameCount,
    frames: Array.from({ length: frameCount }, () => [[]]),
  };
}

test("feature flag defaults to disabled", () => {
  assert.equal(authority.featureFlagEnabled(fakeRoot()), false);
});

test("query flag enables engine authority", () => {
  assert.equal(authority.featureFlagEnabled(fakeRoot("?projectileEngine=1")), true);
  assert.equal(authority.featureFlagEnabled(fakeRoot("?projectileEngine=native")), true);
});

test("explicit legacy query overrides stored opt-in", () => {
  assert.equal(authority.featureFlagEnabled(fakeRoot("?projectileEngine=legacy", "1")), false);
});

test("localStorage can opt into authority without changing default", () => {
  assert.equal(authority.featureFlagEnabled(fakeRoot("", "1")), true);
});

test("authority requires a supported shadow report within tolerance", () => {
  assert.equal(authority.shouldTakeAuthority({
    supported: true,
    withinTolerance: true,
    family: "LINEAR",
  }, true), true);

  assert.equal(authority.shouldTakeAuthority({
    supported: true,
    withinTolerance: false,
    family: "LINEAR",
  }, true), false);

  assert.equal(authority.shouldTakeAuthority({
    supported: true,
    withinTolerance: true,
    family: "DOUBLE_LINEAR",
  }, true), false);

  assert.equal(authority.shouldTakeAuthority({
    supported: true,
    withinTolerance: true,
    family: "CURVE",
  }, false), false);
});

test("spawn time follows virtual clip segment boundary", () => {
  const bodyPart = {
    anim_rate: 10,
    animations: {
      attack_ready: animation(2),
      attack: animation(4),
    },
    virtual_clips: {
      attack_all: { segments: ["attack_ready", "attack"] },
    },
  };
  const spec = authority.CLIP_SPECS.attack;
  const spawn = authority.nativeProjectileSpawnTime(bodyPart, "attack_all", spec, 0.6);
  assert.equal(spawn, 0.2);
});

test("spawn time falls back to ready animation duration", () => {
  const bodyPart = {
    anim_rate: 20,
    animations: {
      s_attack_ready: animation(5),
      s_attack_all: animation(20),
    },
  };
  const spec = authority.CLIP_SPECS.skill1;
  const spawn = authority.nativeProjectileSpawnTime(bodyPart, "s_attack_all", spec, 1);
  assert.equal(spawn, 0.25);
});

test("RETURN rendering selects normal_a and normal_b when available", () => {
  const meta = {
    parts: {
      bul: {
        animations: {
          normal: animation(),
          normal_a: animation(),
          normal_b: animation(),
        },
      },
    },
  };
  const result = authority.projectileAnimations(
    meta,
    authority.CLIP_SPECS.attack,
    { attackType: "RETURN" },
    "RETURN",
  );

  assert.ok(result);
  assert.equal(result.outbound.name, "normal_a");
  assert.equal(result.inbound.name, "normal_b");
});

test("LINEAR rendering keeps the standard normal animation", () => {
  const meta = {
    parts: {
      bul: {
        animations: {
          normal: animation(),
          normal_a: animation(),
        },
      },
    },
  };
  const result = authority.projectileAnimations(
    meta,
    authority.CLIP_SPECS.attack,
    { attackType: "WEAPON" },
    "LINEAR",
  );

  assert.ok(result);
  assert.equal(result.outbound.name, "normal");
  assert.equal(result.inbound, null);
});
