/* Sensitive records stay in memory and are rendered only as plain text. */
(() => {
  const auth = window.RangerbookAuth;
  const $ = id => document.getElementById(id);
  const panel = $("adminLogsPanel"), list = $("backendLogsList"), status = $("backendLogsStatus");
  if (!auth || !panel || !list || !status) return;
  const ui = value => window.RangerbookI18n?.uiText(value) || value;
  const format = (key, args, fallback) => window.RangerbookI18n?.format(key, args, fallback) || fallback.replace(/%N(\d+)/g, (_, n) => args[Number(n) - 1]);
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
        const text = String(entry.message || "");
        const lines = Number(entry.lineCount) || text.split("\n").length;
        if (lines > 1) {
          const count = document.createElement("span");
          count.className = "backend-log-line-count";
          count.textContent = format("site.backendLogs.lines", [lines], "%N1 行");
          meta.append(count);
        }
        const message = document.createElement("pre");
        message.textContent = text;
        row.append(meta);
        if (entry.partial) {
          const note = document.createElement("p");
          note.className = "backend-log-partial";
          note.textContent = ui("此段內容可能不完整，可增加讀取行數或調整時間範圍。");
          row.append(note);
        }
        if (entry.truncated) {
          const note = document.createElement("p");
          note.className = "backend-log-partial";
          note.textContent = ui("內容超過顯示上限，已截斷。");
          row.append(note);
        }
        if (lines > 5 || text.length > 400) {
          const preview = document.createElement("pre");
          preview.className = "backend-log-preview";
          preview.textContent = text.split("\n").slice(0, 3).join("\n").slice(0, 240);
          const details = document.createElement("details");
          details.className = "backend-log-content";
          const summary = document.createElement("summary");
          const setExpanded = () => {
            preview.hidden = details.open;
            summary.textContent = details.open ? ui("收合內容") : format("site.backendLogs.expand", [lines], "展開內容（%N1 行）");
          };
          setExpanded();
          details.addEventListener("toggle", setExpanded);
          details.append(summary, message);
          row.append(preview, details);
        } else row.append(message);
        list.append(row);
      }
      const rawCount = data.rawCount ?? (data.items || []).reduce((count, entry) => count + (Number(entry.lineCount) || 1), 0);
      status.textContent = format("site.backendLogs.counts", [data.items?.length || 0, rawCount], "%N1 筆紀錄 · %N2 行日誌") + " · " + ui("最新紀錄在上方");
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
