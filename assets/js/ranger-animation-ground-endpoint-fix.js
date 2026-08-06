(() => {
  const upstreamFetch = window.fetch.bind(window);
  const animationMetaPattern = /\/animation_meta\/([^/?#]+)\.json(?:[?#]|$)/i;
  const DEFAULT_COORDINATE_SCALE = 0.5;

  const STANDARD_ATTACK_SLOTS = [
    {
      key: "normal",
      defaultPart: "bul",
      hitRateKey: "normalHitPointRate",
      bodyAnimations: [
        "attack_all",
        "attack",
        "attack_a",
        "attack_b",
        "attack_ready",
        "idle",
        "wait",
      ],
    },
    {
      key: "skill1",
      defaultPart: "bul2",
      hitRateKey: "skill1HitPointRate",
      bodyAnimations: [
        "s_attack_all",
        "s_action_attack_all",
        "s_attack",
        "s_attack_a",
        "s_attack_b",
        "s_action_attack_2",
        "s_action_attack_3",
        "s_attack_ready",
        "s_action_attack_1",
        "idle",
        "wait",
      ],
    },
    {
      key: "skill2",
      defaultPart: "bul3",
      hitRateKey: "skill2HitPointRate",
      bodyAnimations: [
        "s2_attack_all",
        "s2_attack",
        "s2_attack_a",
        "s2_attack_b",
        "s2_attack_ready",
        "skill",
        "idle",
        "wait",
      ],
    },
  ];

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
      .map((frame, index) => {
        const bounds = frameVisibleBounds(part, frame);
        return bounds ? { index, ...bounds } : null;
      })
      .filter(Boolean);
  }

  function animationGroundBottom(part, animation) {
    return median(animationSamples(part, animation).map((sample) => sample.bottom));
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
      bottom: median(samples.map((sample) => sample.bottom)),
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
    if (["ENERGY", "WEAPON", "DOUBLE"].includes(attackType)) return "LINEAR";
    return ["PUNCH", "KICK", "SWING", "STAB"].includes(attackType)
      ? "DIRECT"
      : attackType;
  }

  function dynamicAttackSlots(projectileData) {
    const slots = STANDARD_ATTACK_SLOTS.map((slot) => ({ ...slot }));
    const known = new Set(slots.map((slot) => slot.key));

    for (const key of Object.keys(projectileData || {})) {
      if (known.has(key)) continue;
      const match = key.match(/^skill(\d+)$/i);
      const attack = projectileData?.[key];
      if (!match || !attack || typeof attack !== "object") continue;

      const skillNumber = Number(match[1]);
      slots.push({
        key,
        defaultPart: `bul${skillNumber + 1}`,
        hitRateKey: `${key}HitPointRate`,
        bodyAnimations: [
          `s${skillNumber}_attack_all`,
          `s${skillNumber}_attack`,
          `s${skillNumber}_attack_a`,
          `s${skillNumber}_attack_b`,
          `s${skillNumber}_attack_ready`,
          "skill",
          "idle",
          "wait",
        ],
      });
      known.add(key);
    }

    return slots;
  }

  function bodyReferenceProfile(meta, slot) {
    const bodyPart = meta?.parts?.body;
    if (!bodyPart) return null;

    const sizeAnimation = findAnimation(bodyPart, slot.bodyAnimations);
    const groundAnimation = findAnimation(bodyPart, [
      "idle",
      "wait",
      ...slot.bodyAnimations,
    ]);
    const sizeProfile = animationProfile(bodyPart, sizeAnimation);
    const groundBottom = animationGroundBottom(bodyPart, groundAnimation || sizeAnimation);

    if (!sizeProfile || !Number.isFinite(groundBottom)) return null;
    return {
      ...sizeProfile,
      groundBottom,
    };
  }

  function isActorMovementAnimation(bodyProfile, bulletPart, attackAnimation, motionType) {
    const projectileProfile = animationProfile(bulletPart, attackAnimation);
    if (!bodyProfile || !projectileProfile || projectileProfile.frameCount < 4) return false;
    if (!(bodyProfile.width > 0) || !(bodyProfile.height > 0)) return false;

    const heightRatio = projectileProfile.height / bodyProfile.height;
    const widthRatio = projectileProfile.width / bodyProfile.width;
    const itemRatio = projectileProfile.visibleItems / Math.max(1, bodyProfile.visibleItems);

    const sizeComparable =
      heightRatio >= 0.45 &&
      heightRatio <= 2.25 &&
      widthRatio >= 0.30 &&
      widthRatio <= 3.50;
    const compositionComparable =
      projectileProfile.visibleItems >= 2 &&
      (itemRatio >= 0.25 || projectileProfile.visibleItems >= 4);
    if (!sizeComparable || !compositionComparable) return false;

    if (motionType === "DIRECT") {
      const requiredTravel = Math.max(
        20,
        bodyProfile.width * 0.18,
        projectileProfile.width * 0.08
      );
      return (
        projectileProfile.horizontalTravel >= requiredTravel ||
        projectileProfile.horizontalRange >= requiredTravel * 1.35
      );
    }

    if (motionType !== "LINEAR") return false;

    const actorSized =
      heightRatio >= 0.55 &&
      heightRatio <= 1.95 &&
      widthRatio >= 0.35 &&
      widthRatio <= 2.75;
    const actorComposed =
      itemRatio >= 0.35 ||
      projectileProfile.visibleItems >= Math.max(4, bodyProfile.visibleItems * 0.3);

    return actorSized && actorComposed;
  }

  function alignActorAttack(meta, slot) {
    const projectileData = meta?.projectileData;
    const attack = projectileData?.[slot.key];
    if (!attack) return false;

    const motionType = normalizedMotionType(attack);
    if (!["DIRECT", "LINEAR"].includes(motionType)) return false;

    const requestedPartName = String(attack.animationPart || "").trim() || slot.defaultPart;
    const bulletPart = meta?.parts?.[requestedPartName] || meta?.parts?.[slot.defaultPart];
    if (!bulletPart) return false;

    const attackAnimation = findAnimation(
      bulletPart,
      ["normal", "idle", "wait", "shot", "fire", "attack", "_all"]
    );
    const bodyProfile = bodyReferenceProfile(meta, slot);
    if (
      !attackAnimation ||
      !isActorMovementAnimation(bodyProfile, bulletPart, attackAnimation, motionType)
    ) {
      return false;
    }

    const coordinateScale = clamp(
      finiteNumber(projectileData.coordinateScale, DEFAULT_COORDINATE_SCALE) || DEFAULT_COORDINATE_SCALE,
      0.0001,
      1000
    );
    const travelBottom = motionType === "LINEAR"
      ? animationGroundBottom(bulletPart, attackAnimation)
      : stableTerminalBottom(bulletPart, attackAnimation);
    if (!Number.isFinite(travelBottom)) return false;

    projectileData.hitTiming = {
      ...(projectileData.hitTiming || {}),
      [slot.hitRateKey]: 0,
    };

    const patchedAttack = {
      ...attack,
      end: {
        ...(attack.end || {}),
        y: travelBottom / coordinateScale,
      },
    };

    if (motionType === "LINEAR" && Number.isFinite(bodyProfile?.groundBottom)) {
      patchedAttack.start = {
        ...(attack.start || {}),
        // The viewer resolves database start Y from the body origin using a
        // positive-up coordinate. Matching the projectile actor's local bottom
        // to the standing body bottom keeps the entire LINEAR path horizontal.
        y: (travelBottom - bodyProfile.groundBottom) / coordinateScale,
      };
    }

    projectileData[slot.key] = patchedAttack;

    const finishAnimation = findAnimation(bulletPart, ["finish", "hit", "end"]);
    const finishBottom = stableTerminalBottom(bulletPart, finishAnimation);
    if (finishAnimation && Number.isFinite(finishBottom)) {
      shiftAnimationY(finishAnimation, travelBottom - finishBottom);
    }

    return true;
  }

  function alignAllActorAttacks(meta) {
    const projectileData = meta?.projectileData;
    if (!projectileData) return false;

    let changed = false;
    for (const slot of dynamicAttackSlots(projectileData)) {
      changed = alignActorAttack(meta, slot) || changed;
    }
    return changed;
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
      if (!alignAllActorAttacks(meta)) return response;

      const headers = new Headers(response.headers);
      headers.set("content-type", "application/json; charset=utf-8");
      return new Response(JSON.stringify(meta), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.warn("Actor attack ground-path adjustment failed:", error);
      return response;
    }
  }

  window.fetch = async (...args) => {
    const response = await upstreamFetch(...args);
    const requestUrl = args[0] instanceof Request ? args[0].url : String(args[0] || "");
    return patchAnimationMetadata(response, requestUrl);
  };
})();
