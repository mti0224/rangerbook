(() => {
  const ui = value => window.RangerbookI18n?.uiText(String(value)) || String(value);
  const formatUi = (key,args,fallback) => window.RangerbookI18n?.format(key,args,fallback) || fallback;
  const auth = window.RangerbookAuth;
  if (!auth) return;

  const $ = (id) => document.getElementById(id);
  const authCard = $("adminAuthCard");
  const sessionCard = $("adminSessionCard");
  const superAdminPanel = $("superAdminPanel");
  const workspace = $("adminWorkspace");
  const workspaceTabs = $("adminWorkspaceTabs");
  const passwordCard = $("adminPasswordCard");
  const workspacePanels = {
    resources: { button: $("adminResourcesTab"), panel: $("adminResourceUpdatesCard") },
    accounts: { button: $("adminAccountsTab"), panel: superAdminPanel },
    traffic: { button: $("adminTrafficTab"), panel: $("adminTrafficPanel") }
  };
  let activeWorkspaceSection = "resources";
  const loginPanel = $("adminLoginPanel");
  const registerPanel = $("adminRegisterPanel");
  const loginTab = $("adminLoginTab");
  const registerTab = $("adminRegisterTab");
  const loginForm = $("adminLoginForm");
  const registerForm = $("adminRegisterForm");
  const authMessage = $("adminAuthMessage");
  const sessionMessage = $("adminSessionMessage");
  const currentAccount = $("adminCurrentAccount");
  const currentRole = $("adminCurrentRole");
  const currentStatus = $("adminCurrentStatus");
  const usersList = $("adminUsersList");
  const refreshBtn = $("adminRefreshBtn");
  const resourceUpdatesCard = $("adminResourceUpdatesCard");
  const resourceUpdatesSummary = $("adminResourceUpdatesSummary");
  const resourceUpdatesList = $("adminResourceUpdatesList");
  const resourceUpdatesRefreshBtn = $("adminResourceUpdatesRefreshBtn");

  const ROLE_LABELS = {
    super_admin: "最大管理者",
    admin: "管理員",
    user: "一般會員"
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setMessage(target, text = "", type = "") {
    if (!target) return;
    target.textContent = text;
    target.className = `admin-message ${type}`.trim();
  }

  function showAuthPanel(mode) {
    const isLogin = mode !== "register";
    loginPanel.hidden = !isLogin;
    registerPanel.hidden = isLogin;
    loginTab.classList.toggle("active", isLogin);
    registerTab.classList.toggle("active", !isLogin);
    setMessage(authMessage);
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString(window.RangerbookI18n?.locale === "jp" ? "ja-JP" : window.RangerbookI18n?.locale === "th" ? "th-TH-u-ca-gregory" : window.RangerbookI18n?.locale === "en" ? "en-GB" : "zh-TW", { hour12: false, timeZone: "Asia/Taipei" });
  }

  // Changing tabs affects visibility, not RangerbookAuth / AWS permissions.
  function allowedWorkspaceSections() {
    return {
      resources: auth.isAdmin(),
      accounts: auth.isSuperAdmin(),
      traffic: auth.isAdmin()
    };
  }

  function renderWorkspaceTabs() {
    const allowed = allowedWorkspaceSections();
    const user = auth.getUser();
    const hasAccess = Boolean(user.logged_in);
    if (workspace) workspace.hidden = !hasAccess;
    if (user.must_change_password || !allowed[activeWorkspaceSection]) activeWorkspaceSection = "resources";

    Object.entries(workspacePanels).forEach(([key, { button, panel }]) => {
      const accessible = Boolean(allowed[key]);
      const selected = hasAccess && accessible && activeWorkspaceSection === key;
      if (button) {
        button.hidden = !accessible;
        button.setAttribute("aria-selected", selected ? "true" : "false");
        button.tabIndex = selected ? 0 : -1;
      }
      if (panel) panel.hidden = !selected;
    });
  }

  function selectWorkspaceSection(section, focus = false) {
    if (!Object.prototype.hasOwnProperty.call(workspacePanels, section)) return;
    if (!allowedWorkspaceSections()[section]) return;
    activeWorkspaceSection = section;
    renderWorkspaceTabs();
    if (section === "traffic") loadTraffic();
    if (section === "personal") window.dispatchEvent(new Event("rangerbook:personal-teams-open"));
    if (section === "personal") window.RangerbookPersonalTeams?.refresh();
    if (focus) workspacePanels[section].button?.focus();
  }

  // GA4 updates are stored in UTC. Display Taiwan time regardless of browser locale.
  function formatTrafficUpdatedAt(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Taipei", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).formatToParts(date).filter(part => part.type !== "literal")
      .map(part => [part.type, part.value]));
    return parts.year + "-" + parts.month + "-" + parts.day + " [" +
      parts.hour + ":" + parts.minute + ":" + parts.second + "]";
  }

  let trafficRequestId = 0;
  const trafficIds = ["trafficSummary", "trafficDaily", "trafficPages", "trafficSources"];
  function clearTraffic() {
    trafficIds.forEach(id => $(id)?.replaceChildren());
  }

  async function loadTraffic() {
    if (!auth.isAdmin()) return;
    await window.RangerbookI18n?.ready;
    if (!auth.isAdmin()) return;
    const requestId = ++trafficRequestId;
    const status = $("trafficStatus");
    const days = Number($("trafficDays").value);
    status.textContent = "載入中…";
    try {
      const data = await auth.api("/admin/traffic?days=" + days);
      // Switching ranges or logging out must not display stale private data.
      if (requestId !== trafficRequestId || !auth.isAdmin()) return;
      if (data.status !== "ready") {
        status.textContent = data.message || "尚未設定 GA4 資料來源";
        clearTraffic();
        return;
      }
      const numeric = value => Number(value || 0).toLocaleString("zh-TW");
      status.textContent = formatUi("traffic.latestUpdated", [formatTrafficUpdatedAt(data.updatedAt)], "最新更新：" + formatTrafficUpdatedAt(data.updatedAt));
      $("trafficSummary").replaceChildren();
      Object.entries(data.summary || {}).forEach(([key, value]) => {
        const card = document.createElement("div");
        const label = document.createElement("span");
        const number = document.createElement("strong");
        label.textContent = ui(({
          users: "使用者", views: "瀏覽次數",
          sessions: "工作階段", engagedSessions: "互動工作階段"
        })[key] || key);
        number.textContent = numeric(value);
        card.append(label, number);
        $("trafficSummary").append(card);
      });
      const pages = $("trafficPages");
      pages.replaceChildren();
      (Array.isArray(data.pages) ? data.pages : []).forEach(item => {
        const row = document.createElement("div");
        row.className = "traffic-row";
        const left = document.createElement("span"), right = document.createElement("strong");
        left.textContent = item.path ?? "-";
        right.textContent = numeric(item.views);
        row.append(left, right);
        pages.append(row);
      });
      window.RangerbookTrafficCharts.renderDaily($("trafficDaily"), data.daily);
      window.RangerbookTrafficCharts.renderSources($("trafficSources"), data.sources);
    } catch (error) {
      if (requestId !== trafficRequestId || !auth.isAdmin()) return;
      clearTraffic();
      status.textContent = formatUi("site.common.readError",[ui(error?.message || "未知錯誤")],"無法讀取：" + (error?.message || "未知錯誤"));
    }
  }
  $("trafficRefresh")?.addEventListener("click",loadTraffic);
  $("trafficDays")?.addEventListener("change",loadTraffic);

  function renderUserState(user) {
    if ($("memberLoginStep")) $("memberLoginStep").hidden = !(user.mfa_required || user.setup_required || user.must_change_password);
    authCard.hidden = Boolean(user.logged_in);
    sessionCard.hidden = !user.logged_in;
    superAdminPanel.hidden = !auth.isSuperAdmin();
    if (resourceUpdatesCard) resourceUpdatesCard.hidden = !auth.isAdmin();
    renderWorkspaceTabs();

    if (!auth.isAdmin()) {
      ++trafficRequestId;
      clearTraffic();
      $("trafficStatus").textContent = "";
    }
    if (!auth.isSuperAdmin()) clearAccounts();
    if (!user.logged_in) return;

    currentAccount.textContent = user.account || "-";
    currentRole.textContent = ROLE_LABELS[user.role] || user.role || "-";
    currentRole.className = `admin-role-badge ${user.role === "super_admin" ? "super-admin" : user.role === "admin" ? "admin" : ""}`.trim();

    currentStatus.textContent = ui("已登入");
    currentStatus.className = "admin-status-badge approved";
    setMessage(sessionMessage, user.must_change_password ? ui("請先更改重設後的臨時密碼。") : "", user.must_change_password ? "error" : "");
  }

  function renderResourceUpdates(payload) {
    const batches = Array.isArray(payload?.items) ? payload.items : [];
    const lastChecked = formatDate(payload?.lastCheckedAt);
    const resourceTimestamp = payload?.resourceTimestamp || "-";
    const totalRecorded = Number(payload?.totalRecordedBatches || batches.length || 0);

    if (resourceUpdatesSummary) {
      resourceUpdatesSummary.innerHTML = `
        <span><strong>最近檢查</strong>：${escapeHtml(lastChecked)}</span>
        <span><strong>Resource Timestamp</strong>：${escapeHtml(resourceTimestamp)}</span>
        <span><strong>已記錄批次</strong>：${escapeHtml(totalRecorded)}</span>
      `;
    }

    if (!resourceUpdatesList) return;
    if (!batches.length) {
      resourceUpdatesList.innerHTML = '<div class="admin-empty">目前尚未偵測到新的資源變動。</div>';
      return;
    }

    resourceUpdatesList.innerHTML = batches.map((batch) => {
      const items = Array.isArray(batch?.items) ? batch.items : [];
      const paths = items.map((item) => String(item?.path || "")).filter(Boolean);
      const count = Number(batch?.count ?? paths.length);
      const dbCount = Number(batch?.dbCount || 0);
      const deletedCount = Number(batch?.deletedCount || 0);
      const detectedAt = formatDate(batch?.detectedAt);
      const meta = [
        formatUi("dynamic.files", [count], `${count} 個檔案`),
        dbCount ? `DB/NDB ${dbCount}` : "",
        deletedCount ? `刪除 ${deletedCount}` : ""
      ].filter(Boolean).join(" · ");

      return `
        <details class="admin-update-batch">
          <summary data-expand-text="${escapeHtml(ui("展開"))}" data-collapse-text="${escapeHtml(ui("收合"))}">
            <span class="admin-update-batch-title">
              <strong>${escapeHtml(detectedAt)}</strong>
              <small>${escapeHtml(meta)}</small>
            </span>
            <span class="admin-update-batch-ts">TS ${escapeHtml(batch?.resourceTimestamp || "-")}</span>
          </summary>
          <pre class="admin-update-paths">${escapeHtml(paths.join("\n"))}</pre>
        </details>
      `;
    }).join("");
  }

  async function loadResourceUpdates() {
    if (!auth.isAdmin() || !resourceUpdatesCard) return;
    await window.RangerbookI18n?.ready;
    if (!auth.isAdmin()) return;
    if (resourceUpdatesSummary) resourceUpdatesSummary.textContent = "載入中…";
    if (resourceUpdatesList) resourceUpdatesList.innerHTML = '<div class="admin-empty">載入中…</div>';

    try {
      const payload = await auth.api("/admin/resource-updates?limit=40");
      renderResourceUpdates(payload || {});
    } catch (error) {
      if (resourceUpdatesSummary) resourceUpdatesSummary.textContent = "無法讀取資源更新紀錄。";
      if (resourceUpdatesList) {
        resourceUpdatesList.innerHTML = `<div class="admin-empty">${escapeHtml(error.message)}</div>`;
      }
    }
  }

  let accountItems = [], accountPage = 1, accountsRequestId = 0, accountsBusy = false;
  const accountPageSize = 12;
  let filteredAccountCount = 0;
  const accountControls = ["adminAccountSearch", "adminAccountRole", "adminAccountPassword", "adminAccountSort", "adminAccountClear", "adminAccountPrevious", "adminAccountNext"];

  function clearAccounts() {
    ++accountsRequestId;
    accountItems = []; accountPage = 1;
    usersList.replaceChildren();
    $("adminAccountSummary")?.replaceChildren();
    $("adminAccountResults").textContent = "";
    $("adminAccountPage").textContent = "";
  }

  async function loadSuperAdminData() {
    if (!auth.isSuperAdmin() || accountsBusy) return;
    await window.RangerbookI18n?.ready;
    if (!auth.isSuperAdmin() || accountsBusy) return;
    const requestId = ++accountsRequestId;
    usersList.setAttribute("aria-busy", "true");
    refreshBtn.disabled = true;
    $("adminAccountResults").textContent = ui("載入中…");
    try {
      const users = await auth.api("/admin/users");
      if (requestId !== accountsRequestId || !auth.isSuperAdmin()) return;
      accountItems = Array.isArray(users?.items) ? users.items : [];
      renderUsers();
    } catch (error) {
      if (requestId !== accountsRequestId || !auth.isSuperAdmin()) return;
      accountItems = []; renderUsers();
      usersList.innerHTML = `<div class="admin-empty" role="alert">${escapeHtml(ui(error.message))}</div>`;
    } finally {
      if (requestId === accountsRequestId || !auth.isSuperAdmin()) {
        usersList.setAttribute("aria-busy", "false");
        refreshBtn.disabled = false;
      }
    }
  }

  function renderUsers() {
    if (!auth.isSuperAdmin()) return;
    const total = accountItems.length;
    $("adminAccountSummary").innerHTML = [["所有帳號",total], ["一般會員",accountItems.filter(x=>x.role==="user").length], ["管理員",accountItems.filter(x=>x.role==="admin").length], ["最大管理者",accountItems.filter(x=>x.role==="super_admin").length]].map(([title,count])=>`<div><span>${escapeHtml(ui(title))}</span><strong>${count}</strong></div>`).join("");
    const query = $("adminAccountSearch").value.trim().toLocaleLowerCase();
    const role = $("adminAccountRole").value, password = $("adminAccountPassword").value;
    const rank = {super_admin:0,admin:1,user:2};
    const items = accountItems.filter(item => String(item.account || "").toLocaleLowerCase().includes(query) && (role === "all" || item.role === role) && (password === "all" || Boolean(item.must_change_password) === (password === "required")));
    const byName = (a,b) => String(a.account).localeCompare(String(b.account), undefined, {numeric:true,sensitivity:"base"});
    const dateValue = item => Date.parse(item.created_at) || 0;
    items.sort((a,b) => {
      switch ($("adminAccountSort").value) {
        case "name": return byName(a,b);
        case "newest": return dateValue(b)-dateValue(a) || byName(a,b);
        case "oldest": return dateValue(a)-dateValue(b) || byName(a,b);
        default: return (rank[a.role] ?? 3)-(rank[b.role] ?? 3) || byName(a,b);
      }
    });
    filteredAccountCount = items.length;
    const pages = Math.max(1, Math.ceil(items.length/accountPageSize));
    accountPage = Math.max(1,Math.min(accountPage,pages));
    $("adminAccountResults").textContent = formatUi("site.admin.accountResults", [items.length,total], `符合 ${items.length} / 共 ${total} 個帳號`);
    $("adminAccountPage").textContent = formatUi("site.admin.accountPage",[accountPage,pages],`第 ${accountPage} / ${pages} 頁`);
    $("adminAccountPrevious").disabled = accountsBusy || accountPage === 1;
    $("adminAccountNext").disabled = accountsBusy || accountPage === pages;
    usersList.innerHTML = items.slice((accountPage-1)*accountPageSize,accountPage*accountPageSize).map(item => {
      const isSuperAdmin = item.role === "super_admin";
      const controls = isSuperAdmin ? `<div class="admin-locked-note">${escapeHtml(ui("此帳號只能由伺服器端管理"))}</div>` : `
        <div class="admin-user-controls">
          <label class="admin-role-control"><span>${escapeHtml(ui("帳號權限"))}</span>
            <select data-role-select aria-label="${escapeHtml(item.account)} · ${escapeHtml(ui("帳號權限"))}">
              <option value="user" ${item.role === "user" ? "selected" : ""}>${escapeHtml(ui("一般會員"))}</option>
              <option value="admin" ${item.role === "admin" ? "selected" : ""}>${escapeHtml(ui("管理員"))}</option>
            </select>
          </label>
          <div class="admin-user-actions admin-user-actions--management">
            <button class="approve" type="button" data-action="change-role" disabled>${escapeHtml(ui("套用權限"))}</button>
            <details class="admin-overflow">
              <summary class="admin-overflow-trigger" aria-label="${escapeHtml(item.account)} · ${escapeHtml(ui("更多帳號操作"))}" title="${escapeHtml(ui("更多帳號操作"))}">⋯</summary>
              <div class="admin-overflow-menu" role="menu">
                <button class="warning" type="button" role="menuitem" data-action="reset-password">${escapeHtml(ui("重置密碼"))}</button>
                <button class="danger" type="button" role="menuitem" data-action="delete-user">${escapeHtml(ui("刪除帳號"))}</button>
              </div>
            </details>
          </div>
        </div>`;
      return `<article class="admin-user-row admin-user-row--management" data-user-id="${escapeHtml(item.id)}" data-user-account="${escapeHtml(item.account)}" data-user-role="${escapeHtml(item.role)}">
          <div class="admin-user-meta"><strong data-i18n-ignore>${escapeHtml(item.account)}</strong>
            <div class="admin-account-badges"><span class="admin-role-badge ${isSuperAdmin ? "super-admin" : item.role === "admin" ? "admin" : ""}">${escapeHtml(ui(ROLE_LABELS[item.role] || item.role))}</span>${item.must_change_password ? `<span class="admin-password-notice">${escapeHtml(ui("須更改密碼"))}</span>` : ""}</div>
            <small>${escapeHtml(ui("建立時間"))}：${escapeHtml(formatDate(item.created_at))}</small>
          </div>${controls}</article>`;
    }).join("") || `<div class="admin-empty">${escapeHtml(ui(total ? "沒有符合條件的帳號。" : "目前沒有使用者。"))}</div>`;
  }

  for (const id of ["adminAccountSearch", "adminAccountRole", "adminAccountPassword", "adminAccountSort"]) {
    $(id)?.addEventListener(id === "adminAccountSearch" ? "input" : "change", () => { accountPage = 1; renderUsers(); });
  }
  $("adminAccountClear")?.addEventListener("click", () => {
    $("adminAccountSearch").value = "";
    $("adminAccountRole").value = $("adminAccountPassword").value = "all";
    $("adminAccountSort").value = "role"; accountPage = 1; renderUsers();
  });
  $("adminAccountPrevious")?.addEventListener("click", () => { --accountPage; renderUsers(); });
  $("adminAccountNext")?.addEventListener("click", () => { ++accountPage; renderUsers(); });
  usersList?.addEventListener("change", event => {
    if (!event.target.matches("[data-role-select]")) return;
    const row = event.target.closest(".admin-user-row");
    row.querySelector('[data-action="change-role"]').disabled = accountsBusy || event.target.value === row.dataset.userRole;
  });

  function setRowDisabled(row, disabled) {
    row.querySelectorAll("button, select").forEach((element) => { element.disabled = disabled; });
    row.querySelectorAll(".admin-overflow-trigger").forEach((element) => {
      element.setAttribute("aria-disabled", disabled ? "true" : "false");
      element.tabIndex = disabled ? -1 : 0;
    });
  }

  async function runUserAction(row, action) {
    const userId = row?.dataset.userId;
    const account = row?.dataset.userAccount || ui("此帳號");
    if (!userId || accountsBusy || !auth.isSuperAdmin()) return;

    row.querySelectorAll("details[open]").forEach((details) => details.removeAttribute("open"));

    let endpoint = "";
    let options = { method: "POST" };
    let successMessage = "";

    if (action === "change-role") {
      const role = row.querySelector("[data-role-select]")?.value;
      if (!role || role === row.dataset.userRole) return;
      const roleLabel = ui(ROLE_LABELS[role] || role);
      if (!window.confirm(formatUi("site.admin.roleConfirm",[account,roleLabel],`確定要將「${account}」的權限更改為「${roleLabel}」？ 變更後該帳號目前所有登入狀態會立即失效。`))) return;
      endpoint = `/admin/users/${encodeURIComponent(userId)}/role`;
      options.body = JSON.stringify({ role });
      successMessage = formatUi("site.admin.roleDone",[account,roleLabel],`已將「${account}」權限更改為「${roleLabel}」。`);
    } else if (action === "reset-password") {
      if (!window.confirm(formatUi("site.admin.resetConfirm",[account],`確定要重置「${account}」的密碼？`))) return;
      if (!window.confirm(formatUi("site.admin.resetFinal",[account],`再次確認：為「${account}」產生新的臨時密碼？ 重置後該帳號目前所有登入狀態會立即失效。`))) return;
      endpoint = `/admin/users/${encodeURIComponent(userId)}/reset-password`;
    } else if (action === "delete-user") {
      if (!window.confirm(formatUi("site.admin.deleteConfirm",[account],`確定要刪除帳號「${account}」？`))) return;
      if (!window.confirm(formatUi("site.admin.deleteFinal",[account],`再次確認：永久刪除帳號「${account}」？ 此操作無法復原，該帳號所有登入狀態也會立即失效。`))) return;
      endpoint = `/admin/users/${encodeURIComponent(userId)}/delete`;
      successMessage = formatUi("site.admin.deleteDone",[account],`已刪除帳號「${account}」。`);
    } else {
      return;
    }

    ++accountsRequestId;
    accountsBusy = true;
    [refreshBtn, ...accountControls.map($)].filter(Boolean).forEach(element => { element.disabled = true; });
    usersList.querySelectorAll(".admin-user-row").forEach(item => setRowDisabled(item, true));
    try {
      const payload = await auth.api(endpoint, options);
      if (action === "reset-password") {
        successMessage = formatUi("site.admin.resetDone",[account,payload.reset_password],`已為「${account}」產生臨時密碼：${payload.reset_password}。請以安全方式交給本人，首次登入須先更改密碼。`);
      }
      if (successMessage) window.alert(successMessage);
      accountsBusy = false;
      await loadSuperAdminData();
    } catch (error) {
      if (auth.isSuperAdmin()) window.alert(ui(error.message));
    } finally {
      accountsBusy = false;
      [refreshBtn, ...accountControls.map($)].filter(Boolean).forEach(element => { element.disabled = false; });
      if (auth.isSuperAdmin()) {
        usersList.querySelectorAll(".admin-user-row").forEach(item => {
          setRowDisabled(item, false);
          const button = item.querySelector('[data-action="change-role"]');
          if (button) button.disabled = item.querySelector('[data-role-select]').value === item.dataset.userRole;
        });
        $("adminAccountPrevious").disabled = accountPage === 1;
        $("adminAccountNext").disabled = accountPage * accountPageSize >= filteredAccountCount;
      }
    }
  }

  workspaceTabs?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-admin-section]");
    if (!button || !workspaceTabs.contains(button)) return;
    selectWorkspaceSection(button.dataset.adminSection);
  });

  workspaceTabs?.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const available = Object.values(workspacePanels).map(item => item.button)
      .filter(button => button && !button.hidden);
    if (!available.length) return;
    const currentIndex = available.indexOf(document.activeElement);
    let nextIndex = currentIndex >= 0 ? currentIndex : 0;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = available.length - 1;
    if (event.key === "ArrowRight") nextIndex = (nextIndex + 1) % available.length;
    if (event.key === "ArrowLeft") nextIndex = (nextIndex - 1 + available.length) % available.length;
    event.preventDefault();
    selectWorkspaceSection(available[nextIndex].dataset.adminSection, true);
  });

  loginTab?.addEventListener("click", () => showAuthPanel("login"));
  registerTab?.addEventListener("click", () => showAuthPanel("register"));

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const account = $("adminLoginAccount").value.trim();
    const password = $("adminLoginPassword").value;
    setMessage(authMessage, "登入中…");

    try {
      const user = await auth.login(account, password);
      $("adminLoginPassword").value = "";
      if(user.logged_in){location.assign(location.pathname.startsWith("/rangerbook/")?"/rangerbook/":"/");return;}
      location.assign("../login/");

    } catch (error) {
      setMessage(authMessage, error.message, "error");
    }
  });

  registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const account = $("adminRegisterAccount").value.trim();
    const password = $("adminRegisterPassword").value;
    const confirmPassword = $("adminRegisterPasswordConfirm").value;

    if (password !== confirmPassword) {
      setMessage(authMessage, "兩次輸入的密碼不一致。", "error");
      return;
    }

    setMessage(authMessage, "建立帳號中…");
    try {
      await auth.register(account, password, $("adminRegisterEmail").value, window.RangerbookCaptcha?.token() || "");
      registerForm.reset();
      showAuthPanel("login");
      setMessage(authMessage, ui("若資料符合條件，將寄出限時驗證信，請查看信箱。"), "success");
      $("adminLoginAccount").value = account;
    } catch (error) {
      setMessage(authMessage, error.message, "error");
    } finally { window.RangerbookCaptcha?.reset(); }
  });


  refreshBtn?.addEventListener("click", loadSuperAdminData);
  resourceUpdatesRefreshBtn?.addEventListener("click", loadResourceUpdates);

  usersList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (button) runUserAction(button.closest(".admin-user-row"), button.dataset.action);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll(".admin-overflow[open]").forEach(details => { details.removeAttribute("open"); details.querySelector("summary").focus(); });
  });

  document.addEventListener("click", (event) => {
    document.querySelectorAll(".admin-overflow[open]").forEach((details) => {
      if (!details.contains(event.target)) details.removeAttribute("open");
    });
  });

  window.addEventListener("rangerbook:auth-changed", (event) => {
    if (event.detail) renderUserState(event.detail);
  });

  auth.ready().then(async (user) => {
    renderUserState(user);
    if (auth.isAdmin()) await loadResourceUpdates();
    if (auth.isSuperAdmin()) await loadSuperAdminData();
  });
})();
