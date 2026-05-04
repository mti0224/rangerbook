(() => {
  const originalFetch = window.fetch.bind(window);

  function getStarText(row) {
    return String(row?.star ?? row?.["Ranger星數"] ?? row?.rarity ?? row?.grade ?? "");
  }

  function getName(row) {
    return String(row?.name ?? row?.["Ranger名稱"] ?? "");
  }

  function getId(row) {
    return String(row?.id ?? row?.ranger_id ?? row?.unitCode ?? "");
  }

  function starPriority(row) {
    const raw = getStarText(row);
    const star = Number(raw.match(/\d+/)?.[0] || 0);

    let evolution = 0;
    if (/超進化|超進/.test(raw)) evolution = 3;
    else if (/終極|究極|究進/.test(raw)) evolution = 2;

    return star * 10 + evolution;
  }

  function idPriority(row) {
    const id = getId(row);
    const match = id.match(/\d+/);
    return match ? Number(match[0]) : 0;
  }

  function sortRangerIndex(rows) {
    if (!Array.isArray(rows)) return rows;
    return rows.slice().sort((a, b) => {
      const starDiff = starPriority(b) - starPriority(a);
      if (starDiff !== 0) return starDiff;

      const idDiff = idPriority(b) - idPriority(a);
      if (idDiff !== 0) return idDiff;

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
