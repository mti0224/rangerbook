(() => {
  const upstreamFetch = window.fetch.bind(window);
  const animationMetaPattern = /\/animation_meta\/([^/?#]+)\.json(?:[?#]|$)/i;
  const DEFAULT_COORDINATE_SCALE = 0.5;

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return NaN;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) * 0.5;
  }

  function findAnimation(part, names) {
    for (const name of names) {
      const animation = part?.animations?.[name];
      if (animation?.frames?.length) return animation;
    }
    return null;
  }

  function frameVisibleBounds(part, frame) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let visibleItems = 0;

    for (const item of frame || []) {
      const [, resourceNumber, objectMatrix, color] = item || [];
      const alpha = Array.isArray(color) ? Number(color[3] ?? 255) : 255;
      const imageDefinition = part?.images?.[resourceNumber];
      const sprite = part?.sprites?.[imageDefinition?.name];
      const width = Number(sprite?.rect?.[2]);
      const height = Number(sprite?.rect?.[3]);

      if (
        alpha === 0 ||
        !width ||
        !height ||
        !Array.isArray(objectMatrix) ||
        !Array.isArray(imageDefinition?.m)
      ) {
        continue;
      }

      const [m00, m01, m10, m11, m02, m12] = objectMatrix;
      const [i00, i01, i10, i11, i02, i12] = imageDefinition.m;
      const f00 = m00 * i00 + m01 * i10;
      const f01 = m00 * i01 + m01 * i11;
      const f10 = m10 * i00 + m11 * i10;
      const f11 = m10 * i01 + m11 * i11;
      const tx = m00 * i02 + m01 * i12 + m02;
      const ty = m10 * i02 + m11 * i12 + m12;

      for (const [x, y] of [[0, 0], [width, 0], [0, height], [width, height]]) {
        const worldX = f00 * x + f01 * y + tx;
        const worldY = f10 * x + f11 * y + ty;
        minX = Math.min(minX, worldX);
        minY = Math.min(minY, worldY);
        maxX = Math.max(maxX, worldX);
        maxY = Math.max(maxY, worldY);
      }
      visibleItems += 1;
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) * 0.5,
      centerY: (minY + maxY) * 0.5,
      bottom: maxY,
      visibleItems,
    };
  }

  function animationSamples(part, animation) {
    return (animation?.frames || [])
      .map((frame, index) => ({ index, ...frameVisibleBounds(part, frame) }))
      .filter((sample) => Number.isFinite(sample.bottom));
  }

  function stableTerminalBottom(part, animation) {
    const samples = animationSamples(part, animation);
    if (!samples.length) return NaN;

    const firstIndex = samples[0].index;
    const lastIndex = samples[samples.length - 1].index;
    const terminalStart = firstIndex + (lastIndex - firstIndex) * 0.4;
    const terminal = samples.filter((sample) => sample.index >= terminalStart);
    if (!terminal.length) return samples[samples.length - 1].bottom;

    const values = terminal.map((sample) => sample.bottom);
    const range = Math.max(...values) - Math.min(...values);
    const tolerance = Math.max(1, Math.min(8, range * 0.03));
    let bestCluster = [];
    let bestLatestIndex = -Infinity;

    for (const pivot of terminal) {
      const cluster = terminal.filter(
        (sample) => Math.abs(sample.bottom - pivot.bottom) <= tolerance
      );
      const latestIndex = Math.max(...cluster.map((sample) => sample.index));
      if (
        cluster.length > bestCluster.length ||
        (cluster.length === bestCluster.length && latestIndex > bestLatestIndex)
      ) {
        bestCluster = cluster;
        bestLatestIndex = latestIndex;
      }
    }

    return median((bestCluster.length ? bestCluster : terminal).map((sample) => sample.bottom));
  }

  function animationProfile(part, animation) {
    const samples = animationSamples(part, animation);
    if (!samples.length) return null;

    const firstIndex = samples[0].index;
    const lastIndex = samples[samples.length - 1].index;
    const duration = Math.max(1, lastIndex - firstIndex);
    const earlyEnd = firstIndex + duration * 0.35;
    const lateStart = firstIndex + duration * 0.65;
    const early = samples.filter((sample) => sample.index <= earlyEnd);
    const late = samples.filter((sample) => sample.index >= lateStart);
    const earlyCenterX = median((early.length ? early : samples).map((sample) => sample.centerX));
    const lateCenterX = median((late.length ? late : samples).map((sample) => sample.centerX));
    const centerXs = samples.map((sample) => sample.centerX);

    return {
      frameCount: samples.length,
      width: median(samples.map((sample) => sample.width)),
      height: median(samples.map((sample) => sample.height)),
      visibleItems: median(samples.map((sample) => sample.visibleItems)),
      horizontalTravel: Math.abs(lateCenterX - earlyCenterX),
      horizontalRange: Math.max(...centerXs) - Math.min(...centerXs),
    };
  }

  function shiftAnimationY(animation, deltaY) {
    if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 0.001) return;

    for (const frame of animation?.frames || []) {
      for (const item of frame || []) {
        const objectMatrix = item?.[2];
        if (Array.isArray(objectMatrix) && objectMatrix.length >= 6) {
          objectMatrix[5] = finiteNumber(objectMatrix[5], 0) + deltaY;
        }
      }
    }
  }

  function normalizedMotionType(attack) {
    const explicit = String(attack?.motion?.type || "").trim().toUpperCase();
    if (explicit) return explicit;

    const attackType = String(attack?.attackType || "").trim().toUpperCase();
    return ["PUNCH", "KICK", "SWING", "STAB"].includes(attackType)
      ? "DIRECT"
      : attackType;
  }

  function bodyReferenceProfile(meta) {
    const bodyPart = meta?.parts?.body;
    if (!bodyPart) return null;

    const bodyAnimation = findAnimation(bodyPart, [
      "attack_all",
      "attack",
      "attack_a",
      "attack_b",
      "attack_ready",
      "idle",
      "wait",
    ]);
    return animationProfile(bodyPart, bodyAnimation);
  }

  function isActorMovementAnimation(meta, bulletPart, normalAnimation) {
    const bodyProfile = bodyReferenceProfile(meta);
    const projectileProfile = animationProfile(bulletPart, normalAnimation);
    if (!bodyProfile || !projectileProfile || projectileProfile.frameCount < 4) return false;
    if (!(bodyProfile.width > 0) || !(bodyProfile.height > 0)) return false;

    const heightRatio = projectileProfile.height / bodyProfile.height;
    const widthRatio = projectileProfile.width / bodyProfile.width;
    const sizeComparable =
      heightRatio >= 0.45 &&
      heightRatio <= 2.25 &&
      widthRatio >= 0.30 &&
      widthRatio <= 3.50;

    // A character dash/teleport part moves a character-sized visual across its
    // local animation space. Ordinary punches, slashes and hit flashes stay
    // close to one target-local point and therefore fail this motion test.
    const requiredTravel = Math.max(
      20,
      bodyProfile.width * 0.18,
      projectileProfile.width * 0.08
    );
    const translated =
      projectileProfile.horizontalTravel >= requiredTravel ||
      projectileProfile.horizontalRange >= requiredTravel * 1.35;

    // Reject tiny single-sprite sparks that happen to cover a large bounding box.
    const compositionComparable =
      projectileProfile.visibleItems >= 2 ||
      projectileProfile.visibleItems >= bodyProfile.visibleItems * 0.25;

    return sizeComparable && translated && compositionComparable;
  }

  function alignDirectBasicAttackEndpoint(meta) {
    const projectileData = meta?.projectileData;
    const attack = projectileData?.normal;
    if (!attack || normalizedMotionType(attack) !== "DIRECT") return false;

    const requestedPartName = String(attack.animationPart || "").trim() || "bul";
    const bulletPart = meta?.parts?.[requestedPartName] || meta?.parts?.bul;
    if (!bulletPart) return false;

    const normalAnimation = findAnimation(
      bulletPart,
      ["normal", "idle", "wait", "shot", "fire", "attack", "_all"]
    );
    if (!normalAnimation || !isActorMovementAnimation(meta, bulletPart, normalAnimation)) {
      return false;
    }

    const normalBottom = stableTerminalBottom(bulletPart, normalAnimation);
    if (!Number.isFinite(normalBottom)) return false;

    const coordinateScale = clamp(
      finiteNumber(projectileData.coordinateScale, DEFAULT_COORDINATE_SCALE) || DEFAULT_COORDINATE_SCALE,
      0.0001,
      1000
    );

    projectileData.hitTiming = {
      ...(projectileData.hitTiming || {}),
      normalHitPointRate: 0,
    };
    projectileData.normal = {
      ...attack,
      end: {
        ...(attack.end || {}),
        // The viewer subtracts this positive-up native offset from targetBaseY.
        // Using the stable terminal bottom makes the actor's feet end exactly on
        // the target ground line while preserving the authored internal motion.
        y: normalBottom / coordinateScale,
      },
    };

    const finishAnimation = findAnimation(bulletPart, ["finish", "hit", "end"]);
    const finishBottom = stableTerminalBottom(bulletPart, finishAnimation);
    if (finishAnimation && Number.isFinite(finishBottom)) {
      shiftAnimationY(finishAnimation, normalBottom - finishBottom);
    }

    return true;
  }

  async function patchAnimationMetadata(response, url) {
    if (
      !response.ok ||
      !animationMetaPattern.test(String(url || "")) ||
      /\/index\.json(?:[?#]|$)/i.test(String(url || ""))
    ) {
      return response;
    }

    try {
      const meta = await response.clone().json();
      if (!alignDirectBasicAttackEndpoint(meta)) return response;

      const headers = new Headers(response.headers);
      headers.set("content-type", "application/json; charset=utf-8");
      return new Response(JSON.stringify(meta), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.warn("Normal attack ground endpoint adjustment failed:", error);
      return response;
    }
  }

  window.fetch = async (...args) => {
    const response = await upstreamFetch(...args);
    const requestUrl = args[0] instanceof Request ? args[0].url : String(args[0] || "");
    return patchAnimationMetadata(response, requestUrl);
  };
})();
