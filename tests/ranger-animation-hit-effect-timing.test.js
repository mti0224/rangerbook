const test = require("node:test");
const assert = require("node:assert/strict");

const timing = require("../assets/js/ranger-animation-hit-effect-timing.js");

function viewerPlan(overrides = {}) {
  return {
    source: "viewer",
    selectedClip: "attack",
    startedAt: 1000,
    cycleDuration: 2,
    impactTime: 0.8,
    ...overrides,
  };
}

function enginePlan(overrides = {}) {
  return {
    source: "engine",
    authoritative: true,
    family: "DOUBLE_LINEAR",
    selectedClip: "attack",
    startedAt: 1000,
    cycleDuration: 2,
    impactEvents: [
      { type: "projectile-impact", time: 0.7, projectileIndex: 0 },
      { type: "projectile-impact", time: 1.05, projectileIndex: 1 },
    ],
    ...overrides,
  };
}

test("authoritative engine impacts replace legacy viewer timing", () => {
  const schedule = timing.resolveImpactSchedule(viewerPlan(), enginePlan());
  assert.equal(schedule.source, "engine");
  assert.deepEqual(schedule.impacts, [
    { time: 0.7, projectileIndex: 0 },
    { time: 1.05, projectileIndex: 1 },
  ]);
});

test("observational engine plan does not change production hit timing", () => {
  const schedule = timing.resolveImpactSchedule(
    viewerPlan(),
    enginePlan({ authoritative: false }),
  );
  assert.equal(schedule.source, "viewer");
  assert.deepEqual(schedule.impacts, [{ time: 0.8, projectileIndex: 0 }]);
});

test("mismatched playback clock fails back to viewer timing", () => {
  const schedule = timing.resolveImpactSchedule(
    viewerPlan(),
    enginePlan({ startedAt: 2000 }),
  );
  assert.equal(schedule.source, "viewer");
});

test("DOUBLE impacts can overlap as independent hit effects", () => {
  const schedule = timing.resolveImpactSchedule(viewerPlan(), enginePlan());
  const active = timing.activeImpacts(schedule, 1.1, 0.5);
  assert.equal(active.length, 2);
  assert.deepEqual(active.map((item) => item.projectileIndex), [0, 1]);
  assert.ok(active[0].age > active[1].age);
});

test("impact effect wraps correctly across playback cycles", () => {
  const schedule = timing.resolveImpactSchedule(viewerPlan(), enginePlan({
    impactEvents: [{ type: "projectile-impact", time: 1.9, projectileIndex: 0 }],
  }));
  const active = timing.activeImpacts(schedule, 2.1, 0.4);
  assert.equal(active.length, 1);
  assert.equal(active[0].cycleIndex, 0);
  assert.ok(Math.abs(active[0].age - 0.2) < 1e-9);
});

test("DOUBLE engine timing requires live DOUBLE renderer authority", () => {
  const plan = enginePlan();
  const active = timing.effectiveSimulationPlan(
    plan,
    { active: true, family: "LINEAR" },
    { active: true, family: "DOUBLE_LINEAR" },
  );
  assert.equal(active.authoritative, true);

  const failedClosed = timing.effectiveSimulationPlan(
    plan,
    { active: true, family: "LINEAR" },
    { active: false, family: "DOUBLE_LINEAR", reason: "double-runtime-error" },
  );
  assert.equal(failedClosed.authoritative, false);
  assert.equal(failedClosed.authorityReason, "renderer-authority-inactive");
});

test("standard engine timing requires matching live standard authority family", () => {
  const plan = enginePlan({ family: "CURVE", impactEvents: [{ type: "projectile-impact", time: 0.7, projectileIndex: 0 }] });
  const active = timing.effectiveSimulationPlan(
    plan,
    { active: true, family: "CURVE" },
    { active: true, family: "DOUBLE_CURVE" },
  );
  assert.equal(active.authoritative, true);

  const staleFamily = timing.effectiveSimulationPlan(
    plan,
    { active: true, family: "LINEAR" },
    { active: true, family: "DOUBLE_CURVE" },
  );
  assert.equal(staleFamily.authoritative, false);
});
