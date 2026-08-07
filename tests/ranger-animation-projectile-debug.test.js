const test = require("node:test");
const assert = require("node:assert/strict");

const engine = require("../assets/js/ranger-animation-projectile-engine.js");
globalThis.RangerAnimationProjectileEngine = engine;
const debug = require("../assets/js/ranger-animation-debug-overlay.js");

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

function report(overrides = {}) {
  return {
    supported: true,
    family: "LINEAR",
    attackType: "WEAPON",
    geometryModel: "native-v2",
    withinTolerance: true,
    viewerWithinTolerance: false,
    maxPositionDelta: 0,
    durationDelta: 0,
    impactDelta: 0.1,
    viewerMigrationDelta: {
      endpointDelta: 25,
      returnEndpointDelta: 0,
      durationDelta: 0.1,
      returnDurationDelta: 0,
    },
    viewerGeometry: {
      startX: 10,
      startY: 20,
      endX: 130,
      endY: 40,
      returnEndX: 10,
      returnEndY: 20,
    },
    nativeGeometry: {
      startX: 10,
      startY: 20,
      endX: 105,
      endY: 40,
      returnEndX: 10,
      returnEndY: 20,
    },
    simulationInput: {
      attackType: "WEAPON",
      kind: "normal",
      spawnTime: 0.2,
      start: { x: 10, y: 20 },
      end: { x: 105, y: 40 },
      distance: 100,
      moveSpeed: 10,
    },
    ...overrides,
  };
}

test("debug flag defaults to disabled", () => {
  assert.equal(debug.featureFlagEnabled(fakeRoot()), false);
});

test("query and localStorage can enable debug overlay", () => {
  assert.equal(debug.featureFlagEnabled(fakeRoot("?animationDebug=1")), true);
  assert.equal(debug.featureFlagEnabled(fakeRoot("?animationDebug=native")), true);
  assert.equal(debug.featureFlagEnabled(fakeRoot("", "1")), true);
});

test("explicit off query overrides stored debug opt-in", () => {
  assert.equal(debug.featureFlagEnabled(fakeRoot("?animationDebug=off", "1")), false);
});

test("debug model exposes viewer and native endpoint markers", () => {
  const model = debug.buildDebugModel(report(), engine);
  assert.equal(model.supported, true);
  assert.equal(model.geometryModel, "native-v2");
  assert.equal(model.markers.find((item) => item.label === "START").x, 10);
  assert.equal(model.markers.find((item) => item.label === "VIEWER END").x, 130);
  assert.equal(model.markers.find((item) => item.label === "NATIVE END").x, 105);
  assert.equal(model.deltas.viewerEndpoint, 25);
});

test("debug model reconstructs engine event timeline", () => {
  const model = debug.buildDebugModel(report(), engine);
  const types = model.events.map((item) => item.type);
  assert.ok(types.includes("projectile-spawn"));
  assert.ok(types.includes("projectile-impact"));
  assert.ok(types.includes("damage-resolution-start"));
});

test("RETURN debug model includes separate viewer and native return endpoints", () => {
  const model = debug.buildDebugModel(report({
    family: "RETURN",
    attackType: "RETURN",
    viewerMigrationDelta: {
      endpointDelta: 20,
      returnEndpointDelta: 35,
      durationDelta: 0.05,
      returnDurationDelta: 0.2,
    },
    viewerGeometry: {
      startX: 10,
      startY: 20,
      endX: 130,
      endY: 40,
      returnEndX: 60,
      returnEndY: 70,
    },
    nativeGeometry: {
      startX: 10,
      startY: 20,
      endX: 110,
      endY: 40,
      returnEndX: 25,
      returnEndY: 70,
    },
    simulationInput: {
      attackType: "RETURN",
      kind: "normal",
      spawnTime: 0,
      start: { x: 10, y: 20 },
      end: { x: 110, y: 40 },
      returnEnd: { x: 25, y: 70 },
      distance: 100,
      returnDistance: 55,
      moveSpeed: 10,
    },
  }), engine);

  assert.equal(model.markers.find((item) => item.label === "VIEWER RETURN").x, 60);
  assert.equal(model.markers.find((item) => item.label === "NATIVE RETURN").x, 25);
  assert.equal(model.deltas.viewerReturnEndpoint, 35);
});

test("CURVE debug model exposes native control point", () => {
  const model = debug.buildDebugModel(report({
    family: "CURVE",
    attackType: "WEAPONC",
    simulationInput: {
      attackType: "WEAPONC",
      kind: "normal",
      spawnTime: 0,
      start: { x: 10, y: 20 },
      end: { x: 100, y: 40 },
      distance: 100,
      moveSpeed: 10,
      curve: {
        control1: { x: 10, y: 20 },
        control2: { x: 80, y: -20 },
      },
    },
  }), engine);

  const control = model.markers.find((item) => item.label === "CURVE C2");
  assert.deepEqual({ x: control.x, y: control.y }, { x: 80, y: -20 });
});

test("unsupported shadow report stays non-invasive", () => {
  const model = debug.buildDebugModel({ supported: false, reason: "DOUBLE unsupported" }, engine);
  assert.equal(model.supported, false);
  assert.equal(model.markers.length, 0);
  assert.equal(model.events.length, 0);
});
