(() => {
  const nativeFetch = window.fetch.bind(window);
  const siteRoot = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const projectileDataUrl = `${siteRoot}res/projectile_data.json`;
  const animationMetaPattern = /\/animation_meta\/([^/?#]+)\.json(?:[?#]|$)/i;
  const NATIVE_PROJECTILE_COORDINATE_SCALE = 0.5;
  let projectileDataPromise = null;

  function loadProjectileData() {
    if (!projectileDataPromise) {
      projectileDataPromise = nativeFetch(projectileDataUrl)
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
    }
    return projectileDataPromise;
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

  function attachProjectileData(meta, projectileData, unitId, unitData) {
    meta.projectileData = {
      schemaVersion: projectileData?.schemaVersion ?? null,
      motionModelVersion: projectileData?.validation?.motionModelVersion ?? null,
      coordinateScale: NATIVE_PROJECTILE_COORDINATE_SCALE,
      unitId,
      unitCode: unitData?.unitCode || unitId,
      resourceCode: unitData?.resourceCode || unitId,
      guardianResourceCode: unitData?.guardianResourceCode || "",
      useEnemySideResource: unitData?.useEnemySideResource ?? 0,
      render: unitData?.render || null,
      movement: unitData?.movement || null,
      hitTiming: unitData?.hitTiming || null,
      bullet: unitData?.bullet || null,
      normal: unitData?.normal || null,
      skill1: unitData?.skill1 || null,
      skill2: unitData?.skill2 || null,
      effects: unitData?.effects || null,
      sounds: unitData?.sounds || null,
    };
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

      attachProjectileData(meta, projectileData, unitId, unitData);

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
