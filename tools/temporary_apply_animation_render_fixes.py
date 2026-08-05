from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    content = path.read_text(encoding="utf-8")
    if content.count(old) != 1:
        raise RuntimeError(f"{label}: expected exactly one match, got {content.count(old)}")
    path.write_text(content.replace(old, new), encoding="utf-8")


# Keep target orientation and ground anchor stable, while publishing its real rendered bounds.
target = ROOT / "assets/js/ranger-animation-target.js"
replace_once(
    target,
    '''    const geometry = frameGeometry(part, frame);
    if (!geometry) return;

    const sizeRatio = targetSizeRatio(meta);
    const targetScale = scene.sceneScale * sizeRatio;
    const scaleX = geometry.facesLeft ? targetScale : -targetScale;
    const scaledMinX = Math.min(geometry.minX * scaleX, geometry.maxX * scaleX);
    const scaledMaxX = Math.max(geometry.minX * scaleX, geometry.maxX * scaleX);
    const originX = scene.targetX - (scaledMinX + scaledMaxX) * 0.5;
    const originY = scene.targetBaseY - geometry.maxY * targetScale;

    for (const item of frame) {''',
    '''    const geometry = frameGeometry(part, frame);
    if (!geometry) return;

    // Keep the target's facing and ground anchor stable for the whole animation.
    // Recomputing them from every frame makes asymmetric effects flip the target
    // and makes frames with content below the baseline lift the whole target.
    const referenceGeometry = state.referenceGeometry || geometry;
    const sizeRatio = targetSizeRatio(meta);
    const targetScale = scene.sceneScale * sizeRatio;
    const scaleX = referenceGeometry.facesLeft ? targetScale : -targetScale;
    const scaledReferenceMinX = Math.min(referenceGeometry.minX * scaleX, referenceGeometry.maxX * scaleX);
    const scaledReferenceMaxX = Math.max(referenceGeometry.minX * scaleX, referenceGeometry.maxX * scaleX);
    const originX = scene.targetX - (scaledReferenceMinX + scaledReferenceMaxX) * 0.5;
    const originY = scene.targetBaseY - referenceGeometry.maxY * targetScale;

    const visibleLeft = Math.min(
      originX + geometry.minX * scaleX,
      originX + geometry.maxX * scaleX,
    );
    const visibleRight = Math.max(
      originX + geometry.minX * scaleX,
      originX + geometry.maxX * scaleX,
    );
    const visibleTop = originY + geometry.minY * targetScale;
    const visibleBottom = originY + geometry.maxY * targetScale;
    targetBridge.set(state.section, {
      ...(state.profile || {}),
      targetX: (visibleLeft + visibleRight) * 0.5,
      targetBaseY: visibleBottom,
      targetTopY: visibleTop,
      targetCenterY: (visibleTop + visibleBottom) * 0.5,
      renderedWidth: visibleRight - visibleLeft,
      renderedHeight: visibleBottom - visibleTop,
    });

    for (const item of frame) {''',
    "stable target geometry",
)
replace_once(
    target,
    '''    const geometry = frameGeometry(part, firstFrame);
    state.meta = meta;
    state.unitId = unitId;
    publishTarget(state, buildTargetProfile(unitId, meta, part, geometry));
    startTargetLoop(state);''',
    '''    const geometry = frameGeometry(part, firstFrame);
    const profile = buildTargetProfile(unitId, meta, part, geometry);
    state.meta = meta;
    state.unitId = unitId;
    state.referenceGeometry = geometry;
    state.profile = profile;
    publishTarget(state, profile);
    startTargetLoop(state);''',
    "store target reference geometry",
)


# Render motion-disabled projectile parts as authored SAM actions instead of invented flights.
viewer = ROOT / "assets/js/ranger-animation-viewer.js"
replace_once(
    viewer,
    '''  function animDuration(part, animationResult) {
    if (!animationResult) return 0;
    return animationResult.anim.frame_count / Math.max(1, part?.anim_rate || 24);
  }
''',
    '''  function animDuration(part, animationResult) {
    if (!animationResult) return 0;
    return animationResult.anim.frame_count / Math.max(1, part?.anim_rate || 24);
  }

  function animationHasVisibleContent(animationResult) {
    return Boolean(animationResult?.anim?.frames?.some((frame) => (frame || []).some((item) => {
      const color = item?.[3];
      return !Array.isArray(color) || Number(color[3] ?? 255) > 0;
    })));
  }

  function frameVisibleBottom(part, frame) {
    let bottom = -Infinity;
    for (const item of frame || []) {
      const [, resourceNumber, objectMatrix, color] = item || [];
      const alpha = Array.isArray(color) ? Number(color[3] ?? 255) : 255;
      const imageDefinition = part?.images?.[resourceNumber];
      const sprite = part?.sprites?.[imageDefinition?.name];
      const width = Number(sprite?.rect?.[2]);
      const height = Number(sprite?.rect?.[3]);
      if (alpha === 0 || !width || !height || !Array.isArray(objectMatrix) || !Array.isArray(imageDefinition?.m)) continue;
      const [m00, m01, m10, m11, m02, m12] = objectMatrix;
      const [i00, i01, i10, i11, i02, i12] = imageDefinition.m;
      const f10 = m10 * i00 + m11 * i10;
      const f11 = m10 * i01 + m11 * i11;
      const ty = m10 * i02 + m11 * i12 + m12;
      for (const [x, y] of [[0, 0], [width, 0], [0, height], [width, height]]) {
        bottom = Math.max(bottom, f10 * x + f11 * y + ty);
      }
    }
    return Number.isFinite(bottom) ? bottom : null;
  }

  function animationGroundOffset(part, animationResult) {
    const bottoms = (animationResult?.anim?.frames || [])
      .map((frame) => frameVisibleBottom(part, frame))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (!bottoms.length) return 0;
    const middle = Math.floor(bottoms.length / 2);
    return bottoms.length % 2
      ? bottoms[middle]
      : (bottoms[middle - 1] + bottoms[middle]) * 0.5;
  }
''',
    "authored animation helpers",
)
replace_once(
    viewer,
    '''    if (projectile.renderMode === "BEAM") return projectile.beamDuration + projectile.finishDuration;
    if (projectile.renderMode === "DIRECT") return projectile.localNormalDuration + projectile.finishDuration;''',
    '''    if (projectile.renderMode === "BEAM") return projectile.beamDuration + projectile.finishDuration;
    if (projectile.renderMode === "AUTHORED_FINISH") return projectile.finishDuration;
    if (["AUTHORED", "DIRECT"].includes(projectile.renderMode)) return projectile.localNormalDuration + projectile.finishDuration;''',
    "authored projectile lifetime",
)
replace_once(
    viewer,
    '''    const configuredEnabled = projectileConfig?.motion?.enabled;
    let renderMode = motionType;
    if (motionType === "SPECIAL" || motionType === "UNKNOWN") renderMode = "LEGACY";
    if (configuredEnabled === false && !["DIRECT", "SPECIAL"].includes(motionType)) renderMode = "LEGACY";''',
    '''    const configuredEnabled = projectileConfig?.motion?.enabled;
    const normalHasVisibleContent = animationHasVisibleContent(outboundAnimation);
    let renderMode = motionType;
    if (motionType === "SPECIAL" || motionType === "UNKNOWN") renderMode = "LEGACY";
    if (configuredEnabled === false && !["DIRECT", "SPECIAL"].includes(motionType)) {
      // Disabled native motion means the SAM part contains the authored action.
      // An empty normal followed by finish must start finish immediately at the
      // target instead of inventing a half-second flight from actor to target.
      renderMode = !normalHasVisibleContent && finishAnimation ? "AUTHORED_FINISH" : "AUTHORED";
    }''',
    "select authored render mode",
)
replace_once(
    viewer,
    '''      finishDuration,
      beamLength,
      beamDuration,
      loopNormal: renderMode === "LEGACY" ? true : projectileConfig?.motion?.loopNormal !== false,''',
    '''      finishDuration,
      normalGroundOffset: animationGroundOffset(bulletPart, outboundAnimation),
      finishGroundOffset: animationGroundOffset(bulletPart, finishAnimation),
      beamLength,
      beamDuration,
      loopNormal: renderMode === "LEGACY" ? true : projectileConfig?.motion?.loopNormal !== false,''',
    "store authored ground offsets",
)
replace_once(
    viewer,
    '''    const nativeMotionAvailable = geometry.flightDuration > 0;
    const renderMode = nativeMotionAvailable ? projectile.renderMode : "LEGACY";''',
    '''    const nativeMotionAvailable = geometry.flightDuration > 0;
    const fixedPositionMode = ["AUTHORED", "AUTHORED_FINISH", "DIRECT", "BEAM"].includes(projectile.renderMode);
    const renderMode = fixedPositionMode
      ? projectile.renderMode
      : (nativeMotionAvailable ? projectile.renderMode : "LEGACY");''',
    "preserve fixed-position render modes",
)
replace_once(
    viewer,
    '''    if (renderMode === "BEAM") {
      await drawBeam(context, bulletPart, projectile, age, geometry, sceneScale);
      return;
    }

    if (renderMode === "DIRECT") {''',
    '''    if (renderMode === "BEAM") {
      await drawBeam(context, bulletPart, projectile, age, geometry, sceneScale);
      return;
    }

    if (renderMode === "AUTHORED_FINISH") {
      await drawFinish(
        context,
        bulletPart,
        projectile,
        age,
        geometry.endX,
        geometry.endY - projectile.finishGroundOffset * sceneScale,
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
        await drawFinish(
          context,
          bulletPart,
          projectile,
          age - projectile.localNormalDuration,
          geometry.endX,
          geometry.endY - projectile.finishGroundOffset * sceneScale,
          sceneScale,
        );
      }
      return;
    }

    if (renderMode === "DIRECT") {''',
    "draw authored projectile modes",
)


# Keep hit timing intact; use the selected target's actual rendered position.
hit_effect = ROOT / "assets/js/ranger-animation-hit-effect.js"
replace_once(
    hit_effect,
    '''const target=window.RangerAnimationTargetBridge?.get(section);const targetHeight=Math.max(1,finiteNumber(target?.contentHeight,state.meta?.parts?.body?.canvas?.h||240));const scale=Math.max(0.001,finiteNumber(scene.sceneScale,1));const x=finiteNumber(scene.targetX,canvas.width*0.9);const y=finiteNumber(scene.targetBaseY,canvas.height*0.8)-targetHeight*state.plan.hitPointRate*scale;''',
    '''const target=window.RangerAnimationTargetBridge?.get(section);const targetHeight=Math.max(1,finiteNumber(target?.contentHeight,state.meta?.parts?.body?.canvas?.h||240));const scale=Math.max(0.001,finiteNumber(scene.sceneScale,1));const renderedTop=finiteNumber(target?.targetTopY,NaN);const renderedBottom=finiteNumber(target?.targetBaseY,NaN);const hasRenderedBounds=Number.isFinite(renderedTop)&&Number.isFinite(renderedBottom)&&renderedBottom>renderedTop;const x=finiteNumber(target?.targetX,finiteNumber(scene.targetX,canvas.width*0.9));const y=hasRenderedBounds?renderedBottom-(renderedBottom-renderedTop)*state.plan.hitPointRate:finiteNumber(scene.targetBaseY,canvas.height*0.8)-targetHeight*state.plan.hitPointRate*scale;''',
    "target-based hit effect position",
)

print("Animation render fixes applied.")
