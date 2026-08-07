(function (root, factory) {
  const api = factory(root && root.RangerAnimationProjectileEngine);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RangerAnimationDebugOverlay = api;
    if (root.document) api.install(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (engine) {
  "use strict";

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function featureFlagEnabled(rootObject) {
    try {
      const params = new rootObject.URLSearchParams(rootObject.location?.search || "");
      const value = text(params.get("animationDebug")).toLowerCase();
      if (["1", "true", "debug", "native"].includes(value)) return true;
      if (["0", "false", "off"].includes(value)) return false;
    } catch (_) {
      // Fall through to localStorage.
    }
    try {
      return rootObject.localStorage?.getItem("ranger-animation-debug") === "1";
    } catch (_) {
      return false;
    }
  }

  function point(x, y, label, source, confidence) {
    const resolvedX = Number(x);
    const resolvedY = Number(y);
    if (!Number.isFinite(resolvedX) || !Number.isFinite(resolvedY)) return null;
    return {
      x: resolvedX,
      y: resolvedY,
      label,
      source,
      confidence,
    };
  }

  function buildDebugModel(report, projectileEngine = engine) {
    if (!report?.supported) {
      return {
        supported: false,
        reason: report?.reason || "shadow-report-unavailable",
        markers: [],
        events: [],
        approximations: [],
      };
    }

    const viewer = report.viewerGeometry || null;
    const nativeGeometry = report.nativeGeometry || report.geometry || null;
    const markers = [
      point(
        nativeGeometry?.startX,
        nativeGeometry?.startY,
        "START",
        "UnitData projectileStart × 0.5 + current scene transform",
        "high",
      ),
      point(
        viewer?.endX,
        viewer?.endY,
        "VIEWER END",
        "current viewer endpoint including generic projectileEnd offset",
        "legacy",
      ),
      point(
        nativeGeometry?.endX,
        nativeGeometry?.endY,
        "NATIVE END",
        "target hit point; generic projectileEnd offset excluded",
        "high",
      ),
    ].filter(Boolean);

    if (report.family === "RETURN") {
      markers.push(...[
        point(
          viewer?.returnEndX,
          viewer?.returnEndY,
          "VIEWER RETURN",
          "current viewer projectileSecondStart endpoint",
          "legacy",
        ),
        point(
          nativeGeometry?.returnEndX,
          nativeGeometry?.returnEndY,
          "NATIVE RETURN",
          "spawn + projectileEnd × 0.5",
          "high",
        ),
      ].filter(Boolean));
    }

    const control2 = report.simulationInput?.curve?.control2;
    if (control2) {
      const marker = point(
        control2.x,
        control2.y,
        "CURVE C2",
        "0.5*FinalDelta + facing*(0.4D, +0.4D), projected to Canvas",
        "high",
      );
      if (marker) markers.push(marker);
    }

    let events = [];
    if (projectileEngine?.createProjectileSimulation && report.simulationInput) {
      try {
        const simulation = projectileEngine.createProjectileSimulation(report.simulationInput);
        events = (simulation.events || []).map((event) => ({
          type: event.type,
          time: finiteNumber(event.time, 0),
          projectileIndex: Number.isInteger(event.projectileIndex)
            ? event.projectileIndex
            : null,
        }));
      } catch (_) {
        events = [];
      }
    }

    return {
      supported: true,
      reason: null,
      family: report.family || "UNKNOWN",
      attackType: report.attackType || "UNKNOWN",
      geometryModel: report.geometryModel || "unknown",
      withinTolerance: report.withinTolerance === true,
      viewerWithinTolerance: report.viewerWithinTolerance === true,
      markers,
      events,
      deltas: {
        engineMaxPosition: finiteNumber(report.maxPositionDelta, 0),
        engineDuration: finiteNumber(report.durationDelta, 0),
        viewerImpact: report.impactDelta === null ? null : finiteNumber(report.impactDelta, 0),
        viewerEndpoint: finiteNumber(report.viewerMigrationDelta?.endpointDelta, 0),
        viewerReturnEndpoint: finiteNumber(report.viewerMigrationDelta?.returnEndpointDelta, 0),
        viewerDuration: finiteNumber(report.viewerMigrationDelta?.durationDelta, 0),
        viewerReturnDuration: finiteNumber(report.viewerMigrationDelta?.returnDurationDelta, 0),
      },
      approximations: [
        "target contentHeight currently comes from rendered target bounds; native equivalence is not yet verified",
        "Canvas/world projection remains viewer-side until runtime Ground Truth hooks are compared",
      ],
    };
  }

  function formatNumber(value, digits = 3) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "n/a";
    return Number(value).toFixed(digits);
  }

  function summaryLines(model, authority) {
    if (!model?.supported) {
      return [`Projectile Debug: unsupported (${model?.reason || "unknown"})`];
    }
    const lines = [
      `Projectile Debug | ${model.attackType} / ${model.family} | ${model.geometryModel}`,
      `engine/native: ${model.withinTolerance ? "PASS" : "FAIL"} | viewer/native: ${model.viewerWithinTolerance ? "same" : "different"}`,
      `Δpos(engine)=${formatNumber(model.deltas.engineMaxPosition)}px  Δduration(engine)=${formatNumber(model.deltas.engineDuration, 5)}s`,
      `Δend(viewer→native)=${formatNumber(model.deltas.viewerEndpoint)}px  Δimpact=${formatNumber(model.deltas.viewerImpact, 5)}s`,
    ];
    if (model.family === "RETURN") {
      lines.push(
        `ΔreturnEnd=${formatNumber(model.deltas.viewerReturnEndpoint)}px  ΔreturnDuration=${formatNumber(model.deltas.viewerReturnDuration, 5)}s`,
      );
    }
    if (authority) {
      lines.push(
        `authority: ${authority.controlling ? "ENGINE" : "legacy"}${authority.reason ? ` (${authority.reason})` : ""}`,
      );
    }
    if (model.events.length) {
      lines.push(`events: ${model.events.map((item) => `${item.type}@${formatNumber(item.time, 4)}`).join(" → ")}`);
    }
    for (const approximation of model.approximations) {
      lines.push(`approximation: ${approximation}`);
    }
    return lines;
  }

  function install(rootObject) {
    if (rootObject.__RANGER_ANIMATION_DEBUG_OVERLAY_INSTALLED__) return;
    rootObject.__RANGER_ANIMATION_DEBUG_OVERLAY_INSTALLED__ = true;
    if (!featureFlagEnabled(rootObject)) return;

    const states = new Set();
    const sectionStates = new WeakMap();
    const boundSections = new WeakSet();
    let rafId = 0;

    function ensureState(section) {
      let state = sectionStates.get(section);
      if (!state) {
        state = { section, canvas: null, panel: null };
        sectionStates.set(section, state);
        states.add(state);
      }
      return state;
    }

    function ensureUi(state) {
      const stack = state.section.querySelector(".ranger-animation-canvas-stack");
      const baseCanvas = state.section.querySelector(".ranger-animation-canvas");
      if (!stack || !baseCanvas) return false;

      let canvas = state.section.querySelector(".ranger-animation-debug-canvas");
      if (!canvas) {
        canvas = rootObject.document.createElement("canvas");
        canvas.className = "ranger-animation-debug-canvas";
        canvas.setAttribute("aria-hidden", "true");
        canvas.style.position = "absolute";
        canvas.style.inset = "0";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.pointerEvents = "none";
        canvas.style.zIndex = "5";
        stack.appendChild(canvas);
      }
      if (canvas.width !== baseCanvas.width) canvas.width = baseCanvas.width;
      if (canvas.height !== baseCanvas.height) canvas.height = baseCanvas.height;
      state.canvas = canvas;

      let panel = state.section.querySelector(".ranger-animation-debug-panel");
      if (!panel) {
        panel = rootObject.document.createElement("pre");
        panel.className = "ranger-animation-debug-panel";
        panel.style.margin = "10px 0 0";
        panel.style.padding = "10px";
        panel.style.maxHeight = "220px";
        panel.style.overflow = "auto";
        panel.style.whiteSpace = "pre-wrap";
        panel.style.fontSize = "12px";
        panel.style.lineHeight = "1.45";
        panel.style.border = "1px solid rgba(127,127,127,0.35)";
        panel.style.borderRadius = "8px";
        state.section.appendChild(panel);
      }
      state.panel = panel;
      return true;
    }

    function drawMarker(context, marker, index) {
      const radius = 5 + (index % 2);
      context.save();
      context.lineWidth = 2;
      context.strokeStyle = `hsl(${(index * 67) % 360} 80% 60%)`;
      context.fillStyle = "rgba(0,0,0,0.65)";
      context.beginPath();
      context.arc(marker.x, marker.y, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.font = "11px sans-serif";
      context.fillStyle = "rgba(255,255,255,0.95)";
      context.fillText(marker.label, marker.x + 8, marker.y - 8);
      context.restore();
    }

    function render(state) {
      if (!rootObject.document.contains(state.section)) {
        states.delete(state);
        sectionStates.delete(state.section);
        return;
      }
      if (!ensureUi(state)) return;
      const context = state.canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, state.canvas.width, state.canvas.height);

      const report = rootObject.RangerAnimationProjectileShadowBridge?.get?.(state.section) || null;
      const authority = rootObject.RangerAnimationProjectileAuthorityBridge?.get?.(state.section) || null;
      const model = buildDebugModel(report, engine);
      model.markers.forEach((marker, index) => drawMarker(context, marker, index));
      state.panel.textContent = summaryLines(model, authority).join("\n");
    }

    function bindSection(section) {
      if (!section || boundSections.has(section)) return;
      boundSections.add(section);
      ensureState(section);
    }

    function patchAll() {
      rootObject.document.querySelectorAll(".ranger-animation-section").forEach(bindSection);
    }

    function tick() {
      patchAll();
      for (const state of states) render(state);
      rafId = rootObject.requestAnimationFrame(tick);
    }

    const start = () => {
      patchAll();
      if (!rafId) rafId = rootObject.requestAnimationFrame(tick);
    };
    if (rootObject.document.readyState === "loading") {
      rootObject.document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }

  return Object.freeze({
    featureFlagEnabled,
    buildDebugModel,
    summaryLines,
    install,
  });
});
