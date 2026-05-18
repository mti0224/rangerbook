(() => {
  const INDEX_URL = "../res/animation_meta/index.json";
  const RESOURCE_PRIMARY_BASE = "https://rangerbook.warmycat.com/";
  const RESOURCE_FALLBACK_BASE = "https://rangers.lerico.net/res/";
  const DEFAULT_BODY_OFFSET_X = -130;
  const DEFAULT_BODY_OFFSET_Y = -88;

  const CLIPS = [
    { key: "wait", label: "待機", body: ["wait"] },
    { key: "move", label: "移動", body: ["move"] },
    { key: "knockback", label: "被擊退", body: ["hit", "damage", "knockback", "down", "finish"] },
    { key: "attack", label: "一般攻擊", body: ["attack_ready", "attack"], bullet: { part: "bul", names: ["_all"] } },
    { key: "skill1", label: "技能1", body: ["s_attack_ready", "s_attack"], bullet: { part: "bul2", names: ["_all"] } },
    { key: "skill2", label: "技能2", body: ["s2_attack_ready", "s2_attack"], bullet: { part: "bul3", names: ["_all"] } },
    { key: "full", label: "完整", sequence: ["move", "wait", "attack", "skill1", "skill2", "knockback"] },
  ];

  const state = {
    indexPromise: null,
    metaCache: new Map(),
    imageCache: new Map(),
    spriteCache: new Map(),
    rafId: 0,
    startedAt: 0,
    activeCanvas: null,
    activeSection: null,
    activeMeta: null,
    activeClip: "wait",
    zoom: 1,
  };

  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
  function escapeHtml(value) {
    return text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  function resourceUrl(path) { return `${RESOURCE_PRIMARY_BASE}${String(path || "").replace(/^\/+/, "")}`; }
  function legacyResourceUrl(path) {
    const normalized = String(path || "").replace(/^\/+/, "");
    return normalized.startsWith("res_from_emulator/") ? RESOURCE_FALLBACK_BASE + normalized.slice("res_from_emulator/".length) : "";
  }
  function loadIndex() {
    if (!state.indexPromise) {
      state.indexPromise = fetch(INDEX_URL).then((res) => res.ok ? res.json() : null).catch(() => null);
    }
    return state.indexPromise;
  }
  async function loadMeta(unitId) {
    if (!unitId) return null;
    if (state.metaCache.has(unitId)) return state.metaCache.get(unitId);
    const index = await loadIndex();
    const entry = index?.units?.[unitId];
    if (!entry?.meta) return null;
    const meta = await fetch(`../${entry.meta}`).then((res) => res.ok ? res.json() : null).catch(() => null);
    state.metaCache.set(unitId, meta);
    return meta;
  }
  function loadImage(path) {
    const key = path || "";
    if (state.imageCache.has(key)) return state.imageCache.get(key);
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      const fallback = legacyResourceUrl(path);
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => {
        if (fallback && img.src !== fallback) { img.src = fallback; return; }
        reject(new Error(`Image failed: ${path}`));
      };
      img.src = resourceUrl(path);
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
  function buildTrack(meta, clipKey) {
    const clip = CLIPS.find((item) => item.key === clipKey) || CLIPS[0];
    if (clip.sequence) {
      const segments = [];
      let cursor = 0;
      clip.sequence.forEach((key) => {
        const child = buildTrack(meta, key);
        child.segments.forEach((segment) => segments.push({ ...segment, start: (segment.start || 0) + cursor }));
        cursor += child.duration || 0;
      });
      return { key: clip.key, label: clip.label, segments, duration: cursor || 1 };
    }
    const body = meta?.parts?.body;
    const bodyAnim = getAnim(body, clip.body || ["wait", "_all"]);
    const segments = [];
    if (bodyAnim) {
      const duration = bodyAnim.anim.frame_count / Math.max(1, body.anim_rate || 24);
      segments.push({ partName: "body", animName: bodyAnim.name, start: 0, duration, loop: false });
      if (clip.bullet) {
        const bulletPart = meta?.parts?.[clip.bullet.part];
        const bulletAnim = getAnim(bulletPart, clip.bullet.names || ["_all"]);
        if (bulletAnim) segments.push({ partName: clip.bullet.part, animName: bulletAnim.name, start: 0, duration, loop: true });
      }
      return { key: clip.key, label: clip.label, segments, duration: duration || 1 };
    }
    const fallback = getAnim(body, ["wait", "_all"]);
    if (fallback) {
      const duration = fallback.anim.frame_count / Math.max(1, body.anim_rate || 24);
      segments.push({ partName: "body", animName: fallback.name, start: 0, duration, loop: true });
      return { key: clip.key, label: clip.label, segments, duration };
    }
    return { key: clip.key, label: clip.label, segments: [], duration: 1 };
  }
  function clipOptions(meta) {
    return CLIPS.map((clip) => {
      const track = buildTrack(meta, clip.key);
      return `<option value="${escapeHtml(clip.key)}"${track.segments.length ? "" : " disabled"}>${escapeHtml(clip.label)}</option>`;
    }).join("");
  }
  function renderPanel(unitId, meta) {
    return `
      <section class="detail-section ranger-animation-section" data-animation-unit-id="${escapeHtml(unitId)}">
        <h3>角色動畫</h3>
        <div class="ranger-animation-player">
          <canvas class="ranger-animation-canvas" width="640" height="360" aria-label="角色動畫預覽"></canvas>
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
    const cacheKey = `${part.png}|${imageName}`;
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
      ctx.translate(sw / 2, sh / 2); ctx.rotate(-Math.PI / 2); ctx.drawImage(atlas, sx, sy, sh, sw, -sh / 2, -sw / 2, sh, sw);
    } else ctx.drawImage(atlas, sx, sy, sw, sh, 0, 0, sw, sh);
    state.spriteCache.set(cacheKey, canvas);
    return canvas;
  }
  function drawSprite(ctx, spriteCanvas, objectMatrix, imageMatrix, color, originX, originY, zoom) {
    const [m00, m01, m10, m11, m02, m12] = objectMatrix;
    const [i00, i01, i10, i11, i02, i12] = imageMatrix;
    const w = spriteCanvas.width, h = spriteCanvas.height, cx = w * 0.5, cy = h * 0.5;
    const postCx = i00 * cx + i01 * cy + i02, postCy = i10 * cx + i11 * cy + i12;
    const worldCx = m00 * postCx + m01 * postCy + m02, worldCy = m10 * postCx + m11 * postCy + m12;
    const f00 = m00 * i00 + m01 * i10, f01 = m00 * i01 + m01 * i11, f10 = m10 * i00 + m11 * i10, f11 = m10 * i01 + m11 * i11;
    const det = f00 * f11 - f01 * f10, scaleX = Math.hypot(f00, f10), scaleY = Math.hypot(f01, f11), flipX = det < 0;
    const angle = flipX ? Math.atan2(-f10, -f00) : Math.atan2(f10, f00);
    const alpha = Array.isArray(color) ? Number(color[3] ?? 255) / 255 : 1;
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, alpha)); ctx.translate(originX + worldCx * zoom, originY + worldCy * zoom); ctx.rotate(angle); ctx.scale((flipX ? -1 : 1) * scaleX * zoom, scaleY * zoom); ctx.drawImage(spriteCanvas, -w / 2, -h / 2); ctx.restore();
  }
  async function drawPartFrame(ctx, meta, partName, animName, elapsed, originX, originY, zoom, loop) {
    const part = meta?.parts?.[partName], anim = part?.animations?.[animName];
    if (!part || !anim?.frames?.length) return;
    const atlas = await loadImage(part.png); if (!atlas) return;
    const fps = Math.max(1, part.anim_rate || 24);
    const rawFrame = Math.floor(elapsed * fps);
    const frameIndex = loop ? rawFrame % anim.frame_count : Math.min(anim.frame_count - 1, rawFrame);
    const frame = anim.frames[frameIndex] || [];
    for (const item of frame) {
      const [, resNum, objectMatrix, color] = item;
      const imageDef = part.images?.[resNum];
      if (!imageDef || !Array.isArray(objectMatrix) || !Array.isArray(imageDef.m)) continue;
      const spriteCanvas = getSpriteCanvas(part, atlas, imageDef.name);
      if (spriteCanvas) drawSprite(ctx, spriteCanvas, objectMatrix, imageDef.m, color, originX, originY, zoom);
    }
  }
  async function drawTrack(canvas, meta, track, elapsed) {
    const ctx = canvas.getContext("2d"); if (!ctx || !track) return;
    const width = canvas.width, height = canvas.height, zoom = state.zoom || 1;
    const originX = width * 0.5 + DEFAULT_BODY_OFFSET_X * zoom, originY = height * 0.78 + DEFAULT_BODY_OFFSET_Y * zoom;
    ctx.clearRect(0, 0, width, height); ctx.save(); ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(0, Math.round(height * 0.78), width, 1); ctx.restore();
    const t = track.duration ? elapsed % track.duration : elapsed;
    for (const segment of track.segments) {
      const start = segment.start || 0, end = start + segment.duration;
      if (t >= start && t <= end) await drawPartFrame(ctx, meta, segment.partName, segment.animName, t - start, originX, originY, zoom, segment.loop);
    }
  }
  function stopPlayback() { if (state.rafId) cancelAnimationFrame(state.rafId); state.rafId = 0; }
  function playLoop() {
    if (!state.activeCanvas || !state.activeMeta) return;
    const track = buildTrack(state.activeMeta, state.activeClip);
    drawTrack(state.activeCanvas, state.activeMeta, track, (performance.now() - state.startedAt) / 1000);
    state.rafId = requestAnimationFrame(playLoop);
  }
  function startPlayback(section) {
    stopPlayback(); state.activeSection = section; state.activeCanvas = section.querySelector(".ranger-animation-canvas"); state.startedAt = performance.now(); state.rafId = requestAnimationFrame(playLoop);
  }
  function bindPanel(section, meta) {
    const select = section.querySelector(".ranger-animation-select"), zoom = section.querySelector(".ranger-animation-zoom"), zoomText = section.querySelector(".ranger-animation-zoom-percent"), canvas = section.querySelector(".ranger-animation-canvas");
    if (!select || !canvas) return;
    state.activeMeta = meta; state.activeCanvas = canvas; state.activeClip = select.value || "wait";
    select.addEventListener("change", () => { state.activeClip = select.value || "wait"; startPlayback(section); });
    zoom?.addEventListener("input", () => { state.zoom = Number(zoom.value) || 1; if (zoomText) zoomText.textContent = `${Math.round(state.zoom * 100)}%`; });
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
  const observer = new MutationObserver(() => { stopPlayback(); window.setTimeout(patchModal, 0); });
  window.addEventListener("load", () => { const modalContent = document.getElementById("rangerModalContent"); if (modalContent) observer.observe(modalContent, { childList: true }); patchModal(); });
  document.addEventListener("click", (event) => { if (event.target?.id === "rangerModalCloseBtn" || event.target?.id === "rangerModal") stopPlayback(); });
})();
