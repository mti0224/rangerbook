(() => {
  const originalJson = Response.prototype.json;

  const text = (value) => {
    if (value === null || value === undefined || typeof value === "object") return "";
    return String(value).replaceAll("\\n", "\n").trim();
  };

  const meaningfulText = (value) => {
    const valueText = text(value);
    return Boolean(valueText) && !["-", "無", "(無)", "null", "undefined"].includes(valueText);
  };

  function hasMeaningfulValue(value, key = "") {
    if (key.startsWith("每次升級")) return false;
    if (Array.isArray(value)) return value.some((item) => hasMeaningfulValue(item));
    if (value && typeof value === "object") {
      return Object.entries(value).some(([childKey, childValue]) => hasMeaningfulValue(childValue, childKey));
    }
    return meaningfulText(value);
  }

  function hasSpecPlusData(spec) {
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) return false;
    return hasMeaningfulValue(spec["基本效果"], "基本效果")
      || hasMeaningfulValue(spec["特殊效果"], "特殊效果");
  }

  function isGearDatabaseResponse(response) {
    try {
      return decodeURIComponent(response.url).includes("裝備資料庫.json");
    } catch {
      return response.url.includes("%E8%A3%9D%E5%82%99%E8%B3%87%E6%96%99%E5%BA%AB.json");
    }
  }

  Response.prototype.json = async function (...args) {
    const data = await originalJson.apply(this, args);
    if (!isGearDatabaseResponse(this) || !Array.isArray(data)) return data;

    data.forEach((gear) => {
      if (!gear || typeof gear !== "object") return;
      if (!hasSpecPlusData(gear["Spec+"])) delete gear["Spec+"];
    });

    return data;
  };
})();
