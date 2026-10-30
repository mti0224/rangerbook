/* Sensitive records stay in memory and are rendered only as plain text. */
(() => {
  const auth = window.RangerbookAuth;
  const $ = id => document.getElementById(id);
  const panel = $("adminLogsPanel"), list = $("backendLogsList"), status = $("backendLogsStatus");
  if (!auth || !panel || !list || !status) return;
  const ui = value => window.RangerbookI18n?.uiText(value) || value;
  const format = (key, args, fallback) => window.RangerbookI18n?.format(key, args, fallback) || fallback.replace(/%N(\d+)/g, (_, n) => args[Number(n) - 1]);
  let generation = 0, controller = null;
  const serviceNames = {
    "rangerbook-auth.service":"帳號服務", "rangerbook-update.service":"遊戲資料更新（V1）",
    "rangerbook-v2-update.service":"遊戲資料更新（V2）", "rangerbook-private-resources.service":"遊戲圖片更新",
    "rangerbook-pvp-leaderboard.service":"PvP 排行榜", "rangerbook-pvp-usage.service":"PvP 角色使用率",
    "rangerbook-pvp-usage-history.service":"PvP 歷史紀錄", "rangerbook-guildwar-data.service":"公會戰詳細資料",
    "rangerbook-guildwar-ranking.service":"公會戰排行榜", "rangerbook-guildwar-usage.service":"公會戰角色使用率",
    "rangerbook-player-index.service":"玩家暱稱與 UID 名單", "rangerbook-member-mail.service":"會員郵件寄送",
    "rangerbook-member-health.service":"會員服務健康檢查", "rangerbook-traffic.service":"網站流量統計"
  };
  const reasons = {
    maintenance:"遊戲維護中，本次執行未完成。", rateLimited:"請求過於頻繁，本次執行未完成。",
    timeout:"連線逾時，本次執行未完成。", serviceUnavailable:"遊戲服務暫時無法使用，本次執行未完成。",
    unavailableData:"部分遊戲資料無法取得。", apiRejected:"遊戲 API 拒絕請求，本次執行未完成。",
    diskFull:"主機空間不足，本次執行未完成。", permission:"存取權限不足，本次執行未完成。",
    connection:"無法連線至服務，本次執行未完成。", invalidRequest:"收到格式不正確的 HTTP 請求。",
    unknown:"執行失敗，原因請查看原始紀錄。", completed:"執行完成。", unchanged:"資料沒有變動，無需更新。"
  };
  const recovered = {
    maintenance:"執行完成，部分請求遇到遊戲維護。", rateLimited:"執行完成，期間曾遇到請求頻率限制。",
    unavailableData:"執行完成，部分遊戲資料無法取得。"
  };
  function summaryText(entry, info = entry.summary) {
    if (!info) {
      if (entry.kind === "run") info = {reason:entry.status === "success" ? "completed" : "unknown"};
      else info = {reason:/Invalid HTTP request/.test(entry.message || "") ? "invalidRequest" : "event"};
    }
    let text = info.warning ? ui(recovered[info.reason] || "執行完成，期間曾發生異常，詳情請查看原始紀錄。")
      : ui(reasons[info.reason] || (entry.priority <= 3 ? "服務發生錯誤，詳情請查看原始紀錄。" : entry.priority === 4 ? "服務發出警告，詳情請查看原始紀錄。" : "已記錄服務事件。"));
    const http = (info.httpCodes || []).filter(x => /^[45]\d{2}$/.test(String(x))).slice(0,3).map(x => "HTTP " + x);
    const api = (info.apiCodes || []).filter(x => /^(112004|119801|429|512)$/.test(String(x)) && !(info.httpCodes || []).includes(String(x))).slice(0,3);
    const codes = [...http, ...(api.length ? [format("site.backendLogs.apiCode", [api.join(", ")], "錯誤碼 %N1")] : [])];
    if (codes.length) text += " (" + codes.join(" · ") + ")";
    return text;
  }
  function addSummary(row, entry) {
    const description = document.createElement("p");
    description.className = "backend-log-description";
    description.textContent = summaryText(entry);
    row.append(description);
    if (entry.summary?.warning) row.classList.replace("is-success", "is-warning");
    return description;
  }

  function clear() {
    ++generation;
    controller?.abort();
    controller = null;
    list.replaceChildren();
    list.setAttribute("aria-busy", "false");
    status.textContent = "";
    $("backendLogsRefresh").disabled = false;
  }

  function dateLabel(value) {
    if (!value) return "—";
    const locale = {jp:"ja-JP", th:"th-TH-u-ca-gregory", en:"en-GB"}[window.RangerbookI18n?.locale] || "zh-TW";
    return new Date(value).toLocaleString(locale, {timeZone:"Asia/Taipei", hour12:false});
  }

  function addRun(row, entry, description) {
    const timing = document.createElement("p");
    timing.className = "backend-log-run-timing";
    const duration = entry.durationSeconds == null ? "—" : Number(entry.durationSeconds).toFixed(1);
    timing.textContent = format("site.backendLogs.runTiming", [dateLabel(entry.startedAt), duration], "開始：%N1 · 耗時：%N2 秒");
    const details = document.createElement("details");
    details.className = "backend-log-content backend-log-run";
    const summary = document.createElement("summary");
    const output = document.createElement("pre");
    let pending = false, loaded = false, lineCount = 0;
    const label = () => {
      summary.textContent = details.open ? (pending ? ui("正在讀取日誌…") : ui("收合原始紀錄"))
        : loaded ? format("site.backendLogs.expandRaw", [lineCount], "查看原始紀錄（%N1 行）") : ui("查看原始紀錄");
    };
    label();
    details.append(summary, output);
    details.addEventListener("toggle", async () => {
      label();
      if (!details.open || loaded || pending || !auth.isSuperAdmin()) return;
      const request = generation;
      pending = true;
      output.textContent = ui("正在讀取日誌…");
      label();
      try {
        const params = new URLSearchParams({service:entry.service});
        const data = await auth.api("/admin/backend-logs/runs/" + encodeURIComponent(entry.runId) + "?" + params, {signal:controller?.signal});
        if (request !== generation || !auth.isSuperAdmin() || panel.hidden) return;
        output.textContent = data.message || ui("此範圍內沒有符合條件的日誌。");
        if (data.summary) {
          description.textContent = summaryText(entry, data.summary);
          if (data.summary.warning) row.classList.replace("is-success", "is-warning");
        }
        lineCount = Number(data.lineCount) || 0;
        loaded = true;
        if (data.truncated || data.partial) {
          const note = document.createElement("p");
          note.className = "backend-log-partial";
          note.textContent = ui(data.truncated ? "內容超過顯示上限，已截斷。" : "部分輸出已超過伺服器保留期限，僅能顯示仍保留的內容。");
          details.append(note);
        }
      } catch (error) {
        if (request !== generation) return;
        output.textContent = ui("無法讀取日誌，請稍後重試。");
        if (error.status === 401 || error.status === 403) await auth.refresh();
      } finally {
        pending = false;
        if (request === generation) label();
      }
    });
    row.append(timing, details);
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
      await window.RangerbookI18n?.ready;
      if (request !== generation || !auth.isSuperAdmin() || panel.hidden) return;
      for (const entry of data.items || []) {
        const row = document.createElement("article");
        row.className = "backend-log-entry " + (entry.priority <= 3 ? "is-error" : entry.kind === "run" ? "is-success" : entry.priority === 4 ? "is-warning" : "");
        const meta = document.createElement("div");
        meta.className = "backend-log-meta";
        const time = document.createElement("time");
        time.dateTime = entry.time;
        time.textContent = (entry.kind === "run" ? ui("結束：") : "") + dateLabel(entry.time);
        const service = document.createElement("code");
        service.textContent = ui(serviceNames[entry.service] || "其他服務");
        service.title = entry.service;
        const level = document.createElement("span");
        level.textContent = entry.kind === "run" ? ui(entry.status === "success" ? entry.summary?.warning ? "完成（有警告）" : "執行成功" : "執行失敗")
          : ["EMERG", "ALERT", "CRIT", "ERROR", "WARN", "NOTICE", "INFO", "DEBUG"][entry.priority] || "INFO";
        meta.append(time, level, service);
        if (entry.kind === "run") {
          row.append(meta);
          addRun(row, entry, addSummary(row, entry));
          list.append(row);
          continue;
        }
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
        addSummary(row, entry);
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
        {
          const details = document.createElement("details");
          details.className = "backend-log-content";
          const summary = document.createElement("summary");
          const setExpanded = () => {
            summary.textContent = details.open ? ui("收合原始紀錄") : format("site.backendLogs.expandRaw", [lines], "查看原始紀錄（%N1 行）");
          };
          setExpanded();
          details.addEventListener("toggle", setExpanded);
          details.append(summary, message);
          row.append(details);
        }
        list.append(row);
      }
      const rawCount = data.rawCount ?? (data.items || []).reduce((count, entry) => count + (Number(entry.lineCount) || 1), 0);
      status.textContent = (data.mode && data.mode !== "events"
        ? format("site.backendLogs.entryCount", [data.items?.length || 0], "%N1 筆紀錄")
        : format("site.backendLogs.counts", [data.items?.length || 0, rawCount], "%N1 筆紀錄 · %N2 行日誌")) + " · " + ui("最新紀錄在上方");
      if (data.searchLimited) status.textContent += " · " + ui("搜尋結果較多，請縮小時間範圍以查看更多紀錄。");
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
