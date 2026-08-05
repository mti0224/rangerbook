from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def regex_replace_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one regex match, found {count}")
    return updated


# 1. Target rendering: stable anchor geometry and James mirror override.
target_path = Path("assets/js/ranger-animation-target.js")
target = target_path.read_text(encoding="utf-8")

target = replace_once(
    target,
    "\n  function sharedBridge(name) {",
    "\n  const TARGET_MIRROR_OVERRIDES = new Set([\"u1138sk-james\"]);\n\n  function sharedBridge(name) {",
    "insert target mirror overrides",
)

target = replace_once(
    target,
    "    const scaleX = referenceGeometry.facesLeft ? targetScale : -targetScale;",
    "    const detectedScaleX = referenceGeometry.facesLeft ? targetScale : -targetScale;\n"
    "    const scaleX = TARGET_MIRROR_OVERRIDES.has(state.unitId) ? -detectedScaleX : detectedScaleX;",
    "apply James horizontal mirror",
)

target = replace_once(
    target,
    "    const visibleBottom = originY + geometry.maxY * targetScale;\n"
    "    targetBridge.set(state.section, {\n"
    "      ...(state.profile || {}),\n"
    "      targetX: (visibleLeft + visibleRight) * 0.5,\n"
    "      targetBaseY: visibleBottom,\n"
    "      targetTopY: visibleTop,\n"
    "      targetCenterY: (visibleTop + visibleBottom) * 0.5,\n"
    "      renderedWidth: visibleRight - visibleLeft,\n"
    "      renderedHeight: visibleBottom - visibleTop,\n"
    "    });",
    "    const visibleBottom = originY + geometry.maxY * targetScale;\n"
    "    const anchorTopY = originY + referenceGeometry.minY * targetScale;\n"
    "    const anchorBaseY = scene.targetBaseY;\n"
    "    targetBridge.set(state.section, {\n"
    "      ...(state.profile || {}),\n"
    "      targetX: (visibleLeft + visibleRight) * 0.5,\n"
    "      targetBaseY: visibleBottom,\n"
    "      targetTopY: visibleTop,\n"
    "      targetCenterY: (visibleTop + visibleBottom) * 0.5,\n"
    "      renderedWidth: visibleRight - visibleLeft,\n"
    "      renderedHeight: visibleBottom - visibleTop,\n"
    "      // Stable target-space anchors. Projectile landings and hit effects\n"
    "      // should follow the target position, not per-frame visual bounds.\n"
    "      anchorX: scene.targetX,\n"
    "      anchorBaseY,\n"
    "      anchorTopY,\n"
    "      anchorCenterY: (anchorTopY + anchorBaseY) * 0.5,\n"
    "      anchorWidth: scaledReferenceMaxX - scaledReferenceMinX,\n"
    "      anchorHeight: anchorBaseY - anchorTopY,\n"
    "    });",
    "publish stable target anchors",
)

target_path.write_text(target, encoding="utf-8")


# 2. Viewer: align authored finish animation's final visible bottom to target base.
viewer_path = Path("assets/js/ranger-animation-viewer.js")
viewer = viewer_path.read_text(encoding="utf-8")

viewer = replace_once(
    viewer,
    "\n  function namedAnimationDuration(part, name) {",
    "\n  function animationFinalVisibleBottom(part, animationResult) {\n"
    "    const frames = animationResult?.anim?.frames || [];\n"
    "    for (let index = frames.length - 1; index >= 0; index -= 1) {\n"
    "      const bottom = frameVisibleBottom(part, frames[index]);\n"
    "      if (Number.isFinite(bottom)) return bottom;\n"
    "    }\n"
    "    return NaN;\n"
    "  }\n\n"
    "  function namedAnimationDuration(part, name) {",
    "insert final visible bottom helper",
)

viewer = replace_once(
    viewer,
    "\n  function referenceLayout() {",
    "\n  function selectedTargetAnchor(layout) {\n"
    "    const profile = targetBridge.get(state.activeSection);\n"
    "    return {\n"
    "      x: finiteNumber(profile?.anchorX, finiteNumber(profile?.targetX, layout.targetX)),\n"
    "      baseY: finiteNumber(profile?.anchorBaseY, finiteNumber(profile?.targetBaseY, layout.targetBaseY)),\n"
    "    };\n"
    "  }\n\n"
    "  function referenceLayout() {",
    "insert selected target anchor helper",
)

viewer = replace_once(
    viewer,
    "      finishGroundOffset: animationGroundOffset(bulletPart, finishAnimation),",
    "      finishGroundOffset: animationGroundOffset(bulletPart, finishAnimation),\n"
    "      finishFinalBottom: animationFinalVisibleBottom(bulletPart, finishAnimation),",
    "store finish final bottom",
)

viewer = regex_replace_once(
    viewer,
    r'    if \(renderMode === "AUTHORED_FINISH"\) \{.*?\n    if \(renderMode === "DIRECT"\) \{',
    '''    if (renderMode === "AUTHORED_FINISH") {
      const targetAnchor = selectedTargetAnchor(layout);
      const finishBottom = Number.isFinite(projectile.finishFinalBottom)
        ? projectile.finishFinalBottom
        : projectile.finishGroundOffset;
      await drawFinish(
        context,
        bulletPart,
        projectile,
        age,
        geometry.endX,
        targetAnchor.baseY - finishBottom * sceneScale,
        sceneScale,
      );
      return;
    }

    if (renderMode === "AUTHORED") {
      if (age <= projectile.localNormalDuration || !projectile.finishAnimName) {
        await drawProjectileFrame(
          context,
          bulletPart,
          projectile.normalAnimName,
          age,
          false,
          geometry.endX,
          geometry.endY - projectile.normalGroundOffset * sceneScale,
          sceneScale,
          sceneScale,
        );
      } else {
        const targetAnchor = selectedTargetAnchor(layout);
        const finishBottom = Number.isFinite(projectile.finishFinalBottom)
          ? projectile.finishFinalBottom
          : projectile.finishGroundOffset;
        await drawFinish(
          context,
          bulletPart,
          projectile,
          age - projectile.localNormalDuration,
          geometry.endX,
          targetAnchor.baseY - finishBottom * sceneScale,
          sceneScale,
        );
      }
      return;
    }

    if (renderMode === "DIRECT") {''',
    "replace authored projectile alignment",
)

viewer_path.write_text(viewer, encoding="utf-8")


# 3. Hit effect: snapshot the stable target anchor at impact time.
hit_path = Path("assets/js/ranger-animation-hit-effect.js")
hit = hit_path.read_text(encoding="utf-8")

new_render_frame = '''async function renderFrame(state){const{canvas,section}=state;const baseCanvas=section.querySelector(".ranger-animation-canvas");if(!baseCanvas)return;if(canvas.width!==baseCanvas.width)canvas.width=baseCanvas.width;if(canvas.height!==baseCanvas.height)canvas.height=baseCanvas.height;const context=canvas.getContext("2d");if(!context)return;context.clearRect(0,0,canvas.width,canvas.height);if(!state.plan||!state.meta)return;const elapsed=Math.floor(((performance.now()-state.startedAt)/1000)*NATIVE_ACTION_FPS)/NATIVE_ACTION_FPS;const cycleDuration=Math.max(0,finiteNumber(state.plan.cycleDuration,0));const cycleIndex=cycleDuration>0?Math.floor(elapsed/cycleDuration):0;const time=cycleDuration>0?elapsed-cycleIndex*cycleDuration:elapsed;let impactCycleIndex=cycleIndex;let age=time-state.plan.impactTime;if(age<0&&cycleDuration>0&&elapsed>=cycleDuration){age+=cycleDuration;impactCycleIndex-=1;}if(age<0||age>=HIT_EFFECT_DURATION)return;const scene=window.RangerAnimationSceneBridge?.get(section);if(!scene)return;const target=window.RangerAnimationTargetBridge?.get(section);if(!state.activeEffect||state.activeEffect.cycleIndex!==impactCycleIndex){const targetHeight=Math.max(1,finiteNumber(target?.contentHeight,state.meta?.parts?.body?.canvas?.h||240));const scale=Math.max(0.001,finiteNumber(scene.sceneScale,1));const anchorTop=finiteNumber(target?.anchorTopY,finiteNumber(target?.targetTopY,NaN));const anchorBottom=finiteNumber(target?.anchorBaseY,finiteNumber(target?.targetBaseY,NaN));const hasAnchorBounds=Number.isFinite(anchorTop)&&Number.isFinite(anchorBottom)&&anchorBottom>anchorTop;const x=finiteNumber(target?.anchorX,finiteNumber(target?.targetX,finiteNumber(scene.targetX,canvas.width*0.9)));const y=hasAnchorBounds?anchorBottom-(anchorBottom-anchorTop)*state.plan.hitPointRate:finiteNumber(scene.targetBaseY,canvas.height*0.8)-targetHeight*state.plan.hitPointRate*scale;state.activeEffect={cycleIndex:impactCycleIndex,x,y,scale};}await drawEffectFrame(context,age,state.activeEffect.x,state.activeEffect.y,state.activeEffect.scale);}'''

hit = regex_replace_once(
    hit,
    r'async function renderFrame\(state\)\{.*?\}function startLoop',
    new_render_frame + "function startLoop",
    "replace hit effect render frame",
)

hit = replace_once(
    hit,
    "if(resetTime)state.startedAt=performance.now();if(!state.meta)",
    "if(resetTime)state.startedAt=performance.now();state.activeEffect=null;if(!state.meta)",
    "reset hit effect anchor when plan changes",
)

hit = replace_once(
    hit,
    "meta:null,plan:null,startedAt:performance.now(),rendering:false,rafId:0,",
    "meta:null,plan:null,activeEffect:null,startedAt:performance.now(),rendering:false,rafId:0,",
    "initialize hit effect anchor state",
)

hit_path.write_text(hit, encoding="utf-8")

print("Applied stable target anchor, final-frame landing, and hit-effect snapshot fixes.")
