(() => {
  const ANIMATION_META_BASE = "https://res.warmycat.com/animation_meta/";
  const INDEX_URL = `${ANIMATION_META_BASE}index.json`;
  const RESOURCE_PRIMARY_BASE = "https://res.warmycat.com/";
  const RESOURCE_FALLBACK_BASE = "https://rangers.lerico.net/res/";
  const OLD_PRIMARY_PREFIX = "res_from_emulator/";

  const PROJECTILE_SOURCE_ANCHOR = { x: 0.78, y: 0.38 };
  const PROJECTILE_TARGET = {
    bul: { x: 0, y: 0, isBasicAttack: true },
    bul2: { x: 0, y: 0, isBasicAttack: false },
    bul3: { x: 0, y: 0, isBasicAttack: false },
  };
  const TARGET_DISTANCE_RATIO = 0.40;
  const FRAME_INTERVAL_MS = 1000 / 30;

  const CLIPS = [
    { key: "idle", label: "待機", body: ["idle", "wait"] },
    { key: "move", label: "移動", body: ["walk"] },
    { key: "knockback", label: "被擊退", body: ["knockback"] },
    { key: "attack", label: "一般攻擊", body: ["attack_all"], ready: ["attack_ready"], trigger: ["attack"], bullet: "bul" },
    { key: "skill1", label: "技能1", body: ["s_attack_all"], ready: ["s_attack_ready"], trigger: ["s_attack"], bullet: "bul2" },
    { key: "skill2", label: "技能2", body: ["s2_attack_all"], ready: ["s2_attack_ready"], trigger: ["s2_attack", "skill"], bullet: "bul3" },
    { key: "full", label: "完整", sequence: ["move", "idle", "attack", "skill1", "skill2", "knockback"] },
  ];

  const state = {
    indexPromise: null,
    metaCache: new Map(),
    imageCache: new Map(),
    spriteCache: new Map(),
    trackCache: new WeakMap(),
    frameBoundsCache: new WeakMap(),
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
    if (!state.indexPromise) state.indexPromise = fetch(INDEX_URL).then((res) => res.ok ? res.json() : null).catch(() => null);
    return state.indexPromise;
  }
  async function loadMeta(unitId) {
    if (!unitId) return null;
    if (state.metaCache.has(unitId)) return state.metaCache.get(unitId);
    const index = await loadIndex();
    const entry = index?.units?.[unitId];
    if (!entry?.meta) return null;
    const meta = await fetch(animationMetaUrl(entry.meta, unitId)).then((res) => res.ok ? res.json() : null).catch(() => null);
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
  function stageRect(part) {
    const canvas = part?.canvas || {};
    const x = Number(canvas.x || 0);
    const y = Number(canvas.y || 0);
    const w = Number(canvas.w || 0) || 240;
    const h = Number(canvas.h || 0) || 240;
    return { x, y, w, h, right: x + w, bottom: y + h };
  }
  function bodyBounds(meta) {
    const rect = stageRect(meta?.parts?.body);
    return {
      x: rect.x,
      y: rect.y,
      right: rect.right + 420,
      bottom: rect.bottom,
      w: Math.max(1, rect.w + 420),
      h: Math.max(1, rect.h),
    };
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
  function projectileDurationSeconds(bodyPart, normalAnim, isBasicAttack) {
    const normalCount = normalAnim?.anim?.frame_count || 0;
    const bodyFps = Math.max(1, bodyPart?.anim_rate || 24);
    if (isBasicAttack && normalCount <= 1) return 15 / bodyFps;
    return Math.max(1, normalCount) / bodyFps;
  }
  function buildProjectile(meta, clip, bodyPart, clipDuration) {
    if (!clip.bullet) return null;
    const bulletPart = meta?.parts?.[clip.bullet];
    if (!bulletPart) return null;
    const normalAnim = getAnim(bulletPart, ["normal", "idle", "wait", "shot", "fire", "attack", "_all"]);
    if (!normalAnim) return null;
    const finishAnim = getAnim(bulletPart, ["finish", "hit", "end"]);
    const config = PROJECTILE_TARGET[clip.bullet] || PROJECTILE_TARGET.bul;
    const spawnTime = projectileSpawnTime(bodyPart, clip, clipDuration);
    const normalDuration = projectileDurationSeconds(bodyPart, normalAnim, config.isBasicAttack);
    const finishDuration = finishAnim ? finishAnim.anim.frame_count / Math.max(1, bodyPart.anim_rate || 24) : 0;
    return {
      partName: clip.bullet,
      normalAnimName: normalAnim.name,
      finishAnimName: finishAnim?.name || "",
      spawnTime,
      normalDuration,
      finishDuration,
      targetOffsetX: config.x,
      targetOffsetY: config.y,
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
    const duration = animDuration(bodyPart, bodyAnim) || 1;
    const projectile = buildProjectile(meta, clip, bodyPart, duration);
    return {
      key: clip.key,
      label: clip.label,
      segments: [{ partName: "body", animName: bodyAnim.name, start: 0, duration, loop: clip.key === "idle", projectile }],
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
    canvas.width = sw; canvas.height = sh;
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
  function transformPoint(objectMatrix, imageMatrix, x, y) {
    const [m00, m01, m10, m11, m02, m12] = objectMatrix;
    const [i00, i01, i10, i11, i02, i12] = imageMatrix;
    const postX = i00 * x + i01 * y + i02;
    const postY = i10 * x + i11 * y + i12;
    return {
      x: m00 * postX + m01 * postY + m02,
      y: m10 * postX + m11 * postY + m12,
    };
  }
  function frameBounds(part, animName, frameIndex) {
    const anim = part?.animations?.[animName];
    if (!part || !anim?.frames?.length) return null;
    if (!state.frameBoundsCache.has(part)) state.frameBoundsCache.set(part, new Map());
    const cache = state.frameBoundsCache.get(part);
    const key = `${animName}:${frameIndex}`;
    if (cache.has(key)) return cache.get(key);

    const frame = anim.frames[Math.max(0, Math.min(frameIndex, anim.frame_count - 1))] || [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const item of frame) {
      const [, resNum, objectMatrix] = item;
      const imageDef = part.images?.[resNum];
      const sprite = imageDef ? part.sprites?.[imageDef.name] : null;
      if (!imageDef || !sprite || !Array.isArray(objectMatrix) || !Array.isArray(imageDef.m)) continue;
      const [, , sw, sh] = sprite.rect || [];
      if (!sw || !sh) continue;
      [[0, 0], [sw, 0], [0, sh], [sw, sh]].forEach(([x, y]) => {
        const point = transformPoint(objectMatrix, imageDef.m, x, y);
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
    }
    const bounds = Number.isFinite(minX) ? {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    } : null;
    cache.set(key, bounds);
    return bounds;
  }
  function drawSprite(ctx, spriteCanvas, objectMatrix, imageMatrix, color, originX, originY, scale) {
    const [m00, m01, m10, m11, m02, m12] = objectMatrix;
    const [i00, i01, i10, i11, i02, i12] = imageMatrix;
    const w = spriteCanvas.width, h = spriteCanvas.height, cx = w * 0.5, cy = h * 0.5;
    const postCx = i00 * cx + i01 * cy + i02, postCy = i10 * cx + i11 * cy + i12;
    const worldCx = m00 * postCx + m01 * postCy + m02, worldCy = m10 * postCx + m11 * postCy + m12;
    const f00 = m00 * i00 + m01 * i10, f01 = m00 * i01 + m01 * i11, f10 = m10 * i00 + m11 * i10, f11 = m10 * i01 + m11 * i11;
    const det = f00 * f11 - f01 * f10, scaleX = Math.hypot(f00, f10), scaleY = Math.hypot(f01, f11), flipX = det < 0;
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
  async function drawFrameAtOrigin(ctx, part, animName, frameIndex, originX, originY, scale) {
    const anim = part?.animations?.[animName];
    if (!part || !anim?.frames?.length) return false;
    const atlas = await loadImage(part.png);
    if (!atlas) return false;
    const frame = anim.frames[Math.max(0, Math.min(frameIndex, anim.frame_count - 1))] || [];
    let drawn = false;
    for (const item of frame) {
      const [, resNum, objectMatrix, color] = item;
      const imageDef = part.images?.[resNum];
      if (!imageDef || !Array.isArray(objectMatrix) || !Array.isArray(imageDef.m)) continue;
      const spriteCanvas = getSpriteCanvas(part, atlas, imageDef.name);
      if (spriteCanvas) {
        drawSprite(ctx, spriteCanvas, objectMatrix, imageDef.m, color, originX, originY, scale);
        drawn = true;
      }
    }
    return drawn;
  }
  async function drawFrameAtCenter(ctx, part, animName, frameIndex, centerX, centerY, scale) {
    const bounds = frameBounds(part, animName, frameIndex);
    const originX = centerX - (bounds?.centerX || 0) * scale;
    const originY = centerY - (bounds?.centerY || 0) * scale;
    return drawFrameAtOrigin(ctx, part, animName, frameIndex, originX, originY, scale);
  }
  function frameIndexForSegment(part, segment, elapsed) {
    const anim = part?.animations?.[segment.animName];
    if (!part || !anim?.frames?.length) return 0;
    const fps = Math.max(1, part.anim_rate || 24);
    const rawFrame = Math.floor(elapsed * fps);
    return segment.loop ? rawFrame % anim.frame_count : Math.min(anim.frame_count - 1, rawFrame);
  }
  async function drawBodySegment(ctx, meta, segment, elapsed, bodyOriginX, bodyOriginY, scale) {
    const part = meta?.parts?.body;
    if (!part) return;
    const anim = part.animations?.[segment.animName];
    if (!anim?.frames?.length) return;
    const frameIndex = frameIndexForSegment(part, segment, elapsed);
    await drawFrameAtOrigin(ctx, part, segment.animName, frameIndex, bodyOriginX, bodyOriginY, scale);
  }
  async function drawProjectile(ctx, meta, projectile, projectileAge, bodyOriginX, bodyOriginY, targetDistance, scale, bodySegment, bodySegmentAge) {
    if (!projectile || projectileAge < 0) return;
    const part = meta?.parts?.[projectile.partName];
    const bodyPart = meta?.parts?.body;
    if (!part || !bodyPart || !bodySegment) return;
    const bodyFps = Math.max(1, bodyPart.anim_rate || 24);
    const bodyFrameIndex = frameIndexForSegment(bodyPart, bodySegment, bodySegmentAge);
    const bodyFrameBounds = frameBounds(bodyPart, bodySegment.animName, bodyFrameIndex);
    const bodyRect = stageRect(bodyPart);
    const minX = bodyFrameBounds?.minX ?? 0;
    const minY = bodyFrameBounds?.minY ?? 0;
    const width = bodyFrameBounds?.width ?? bodyRect.w;
    const height = bodyFrameBounds?.height ?? bodyRect.h;
    const sourceX = bodyOriginX + (minX + width * PROJECTILE_SOURCE_ANCHOR.x) * scale;
    const sourceY = bodyOriginY + (minY + height * PROJECTILE_SOURCE_ANCHOR.y) * scale;
    const startX = sourceX;
    const startY = sourceY;
    const endX = sourceX + targetDistance + projectile.targetOffsetX * scale;
    const endY = sourceY + projectile.targetOffsetY * scale;

    if (projectileAge < projectile.normalDuration) {
      const normalAnim = part.animations?.[projectile.normalAnimName];
      if (!normalAnim?.frames?.length) return;
      const p = Math.min(1, Math.max(0, projectileAge / Math.max(0.001, projectile.normalDuration)));
      const x = startX + (endX - startX) * p;
      const y = startY + (endY - startY) * p;
      const rawFrame = Math.floor(projectileAge * bodyFps);
      const frameIndex = rawFrame % Math.max(1, normalAnim.frame_count);
      await drawFrameAtCenter(ctx, part, projectile.normalAnimName, frameIndex, x, y, scale);
      return;
    }

    if (!projectile.finishAnimName) return;
    const finishAnim = part.animations?.[projectile.finishAnimName];
    if (!finishAnim?.frames?.length) return;
    const finishAge = projectileAge - projectile.normalDuration;
    if (finishAge > projectile.finishDuration) return;
    const frameIndex = Math.min(finishAnim.frame_count - 1, Math.max(0, Math.floor(finishAge * bodyFps)));
    await drawFrameAtCenter(ctx, part, projectile.finishAnimName, frameIndex, endX, endY, scale);
  }
  async function drawTrack(canvas, meta, track, elapsed) {
    const ctx = canvas.getContext("2d");
    if (!ctx || !track) return;
    const width = canvas.width, height = canvas.height;
    const bounds = bodyBounds(meta);
    const fitScale = Math.min(width / bounds.w, height / bounds.h) * 0.82;
    const scale = fitScale * (state.zoom || 1);
    const baseX = (width - bounds.w * scale) / 2 - bounds.x * scale + state.panX;
    const baseY = (height - bounds.h * scale) / 2 - bounds.y * scale + state.panY;
    const bodyRect = stageRect(meta?.parts?.body);
    const bodyOriginX = baseX + bodyRect.x * scale;
    const bodyOriginY = baseY + bodyRect.y * scale;
    const targetDistance = width * TARGET_DISTANCE_RATIO;

    ctx.clearRect(0, 0, width, height);
    ctx.save(); ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(0, Math.round(height * 0.76), width, 1); ctx.restore();

    const t = track.duration ? elapsed % track.duration : elapsed;
    for (const segment of track.segments) {
      const start = segment.start || 0;
      const end = start + segment.duration;
      if (t < start || t > end) continue;
      const segmentAge = t - start;
      await drawBodySegment(ctx, meta, segment, segmentAge, bodyOriginX, bodyOriginY, scale);
      if (segment.projectile) {
        await drawProjectile(ctx, meta, segment.projectile, segmentAge - segment.projectile.spawnTime, bodyOriginX, bodyOriginY, targetDistance, scale, segment, segmentAge);
      }
    }
  }

  function stopPlayback() { if (state.rafId) cancelAnimationFrame(state.rafId); state.rafId = 0; }
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
    const select = section.querySelector(".ranger-animation-select"), zoom = section.querySelector(".ranger-animation-zoom"), zoomText = section.querySelector(".ranger-animation-zoom-percent"), canvas = section.querySelector(".ranger-animation-canvas");
    if (!select || !canvas) return;
    const defaultKey = defaultClipKey(meta);
    if (defaultKey) select.value = defaultKey;
    if (zoom) zoom.value = "1";
    state.activeMeta = meta; state.activeCanvas = canvas; state.activeClip = select.value || defaultKey;
    state.zoom = Number(zoom?.value) || 1;
    state.panX = 0; state.panY = 0;
    bindDrag(canvas);
    select.addEventListener("change", () => { state.activeClip = select.value || defaultKey; startPlayback(section); });
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
  window.addEventListener("load", () => { const modalContent = document.getElementById("rangerModalContent"); if (modalContent) observer.observe(modalContent, { childList: true }); patchModal(); });
  document.addEventListener("click", (event) => { if (event.target?.id === "rangerModalCloseBtn" || event.target?.id === "rangerModal") stopPlayback(); });
})();
