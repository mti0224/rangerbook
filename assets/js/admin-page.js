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
      <article class="admin-user-row" data-user-id="${escapeHtml(item.id)}">
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
      const canRevoke = item.role === "admin";
      return `
        <article class="admin-user-row" data-user-id="${escapeHtml(item.id)}">
          <div class="admin-user-meta">
            <strong>${escapeHtml(item.account)}</strong>
            <small>
              ${escapeHtml(ROLE_LABELS[item.role] || item.role)} ·
              ${escapeHtml(STATUS_LABELS[item.admin_application_status] || item.admin_application_status || "-")}
            </small>
          </div>
          ${canRevoke ? '<div class="admin-user-actions"><button class="danger" type="button" data-action="revoke">撤銷管理員</button></div>' : ""}
        </article>
      `;
    }).join("");
  }

  async function runUserAction(row, action) {
    const userId = row?.dataset.userId;
    if (!userId) return;

    const endpoints = {
      approve: `/admin/applications/${encodeURIComponent(userId)}/approve`,
      reject: `/admin/applications/${encodeURIComponent(userId)}/reject`,
      revoke: `/admin/users/${encodeURIComponent(userId)}/revoke`
    };
    const endpoint = endpoints[action];
    if (!endpoint) return;

    row.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    try {
      await auth.api(endpoint, { method: "POST" });
      await loadSuperAdminData();
    } catch (error) {
      window.alert(error.message);
      row.querySelectorAll("button").forEach((button) => { button.disabled = false; });
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

  auth.ready().then(async (user) => {
    renderUserState(user);
    if (auth.isSuperAdmin()) await loadSuperAdminData();
  });
})();
