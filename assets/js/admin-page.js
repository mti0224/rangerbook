(() => {
  const auth = window.RangerbookAuth;
  if (!auth) return;

  const $ = (id) => document.getElementById(id);
  const authCard = $("adminAuthCard");
  const sessionCard = $("adminSessionCard");
  const superAdminPanel = $("superAdminPanel");
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

  function renderUserState(user) {
    authCard.hidden = Boolean(user.logged_in);
    sessionCard.hidden = !user.logged_in;
    superAdminPanel.hidden = !auth.isSuperAdmin();

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

  auth.ready().then(async (user) => {
    renderUserState(user);
    if (auth.isSuperAdmin()) await loadSuperAdminData();
  });
})();