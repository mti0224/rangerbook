"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../assets/js/ranger-animation-projectile-engine.js");

function eventTypesAt(simulation, time) {
  return simulation.events
    .filter((event) => Math.abs(event.time - time) < 1e-9)
    .map((event) => event.type);
}

test("dispatcher preserves raw attackType and derives native family", () => {
  assert.equal(engine.familyForAttackType("WEAPON"), "LINEAR");
  assert.equal(engine.familyForAttackType("WEAPONC"), "CURVE");
  assert.equal(engine.familyForAttackType("DOUBLE"), "DOUBLE_LINEAR");
  assert.equal(engine.familyForAttackType("DOUBLEC"), "DOUBLE_CURVE");
  assert.equal(engine.familyForAttackType("RETURN"), "RETURN");
  assert.equal(engine.familyForAttackType("BEAM"), "BEAM");
  assert.equal(engine.familyForAttackType("ACTION"), "ACTION");
  assert.equal(engine.familyForAttackType("STAB"), "DIRECT");

  const simulation = engine.createProjectileSimulation({
    attackType: "WEAPON",
    start: { x: 0, y: 0 },
    end: { x: 60, y: 0 },
    distance: 60,
    moveSpeed: 1,
  });
  assert.equal(simulation.sourceAttackType, "WEAPON");
  assert.equal(simulation.family, "LINEAR");
});

test("LINEAR duration uses native D / (moveSpeed * 60)", () => {
  const simulation = engine.createProjectileSimulation({
    attackType: "ENERGY",
    spawnTime: 2,
    start: { x: 0, y: 0 },
    end: { x: 240, y: 999 },
    distance: 120,
    moveSpeed: 0.5,
  });
  assert.equal(simulation.outboundDuration, 4);
  assert.equal(simulation.impactTime, 6);
});

test("LINEAR positionAt interpolates the adapter-provided final geometry", () => {
  const simulation = engine.createProjectileSimulation({
    attackType: "WEAPON",
    spawnTime: 1,
    duration: 2,
    start: { x: 10, y: 20 },
    end: { x: 30, y: 60 },
  });
  assert.deepEqual(simulation.positionAt(1), { x: 10, y: 20 });
  assert.deepEqual(simulation.positionAt(2), { x: 20, y: 40 });
  assert.deepEqual(simulation.positionAt(3), { x: 30, y: 60 });
});

test("CURVE uses cubic Bezier geometry and shares duration with rotation", () => {
  const simulation = engine.createProjectileSimulation({
    attackType: "WEAPONC",
    spawnTime: 0,
    duration: 2,
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    curve: {
      control1: { x: 0, y: 10 },
      control2: { x: 10, y: 10 },
    },
    startAngle: 0,
    endAngle: 90,
  });
  assert.equal(simulation.family, "CURVE");
  assert.deepEqual(simulation.positionAt(1), { x: 5, y: 7.5 });
  assert.equal(simulation.rotationAt(1), 45);
  assert.equal(simulation.rotationAt(2), 90);
});

test("DOUBLE creates two independent projectile simulations", () => {
  const simulation = engine.createProjectileSimulation({
    attackType: "DOUBLE",
    spawnTime: 0,
    duration: 1,
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    second: {
      spawnTime: 0.5,
      duration: 2,
      start: { x: 0, y: 20 },
      end: { x: 20, y: 20 },
    },
  });
  assert.equal(simulation.family, "DOUBLE_LINEAR");
  assert.equal(simulation.projectiles.length, 2);
  assert.equal(simulation.projectiles[0].impactTime, 1);
  assert.equal(simulation.projectiles[1].impactTime, 2.5);
  assert.deepEqual(simulation.projectiles[0].positionAt(0.5), { x: 5, y: 0 });
  assert.deepEqual(simulation.projectiles[1].positionAt(1.5), { x: 10, y: 20 });
});

test("Normal moving projectile preserves native same-tick callback ordering", () => {
  const simulation = engine.createProjectileSimulation({
    attackType: "WEAPON",
    kind: "normal",
    duration: 1,
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    finishDuration: 0.25,
  });
  assert.deepEqual(eventTypesAt(simulation, 1), [
    "projectile-impact",
    "projectile-finish-start",
    "damage-resolution-start",
  ]);
});

test("Skill moving projectile preserves native same-tick callback ordering", () => {
  const simulation = engine.createProjectileSimulation({
    attackType: "WEAPON",
    kind: "skill",
    duration: 1,
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    finishDuration: 0.25,
  });
  assert.deepEqual(eventTypesAt(simulation, 1), [
    "projectile-impact",
    "damage-resolution-start",
    "projectile-finish-start",
  ]);
});

test("RETURN impact occurs at outbound completion and cleanup after inbound completion", () => {
  const simulation = engine.createProjectileSimulation({
    attackType: "RETURN",
    duration: 1,
    returnDuration: 1.5,
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    returnEnd: { x: 2, y: 0 },
  });
  assert.equal(simulation.impactTime, 1);
  assert.equal(simulation.cleanupTime, 2.5);
  assert.ok(simulation.impactTime < simulation.cleanupTime);
  assert.deepEqual(simulation.positionAt(1.75), { x: 6, y: 0 });
  assert.ok(simulation.events.some((event) => event.type === "projectile-return-complete" && event.time === 2.5));
});

test("BEAM impact is immediate while bulDuration controls visual cleanup", () => {
  const simulation = engine.createProjectileSimulation({
    attackType: "BEAM",
    spawnTime: 3,
    bulDuration: 0.6,
  });
  assert.equal(simulation.impactTime, 3);
  assert.equal(simulation.cleanupTime, 3.6);
  assert.deepEqual(eventTypesAt(simulation, 3), [
    "beam-spawn",
    "beam-impact",
    "damage-resolution-start",
  ]);
});

test("ACTION skill hit occurs at phase2.end", () => {
  const simulation = engine.createProjectileSimulation({
    attackType: "ACTION",
    spawnTime: 1,
    phase1Duration: 0.2,
    phase2Duration: 0.4,
    phase3Duration: 0.3,
  });
  assert.ok(Math.abs(simulation.impactTime - 1.6) < 1e-9);
  assert.deepEqual(eventTypesAt(simulation, 1.6), [
    "skill-hit",
    "damage-resolution-start",
    "action-phase3-start",
  ]);
  assert.ok(Math.abs(simulation.cleanupTime - 1.9) < 1e-9);
});
