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

  function injectMarker(bodyPart, definition, attack, markerId) {
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
        injectMarker(bodyPart, definition, unitData[definition.dataKey], 2147483000 + index);
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
