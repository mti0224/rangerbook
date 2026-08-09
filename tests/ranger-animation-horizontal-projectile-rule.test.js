const test = require("node:test");
const assert = require("node:assert/strict");

const rule = require("../assets/js/ranger-animation-horizontal-projectile-rule.js");

function attack(overrides = {}) {
  return {
    attackType: "WEAPON",
    moveSpeed: 20,
    start: { x: 200, y: 0 },
    motion: { type: "LINEAR", enabled: true },
    ...overrides,
  };
}

test("LINEAR hitPointRate=0 enables horizontal viewer override", () => {
  assert.equal(rule.shouldForceHorizontal({
    attack: attack(),
    hitTiming: { normalHitPointRate: 0 },
    hitRateKey: "normalHitPointRate",
  }), true);
});

test("nonzero hitPointRate keeps target-height trajectory", () => {
  assert.equal(rule.shouldForceHorizontal({
    attack: attack(),
    hitTiming: { normalHitPointRate: 0.5 },
    hitRateKey: "normalHitPointRate",
  }), false);
});

test("sentinel hitPointRate does not become horizontal", () => {
  assert.equal(rule.shouldForceHorizontal({
    attack: attack(),
    hitTiming: { normalHitPointRate: 100 },
    hitRateKey: "normalHitPointRate",
  }), false);
  assert.equal(rule.effectiveHitPointRate(
    { normalHitPointRate: 100 },
    "normalHitPointRate",
    "LINEAR",
  ), 0.25);
});

test("moveSpeed=0 stays outside forced LINEAR override", () => {
  assert.equal(rule.shouldForceHorizontal({
    attack: attack({ moveSpeed: 0 }),
    hitTiming: { normalHitPointRate: 0 },
    hitRateKey: "normalHitPointRate",
  }), false);
});

test("CURVE hitPointRate=0 is not affected", () => {
  assert.equal(rule.shouldForceHorizontal({
    attack: attack({ attackType: "WEAPONC", motion: { type: "CURVE", enabled: true } }),
    hitTiming: { normalHitPointRate: 0 },
    hitRateKey: "normalHitPointRate",
  }), false);
});

test("DOUBLE linear family is included", () => {
  assert.equal(rule.shouldForceHorizontal({
    attack: attack({ attackType: "DOUBLE", motion: { type: "LINEAR", enabled: true } }),
    hitTiming: { normalHitPointRate: 0 },
    hitRateKey: "normalHitPointRate",
  }), true);
});

test("travelBottom preserves the original launch Y", () => {
  assert.equal(rule.travelBottomForStart(attack({ start: { x: 200, y: 0 } }), 0.5), 88);
  assert.equal(rule.travelBottomForStart(attack({ start: { x: 75, y: 100 } }), 0.5), 138);

  const annotation = rule.buildHorizontalAnnotation({
    attack: attack({ start: { x: 200, y: 0 } }),
    hitTiming: { normalHitPointRate: 0 },
    hitRateKey: "normalHitPointRate",
    coordinateScale: 0.5,
  });
  assert.equal(annotation.travelBottom, 88);
  assert.equal(annotation.viewerHorizontalZeroHitRate, true);
  assert.equal(annotation.provenance, "viewer-override:linear-hit-rate-zero");
});
