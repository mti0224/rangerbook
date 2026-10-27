/* Sensitive records stay in memory and are rendered only as plain text. */
(() => {
  const auth = window.RangerbookAuth;
  const $ = id => document.getElementById(id);
  const panel = $("adminLogsPanel"), list = $("backendLogsList"), status = $("backendLogsStatus");
  if (!auth || !panel || !list || !status) return;
  const ui = value => window.RangerbookI18n?.uiText(value) || value;
  let generation = 0, controller = null;

  function clear() {
    ++generation;
    controller?.abort();
    controller = null;
    list.replaceChildren();
    list.setAttribute("aria-busy", "false");
    status.textContent = "";
    $("backendLogsRefresh").disabled = false;
  }

  async function load() {
    if (!auth.isSuperAdmin() || panel.hidden) return clear();
    clear();
    const request = generation;
    controller = new AbortController();
    list.setAttribute("aria-busy", "true");
    $("backendLogsRefresh").disabled = true;
    status.textContent = ui("正在讀取日誌…");
    const params = new URLSearchParams({
      source: $("backendLogsSource").value, hours: $("backendLogsHours").value,
      level: $("backendLogsLevel").value, limit: $("backendLogsLimit").value,
      keyword: $("backendLogsKeyword").value.trim()
    });
    try {
      const data = await auth.api("/admin/backend-logs?" + params, {signal: controller.signal});
      if (request !== generation || !auth.isSuperAdmin() || panel.hidden) return;
      for (const entry of data.items || []) {
        const row = document.createElement("article");
        row.className = "backend-log-entry " + (entry.priority <= 3 ? "is-error" : entry.priority === 4 ? "is-warning" : "");
        const meta = document.createElement("div");
        meta.className = "backend-log-meta";
        const time = document.createElement("time");
        time.dateTime = entry.time;
        const locale = {jp:"ja-JP", th:"th-TH-u-ca-gregory", en:"en-GB"}[window.RangerbookI18n?.locale] || "zh-TW";
        time.textContent = new Date(entry.time).toLocaleString(locale, {timeZone:"Asia/Taipei", hour12:false});
        const service = document.createElement("code");
        service.textContent = entry.service;
        const level = document.createElement("span");
        level.textContent = ["EMERG", "ALERT", "CRIT", "ERROR", "WARN", "NOTICE", "INFO", "DEBUG"][entry.priority] || "INFO";
        meta.append(time, level, service);
        const message = document.createElement("pre");
        message.textContent = entry.message;
        row.append(meta, message);
        list.append(row);
      }
      status.textContent = (data.items?.length || 0) + " / " + data.limit + " · " + ui("最新紀錄在上方");
      if (!data.items?.length) status.textContent = ui("此範圍內沒有符合條件的日誌。");
    } catch (error) {
      if (request !== generation || error.name === "AbortError") return;
      list.replaceChildren();
      status.textContent = ui(error.status === 429 ? "查詢過於頻繁，請稍後再試。" : error.status === 401 || error.status === 403 ? "無權查看日誌，請重新登入並確認權限。" : "無法讀取日誌，請稍後重試。");
      if (error.status === 401 || error.status === 403) await auth.refresh();
    } finally {
      if (request === generation) {
        list.setAttribute("aria-busy", "false");
        $("backendLogsRefresh").disabled = false;
      }
    }
  }
  $("backendLogsForm").addEventListener("submit", event => { event.preventDefault(); load(); });
  for (const name of ["Source", "Hours", "Level", "Limit"]) $("backendLogs" + name).addEventListener("change", load);
  window.addEventListener("rangerbook:backend-logs-open", load);
  window.addEventListener("rangerbook:auth-changed", () => { if (!auth.isSuperAdmin()) clear(); });
  new MutationObserver(() => { if (panel.hidden) clear(); }).observe(panel, {attributes:true, attributeFilter:["hidden"]});
  window.addEventListener("pagehide", clear);
})();
