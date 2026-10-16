/* Shared by player search, every PvP league and every guild tier. */
(() => {
  "use strict";
  function effectText(equipment, dictionary) {
    const code = equipment?.attr4No;
    if (code === undefined || code === null || code === "" || Number(code) === 0) return "";
    const entry = dictionary?.[String(code)];
    const name = typeof entry === "string" ? entry
      : String(entry?.["效果名稱"] || entry?.["名稱"] || entry?.name || entry?.label || "");
    if (!name) return "";
    const raw = equipment.attr4Value;
    const value = typeof raw === "number" || (typeof raw === "string" && raw.trim()) ? Number(raw) : NaN;
    const unit = equipment.attr4Unit;
    if (!Number.isFinite(value) || !["PERCENT", "FLAT"].includes(unit)) {
      const pending = window.RangerbookI18n?.t("gear.playerValuePending", "數值待更新") || "數值待更新";
      return `${name} (${pending})`;
    }
    return `${name} ${Number(value.toFixed(6))}${unit === "PERCENT" ? "%" : ""}`;
  }
  function label() {
    return window.RangerbookI18n?.t("gear.highLevelOptions", "高級效果") || "高級效果";
  }
  window.RangerbookPlayerEquipment = { effectText, label };
})();
