(() => {
  const ANIMATION_META_BASE = "https://res.warmycat.com/animation_meta/";
  const INDEX_URL = `${ANIMATION_META_BASE}index.json`;
  const RESOURCE_PRIMARY_BASE = "https://res.warmycat.com/";
  const RESOURCE_FALLBACK_BASE = "https://rangers.lerico.net/res/";
  const OLD_PRIMARY_PREFIX = "res_from_emulator/";
  const SITE_ROOT = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const PROJECTILE_DATA_URL = `${SITE_ROOT}res/projectile_data.json`;

  const NATIVE_ACTION_FPS = 60;
  const NATIVE_PROJECTILE_COORDINATE_SCALE = 0.5;
  const NORMAL_STAGE_INITIAL_SCALE = 0.85;
  const VIEWER_RESOURCE_SCALE = 2.28;
  const MIN_FLIGHT_DURATION = 1 / NATIVE_ACTION_FPS;
  const MAX_FLIGHT_DURATION = 8;

  const RANGER_X_RATIO = 0.50;
  const TARGET_X_RATIO = 0.90;
  const TARGET_DISTANCE_MULTIPLIER = 2.25;
  const GROUND_Y_RATIO = 0.80;
  const BODY_OFFSET_X = -130;
  const BODY_OFFSET_Y = -88;

  function sharedBridge(name) {
    if (window[name]?.get && window[name]?.set) return window[name];
    const values = new WeakMap();
    const bridge = {
      get(section) {
        return section ? values.get(section) || null : null;
      },
      set(section, value) {
        if (!section) return;
        if (value === null || value === undefined) values.delete(section);
        else values.set(section, value);
      },
    };
    window[name] = bridge;
    return bridge;
  }

  const sceneBridge = sharedBridge("RangerAnimationSceneBridge");
  const targetBridge = sharedBridge("RangerAnimationTargetBridge");

  const CLIPS = [
    { key: "idle", label: "待機", body: ["idle", "wait"] },
    { key: "move", label: "移動", body: ["walk"] },
    { key: "knockback", label: "被擊退", body: ["knockback"] },
    {
      key: "attack",
      dataKey: "normal",
      hitRateKey: "normalHitPointRate",
      label: "一般攻擊",
      body: ["attack_all", "attack", "attack_a", "attack_b"],
      ready: ["attack_ready"],
      trigger: ["attack", "attack_a", "attack_b"],
      bullet: "bul",
      isBasicAttack: true,
    },
    {
      key: "skill1",
      dataKey: "skill1",
      hitRateKey: "skill1HitPointRate",
      label: "技能1",
      body: ["s_attack_all", "s_action_attack_all", "s_attack", "s_attack_a", "s_attack_b", "s_action_attack_2", "s_action_attack_3"],
      ready: ["s_attack_ready", "s_action_attack_1"],
      trigger: ["s_attack", "s_attack_a", "s_attack_b", "s_action_attack_2", "s_action_attack_3"],
      bullet: "bul2",
      isBasicAttack: false,
    },
    {
      key: "skill2",
      dataKey: "skill2",
      hitRateKey: "skill2HitPointRate",
      label: "技能2",
      body: ["s2_attack_all", "s2_attack", "s2_attack_a", "s2_attack_b", "skill"],
      ready: ["s2_attack_ready"],
      trigger: ["s2_attack", "s2_attack_a", "s2_attack_b", "skill"],
      bullet: "bul3",
      isBasicAttack: false,
    },
    { key: "full", label: "完整", sequence: ["move", "idle", "attack", "skill1", "skill2", "knockback"] },
  ];

  const state = {
    indexPromise: null,
    projectileDataPromise: null,
    metaCache: new Map(),
    imageCache: new Map(),
    spriteCache: new Map(),
    trackCache: new WeakMap(),
    rafId: 0,
    startedAt: 0,
    activeCanvas: null,
    activeSection: null,
    activeMeta: null,
    activeClip: "idle",
    zoom: 1,
    panX: 0,
    panY: 0,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragPanX: 0,
    dragPanY: 0,
  };

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function escapeHtml(value) {
    return text(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function positiveNumber(value, fallback = 0) {
    const number = finiteNumber(value, fallback);
    return number > 0 ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function targetSceneDistance(width, zoom) {
    return width * (TARGET_X_RATIO - RANGER_X_RATIO) * TARGET_DISTANCE_MULTIPLIER * zoom;
  }

  function normalizeResourcePath(path) {
    return String(path || "")
      .replace(/^\/+/, "")
      .replace(new RegExp(`^${OLD_PRIMARY_PREFIX}`), "");
  }

  function animationMetaUrl(metaPath, unitId) {
    const raw = text(metaPath);
    const filename = raw ? raw.split("/").pop() : `${unitId}.json`;
    return `${ANIMATION_META_BASE}${encodeURIComponent(filename)}`;
  }

  function resourceUrl(path) {
    return `${RESOURCE_PRIMARY_BASE}${normalizeResourcePath(path)}`;
  }

  function legacyResourceUrl(path) {
    return `${RESOURCE_FALLBACK_BASE}${normalizeResourcePath(path)}`;
  }

  function loadIndex() {
    if (!state.indexPromise) {
      state.indexPromise = fetch(INDEX_URL)
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
    }
    return state.indexPromise;
  }

  function loadProjectileData() {
    if (!state.projectileDataPromise) {
      state.projectileDataPromise = fetch(PROJECTILE_DATA_URL)
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
    }
    return state.projectileDataPromise;
  }

  function attachProjectileDataFallback(meta, projectileData, unitId) {
    if (!meta || meta.projectileData) return meta;
    const unitData = projectileData?.units?.[unitId];
    if (!unitData) return meta;
    meta.projectileData = {
      schemaVersion: projectileData?.schemaVersion ?? null,
      motionModelVersion: projectileData?.validation?.motionModelVersion ?? null,
      coordinateScale: NATIVE_PROJECTILE_COORDINATE_SCALE,
      unitId,
      render: unitData.render || null,
      movement: unitData.movement || null,
      hitTiming: unitData.hitTiming || null,
      bullet: unitData.bullet || null,
      normal: unitData.normal || null,
      skill1: unitData.skill1 || null,
      skill2: unitData.skill2 || null,
      effects: unitData.effects || null,
      sounds: unitData.sounds || null,
    };
    return meta;
  }

  async function loadMeta(unitId) {
    if (!unitId) return null;
    if (state.metaCache.has(unitId)) return state.metaCache.get(unitId);
    const index = await loadIndex();
    const entry = index?.units?.[unitId];
    if (!entry?.meta) {
      state.metaCache.set(unitId, null);
      return null;
    }
    const [meta, projectileData] = await Promise.all([
      fetch(animationMetaUrl(entry.meta, unitId))
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
      loadProjectileData(),
    ]);
    attachProjectileDataFallback(meta, projectileData, unitId);
    state.metaCache.set(unitId, meta);
    return meta;
  }

  function loadImage(path) {
    const normalizedPath = normalizeResourcePath(path);
    const key = normalizedPath || "";
    if (state.imageCache.has(key)) return state.imageCache.get(key);
    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      const primary = resourceUrl(normalizedPath);
      const fallback = legacyResourceUrl(normalizedPath);
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => {
        if (fallback && image.src !== fallback) {
          image.src = fallback;
          return;
        }
        reject(new Error(`Image failed: ${normalizedPath}`));
      };
      image.src = primary;
    }).catch(() => null);
    state.imageCache.set(key, promise);
    return promise;
  }

  function inferUnitIdFromModal(modalContent) {
    const image = modalContent.querySelector(".ranger-detail-image");
    const src = image?.getAttribute("src") || image?.src || "";
    const match = src.match(/res(?:_from_emulator)?\/([^/]+)\//) || src.match(/\/([^/]+)\/[^/]+-thum/i);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function getAnim(part, names) {
    if (!part) return null;
    for (const name of names || []) {
      const animation = part.animations?.[name];
      if (animation?.frames?.length) return { name, anim: animation };
    }
    return null;
  }

  function animDuration(part, animationResult) {
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

  function namedAnimationDuration(part, name) {
    const animation = part?.animations?.[name];
    return animation?.frame_count
      ? animation.frame_count / Math.max(1, part.anim_rate || 24)
      : 0;
  }

  function nativeProjectileSpawnTime(bodyPart, bodyAnimName, clip, clipDuration) {
    const virtualClip = bodyPart?.virtual_clips?.[bodyAnimName];
    if (Array.isArray(virtualClip?.segments)) {
      let cursor = 0;
      for (const segmentName of virtualClip.segments) {
        if ((clip.trigger || []).includes(segmentName)) {
          return clamp(cursor, 0, Math.max(0, clipDuration - 0.001));
        }
        cursor += namedAnimationDuration(bodyPart, segmentName);
      }
    }

    if ((clip.trigger || []).includes(bodyAnimName)) return 0;

    if (bodyAnimName === "_all" && Array.isArray(bodyPart?.timeline?.labels)) {
      const label = bodyPart.timeline.labels.find((item) => (clip.trigger || []).includes(item.name));
      if (label) return clamp(finiteNumber(label.seconds, 0), 0, Math.max(0, clipDuration - 0.001));
    }

    for (const readyName of clip.ready || []) {
      const duration = namedAnimationDuration(bodyPart, readyName);
      if (duration > 0) return clamp(duration, 0, Math.max(0, clipDuration - 0.001));
    }
    return 0;
  }

  function spriteDims(part, imageName) {
    const sprite = part?.sprites?.[imageName];
    if (!sprite) return null;
    const [, , width, height] = sprite.rect || [];
    if (!width || !height) return null;
    return { w: width, h: height };
  }

  function worldPosition(part, item) {
    const [, resourceNumber, objectMatrix, color] = item || [];
    const imageDefinition = part?.images?.[resourceNumber];
    if (!imageDefinition || !Array.isArray(objectMatrix) || !Array.isArray(imageDefinition.m)) return null;
    const dimensions = spriteDims(part, imageDefinition.name);
    if (!dimensions) return null;
    const [m00, m01, m10, m11, m02, m12] = objectMatrix;
    const [i00, i01, i10, i11, i02, i12] = imageDefinition.m;
    const centerX = dimensions.w * 0.5;
    const centerY = dimensions.h * 0.5;
    const imageCenterX = i00 * centerX + i01 * centerY + i02;
    const imageCenterY = i10 * centerX + i11 * centerY + i12;
    return {
      x: m00 * imageCenterX + m01 * imageCenterY + m02,
      y: m10 * imageCenterX + m11 * imageCenterY + m12,
      color,
    };
  }

  function frontMostPoint(part, frame) {
    let best = null;
    for (const item of frame || []) {
      const color = item?.[3];
      const alpha = Array.isArray(color) ? Number(color[3] ?? 255) : 255;
      if (alpha === 0) continue;
      const point = worldPosition(part, item);
      if (point && (!best || point.x > best.x)) best = point;
    }
    return best;
  }

  function isInjectedProjectileMarker(item) {
    const markerId = Number(item?.[0]);
    return Number.isFinite(markerId) && markerId >= 2147483000 && markerId < 2147484000;
  }

  function animationMarkerMuzzle(part, readyNames, triggerNames, includeInjected = true) {
    const ready = getAnim(part, readyNames);
    const trigger = getAnim(part, triggerNames);
    if (!ready || !trigger) return null;
    const readyFrames = ready.anim.frames || [];
    const triggerFrames = trigger.anim.frames || [];
    if (!readyFrames.length || !triggerFrames.length) return null;
    const lastReady = readyFrames[readyFrames.length - 1] || [];
    const firstTrigger = triggerFrames[0] || [];
    const hidden = lastReady.filter((item) => {
      const color = item?.[3];
      const hiddenItem = Array.isArray(color) && Number(color[3] ?? 255) === 0;
      return hiddenItem && (includeInjected || !isInjectedProjectileMarker(item));
    });
    const marker = hidden.find((candidate) => firstTrigger.some(
      (item) => item?.[0] === candidate?.[0] && item?.[1] === candidate?.[1]
    )) || hidden.find((candidate) => firstTrigger.some((item) => item?.[1] === candidate?.[1]));
    return marker ? worldPosition(part, marker) : null;
  }

  function animationDerivedMuzzle(part, readyNames, triggerNames) {
    const ready = getAnim(part, readyNames);
    if (!ready) return null;
    const readyFrames = ready.anim.frames || [];
    if (!readyFrames.length) return null;
    const marker = animationMarkerMuzzle(part, readyNames, triggerNames, true);
    return marker || frontMostPoint(part, readyFrames[readyFrames.length - 1] || []);
  }

  function frameMetrics(part, frame) {
    const points = [];
    for (const item of frame || []) {
      const color = item?.[3];
      const alpha = Array.isArray(color) ? Number(color[3] ?? 255) : 255;
      if (alpha === 0) continue;
      const point = worldPosition(part, item);
      if (point) points.push(point);
    }
    if (!points.length) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return {
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }

  function isPlausibleBasicAttackStart(bodyPart, clip, databaseX, databaseY) {
    if (!clip.isBasicAttack || (databaseX === 0 && databaseY === 0)) return true;
    const reference = animationDerivedMuzzle(bodyPart, clip.ready, clip.trigger);
    if (!reference) return true;
    const ready = getAnim(bodyPart, clip.ready);
    const readyFrame = ready?.anim?.frames?.[ready.anim.frames.length - 1] || [];
    const metrics = frameMetrics(bodyPart, readyFrame);
    const width = Math.max(1, metrics?.width || 0);
    const height = Math.max(1, metrics?.height || 0);
    const dx = Math.abs(databaseX - reference.x);
    // UnitData uses positive-up Y, while SAM/body-local coordinates use positive-down Y.
    const dy = Math.abs(-databaseY - reference.y);
    const distance = Math.hypot(dx, dy);
    const maxDistance = Math.max(80, Math.min(180, Math.hypot(width, height) * 0.30));
    const maxVerticalDistance = Math.max(50, Math.min(110, height * 0.30));
    return distance <= maxDistance && dy <= maxVerticalDistance;
  }

  function normalizeMotionType(projectileConfig) {
    const explicit = text(projectileConfig?.motion?.type).toUpperCase();
    if (["LINEAR", "CURVE", "RETURN", "BEAM", "DIRECT", "NONE", "UNKNOWN"].includes(explicit)) return explicit;
    const attackType = text(projectileConfig?.attackType).toUpperCase();
    if (["ENERGY", "WEAPON", "DOUBLE"].includes(attackType)) return "LINEAR";
    if (["ENERGYC", "WEAPONC", "DOUBLEC"].includes(attackType)) return "CURVE";
    if (attackType === "RETURN") return "RETURN";
    if (attackType === "BEAM") return "BEAM";
    if (["LASER", "ACTION"].includes(attackType)) return "SPECIAL";
    if (["PUNCH", "KICK", "SWING", "STAB"].includes(attackType)) return "DIRECT";
    if (!attackType || attackType === "NONE") return "NONE";
    return "UNKNOWN";
  }

  function defaultHitPointRate(motionType) {
    if (motionType === "CURVE") return 0;
    if (["LINEAR", "RETURN"].includes(motionType)) return 0.25;
    return null;
  }

  function effectiveHitPointRate(meta, clip, motionType) {
    const raw = finiteNumber(meta?.projectileData?.hitTiming?.[clip.hitRateKey], NaN);
    if (!Number.isFinite(raw)) return defaultHitPointRate(motionType);

    // UnitData contains both ratio-form values (0, 0.3, 0.5, 1) and
    // percentage-form values (20, 30, 50, 100). They describe the target's
    // vertical hit point, measured upward from the target base.
    const ratio = raw > 1 ? raw / 100 : raw;
    return clamp(ratio, 0, 1);
  }

  function nativeStartPoint(meta, clip, projectileConfig, bodyPart) {
    const coordinateScale = positiveNumber(meta?.projectileData?.coordinateScale, NATIVE_PROJECTILE_COORDINATE_SCALE);
    const rawX = finiteNumber(projectileConfig?.start?.x, NaN);
    const rawY = finiteNumber(projectileConfig?.start?.y, NaN);
    if (Number.isFinite(rawX) && Number.isFinite(rawY)) {
      return {
        x: rawX * coordinateScale,
        y: rawY * coordinateScale,
        source: "database",
      };
    }

    // SAM-derived points are only used when UnitData does not contain coordinates.
    const authored = animationMarkerMuzzle(bodyPart, clip.ready, clip.trigger, false);
    if (authored) {
      return { x: authored.x, y: authored.y, source: "animation-anchor" };
    }
    const fallback = animationDerivedMuzzle(bodyPart, clip.ready, clip.trigger);
    if (fallback) {
      return { x: fallback.x, y: fallback.y, source: "animation-fallback" };
    }
    return { x: 0, y: 0, source: "database" };
  }

  function movementDuration(distance, moveSpeed) {
    const speed = positiveNumber(moveSpeed, 0);
    if (!speed) return 0;
    return clamp(distance / (speed * NATIVE_ACTION_FPS), MIN_FLIGHT_DURATION, MAX_FLIGHT_DURATION);
  }

  function syntheticTargetContentHeight(bodyPart) {
    return positiveNumber(bodyPart?.canvas?.h, 240);
  }

  function selectedTargetProfile(bodyPart) {
    const profile = targetBridge.get(state.activeSection);
    return {
      contentHeight: positiveNumber(profile?.contentHeight, syntheticTargetContentHeight(bodyPart)),
      contentWidth: positiveNumber(profile?.contentWidth, positiveNumber(bodyPart?.canvas?.w, 0)),
      unitId: text(profile?.unitId),
    };
  }

  function referenceLayout() {
    const width = 640;
    const height = 360;
    const zoom = 1;
    const baseSceneScale = Math.min(width / 1400, height / 750) * VIEWER_RESOURCE_SCALE * NORMAL_STAGE_INITIAL_SCALE;
    const sceneScale = baseSceneScale * zoom;
    const actorX = width * RANGER_X_RATIO;
    const actorY = height * GROUND_Y_RATIO;
    const targetX = actorX + targetSceneDistance(width, zoom);
    return {
      actorX,
      actorY,
      targetX,
      targetBaseY: actorY,
      bodyOriginX: actorX + BODY_OFFSET_X * sceneScale,
      bodyOriginY: actorY + BODY_OFFSET_Y * sceneScale,
      sceneScale,
      facing: 1,
    };
  }

  function resolveStartScreen(projectile, layout, sceneScale) {
    if (projectile.start.source === "database") {
      return {
        x: layout.bodyOriginX + layout.facing * projectile.start.x * sceneScale,
        y: layout.bodyOriginY - projectile.start.y * sceneScale,
      };
    }
    return {
      x: layout.bodyOriginX + layout.facing * projectile.start.x * sceneScale,
      y: layout.bodyOriginY + projectile.start.y * sceneScale,
    };
  }

  function resolveReturnEnd(projectile, layout, sceneScale) {
    return {
      x: layout.bodyOriginX + layout.facing * projectile.secondStart.x * sceneScale,
      y: layout.bodyOriginY - projectile.secondStart.y * sceneScale,
    };
  }

  function resolveOutboundEnd(projectile, bodyPart, layout, sceneScale) {
    const targetHeight = selectedTargetProfile(bodyPart).contentHeight;
    const targetHitHeight = targetHeight * finiteNumber(projectile.hitPointRate, 0);
    return {
      x: layout.targetX + layout.facing * projectile.endOffset.x * sceneScale,
      // The native endpoint is based on the target hit point. endY is an
      // additional positive-up offset, not an offset from the launch line.
      y: layout.targetBaseY - (targetHitHeight + projectile.endOffset.y) * sceneScale,
    };
  }

  function estimateProjectileLifetime(projectile, bodyPart) {
    const layout = referenceLayout();
    const sceneScale = layout.sceneScale;
    const start = resolveStartScreen(projectile, layout, sceneScale);
    const end = resolveOutboundEnd(projectile, bodyPart, layout, sceneScale);
    const nativeDistance = Math.hypot(end.x - start.x, end.y - start.y) / Math.max(0.0001, sceneScale);
    const flightDuration = movementDuration(nativeDistance, projectile.moveSpeed);

    if (projectile.renderMode === "RETURN" && flightDuration > 0) {
      const returnEnd = resolveReturnEnd(projectile, layout, sceneScale);
      const returnDistance = Math.hypot(returnEnd.x - end.x, returnEnd.y - end.y) / Math.max(0.0001, sceneScale);
      return flightDuration + movementDuration(returnDistance, projectile.moveSpeed);
    }
    if (projectile.renderMode === "BEAM") return projectile.beamDuration + projectile.finishDuration;
    if (projectile.renderMode === "AUTHORED_FINISH") return projectile.finishDuration;
    if (["AUTHORED", "DIRECT"].includes(projectile.renderMode)) return projectile.localNormalDuration + projectile.finishDuration;
    if (["LINEAR", "CURVE"].includes(projectile.renderMode) && flightDuration > 0) {
      return flightDuration + projectile.finishDuration;
    }
    return Math.max(projectile.localNormalDuration, 15 / Math.max(1, bodyPart?.anim_rate || 24)) + projectile.finishDuration;
  }

  function buildProjectile(meta, clip, bodyPart, bodyAnimation, clipDuration) {
    if (!clip.bullet) return null;
    const projectileConfig = meta?.projectileData?.[clip.dataKey] || null;
    const motionType = normalizeMotionType(projectileConfig);
    if (motionType === "NONE") return null;

    const requestedPartName = text(projectileConfig?.animationPart) || clip.bullet;
    const bulletPart = meta?.parts?.[requestedPartName] || meta?.parts?.[clip.bullet];
    if (!bulletPart) return null;

    const standardNormal = getAnim(bulletPart, ["normal", "idle", "wait", "shot", "fire", "attack", "_all"]);
    const outboundAnimation = motionType === "RETURN" ? (getAnim(bulletPart, ["normal_a"]) || standardNormal) : standardNormal;
    if (!outboundAnimation) return null;
    const returnAnimation = motionType === "RETURN" ? (getAnim(bulletPart, ["normal_b"]) || outboundAnimation) : null;
    const finishAnimation = getAnim(bulletPart, ["finish", "hit", "end"]);

    const spawnTime = nativeProjectileSpawnTime(bodyPart, bodyAnimation.name, clip, clipDuration);
    const localNormalDuration = Math.max(1, outboundAnimation.anim.frame_count || 0) / Math.max(1, bulletPart.anim_rate || 24);
    const finishDuration = finishAnimation ? animDuration(bulletPart, finishAnimation) : 0;
    const start = nativeStartPoint(meta, clip, projectileConfig, bodyPart);
    const coordinateScale = positiveNumber(meta?.projectileData?.coordinateScale, NATIVE_PROJECTILE_COORDINATE_SCALE);
    const endOffset = {
      x: finiteNumber(projectileConfig?.end?.x, 0) * coordinateScale,
      y: finiteNumber(projectileConfig?.end?.y, 0) * coordinateScale,
    };
    const secondStart = {
      x: finiteNumber(projectileConfig?.secondStart?.x, finiteNumber(projectileConfig?.start?.x, 0)) * coordinateScale,
      y: finiteNumber(projectileConfig?.secondStart?.y, finiteNumber(projectileConfig?.start?.y, 0)) * coordinateScale,
    };

    const configuredEnabled = projectileConfig?.motion?.enabled;
    const normalHasVisibleContent = animationHasVisibleContent(outboundAnimation);
    let renderMode = motionType;
    if (motionType === "SPECIAL" || motionType === "UNKNOWN") renderMode = "LEGACY";
    if (configuredEnabled === false && !["DIRECT", "SPECIAL"].includes(motionType)) {
      // Disabled native motion means the SAM part contains the authored action.
      // An empty normal followed by finish must start finish immediately at the
      // target instead of inventing a half-second flight from actor to target.
      renderMode = !normalHasVisibleContent && finishAnimation ? "AUTHORED_FINISH" : "AUTHORED";
    }

    const beamLength = positiveNumber(meta?.projectileData?.bullet?.length, 0);
    const beamDuration = positiveNumber(meta?.projectileData?.bullet?.duration, 0);
    if (renderMode === "BEAM" && (!beamLength || !beamDuration)) renderMode = "LEGACY";

    const projectile = {
      partName: bulletPart === meta?.parts?.[requestedPartName] ? requestedPartName : clip.bullet,
      config: projectileConfig,
      motionType,
      renderMode,
      normalAnimName: outboundAnimation.name,
      returnAnimName: returnAnimation?.name || outboundAnimation.name,
      finishAnimName: finishAnimation?.name || "",
      spawnTime,
      start,
      secondStart,
      endOffset,
      coordinateScale,
      moveSpeed: positiveNumber(projectileConfig?.moveSpeed, 0),
      hitPointRate: effectiveHitPointRate(meta, clip, motionType),
      localNormalDuration,
      finishDuration,
      normalGroundOffset: animationGroundOffset(bulletPart, outboundAnimation),
      finishGroundOffset: animationGroundOffset(bulletPart, finishAnimation),
      beamLength,
      beamDuration,
      loopNormal: renderMode === "LEGACY" ? true : projectileConfig?.motion?.loopNormal !== false,
      rotationMode: text(projectileConfig?.motion?.rotation).toUpperCase() || "FIXED",
      isBasicAttack: clip.isBasicAttack === true,
    };
    projectile.lifetime = estimateProjectileLifetime(projectile, bodyPart);
    return projectile;
  }

  function computeTrack(meta, clipKey) {
    const clip = CLIPS.find((item) => item.key === clipKey) || CLIPS[0];
    if (clip.sequence) {
      const segments = [];
      let cursor = 0;
      for (const childKey of clip.sequence) {
        const childTrack = buildTrack(meta, childKey);
        if (!childTrack.segments.length) continue;
        for (const segment of childTrack.segments) segments.push({ ...segment, start: (segment.start || 0) + cursor });
        cursor += childTrack.duration || 0;
      }
      return { key: clip.key, label: clip.label, segments, duration: cursor || 1 };
    }

    const bodyPart = meta?.parts?.body;
    const bodyAnimation = getAnim(bodyPart, clip.body);
    if (!bodyAnimation) return { key: clip.key, label: clip.label, segments: [], duration: 0 };
    const bodyDuration = animDuration(bodyPart, bodyAnimation) || 1;
    const projectile = buildProjectile(meta, clip, bodyPart, bodyAnimation, bodyDuration);
    const duration = Math.max(bodyDuration, projectile ? projectile.spawnTime + projectile.lifetime : 0, 1);
    return {
      key: clip.key,
      label: clip.label,
      segments: [{
        partName: "body",
        animName: bodyAnimation.name,
        start: 0,
        duration,
        bodyDuration,
        loop: clip.key === "idle",
        projectile,
      }],
      duration,
    };
  }

  function buildTrack(meta, clipKey) {
    if (!meta) return { key: clipKey, label: clipKey, segments: [], duration: 0 };
    if (!state.trackCache.has(meta)) state.trackCache.set(meta, new Map());
    const cache = state.trackCache.get(meta);
    if (!cache.has(clipKey)) cache.set(clipKey, computeTrack(meta, clipKey));
    return cache.get(clipKey);
  }

  function availableClips(meta) {
    return CLIPS.map((clip) => ({ clip, track: buildTrack(meta, clip.key) })).filter(({ track }) => track.segments.length > 0);
  }

  function clipOptions(meta) {
    return availableClips(meta).map(({ clip }) => `<option value="${escapeHtml(clip.key)}">${escapeHtml(clip.label)}</option>`).join("");
  }

  function defaultClipKey(meta) {
    const available = availableClips(meta).map(({ clip }) => clip.key);
    return available.includes("idle") ? "idle" : (available[0] || "");
  }

  function renderPanel(unitId, meta) {
    return `
      <section class="detail-section ranger-animation-section" data-animation-unit-id="${escapeHtml(unitId)}">
        <h3>角色動畫</h3>
        <div class="ranger-animation-player">
          <canvas class="ranger-animation-canvas" width="640" height="360" aria-label="角色動畫預覽"></canvas>
          <p class="ranger-animation-hint">一般關卡場景比例 0.85；角色與目標距離在目前基礎上再增加 50%，目標可移出畫面。</p>
          <div class="ranger-animation-controls simplified">
            <label><span>動畫</span><select class="ranger-animation-select">${clipOptions(meta)}</select></label>
            <label class="ranger-animation-zoom-label"><span>縮放 <strong class="ranger-animation-zoom-percent">100%</strong></span><input class="ranger-animation-zoom" type="range" min="0.4" max="2.5" step="0.1" value="1"></label>
          </div>
        </div>
      </section>`;
  }

  function fallbackMissingPanel(unitId) {
    return `<section class="detail-section ranger-animation-section" data-animation-unit-id="${escapeHtml(unitId)}"><h3>角色動畫</h3><div class="empty-state small">尚未產生此角色的動畫 metadata。請確認 GitHub Actions 已完成 Build animation metadata。</div></section>`;
  }

  function getSpriteCanvas(part, atlas, imageName) {
    const cacheKey = `${normalizeResourcePath(part.png)}|${imageName}`;
    if (state.spriteCache.has(cacheKey)) return state.spriteCache.get(cacheKey);
    const sprite = part.sprites?.[imageName];
    if (!sprite) return null;
    const [sourceX, sourceY, width, height] = sprite.rect || [];
    if (!width || !height) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    if (sprite.rotated) {
      context.translate(width / 2, height / 2);
      context.rotate(-Math.PI / 2);
      context.drawImage(atlas, sourceX, sourceY, height, width, -height / 2, -width / 2, height, width);
    } else {
      context.drawImage(atlas, sourceX, sourceY, width, height, 0, 0, width, height);
    }
    state.spriteCache.set(cacheKey, canvas);
    return canvas;
  }

  function drawSprite(context, spriteCanvas, objectMatrix, imageMatrix, color, originX, originY, scaleX, scaleY) {
    const [m00, m01, m10, m11, m02, m12] = objectMatrix;
    const [i00, i01, i10, i11, i02, i12] = imageMatrix;
    const width = spriteCanvas.width;
    const height = spriteCanvas.height;
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const imageCenterX = i00 * centerX + i01 * centerY + i02;
    const imageCenterY = i10 * centerX + i11 * centerY + i12;
    const worldCenterX = m00 * imageCenterX + m01 * imageCenterY + m02;
    const worldCenterY = m10 * imageCenterX + m11 * imageCenterY + m12;
    const f00 = m00 * i00 + m01 * i10;
    const f01 = m00 * i01 + m01 * i11;
    const f10 = m10 * i00 + m11 * i10;
    const f11 = m10 * i01 + m11 * i11;
    const determinant = f00 * f11 - f01 * f10;
    const localScaleX = Math.hypot(f00, f10);
    const localScaleY = Math.hypot(f01, f11);
    const flipX = determinant < 0;
    const angle = flipX ? Math.atan2(-f10, -f00) : Math.atan2(f10, f00);
    const alpha = Array.isArray(color) ? Number(color[3] ?? 255) / 255 : 1;

    context.save();
    context.globalAlpha = clamp(alpha, 0, 1);
    context.translate(originX + worldCenterX * scaleX, originY + worldCenterY * scaleY);
    context.rotate(angle);
    context.scale((flipX ? -1 : 1) * localScaleX * scaleX, localScaleY * scaleY);
    context.drawImage(spriteCanvas, -width / 2, -height / 2);
    context.restore();
  }

  async function drawSamFrame(context, part, animName, frameIndexValue, originX, originY, scaleX, scaleY = scaleX, rotationDegrees = 0) {
    const animation = part?.animations?.[animName];
    if (!part || !animation?.frames?.length) return false;
    const atlas = await loadImage(part.png);
    if (!atlas) return false;
    const frame = animation.frames[clamp(frameIndexValue, 0, animation.frame_count - 1)] || [];
    let drawn = false;

    context.save();
    context.translate(originX, originY);
    if (rotationDegrees) context.rotate(rotationDegrees * Math.PI / 180);
    for (const item of frame) {
      const [, resourceNumber, objectMatrix, color] = item;
      const imageDefinition = part.images?.[resourceNumber];
      if (!imageDefinition || !Array.isArray(objectMatrix) || !Array.isArray(imageDefinition.m)) continue;
      const spriteCanvas = getSpriteCanvas(part, atlas, imageDefinition.name);
      if (!spriteCanvas) continue;
      drawSprite(context, spriteCanvas, objectMatrix, imageDefinition.m, color, 0, 0, scaleX, scaleY);
      drawn = true;
    }
    context.restore();
    return drawn;
  }

  function frameIndex(part, animName, elapsed, loop = false) {
    const animation = part?.animations?.[animName];
    if (!part || !animation?.frames?.length) return 0;
    const rawFrame = Math.floor(elapsed * Math.max(1, part.anim_rate || 24));
    return loop
      ? ((rawFrame % animation.frame_count) + animation.frame_count) % animation.frame_count
      : clamp(rawFrame, 0, animation.frame_count - 1);
  }

  function lerp(start, end, progress) {
    const t = clamp(progress, 0, 1);
    return start + (end - start) * t;
  }

  function cubicBezierPoint(point0, point1, point2, point3, progress) {
    const t = clamp(progress, 0, 1);
    const u = 1 - t;
    return {
      x: u * u * u * point0.x + 3 * u * u * t * point1.x + 3 * u * t * t * point2.x + t * t * t * point3.x,
      y: u * u * u * point0.y + 3 * u * u * t * point1.y + 3 * u * t * t * point2.y + t * t * t * point3.y,
    };
  }

  function projectileRotation(projectile, progress) {
    if (projectile.rotationMode !== "ANGLE_LERP") return 0;
    const start = finiteNumber(projectile.config?.angle?.start, 0);
    const end = finiteNumber(projectile.config?.angle?.end, start);
    return lerp(start, end, progress);
  }

  function resolveProjectileGeometry(projectile, bodyPart, layout, sceneScale) {
    const start = resolveStartScreen(projectile, layout, sceneScale);
    const end = resolveOutboundEnd(projectile, bodyPart, layout, sceneScale);
    const endX = end.x;
    const endY = end.y;
    const nativeDistance = Math.hypot(endX - start.x, endY - start.y) / Math.max(0.0001, sceneScale);
    const flightDuration = movementDuration(nativeDistance, projectile.moveSpeed);
    const returnEnd = resolveReturnEnd(projectile, layout, sceneScale);
    const returnNativeDistance = Math.hypot(returnEnd.x - endX, returnEnd.y - endY) / Math.max(0.0001, sceneScale);
    const returnDuration = movementDuration(returnNativeDistance, projectile.moveSpeed);
    return {
      startX: start.x,
      startY: start.y,
      endX,
      endY,
      nativeDistance,
      flightDuration,
      returnEndX: returnEnd.x,
      returnEndY: returnEnd.y,
      returnNativeDistance,
      returnDuration,
      facing: layout.facing,
    };
  }

  async function drawProjectileFrame(context, bulletPart, animationName, age, loop, x, y, scaleX, scaleY, rotation = 0) {
    const frame = frameIndex(bulletPart, animationName, age, loop);
    return drawSamFrame(context, bulletPart, animationName, frame, x, y, scaleX, scaleY, rotation);
  }

  async function drawFinish(context, bulletPart, projectile, age, endX, endY, sceneScale) {
    if (!projectile.finishAnimName || age < 0 || age > projectile.finishDuration) return;
    const frame = frameIndex(bulletPart, projectile.finishAnimName, age, false);
    await drawSamFrame(context, bulletPart, projectile.finishAnimName, frame, endX, endY, sceneScale);
  }

  async function drawBeam(context, bulletPart, projectile, age, geometry, sceneScale) {
    if (age > projectile.beamDuration) {
      await drawFinish(context, bulletPart, projectile, age - projectile.beamDuration, geometry.endX, geometry.endY, sceneScale);
      return;
    }
    const count = Math.max(1, Math.trunc(geometry.nativeDistance / projectile.beamLength));
    const nominalWidth = projectile.beamLength * count;
    const layerScaleX = nominalWidth > 0 ? geometry.nativeDistance / nominalWidth : 1;
    const dx = geometry.endX - geometry.startX;
    const dy = geometry.endY - geometry.startY;
    const rotation = Math.atan2(dy, dx) * 180 / Math.PI;
    const unitX = geometry.nativeDistance > 0 ? dx / (geometry.nativeDistance * sceneScale) : geometry.facing;
    const unitY = geometry.nativeDistance > 0 ? dy / (geometry.nativeDistance * sceneScale) : 0;

    for (let index = 0; index < count; index += 1) {
      const nativeOffset = projectile.beamLength * index * layerScaleX;
      const x = geometry.startX + unitX * nativeOffset * sceneScale;
      const y = geometry.startY + unitY * nativeOffset * sceneScale;
      await drawProjectileFrame(
        context,
        bulletPart,
        projectile.normalAnimName,
        age,
        true,
        x,
        y,
        sceneScale * layerScaleX * geometry.facing,
        sceneScale,
        rotation,
      );
    }
  }

  async function drawProjectile(context, meta, projectile, age, bodyPart, layout, sceneScale) {
    const bulletPart = meta?.parts?.[projectile.partName];
    if (!bulletPart) return;
    const geometry = resolveProjectileGeometry(projectile, bodyPart, layout, sceneScale);
    const nativeMotionAvailable = geometry.flightDuration > 0;
    const fixedPositionMode = ["AUTHORED", "AUTHORED_FINISH", "DIRECT", "BEAM"].includes(projectile.renderMode);
    const renderMode = fixedPositionMode
      ? projectile.renderMode
      : (nativeMotionAvailable ? projectile.renderMode : "LEGACY");

    if (renderMode === "BEAM") {
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

    if (renderMode === "DIRECT") {
      if (age <= projectile.localNormalDuration || !projectile.finishAnimName) {
        await drawProjectileFrame(context, bulletPart, projectile.normalAnimName, age, projectile.loopNormal, geometry.endX, geometry.endY, sceneScale, sceneScale);
      } else {
        await drawFinish(context, bulletPart, projectile, age - projectile.localNormalDuration, geometry.endX, geometry.endY, sceneScale);
      }
      return;
    }

    if (renderMode === "RETURN") {
      const totalDuration = geometry.flightDuration + geometry.returnDuration;
      if (age > totalDuration) return;
      if (age < geometry.flightDuration) {
        const progress = age / Math.max(MIN_FLIGHT_DURATION, geometry.flightDuration);
        await drawProjectileFrame(
          context,
          bulletPart,
          projectile.normalAnimName,
          age,
          true,
          lerp(geometry.startX, geometry.endX, progress),
          lerp(geometry.startY, geometry.endY, progress),
          sceneScale,
          sceneScale,
          projectileRotation(projectile, progress),
        );
        return;
      }
      const returnAge = age - geometry.flightDuration;
      const progress = returnAge / Math.max(MIN_FLIGHT_DURATION, geometry.returnDuration);
      await drawProjectileFrame(
        context,
        bulletPart,
        projectile.returnAnimName,
        returnAge,
        true,
        lerp(geometry.endX, geometry.returnEndX, progress),
        lerp(geometry.endY, geometry.returnEndY, progress),
        sceneScale,
        sceneScale,
        projectileRotation(projectile, 1 - progress),
      );
      return;
    }

    const duration = renderMode === "LEGACY"
      ? Math.max(projectile.localNormalDuration, 15 / Math.max(1, bodyPart.anim_rate || 24))
      : geometry.flightDuration;
    if (age <= duration || !projectile.finishAnimName) {
      const progress = clamp(age / Math.max(0.001, duration), 0, 1);
      let position = {
        x: lerp(geometry.startX, geometry.endX, progress),
        y: lerp(geometry.startY, geometry.endY, progress),
      };
      if (projectile.motionType === "CURVE") {
        const pixelDistance = Math.hypot(geometry.endX - geometry.startX, geometry.endY - geometry.startY);
        position = cubicBezierPoint(
          { x: geometry.startX, y: geometry.startY },
          { x: geometry.startX, y: geometry.startY },
          {
            x: (geometry.startX + geometry.endX) * 0.5 + geometry.facing * pixelDistance * 0.4,
            y: (geometry.startY + geometry.endY) * 0.5 - pixelDistance * 0.4,
          },
          { x: geometry.endX, y: geometry.endY },
          progress,
        );
      }
      await drawProjectileFrame(
        context,
        bulletPart,
        projectile.normalAnimName,
        age,
        projectile.loopNormal,
        position.x,
        position.y,
        sceneScale,
        sceneScale,
        projectileRotation(projectile, progress),
      );
      return;
    }

    await drawFinish(context, bulletPart, projectile, age - duration, geometry.endX, geometry.endY, sceneScale);
  }

  async function drawSegment(bodyContext, projectileContext, meta, segment, age, layout, sceneScale) {
    const bodyPart = meta?.parts?.body;
    if (!bodyPart) return;
    const bodyAge = segment.loop ? age : Math.min(age, Math.max(0, segment.bodyDuration - 0.001));
    const bodyFrame = frameIndex(bodyPart, segment.animName, bodyAge, segment.loop);
    await drawSamFrame(bodyContext, bodyPart, segment.animName, bodyFrame, layout.bodyOriginX, layout.bodyOriginY, sceneScale);

    const projectile = segment.projectile;
    if (!projectile) return;
    const projectileAge = age - projectile.spawnTime;
    if (projectileAge < 0) return;
    await drawProjectile(projectileContext, meta, projectile, projectileAge, bodyPart, layout, sceneScale);
  }

  async function drawTrack(canvas, meta, track, elapsed) {
    const bodyContext = canvas.getContext("2d");
    if (!bodyContext || !track) return;
    const width = canvas.width;
    const height = canvas.height;
    const projectileCanvas = state.activeSection?.querySelector(".ranger-animation-projectile-canvas");
    if (projectileCanvas) {
      if (projectileCanvas.width !== width) projectileCanvas.width = width;
      if (projectileCanvas.height !== height) projectileCanvas.height = height;
    }
    const projectileContext = projectileCanvas?.getContext("2d") || bodyContext;
    const zoom = state.zoom || 1;
    const baseSceneScale = Math.min(width / 1400, height / 750) * VIEWER_RESOURCE_SCALE * NORMAL_STAGE_INITIAL_SCALE;
    const sceneScale = baseSceneScale * zoom;
    const actorX = width * RANGER_X_RATIO + state.panX;
    const actorY = height * GROUND_Y_RATIO + state.panY;
    const layout = {
      actorX,
      actorY,
      targetX: actorX + targetSceneDistance(width, zoom),
      targetBaseY: actorY,
      facing: 1,
      zoom,
      baseSceneScale,
      sceneScale,
      panX: state.panX,
      panY: state.panY,
    };
    layout.bodyOriginX = layout.actorX + BODY_OFFSET_X * sceneScale;
    layout.bodyOriginY = layout.actorY + BODY_OFFSET_Y * sceneScale;
    sceneBridge.set(state.activeSection, { ...layout, width, height });

    bodyContext.clearRect(0, 0, width, height);
    if (projectileContext !== bodyContext) projectileContext.clearRect(0, 0, width, height);
    bodyContext.save();
    bodyContext.fillStyle = "rgba(255,255,255,0.08)";
    bodyContext.fillRect(0, Math.round(layout.actorY), width, 1);
    bodyContext.restore();

    const nativeElapsed = Math.floor(elapsed * NATIVE_ACTION_FPS) / NATIVE_ACTION_FPS;
    const time = track.duration ? nativeElapsed % track.duration : nativeElapsed;
    for (const segment of track.segments) {
      const start = segment.start || 0;
      const end = start + Math.max(segment.duration || 0, segment.bodyDuration || 0, 1);
      if (time < start || time > end) continue;
      await drawSegment(bodyContext, projectileContext, meta, segment, time - start, layout, sceneScale);
    }
  }

  function stopPlayback() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = 0;
    const projectileCanvas = state.activeSection?.querySelector(".ranger-animation-projectile-canvas");
    const projectileContext = projectileCanvas?.getContext("2d");
    projectileContext?.clearRect(0, 0, projectileCanvas.width, projectileCanvas.height);
  }

  function playLoop() {
    if (!state.activeCanvas || !state.activeMeta) return;
    const track = buildTrack(state.activeMeta, state.activeClip);
    drawTrack(state.activeCanvas, state.activeMeta, track, (performance.now() - state.startedAt) / 1000);
    state.rafId = requestAnimationFrame(playLoop);
  }

  function startPlayback(section) {
    stopPlayback();
    state.activeSection = section;
    state.activeCanvas = section.querySelector(".ranger-animation-canvas");
    state.startedAt = performance.now();
    state.rafId = requestAnimationFrame(playLoop);
  }

  function bindDrag(canvas) {
    canvas.addEventListener("pointerdown", (event) => {
      state.dragging = true;
      state.dragStartX = event.clientX;
      state.dragStartY = event.clientY;
      state.dragPanX = state.panX;
      state.dragPanY = state.panY;
      canvas.setPointerCapture?.(event.pointerId);
      canvas.classList.add("dragging");
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!state.dragging) return;
      state.panX = state.dragPanX + event.clientX - state.dragStartX;
      state.panY = state.dragPanY + event.clientY - state.dragStartY;
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
      canvas.addEventListener(eventName, (event) => {
        state.dragging = false;
        canvas.releasePointerCapture?.(event.pointerId);
        canvas.classList.remove("dragging");
      });
    });
  }

  function bindPanel(section, meta) {
    const select = section.querySelector(".ranger-animation-select");
    const zoom = section.querySelector(".ranger-animation-zoom");
    const zoomText = section.querySelector(".ranger-animation-zoom-percent");
    const canvas = section.querySelector(".ranger-animation-canvas");
    if (!select || !canvas) return;
    const defaultKey = defaultClipKey(meta);
    if (defaultKey) select.value = defaultKey;
    if (zoom) zoom.value = "1";
    state.activeSection = section;
    state.activeMeta = meta;
    state.activeCanvas = canvas;
    state.activeClip = select.value || defaultKey;
    state.zoom = Number(zoom?.value) || 1;
    state.panX = 0;
    state.panY = 0;
    state.trackCache.delete(meta);
    bindDrag(canvas);
    select.addEventListener("change", () => {
      state.activeClip = select.value || defaultKey;
      startPlayback(section);
    });
    zoom?.addEventListener("input", () => {
      state.zoom = Number(zoom.value) || 1;
      if (zoomText) zoomText.textContent = `${Math.round(state.zoom * 100)}%`;
    });
    section.addEventListener("ranger-animation-target-change", () => {
      state.trackCache.delete(meta);
      if (state.activeSection === section) startPlayback(section);
    });
    if (zoomText) zoomText.textContent = `${Math.round(state.zoom * 100)}%`;
    startPlayback(section);
  }

  async function patchModal() {
    const modalContent = document.getElementById("rangerModalContent");
    if (!modalContent || !modalContent.children.length) return;
    const unitId = inferUnitIdFromModal(modalContent);
    if (!unitId || modalContent.querySelector(`.ranger-animation-section[data-animation-unit-id="${CSS.escape(unitId)}"]`)) return;
    const meta = await loadMeta(unitId);
    modalContent.insertAdjacentHTML("beforeend", meta ? renderPanel(unitId, meta) : fallbackMissingPanel(unitId));
    const section = modalContent.querySelector(`.ranger-animation-section[data-animation-unit-id="${CSS.escape(unitId)}"]`);
    if (section && meta) bindPanel(section, meta);
  }

  function onlyAnimationPanelAdded(mutations) {
    return mutations.length > 0 && mutations.every((mutation) => {
      const added = [...mutation.addedNodes].filter((node) => node.nodeType === Node.ELEMENT_NODE);
      const removed = [...mutation.removedNodes].filter((node) => node.nodeType === Node.ELEMENT_NODE);
      return removed.length === 0 && added.length > 0 && added.every((node) => node.classList?.contains("ranger-animation-section"));
    });
  }

  const observer = new MutationObserver((mutations) => {
    if (!onlyAnimationPanelAdded(mutations)) stopPlayback();
    window.setTimeout(patchModal, 0);
  });

  window.addEventListener("load", () => {
    const modalContent = document.getElementById("rangerModalContent");
    if (modalContent) observer.observe(modalContent, { childList: true });
    patchModal();
  });

  document.addEventListener("click", (event) => {
    if (event.target?.id === "rangerModalCloseBtn" || event.target?.id === "rangerModal") stopPlayback();
  });
})();
