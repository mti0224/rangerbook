(() => {
  const ANIMATION_META_BASE = "https://res.warmycat.com/animation_meta/";
  const INDEX_URL = `${ANIMATION_META_BASE}index.json`;
  const RESOURCE_PRIMARY_BASE = "https://res.warmycat.com/";
  const RESOURCE_FALLBACK_BASE = "https://rangers.lerico.net/res/";
  const OLD_PRIMARY_PREFIX = "res_from_emulator/";
  const SITE_ROOT = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const PROJECTILE_DATA_URL = `${SITE_ROOT}res/projectile_data.json`;
  const FRAME_INTERVAL_MS = 1000 / 30;
  const NATIVE_ACTION_FPS = 60;
  const DEFAULT_PROJECTILE_COORDINATE_SCALE = 0.5;
  const MIN_FLIGHT_DURATION = FRAME_INTERVAL_MS / 1000;
  const MAX_FLIGHT_DURATION = 8;

  const RANGER_X_RATIO = 0.50;
  const TARGET_X_RATIO = 0.90;
  const GROUND_Y_RATIO = 0.80;
  const BODY_OFFSET_X = -130;
  const BODY_OFFSET_Y = -88;
  const BUL_TARGET_X = -50;
  const BUL_TARGET_Y = -93;
  const BUL2_TARGET_X = -50;
  const BUL2_TARGET_Y = -93;
  const BUL3_TARGET_X = -50;
  const BUL3_TARGET_Y = -93;

  const CLIPS = [
    { key: "idle", label: "待機", body: ["idle", "wait"] },
    { key: "move", label: "移動", body: ["walk"] },
    { key: "knockback", label: "被擊退", body: ["knockback"] },
    { key: "attack", dataKey: "normal", label: "一般攻擊", body: ["attack_all"], ready: ["attack_ready"], trigger: ["attack"], bullet: "bul", targetX: BUL_TARGET_X, targetY: BUL_TARGET_Y, isBasicAttack: true },
    { key: "skill1", dataKey: "skill1", label: "技能1", body: ["s_attack_all", "s_action_attack_all"], ready: ["s_attack_ready", "s_action_attack_1"], trigger: ["s_attack", "s_action_attack_2", "s_action_attack_3"], bullet: "bul2", targetX: BUL2_TARGET_X, targetY: BUL2_TARGET_Y, isBasicAttack: false },
    { key: "skill2", dataKey: "skill2", label: "技能2", body: ["s2_attack_all"], ready: ["s2_attack_ready"], trigger: ["s2_attack", "skill"], bullet: "bul3", targetX: BUL3_TARGET_X, targetY: BUL3_TARGET_Y, isBasicAttack: false },
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
    lastDrawAt: 0,
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

  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
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
  function normalizeResourcePath(path) {
    return String(path || "").replace(/^\/+/, "").replace(new RegExp(`^${OLD_PRIMARY_PREFIX}`), "");
  }
  function animationMetaUrl(metaPath, unitId) {
    const raw = text(metaPath);
    const filename = raw ? raw.split("/").pop() : `${unitId}.json`;
    return `${ANIMATION_META_BASE}${encodeURIComponent(filename)}`;
  }
  function resourceUrl(path) { return `${RESOURCE_PRIMARY_BASE}${normalizeResourcePath(path)}`; }
  function legacyResourceUrl(path) { return `${RESOURCE_FALLBACK_BASE}${normalizeResourcePath(path)}`; }

  function loadIndex() {
    if (!state.indexPromise) {
      state.indexPromise = fetch(INDEX_URL).then((res) => res.ok ? res.json() : null).catch(() => null);
    }
    return state.indexPromise;
  }

  function loadProjectileData() {
    if (!state.projectileDataPromise) {
      state.projectileDataPromise = fetch(PROJECTILE_DATA_URL)
        .then((res) => res.ok ? res.json() : null)
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
      coordinateScale: DEFAULT_PROJECTILE_COORDINATE_SCALE,
      unitId,
      bullet: unitData.bullet || null,
      normal: unitData.normal || null,
      skill1: unitData.skill1 || null,
      skill2: unitData.skill2 || null,
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
      fetch(animationMetaUrl(entry.meta, unitId)).then((res) => res.ok ? res.json() : null).catch(() => null),
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
      const img = new Image();
      const primary = resourceUrl(normalizedPath);
      const fallback = legacyResourceUrl(normalizedPath);
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => {
        if (fallback && img.src !== fallback) { img.src = fallback; return; }
        reject(new Error(`Image failed: ${normalizedPath}`));
      };
      img.src = primary;
    }).catch(() => null);
    state.imageCache.set(key, promise);
    return promise;
  }

  function inferUnitIdFromModal(modalContent) {
    const img = modalContent.querySelector(".ranger-detail-image");
    const src = img?.getAttribute("src") || img?.src || "";
    const match = src.match(/res(?:_from_emulator)?\/([^/]+)\//) || src.match(/\/([^/]+)\/[^/]+-thum/i);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function getAnim(part, names) {
    if (!part) return null;
    for (const name of names) {
      const anim = part.animations?.[name];
      if (anim?.frames?.length) return { name, anim };
    }
    return null;
  }

  function animDuration(part, animResult) {
    return animResult ? animResult.anim.frame_count / Math.max(1, part?.anim_rate || 24) : 0;
  }
  function rawAnimDuration(part, names) {
    const found = getAnim(part, names || []);
    return found ? animDuration(part, found) : 0;
  }
  function segmentStartTime(part, segmentNames) {
    if (!part || !Array.isArray(part.segments)) return 0;
    const segment = part.segments.find((item) => segmentNames.includes(item.name));
    return segment ? Number(segment.start || 0) / Math.max(1, part.anim_rate || 24) : 0;
  }
  function projectileSpawnTime(bodyPart, clip, clipDuration) {
    const readyDuration = rawAnimDuration(bodyPart, clip.ready || []);
    if (readyDuration > 0) return Math.min(readyDuration, Math.max(0, clipDuration - 0.001));
    const absoluteStart = segmentStartTime(bodyPart, clip.trigger || []);
    if (absoluteStart > 0 && absoluteStart < clipDuration) return absoluteStart;
    return 0;
  }

  function spriteDims(part, imageName) {
    const sprite = part?.sprites?.[imageName];
    if (!sprite) return null;
    const [, , sw, sh] = sprite.rect || [];
    if (!sw || !sh) return null;
    return { w: sw, h: sh };
  }
  function worldPosition(part, item) {
    const [, resNum, objectMatrix, color] = item || [];
    const imageDef = part?.images?.[resNum];
    if (!imageDef || !Array.isArray(objectMatrix) || !Array.isArray(imageDef.m)) return null;
    const dims = spriteDims(part, imageDef.name);
    if (!dims) return null;
    const [m00, m01, m10, m11, m02, m12] = objectMatrix;
    const [i00, i01, i10, i11, i02, i12] = imageDef.m;
    const cx = dims.w * 0.5, cy = dims.h * 0.5;
    const postCx = i00 * cx + i01 * cy + i02;
    const postCy = i10 * cx + i11 * cy + i12;
    return {
      x: m00 * postCx + m01 * postCy + m02,
      y: m10 * postCx + m11 * postCy + m12,
      color,
    };
  }
  function frontMostPoint(part, frame) {
    let best = null;
    let bestX = -Infinity;
    for (const item of frame || []) {
      const color = item[3];
      const alpha = Array.isArray(color) ? Number(color[3] ?? 255) : 255;
      if (alpha === 0) continue;
      const pos = worldPosition(part, item);
      if (pos && pos.x > bestX) { bestX = pos.x; best = pos; }
    }
    return best;
  }
  function findMuzzlePoint(part, readyNames, triggerNames) {
    const ready = getAnim(part, readyNames || []);
    const attack = getAnim(part, triggerNames || []);
    if (!ready || !attack) return null;
    const readyFrames = ready.anim.frames || [];
    const attackFrames = attack.anim.frames || [];
    if (!readyFrames.length || !attackFrames.length) return null;
    const lastReady = readyFrames[readyFrames.length - 1] || [];
    const candidates = lastReady.filter((item) => {
      const color = item[3];
      return Array.isArray(color) && Number(color[3] ?? 255) === 0;
    });
    if (candidates.length) {
      const firstAttack = attackFrames[0] || [];
      const confirmedByObject = candidates.find((obj) => firstAttack.some((o) => o[0] === obj[0] && o[1] === obj[1]));
      const confirmedByResource = candidates.find((obj) => firstAttack.some((o) => o[1] === obj[1]));
      const confirmed = confirmedByObject || confirmedByResource;
      if (confirmed) {
        const pos = worldPosition(part, confirmed);
        if (pos) return pos;
      }
    }
    return frontMostPoint(part, lastReady);
  }

  function normalizeMotionType(projectileConfig) {
    const explicit = text(projectileConfig?.motion?.type).toUpperCase();
    if (["LINEAR", "CURVE", "RETURN", "BEAM", "DIRECT", "NONE", "UNKNOWN"].includes(explicit)) return explicit;
    const attackType = text(projectileConfig?.attackType).toUpperCase();
    if (["ENERGY", "WEAPON", "DOUBLE"].includes(attackType)) return "LINEAR";
    if (["ENERGYC", "WEAPONC", "DOUBLEC"].includes(attackType)) return "CURVE";
    if (attackType === "RETURN") return "RETURN";
    if (attackType === "BEAM") return "BEAM";
    if (!attackType || attackType === "NONE") return "NONE";
    if (["PUNCH", "KICK", "SWING", "STAB", "LASER", "ACTION"].includes(attackType)) return "DIRECT";
    return "UNKNOWN";
  }

  function referenceScale() {
    return Math.min(640 / 1400, 360 / 750) * 2.28;
  }

  function referenceFlightDistance(muzzleX, muzzleY, targetX, targetY, endOffsetX, endOffsetY) {
    const scale = referenceScale();
    const rangerX = 640 * RANGER_X_RATIO;
    const targetBaseX = 640 * TARGET_X_RATIO;
    const groundY = 360 * GROUND_Y_RATIO;
    const bodyOriginX = rangerX + BODY_OFFSET_X * scale;
    const bodyOriginY = groundY + BODY_OFFSET_Y * scale;
    const startX = bodyOriginX + muzzleX * scale;
    const startY = bodyOriginY + muzzleY * scale;
    const endX = targetBaseX + (targetX + endOffsetX) * scale;
    const endY = groundY + (targetY + endOffsetY) * scale;
    return Math.hypot(endX - startX, endY - startY) / Math.max(0.001, scale);
  }

  function movementDuration(distance, moveSpeed) {
    const speed = positiveNumber(moveSpeed, 0);
    if (!speed) return 0;
    return clamp(distance / (speed * NATIVE_ACTION_FPS), MIN_FLIGHT_DURATION, MAX_FLIGHT_DURATION);
  }

  function buildProjectile(meta, clip, bodyPart, clipDuration) {
    if (!clip.bullet) return null;
    const projectileConfig = meta?.projectileData?.[clip.dataKey] || null;
    const motionType = normalizeMotionType(projectileConfig);
    if (motionType === "NONE") return null;

    const partName = text(projectileConfig?.animationPart) || clip.bullet;
    const bulletPart = meta?.parts?.[partName] || meta?.parts?.[clip.bullet];
    if (!bulletPart) return null;

    const standardNormal = getAnim(bulletPart, ["normal", "idle", "wait", "shot", "fire", "attack", "_all"]);
    const outboundAnim = motionType === "RETURN"
      ? (getAnim(bulletPart, ["normal_a"]) || standardNormal)
      : standardNormal;
    if (!outboundAnim) return null;
    const returnAnim = motionType === "RETURN"
      ? (getAnim(bulletPart, ["normal_b"]) || outboundAnim)
      : null;
    const finishAnim = getAnim(bulletPart, ["finish", "hit", "end"]);
    const spawnTime = projectileSpawnTime(bodyPart, clip, clipDuration);
    const localNormalDuration = Math.max(1, outboundAnim.anim.frame_count || 0) / Math.max(1, bulletPart.anim_rate || 24);
    const bodyFps = Math.max(1, bodyPart?.anim_rate || 24);
    const legacyNormalDuration = clip.isBasicAttack && (outboundAnim.anim.frame_count || 0) <= 1
      ? 15 / bodyFps
      : localNormalDuration;
    const finishDuration = finishAnim ? animDuration(bulletPart, finishAnim) : 0;
    const muzzle = findMuzzlePoint(bodyPart, clip.ready, clip.trigger);
    const coordinateScale = positiveNumber(meta?.projectileData?.coordinateScale, DEFAULT_PROJECTILE_COORDINATE_SCALE);
    const endOffsetX = finiteNumber(projectileConfig?.end?.x, 0) * coordinateScale;
    const endOffsetY = finiteNumber(projectileConfig?.end?.y, 0) * coordinateScale;
    const distance = referenceFlightDistance(
      muzzle ? muzzle.x : 0,
      muzzle ? muzzle.y : 0,
      clip.targetX || 0,
      clip.targetY || 0,
      endOffsetX,
      endOffsetY,
    );
    const flightDuration = movementDuration(distance, projectileConfig?.moveSpeed);
    const configuredEnabled = projectileConfig?.motion?.enabled;
    const useNativeMotion = configuredEnabled === true && flightDuration > 0;
    const renderMode = useNativeMotion ? motionType : (motionType === "DIRECT" ? "DIRECT" : "LEGACY");
    const beamDuration = positiveNumber(meta?.projectileData?.bullet?.duration, 0) || localNormalDuration;

    let motionDuration;
    if (renderMode === "RETURN") motionDuration = flightDuration * 2;
    else if (renderMode === "BEAM") motionDuration = beamDuration;
    else if (renderMode === "DIRECT") motionDuration = localNormalDuration;
    else if (renderMode === "LINEAR" || renderMode === "CURVE") motionDuration = flightDuration;
    else motionDuration = legacyNormalDuration;

    const includeFinish = renderMode !== "RETURN";
    return {
      partName: bulletPart === meta?.parts?.[partName] ? partName : clip.bullet,
      config: projectileConfig,
      motionType,
      renderMode,
      normalAnimName: outboundAnim.name,
      returnAnimName: returnAnim?.name || outboundAnim.name,
      finishAnimName: finishAnim?.name || "",
      spawnTime,
      flightDuration,
      normalDuration: motionDuration,
      localNormalDuration,
      finishDuration: includeFinish ? finishDuration : 0,
      duration: motionDuration + (includeFinish ? finishDuration : 0),
      muzzleX: muzzle ? muzzle.x : 0,
      muzzleY: muzzle ? muzzle.y : 0,
      targetX: clip.targetX || 0,
      targetY: clip.targetY || 0,
      endOffsetX,
      endOffsetY,
      coordinateScale,
      beamLength: positiveNumber(meta?.projectileData?.bullet?.length, 0),
      loopNormal: renderMode === "LEGACY" ? true : projectileConfig?.motion?.loopNormal !== false,
      rotationMode: text(projectileConfig?.motion?.rotation).toUpperCase() || "FIXED",
    };
  }

  function computeTrack(meta, clipKey) {
    const clip = CLIPS.find((item) => item.key === clipKey) || CLIPS[0];
    if (clip.sequence) {
      const segments = [];
      let cursor = 0;
      clip.sequence.forEach((key) => {
        const child = buildTrack(meta, key);
        if (!child.segments.length) return;
        child.segments.forEach((segment) => segments.push({ ...segment, start: (segment.start || 0) + cursor }));
        cursor += child.duration || 0;
      });
      return { key: clip.key, label: clip.label, segments, duration: cursor || 1 };
    }

    const bodyPart = meta?.parts?.body;
    const bodyAnim = getAnim(bodyPart, clip.body || []);
    if (!bodyAnim) return { key: clip.key, label: clip.label, segments: [], duration: 0 };
    const bodyDuration = animDuration(bodyPart, bodyAnim) || 1;
    const projectile = buildProjectile(meta, clip, bodyPart, bodyDuration);
    const projectileEnd = projectile ? projectile.spawnTime + projectile.duration : 0;
    const duration = Math.max(bodyDuration, projectileEnd, 1);
    return {
      key: clip.key,
      label: clip.label,
      segments: [{ partName: "body", animName: bodyAnim.name, start: 0, duration, bodyDuration, loop: clip.key === "idle", projectile }],
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
    if (available.includes("idle")) return "idle";
    return available[0] || "";
  }

  function renderPanel(unitId, meta) {
    return `
      <section class="detail-section ranger-animation-section" data-animation-unit-id="${escapeHtml(unitId)}">
        <h3>角色動畫</h3>
        <div class="ranger-animation-player">
          <canvas class="ranger-animation-canvas" width="640" height="360" aria-label="角色動畫預覽"></canvas>
          <p class="ranger-animation-hint">可拖曳畫面平移角色動畫位置。</p>
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
    const [sx, sy, sw, sh] = sprite.rect || [];
    if (!sw || !sh) return null;
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (sprite.rotated) {
      ctx.translate(sw / 2, sh / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(atlas, sx, sy, sh, sw, -sh / 2, -sw / 2, sh, sw);
    } else {
      ctx.drawImage(atlas, sx, sy, sw, sh, 0, 0, sw, sh);
    }
    state.spriteCache.set(cacheKey, canvas);
    return canvas;
  }

  function drawSprite(ctx, spriteCanvas, objectMatrix, imageMatrix, color, originX, originY, scale) {
    const [m00, m01, m10, m11, m02, m12] = objectMatrix;
    const [i00, i01, i10, i11, i02, i12] = imageMatrix;
    const w = spriteCanvas.width;
    const h = spriteCanvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const postCx = i00 * cx + i01 * cy + i02;
    const postCy = i10 * cx + i11 * cy + i12;
    const worldCx = m00 * postCx + m01 * postCy + m02;
    const worldCy = m10 * postCx + m11 * postCy + m12;
    const f00 = m00 * i00 + m01 * i10;
    const f01 = m00 * i01 + m01 * i11;
    const f10 = m10 * i00 + m11 * i10;
    const f11 = m10 * i01 + m11 * i11;
    const det = f00 * f11 - f01 * f10;
    const scaleX = Math.hypot(f00, f10);
    const scaleY = Math.hypot(f01, f11);
    const flipX = det < 0;
    const angle = flipX ? Math.atan2(-f10, -f00) : Math.atan2(f10, f00);
    const alpha = Array.isArray(color) ? Number(color[3] ?? 255) / 255 : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.translate(originX + worldCx * scale, originY + worldCy * scale);
    ctx.rotate(angle);
    ctx.scale((flipX ? -1 : 1) * scaleX * scale, scaleY * scale);
    ctx.drawImage(spriteCanvas, -w / 2, -h / 2);
    ctx.restore();
  }

  async function drawSamFrame(ctx, part, animName, frameIndexValue, originX, originY, scale) {
    const anim = part?.animations?.[animName];
    if (!part || !anim?.frames?.length) return false;
    const atlas = await loadImage(part.png);
    if (!atlas) return false;
    const frame = anim.frames[Math.max(0, Math.min(frameIndexValue, anim.frame_count - 1))] || [];
    let drawn = false;
    for (const item of frame) {
      const [, resNum, objectMatrix, color] = item;
      const imageDef = part.images?.[resNum];
      if (!imageDef || !Array.isArray(objectMatrix) || !Array.isArray(imageDef.m)) continue;
      const spriteCanvas = getSpriteCanvas(part, atlas, imageDef.name);
      if (!spriteCanvas) continue;
      drawSprite(ctx, spriteCanvas, objectMatrix, imageDef.m, color, originX, originY, scale);
      drawn = true;
    }
    return drawn;
  }

  async function drawRotatedSamFrame(ctx, part, animName, frameIndexValue, originX, originY, scale, rotationDegrees = 0) {
    if (!rotationDegrees) return drawSamFrame(ctx, part, animName, frameIndexValue, originX, originY, scale);
    ctx.save();
    ctx.translate(originX, originY);
    ctx.rotate(rotationDegrees * Math.PI / 180);
    const drawn = await drawSamFrame(ctx, part, animName, frameIndexValue, 0, 0, scale);
    ctx.restore();
    return drawn;
  }

  function frameIndex(part, animName, elapsed, loop = false) {
    const anim = part?.animations?.[animName];
    if (!part || !anim?.frames?.length) return 0;
    const rawFrame = Math.floor(elapsed * Math.max(1, part.anim_rate || 24));
    return loop ? rawFrame % anim.frame_count : Math.min(anim.frame_count - 1, Math.max(0, rawFrame));
  }

  function lerp(start, end, progress) {
    const t = clamp(progress, 0, 1);
    return start + (end - start) * t;
  }

  function cubicBezierPoint(p0, p1, p2, p3, progress) {
    const t = clamp(progress, 0, 1);
    const u = 1 - t;
    const uu = u * u;
    const tt = t * t;
    return {
      x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
      y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
    };
  }

  function projectileRotation(projectile, progress) {
    if (projectile.rotationMode !== "ANGLE_LERP") return 0;
    const start = finiteNumber(projectile.config?.angle?.start, 0);
    const end = finiteNumber(projectile.config?.angle?.end, start);
    return lerp(start, end, progress);
  }

  function partVisualWidth(part) {
    let width = 0;
    for (const sprite of Object.values(part?.sprites || {})) {
      const rect = sprite?.rect;
      if (Array.isArray(rect)) width = Math.max(width, finiteNumber(rect[2], 0));
    }
    return width || 64;
  }

  async function drawProjectileAnimation(ctx, bulletPart, animName, age, loop, x, y, scale, rotation = 0) {
    const bulletFrame = frameIndex(bulletPart, animName, age, loop);
    return drawRotatedSamFrame(ctx, bulletPart, animName, bulletFrame, x, y, scale, rotation);
  }

  async function drawFinish(ctx, bulletPart, projectile, finishAge, endX, endY, scale) {
    if (!projectile.finishAnimName || finishAge < 0 || finishAge > projectile.finishDuration) return;
    const finishFrame = frameIndex(bulletPart, projectile.finishAnimName, finishAge, false);
    await drawSamFrame(ctx, bulletPart, projectile.finishAnimName, finishFrame, endX, endY, scale);
  }

  async function drawBeam(ctx, bulletPart, projectile, age, startX, startY, endX, endY, scale) {
    if (age > projectile.normalDuration) {
      await drawFinish(ctx, bulletPart, projectile, age - projectile.normalDuration, endX, endY, scale);
      return;
    }
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.hypot(dx, dy);
    const configuredLength = projectile.beamLength * projectile.coordinateScale * scale;
    const segmentLength = Math.max(4, configuredLength || partVisualWidth(bulletPart) * scale * 0.8);
    const segmentCount = Math.min(128, Math.max(1, Math.ceil(distance / segmentLength) + 1));
    const rotation = Math.atan2(dy, dx) * 180 / Math.PI;
    for (let index = 0; index < segmentCount; index += 1) {
      const progress = segmentCount === 1 ? 0 : index / (segmentCount - 1);
      await drawProjectileAnimation(
        ctx,
        bulletPart,
        projectile.normalAnimName,
        age,
        true,
        lerp(startX, endX, progress),
        lerp(startY, endY, progress),
        scale,
        rotation,
      );
    }
  }

  async function drawSegment(ctx, meta, segment, segmentAge, layout, scale) {
    const bodyPart = meta?.parts?.body;
    if (!bodyPart) return;
    const bodyAge = segment.loop ? segmentAge : Math.min(segmentAge, Math.max(0, (segment.bodyDuration || segment.duration) - 0.001));
    const bodyFrame = frameIndex(bodyPart, segment.animName, bodyAge, segment.loop);
    await drawSamFrame(ctx, bodyPart, segment.animName, bodyFrame, layout.bodyOriginX, layout.bodyOriginY, scale);

    const projectile = segment.projectile;
    if (!projectile) return;
    const projectileAge = segmentAge - projectile.spawnTime;
    if (projectileAge < 0 || projectileAge > projectile.duration) return;
    const bulletPart = meta?.parts?.[projectile.partName];
    if (!bulletPart) return;

    const startX = layout.bodyOriginX + (projectile.muzzleX || 0) * scale;
    const startY = layout.bodyOriginY + (projectile.muzzleY || 0) * scale;
    const endX = layout.targetX + (projectile.targetX + projectile.endOffsetX) * scale;
    const endY = layout.groundY + (projectile.targetY + projectile.endOffsetY) * scale;

    if (projectile.renderMode === "BEAM") {
      await drawBeam(ctx, bulletPart, projectile, projectileAge, startX, startY, endX, endY, scale);
      return;
    }

    if (projectile.renderMode === "DIRECT") {
      if (projectileAge < projectile.normalDuration || !projectile.finishAnimName) {
        await drawProjectileAnimation(ctx, bulletPart, projectile.normalAnimName, projectileAge, projectile.loopNormal, endX, endY, scale);
      } else {
        await drawFinish(ctx, bulletPart, projectile, projectileAge - projectile.normalDuration, endX, endY, scale);
      }
      return;
    }

    if (projectile.renderMode === "RETURN") {
      const flightDuration = Math.max(MIN_FLIGHT_DURATION, projectile.flightDuration);
      if (projectileAge < flightDuration) {
        const progress = projectileAge / flightDuration;
        await drawProjectileAnimation(
          ctx,
          bulletPart,
          projectile.normalAnimName,
          projectileAge,
          true,
          lerp(startX, endX, progress),
          lerp(startY, endY, progress),
          scale,
          projectileRotation(projectile, progress),
        );
        return;
      }
      const rawStartX = finiteNumber(projectile.config?.start?.x, 0);
      const rawStartY = finiteNumber(projectile.config?.start?.y, 0);
      const rawSecondX = finiteNumber(projectile.config?.secondStart?.x, rawStartX);
      const rawSecondY = finiteNumber(projectile.config?.secondStart?.y, rawStartY);
      const returnEndX = startX + (rawSecondX - rawStartX) * projectile.coordinateScale * scale;
      const returnEndY = startY + (rawSecondY - rawStartY) * projectile.coordinateScale * scale;
      const returnAge = projectileAge - flightDuration;
      const progress = returnAge / flightDuration;
      await drawProjectileAnimation(
        ctx,
        bulletPart,
        projectile.returnAnimName,
        returnAge,
        true,
        lerp(endX, returnEndX, progress),
        lerp(endY, returnEndY, progress),
        scale,
        projectileRotation(projectile, 1 - progress),
      );
      return;
    }

    if (projectileAge < projectile.normalDuration || !projectile.finishAnimName) {
      const progress = projectileAge / Math.max(0.001, projectile.normalDuration);
      let position = {
        x: lerp(startX, endX, progress),
        y: lerp(startY, endY, progress),
      };
      if (projectile.renderMode === "CURVE") {
        const distance = Math.hypot(endX - startX, endY - startY);
        const direction = endX >= startX ? 1 : -1;
        position = cubicBezierPoint(
          { x: startX, y: startY },
          { x: startX, y: startY },
          {
            x: (startX + endX) * 0.5 + direction * distance * 0.4,
            y: (startY + endY) * 0.5 - distance * 0.4,
          },
          { x: endX, y: endY },
          progress,
        );
      }
      await drawProjectileAnimation(
        ctx,
        bulletPart,
        projectile.normalAnimName,
        projectileAge,
        projectile.loopNormal,
        position.x,
        position.y,
        scale,
        projectileRotation(projectile, progress),
      );
      return;
    }

    await drawFinish(ctx, bulletPart, projectile, projectileAge - projectile.normalDuration, endX, endY, scale);
  }

  async function drawTrack(canvas, meta, track, elapsed) {
    const ctx = canvas.getContext("2d");
    if (!ctx || !track) return;
    const width = canvas.width;
    const height = canvas.height;
    const scale = Math.min(width / 1400, height / 750) * 2.28 * (state.zoom || 1);
    const layout = {
      rangerX: width * RANGER_X_RATIO + state.panX,
      targetX: width * TARGET_X_RATIO + state.panX,
      groundY: height * GROUND_Y_RATIO + state.panY,
    };
    layout.bodyOriginX = layout.rangerX + BODY_OFFSET_X * scale;
    layout.bodyOriginY = layout.groundY + BODY_OFFSET_Y * scale;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(0, Math.round(layout.groundY), width, 1);
    ctx.restore();

    const t = track.duration ? elapsed % track.duration : elapsed;
    for (const segment of track.segments) {
      const start = segment.start || 0;
      const end = start + segment.duration;
      if (t < start || t > end) continue;
      await drawSegment(ctx, meta, segment, t - start, layout, scale);
    }
  }

  function stopPlayback() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = 0;
  }
  function playLoop(timestamp) {
    if (!state.activeCanvas || !state.activeMeta) return;
    if (!timestamp || timestamp - state.lastDrawAt >= FRAME_INTERVAL_MS) {
      state.lastDrawAt = timestamp || performance.now();
      const track = buildTrack(state.activeMeta, state.activeClip);
      drawTrack(state.activeCanvas, state.activeMeta, track, (performance.now() - state.startedAt) / 1000);
    }
    state.rafId = requestAnimationFrame(playLoop);
  }
  function startPlayback(section) {
    stopPlayback();
    state.activeSection = section;
    state.activeCanvas = section.querySelector(".ranger-animation-canvas");
    state.startedAt = performance.now();
    state.lastDrawAt = 0;
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
    ["pointerup", "pointercancel", "pointerleave"].forEach((name) => canvas.addEventListener(name, (event) => {
      state.dragging = false;
      canvas.releasePointerCapture?.(event.pointerId);
      canvas.classList.remove("dragging");
    }));
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
    state.activeMeta = meta;
    state.activeCanvas = canvas;
    state.activeClip = select.value || defaultKey;
    state.zoom = Number(zoom?.value) || 1;
    state.panX = 0;
    state.panY = 0;
    bindDrag(canvas);
    select.addEventListener("change", () => {
      state.activeClip = select.value || defaultKey;
      startPlayback(section);
    });
    zoom?.addEventListener("input", () => {
      state.zoom = Number(zoom.value) || 1;
      if (zoomText) zoomText.textContent = `${Math.round(state.zoom * 100)}%`;
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
