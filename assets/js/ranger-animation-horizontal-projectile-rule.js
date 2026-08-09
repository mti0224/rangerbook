(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RangerAnimationHorizontalProjectileRule = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_COORDINATE_SCALE = 0.5;
  const VIEWER_BODY_OFFSET_Y = -88;
  const ZERO_EPSILON = 1e-9;
  const LINEAR_ATTACK_TYPES = new Set(["ENERGY", "WEAPON", "DOUBLE"]);

  function finiteNumber(value, fallback = NaN) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizedMotionType(attack) {
    const explicit = String(attack?.motion?.type || "").trim().toUpperCase();
    if (explicit) return explicit;
    const attackType = String(attack?.attackType || "").trim().toUpperCase();
    return LINEAR_ATTACK_TYPES.has(attackType) ? "LINEAR" : attackType;
  }

  function effectiveHitPointRate(hitTiming, hitRateKey, motionType) {
    const raw = finiteNumber(hitTiming?.[hitRateKey], NaN);
    if (motionType !== "LINEAR") return Number.isFinite(raw) ? raw : null;
    if (!Number.isFinite(raw) || raw > 10) return 0.25;
    return raw;
  }

  function shouldForceHorizontal({ attack, hitTiming, hitRateKey } = {}) {
    const motionType = normalizedMotionType(attack);
    if (motionType !== "LINEAR") return false;
    if (attack?.motion?.enabled === false) return false;
    if (!(finiteNumber(attack?.moveSpeed, 0) > 0)) return false;
    const hitPointRate = effectiveHitPointRate(hitTiming, hitRateKey, motionType);
    return Number.isFinite(hitPointRate) && Math.abs(hitPointRate) <= ZERO_EPSILON;
  }

  function travelBottomForStart(attack, coordinateScale = DEFAULT_COORDINATE_SCALE) {
    const rawStartY = finiteNumber(attack?.start?.y, NaN);
    const scale = finiteNumber(coordinateScale, DEFAULT_COORDINATE_SCALE);
    if (!Number.isFinite(rawStartY) || !(scale > 0)) return null;

    // Viewer screen-space start:
    //   startY = actorY + BODY_OFFSET_Y*s - (rawStartY*coordinateScale)*s
    // Actor-ground LINEAR start:
    //   startY = actorY - travelBottom*s
    // Therefore preserving the launch Y while making the target Y identical gives:
    //   travelBottom = rawStartY*coordinateScale - BODY_OFFSET_Y
    return rawStartY * scale - VIEWER_BODY_OFFSET_Y;
  }

  function buildHorizontalAnnotation({
    attack,
    hitTiming,
    hitRateKey,
    coordinateScale = DEFAULT_COORDINATE_SCALE,
  } = {}) {
    if (!shouldForceHorizontal({ attack, hitTiming, hitRateKey })) return null;
    const travelBottom = travelBottomForStart(attack, coordinateScale);
    if (!Number.isFinite(travelBottom)) return null;
    return {
      motionType: "LINEAR",
      travelBottom,
      viewerHorizontalZeroHitRate: true,
      provenance: "viewer-override:linear-hit-rate-zero",
    };
  }

  return Object.freeze({
    DEFAULT_COORDINATE_SCALE,
    VIEWER_BODY_OFFSET_Y,
    ZERO_EPSILON,
    LINEAR_ATTACK_TYPES,
    normalizedMotionType,
    effectiveHitPointRate,
    shouldForceHorizontal,
    travelBottomForStart,
    buildHorizontalAnnotation,
  });
});
