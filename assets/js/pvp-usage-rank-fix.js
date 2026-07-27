(() => {
  const nativeFetch = window.fetch.bind(window);

  function rankByAppearanceCount(items) {
    if (!Array.isArray(items)) return items;

    return [...items]
      .sort((a, b) => {
        const appearanceDiff = (Number(b?.appearanceCount) || 0) - (Number(a?.appearanceCount) || 0);
        if (appearanceDiff) return appearanceDiff;

        const playerDiff = (Number(b?.playerCount) || 0) - (Number(a?.playerCount) || 0);
        if (playerDiff) return playerDiff;

        return String(a?.rangerId || a?.unitCode || "")
          .localeCompare(String(b?.rangerId || b?.unitCode || ""));
      })
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }

  function normalizeUsageRanking(data) {
    if (!data || typeof data !== "object") return data;

    const normalized = {
      ...data,
      rangers: rankByAppearanceCount(data.rangers),
    };

    if (data.scopes && typeof data.scopes === "object") {
      normalized.scopes = Object.fromEntries(
        Object.entries(data.scopes).map(([scopeKey, scope]) => [
          scopeKey,
          scope && typeof scope === "object"
            ? { ...scope, rangers: rankByAppearanceCount(scope.rangers) }
            : scope,
        ])
      );
    }

    return normalized;
  }

  window.fetch = async (input, init) => {
    const response = await nativeFetch(input, init);
    const url = typeof input === "string" ? input : input?.url || "";

    if (!url.includes("pvp-data.warmycat.com/usage.json")) return response;

    try {
      const data = normalizeUsageRanking(await response.clone().json());
      const headers = new Headers(response.headers);
      headers.set("Content-Type", "application/json; charset=utf-8");

      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.warn("PvP 角色排名修正失敗，改用原始資料。", error);
      return response;
    }
  };
})();
