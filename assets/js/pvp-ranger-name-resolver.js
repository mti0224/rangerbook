(() => {
  const USAGE_URL_FRAGMENT = "pvp-data.warmycat.com/usage.json";
  const RANGER_CATALOG_URLS = [
    "../../res/Ranger_index.json",
    "../../res/Rangers_data.json",
  ];
  const CATALOG_REFRESH_MS = 60 * 60 * 1000;
  const nativeFetch = window.fetch.bind(window);

  let catalogPromise = null;
  let catalogLoadedAt = 0;

  const text = (value) => String(value ?? "").trim();

  function valueFrom(row, keys) {
    if (!row || typeof row !== "object") return "";
    for (const key of keys) {
      const value = text(row[key]);
      if (value) return value;
    }
    return "";
  }

  function rangerId(row, fallback = "") {
    return valueFrom(row, ["ranger_id", "rangerId", "RangerID", "unitCode", "id", "code"]) || text(fallback);
  }

  function rangerInfo(row, fallbackId = "") {
    if (typeof row === "string") {
      return { id: text(fallbackId), name: text(row), star: "", type: "", element: "" };
    }
    if (!row || typeof row !== "object") return null;

    const id = rangerId(row, fallbackId);
    if (!id) return null;

    return {
      id,
      name: valueFrom(row, ["Ranger名稱", "角色名稱", "名稱", "name", "displayName", "rangerName", "title"]),
      star: valueFrom(row, ["Ranger星數", "星數", "星級", "star"]),
      type: valueFrom(row, ["類型", "type"]),
      element: valueFrom(row, ["屬性", "element", "attribute"]),
    };
  }

  function buildCatalog(raw) {
    const catalog = new Map();

    const add = (value, fallbackId = "") => {
      const info = rangerInfo(value, fallbackId);
      if (!info?.id) return;
      const previous = catalog.get(info.id) || {};
      catalog.set(info.id, {
        ...previous,
        ...Object.fromEntries(Object.entries(info).filter(([, item]) => item !== "")),
      });
    };

    const visit = (value) => {
      if (Array.isArray(value)) {
        value.forEach((item) => add(item));
        return;
      }
      if (!value || typeof value !== "object") return;

      const nested = [value.rangers, value.items, value.data, value.index]
        .filter((item) => Array.isArray(item) || (item && typeof item === "object"));
      if (nested.length) {
        nested.forEach(visit);
        return;
      }

      for (const [key, item] of Object.entries(value)) {
        if (Array.isArray(item)) item.forEach((entry) => add(entry));
        else if (item && typeof item === "object") add(item, key);
        else if (typeof item === "string") add(item, key);
      }
    };

    visit(raw);
    return catalog;
  }

  async function fetchCatalog() {
    for (const url of RANGER_CATALOG_URLS) {
      try {
        const separator = url.includes("?") ? "&" : "?";
        const response = await nativeFetch(`${url}${separator}t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) continue;
        const catalog = buildCatalog(await response.json());
        if (catalog.size) return catalog;
      } catch (error) {
        console.warn(`角色名稱索引載入失敗：${url}`, error);
      }
    }
    return new Map();
  }

  function loadCatalog() {
    const now = Date.now();
    if (!catalogPromise || now - catalogLoadedAt >= CATALOG_REFRESH_MS) {
      catalogLoadedAt = now;
      catalogPromise = fetchCatalog();
    }
    return catalogPromise;
  }

  function resolveRow(row, catalog) {
    if (!row || typeof row !== "object") return row;
    const id = text(row.rangerId || row.unitCode || row.id);
    if (!id) return row;

    const info = catalog.get(id);
    if (!info) return row;

    return {
      ...row,
      rangerId: row.rangerId || row.unitCode || id,
      name: info.name || row.name || id,
      star: info.star || row.star || "",
      type: info.type || row.type || "",
      element: info.element || row.element || "",
    };
  }

  function resolveRows(rows, catalog) {
    return Array.isArray(rows) ? rows.map((row) => resolveRow(row, catalog)) : rows;
  }

  function resolveUsageData(data, catalog) {
    if (!data || typeof data !== "object" || !catalog.size) return data;

    const output = {
      ...data,
      rangers: resolveRows(data.rangers, catalog),
    };

    if (data.scopes && typeof data.scopes === "object") {
      output.scopes = Object.fromEntries(
        Object.entries(data.scopes).map(([scopeKey, scope]) => [
          scopeKey,
          scope && typeof scope === "object"
            ? { ...scope, rangers: resolveRows(scope.rangers, catalog) }
            : scope,
        ])
      );
    }

    return output;
  }

  window.fetch = async (input, init) => {
    const response = await nativeFetch(input, init);
    const url = typeof input === "string" ? input : input?.url || "";
    if (!url.includes(USAGE_URL_FRAGMENT) || !response.ok) return response;

    try {
      const [data, catalog] = await Promise.all([
        response.clone().json(),
        loadCatalog(),
      ]);
      const resolved = resolveUsageData(data, catalog);
      const headers = new Headers(response.headers);
      headers.set("Content-Type", "application/json; charset=utf-8");

      return new Response(JSON.stringify(resolved), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.warn("PvP 角色名稱前端解析失敗，改用 usage.json 原始名稱。", error);
      return response;
    }
  };
})();
