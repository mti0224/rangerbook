(() => {
  const nativeFetch = window.fetch.bind(window);
  const siteRoot = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const projectileDataUrl = `${siteRoot}res/projectile_data.json`;
  const animationMetaPattern = /\/animation_meta\/([^/?#]+)\.json(?:[?#]|$)/i;
  let projectileDataPromise = null;

  const clipDefinitions = [
    {
      dataKey: "normal",
      ready: ["attack_ready"],
      trigger: ["attack"],
      validateStart: true,
    },
    {
      dataKey: "skill1",
      ready: ["s_attack_ready", "s_action_attack_1"],
      trigger: ["s_attack", "s_action_attack_2", "s_action_attack_3"],
    },
    {
      dataKey: "skill2",
      ready: ["s2_attack_ready"],
      trigger: ["s2_attack", "skill"],
    },
  ];

  function loadProjectileData() {
    if (!projectileDataPromise) {
      projectileDataPromise = nativeFetch(projectileDataUrl)
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
    }
    return projectileDataPromise;
  }

  function findAnimation(part, names) {
    for (const name of names) {
      const animation = part?.animations?.[name];
      if (animation?.frames?.length) return animation;
    }
    return null;
  }

  function findReferenceImage(part) {
    for (const [resourceNumber, image] of Object.entries(part?.images || {})) {
      const sprite = part?.sprites?.[image?.name];
      const rect = sprite?.rect;
      if (!Array.isArray(image?.m) || !Array.isArray(rect) || !rect[2] || !rect[3]) continue;
      return { resourceNumber, image, width: Number(rect[2]), height: Number(rect[3]) };
    }
    return null;
  }

  function worldPosition(part, item) {
    const [, resourceNumber, objectMatrix] = item || [];
    const image = part?.images?.[resourceNumber];
    const sprite = part?.sprites?.[image?.name];
    const rect = sprite?.rect;
    if (!Array.isArray(objectMatrix) || !Array.isArray(image?.m) || !Array.isArray(rect) || !rect[2] || !rect[3]) {
      return null;
    }

    const [m00, m01, m10, m11, m02, m12] = objectMatrix;
    const [i00, i01, i10, i11, i02, i12] = image.m;
    const centerX = Number(rect[2]) * 0.5;
    const centerY = Number(rect[3]) * 0.5;
    const transformedCenterX = i00 * centerX + i01 * centerY + i02;
    const transformedCenterY = i10 * centerX + i11 * centerY + i12;
    return {
      x: m00 * transformedCenterX + m01 * transformedCenterY + m02,
      y: m10 * transformedCenterX + m11 * transformedCenterY + m12,
    };
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

  function findAnimationStart(part, ready, trigger) {
    const readyFrame = ready?.frames?.[ready.frames.length - 1];
    const triggerFrame = trigger?.frames?.[0];
    if (!Array.isArray(readyFrame) || !Array.isArray(triggerFrame)) return null;

    const hidden = readyFrame.filter((item) => {
      const color = item?.[3];
      return Array.isArray(color) && Number(color[3] ?? 255) === 0;
    });
    const exact = hidden.find((candidate) => triggerFrame.some(
      (item) => item?.[0] === candidate?.[0] && item?.[1] === candidate?.[1]
    ));
    const sameResource = hidden.find((candidate) => triggerFrame.some(
      (item) => item?.[1] === candidate?.[1]
    ));
    const matched = exact || sameResource;
    const matchedPoint = matched ? worldPosition(part, matched) : null;
    if (matchedPoint) return matchedPoint;

    let frontMost = null;
    for (const item of readyFrame) {
      const color = item?.[3];
      const alpha = Array.isArray(color) ? Number(color[3] ?? 255) : 255;
      if (alpha === 0) continue;
      const point = worldPosition(part, item);
      if (point && (!frontMost || point.x > frontMost.x)) frontMost = point;
    }
    return frontMost;
  }

  function isPlausibleBasicAttackStart(bodyPart, ready, trigger, x, y) {
    const reference = findAnimationStart(bodyPart, ready, trigger);
    if (!reference) return true;

    const readyFrame = ready.frames[ready.frames.length - 1];
    const metrics = frameMetrics(bodyPart, readyFrame);
    const width = Math.max(1, metrics?.width || 0);
    const height = Math.max(1, metrics?.height || 0);
    const dx = Math.abs(x - reference.x);
    const dy = Math.abs(y - reference.y);
    const distance = Math.hypot(dx, dy);
    const maxDistance = Math.max(80, Math.min(180, Math.hypot(width, height) * 0.30));
    const maxVerticalDistance = Math.max(50, Math.min(110, height * 0.30));
    return distance <= maxDistance && dy <= maxVerticalDistance;
  }

  function createMarker(part, x, y, markerId) {
    const reference = findReferenceImage(part);
    if (!reference) return null;

    const [i00, i01, i10, i11, i02, i12] = reference.image.m;
    const centerX = reference.width * 0.5;
    const centerY = reference.height * 0.5;
    const transformedCenterX = i00 * centerX + i01 * centerY + i02;
    const transformedCenterY = i10 * centerX + i11 * centerY + i12;
    const resourceNumber = /^\d+$/.test(reference.resourceNumber)
      ? Number(reference.resourceNumber)
      : reference.resourceNumber;

    return [
      markerId,
      resourceNumber,
      [1, 0, 0, 1, x - transformedCenterX, y - transformedCenterY],
      [255, 255, 255, 0],
    ];
  }

  function injectMarker(bodyPart, definition, attack, markerId, unitId) {
    if (!attack || String(attack.attackType || "").toUpperCase() === "NONE") return;
    const x = Number(attack.start?.x);
    const y = Number(attack.start?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) return;

    const ready = findAnimation(bodyPart, definition.ready);
    const trigger = findAnimation(bodyPart, definition.trigger);
    if (!ready || !trigger) return;

    const readyFrame = ready.frames[ready.frames.length - 1];
    const triggerFrame = trigger.frames[0];
    if (!Array.isArray(readyFrame) || !Array.isArray(triggerFrame)) return;

    if (definition.validateStart && !isPlausibleBasicAttackStart(bodyPart, ready, trigger, x, y)) {
      console.info("Projectile start rejected; using animation-derived origin", {
        unitId,
        clip: definition.dataKey,
        start: { x, y },
      });
      return;
    }

    const marker = createMarker(bodyPart, x, y, markerId);
    if (!marker) return;
    readyFrame.unshift(marker);
    triggerFrame.unshift([
      marker[0],
      marker[1],
      [...marker[2]],
      [...marker[3]],
    ]);
  }

  function inferUnitId(meta, url) {
    const match = String(url || "").match(animationMetaPattern);
    return String(
      meta?.unit_id ||
      meta?.unitId ||
      meta?.resourceCode ||
      (match ? decodeURIComponent(match[1]) : "")
    ).trim();
  }

  async function enrichMetadata(response, url) {
    if (!response.ok || !animationMetaPattern.test(String(url || "")) || /\/index\.json(?:[?#]|$)/i.test(String(url || ""))) {
      return response;
    }

    try {
      const [meta, projectileData] = await Promise.all([
        response.clone().json(),
        loadProjectileData(),
      ]);
      const unitId = inferUnitId(meta, url);
      const unitData = projectileData?.units?.[unitId];
      const bodyPart = meta?.parts?.body;
      if (!unitData || !bodyPart) return response;

      clipDefinitions.forEach((definition, index) => {
        injectMarker(bodyPart, definition, unitData[definition.dataKey], 2147483000 + index, unitId);
      });

      const headers = new Headers(response.headers);
      headers.set("content-type", "application/json; charset=utf-8");
      return new Response(JSON.stringify(meta), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.warn("Projectile metadata integration failed:", error);
      return response;
    }
  }

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const requestUrl = args[0] instanceof Request ? args[0].url : String(args[0] || "");
    return enrichMetadata(response, requestUrl);
  };
})();
