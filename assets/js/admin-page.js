(() => {
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
    password: { button: $("adminPasswordTab"), panel: passwordCard },
    resources: { button: $("adminResourcesTab"), panel: $("adminResourceUpdatesCard") },
    accounts: { button: $("adminAccountsTab"), panel: superAdminPanel },
    traffic: { button: $("adminTrafficTab"), panel: $("adminTrafficPanel") }
  };
  let activeWorkspaceSection = "password";
  const loginPanel = $("adminLoginPanel");
  const registerPanel = $("adminRegisterPanel");
  const loginTab = $("adminLoginTab");
  const registerTab = $("adminRegisterTab");
  const loginForm = $("adminLoginForm");
  const registerForm = $("adminRegisterForm");
  const authMessage = $("adminAuthMessage");
  const sessionMessage = $("adminSessionMessage");
  const logoutBtn = $("adminLogoutBtn");
  const currentAccount = $("adminCurrentAccount");
  const currentRole = $("adminCurrentRole");
  const currentStatus = $("adminCurrentStatus");
  const applicationsList = $("adminApplicationsList");
  const usersList = $("adminUsersList");
  const refreshBtn = $("adminRefreshBtn");
  const resourceUpdatesCard = $("adminResourceUpdatesCard");
  const resourceUpdatesSummary = $("adminResourceUpdatesSummary");
  const resourceUpdatesList = $("adminResourceUpdatesList");
  const resourceUpdatesRefreshBtn = $("adminResourceUpdatesRefreshBtn");

  const ROLE_LABELS = {
    super_admin: "最大管理者",
    admin: "管理員",
    user: "非管理員"
  };

  const STATUS_LABELS = {
    pending: "等待審核",
    approved: "已核准",
    rejected: "已拒絕"
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
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-Hant", { hour12: false });
  }

  // Changing tabs affects visibility, not RangerbookAuth / AWS permissions.
  function allowedWorkspaceSections() {
    return {
      password: auth.isAdmin(),
      resources: auth.isAdmin(),
      accounts: auth.isSuperAdmin(),
      traffic: auth.isSuperAdmin()
    };
  }

  function renderWorkspaceTabs() {
    const allowed = allowedWorkspaceSections();
    const hasAccess = auth.isAdmin();
    if (workspace) workspace.hidden = !hasAccess;
    if (!allowed[activeWorkspaceSection]) activeWorkspaceSection = "password";

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
    if (focus) workspacePanels[section].button?.focus();
  }

  let trafficRequestId = 0;
  const trafficIds = ["trafficSummary", "trafficDaily", "trafficPages", "trafficSources"];
  function clearTraffic() {
    trafficIds.forEach(id => $(id)?.replaceChildren());
  }

  async function loadTraffic() {
    if (!auth.isSuperAdmin()) return;
    const requestId = ++trafficRequestId;
    const status = $("trafficStatus");
    const days = Number($("trafficDays").value);
    status.textContent = "載入中…";
    try {
      const data = await auth.api("/super-admin/traffic?days=" + days);
      // Switching ranges or logging out must not display stale private data.
      if (requestId !== trafficRequestId || !auth.isSuperAdmin()) return;
      if (data.status !== "ready") {
        status.textContent = data.message || "尚未設定 GA4 資料來源";
        clearTraffic();
        return;
      }
      const numeric = value => Number(value || 0).toLocaleString("zh-TW");
      status.textContent = "最新更新：" + (data.updatedAt || "-");
      $("trafficSummary").replaceChildren();
      Object.entries(data.summary || {}).forEach(([key, value]) => {
        const card = document.createElement("div");
        const label = document.createElement("span");
        const number = document.createElement("strong");
        label.textContent = ({
          users: "使用者", views: "瀏覽次數",
          sessions: "工作階段", engagedSessions: "互動工作階段"
        })[key] || key;
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
      if (requestId !== trafficRequestId || !auth.isSuperAdmin()) return;
      clearTraffic();
      status.textContent = "無法讀取：" + (error?.message || "未知錯誤");
    }
  }
  $("trafficRefresh")?.addEventListener("click",loadTraffic);
  $("trafficDays")?.addEventListener("change",loadTraffic);

  function renderUserState(user) {
    authCard.hidden = Boolean(user.logged_in);
    sessionCard.hidden = !user.logged_in;
    superAdminPanel.hidden = !auth.isSuperAdmin();
    if (resourceUpdatesCard) resourceUpdatesCard.hidden = !auth.isAdmin();
    renderWorkspaceTabs();

    if (!auth.isSuperAdmin()) {
      ++trafficRequestId;
      clearTraffic();
      $("trafficStatus").textContent = "";
    }
    if (!user.logged_in) return;

    currentAccount.textContent = user.account || "-";
    currentRole.textContent = ROLE_LABELS[user.role] || user.role || "-";
    currentRole.className = `admin-role-badge ${user.role === "super_admin" ? "super-admin" : user.role === "admin" ? "admin" : ""}`.trim();

    const status = user.admin_application_status || (user.role === "super_admin" ? "approved" : "-");
    currentStatus.textContent = STATUS_LABELS[status] || status;
    currentStatus.className = `admin-status-badge ${status}`.trim();

    if (user.role === "user" && status === "pending") {
      setMessage(sessionMessage, "你的管理員申請正在等待最大管理者審核。", "success");
    } else if (user.role === "user" && status === "rejected") {
      setMessage(sessionMessage, "你的管理員申請已被拒絕，目前維持非管理員權限。", "error");
    } else {
      setMessage(sessionMessage);
    }
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
        `${count} 個檔案`,
        dbCount ? `DB/NDB ${dbCount}` : "",
        deletedCount ? `刪除 ${deletedCount}` : ""
      ].filter(Boolean).join(" · ");

      return `
        <details class="admin-update-batch">
          <summary>
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

  async function loadSuperAdminData() {
    if (!auth.isSuperAdmin()) return;
    applicationsList.innerHTML = '<div class="admin-empty">載入中…</div>';
    usersList.innerHTML = '<div class="admin-empty">載入中…</div>';

    try {
      const [applications, users] = await Promise.all([
        auth.api("/admin/applications"),
        auth.api("/admin/users")
      ]);
      renderApplications(applications?.items || []);
      renderUsers(users?.items || []);
    } catch (error) {
      applicationsList.innerHTML = `<div class="admin-empty">${escapeHtml(error.message)}</div>`;
      usersList.innerHTML = `<div class="admin-empty">${escapeHtml(error.message)}</div>`;
    }
  }

  function renderApplications(items) {
    if (!items.length) {
      applicationsList.innerHTML = '<div class="admin-empty">目前沒有待審核申請。</div>';
      return;
    }

    applicationsList.innerHTML = items.map((item) => `
      <article class="admin-user-row" data-user-id="${escapeHtml(item.id)}" data-user-account="${escapeHtml(item.account)}">
        <div class="admin-user-meta">
          <strong>${escapeHtml(item.account)}</strong>
          <small>申請時間：${escapeHtml(formatDate(item.created_at))}</small>
        </div>
        <div class="admin-user-actions">
          <button class="approve" type="button" data-action="approve">核准管理員</button>
          <button class="reject" type="button" data-action="reject">拒絕</button>
        </div>
      </article>
    `).join("");
  }

  function renderUsers(items) {
    if (!items.length) {
      usersList.innerHTML = '<div class="admin-empty">目前沒有使用者。</div>';
      return;
    }

    usersList.innerHTML = items.map((item) => {
      const isSuperAdmin = item.role === "super_admin";
      const controls = isSuperAdmin ? '<div class="admin-locked-note">此帳號只能由伺服器端管理</div>' : `
        <div class="admin-user-controls">
          <label class="admin-role-control">
            <span>帳號權限</span>
            <select data-role-select>
              <option value="user" ${item.role === "user" ? "selected" : ""}>非管理員</option>
              <option value="admin" ${item.role === "admin" ? "selected" : ""}>管理員</option>
            </select>
          </label>
          <div class="admin-user-actions admin-user-actions--management">
            <button class="approve" type="button" data-action="change-role">套用權限</button>
            <details class="admin-overflow">
              <summary class="admin-overflow-trigger" aria-label="更多帳號操作" title="更多帳號操作">⋯</summary>
              <div class="admin-overflow-menu" role="menu">
                <button class="warning" type="button" role="menuitem" data-action="reset-password">重置密碼</button>
                <button class="danger" type="button" role="menuitem" data-action="delete-user">刪除帳號</button>
              </div>
            </details>
          </div>
        </div>`;

      return `
        <article class="admin-user-row admin-user-row--management" data-user-id="${escapeHtml(item.id)}" data-user-account="${escapeHtml(item.account)}">
          <div class="admin-user-meta">
            <strong>${escapeHtml(item.account)}</strong>
            <small>
              ${escapeHtml(ROLE_LABELS[item.role] || item.role)} ·
              ${escapeHtml(STATUS_LABELS[item.admin_application_status] || item.admin_application_status || "-")}
            </small>
          </div>
          ${controls}
        </article>
      `;
    }).join("");
  }

  function setRowDisabled(row, disabled) {
    row.querySelectorAll("button, select").forEach((element) => { element.disabled = disabled; });
    row.querySelectorAll(".admin-overflow-trigger").forEach((element) => {
      element.setAttribute("aria-disabled", disabled ? "true" : "false");
      element.tabIndex = disabled ? -1 : 0;
    });
  }

  async function runUserAction(row, action) {
    const userId = row?.dataset.userId;
    const account = row?.dataset.userAccount || "此帳號";
    if (!userId) return;

    row.querySelectorAll("details[open]").forEach((details) => details.removeAttribute("open"));

    let endpoint = "";
    let options = { method: "POST" };
    let successMessage = "";

    if (action === "approve") {
      endpoint = `/admin/applications/${encodeURIComponent(userId)}/approve`;
    } else if (action === "reject") {
      endpoint = `/admin/applications/${encodeURIComponent(userId)}/reject`;
    } else if (action === "change-role") {
      const role = row.querySelector("[data-role-select]")?.value;
      if (!role) return;
      const roleLabel = ROLE_LABELS[role] || role;
      if (!window.confirm(`確定要將「${account}」的權限更改為「${roleLabel}」？\n變更後該帳號目前所有登入狀態會立即失效。`)) return;
      endpoint = `/admin/users/${encodeURIComponent(userId)}/role`;
      options.body = JSON.stringify({ role });
      successMessage = `已將「${account}」權限更改為「${roleLabel}」。`;
    } else if (action === "reset-password") {
      if (!window.confirm(`確定要重置「${account}」的密碼？`)) return;
      if (!window.confirm(`再次確認：將「${account}」的密碼重置為 qwer1234？\n重置後該帳號目前所有登入狀態會立即失效。`)) return;
      endpoint = `/admin/users/${encodeURIComponent(userId)}/reset-password`;
      successMessage = `已將「${account}」的密碼重置為 qwer1234。`;
    } else if (action === "delete-user") {
      if (!window.confirm(`確定要刪除帳號「${account}」？`)) return;
      if (!window.confirm(`再次確認：永久刪除帳號「${account}」？\n此操作無法復原，該帳號所有登入狀態也會立即失效。`)) return;
      endpoint = `/admin/users/${encodeURIComponent(userId)}/delete`;
      successMessage = `已刪除帳號「${account}」。`;
    } else {
      return;
    }

    setRowDisabled(row, true);
    try {
      await auth.api(endpoint, options);
      if (successMessage) window.alert(successMessage);
      await loadSuperAdminData();
    } catch (error) {
      window.alert(error.message);
      setRowDisabled(row, false);
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
      renderUserState(user);
      if (auth.isAdmin()) await loadResourceUpdates();
      if (auth.isSuperAdmin()) await loadSuperAdminData();
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
      await auth.register(account, password);
      registerForm.reset();
      showAuthPanel("login");
      setMessage(authMessage, "註冊成功，管理員申請已送出。請等待最大管理者審核後再登入查看權限。", "success");
      $("adminLoginAccount").value = account;
    } catch (error) {
      setMessage(authMessage, error.message, "error");
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    await auth.logout();
    renderUserState(auth.getUser());
    showAuthPanel("login");
  });

  refreshBtn?.addEventListener("click", loadSuperAdminData);
  resourceUpdatesRefreshBtn?.addEventListener("click", loadResourceUpdates);

  applicationsList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (button) runUserAction(button.closest(".admin-user-row"), button.dataset.action);
  });

  usersList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (button) runUserAction(button.closest(".admin-user-row"), button.dataset.action);
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