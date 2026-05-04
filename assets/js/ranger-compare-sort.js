(() => {
  const originalFetch = window.fetch.bind(window);

  function starRank(value) {
    const raw = String(value ?? "");
    const match = raw.match(/\d+/);
    return match ? Number(match[0]) : 0;
  }

  function getStar(row) {
    return row?.star ?? row?.["Ranger星數"] ?? row?.rarity ?? row?.grade ?? "";
  }

  function getName(row) {
    return String(row?.name ?? row?.["Ranger名稱"] ?? "");
  }

  function sortRangerIndex(rows) {
    if (!Array.isArray(rows)) return rows;
    return rows.slice().sort((a, b) => {
      const starDiff = starRank(getStar(b)) - starRank(getStar(a));
      if (starDiff !== 0) return starDiff;
      return getName(a).localeCompare(getName(b), "zh-Hant");
    });
  }

  window.fetch = async function (resource, options) {
    const response = await originalFetch(resource, options);
    const url = typeof resource === "string" ? resource : resource?.url || "";
    if (!url.includes("Ranger_index.json")) return response;

    return new Response(JSON.stringify(sortRangerIndex(await response.clone().json())), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  };
})();
