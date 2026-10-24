(() => {
  const DEFAULT_API_BASE = "https://rangerbook-auth.warmycat.com";
  const API_BASE = String(window.RANGERBOOK_AUTH_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
  const ADMIN_ROLES = new Set(["admin", "super_admin"]);

  let currentUser = {
    logged_in: false,
    account: null,
    role: "user",
    must_change_password: false,
    admin_application_status: null
  };
  let readyPromise = null;

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    let response;
    try { response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: "include",
      cache: "no-store"
    }); } catch (_) {
      throw new Error(window.RangerbookI18n?.t("member.networkError", "Connection failed. Check your network and try again.") || "Connection failed. Check your network and try again.");
    }

    let payload = null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      const text = await response.text();
      payload = text ? { detail: text } : null;
    }

    // The isolated Basic-auth entrance must not receive a second HTTP challenge
    // for a membership failure. Preserve application semantics in this client.
    const appStatus = window.RANGERBOOK_STAGE_BASIC_AUTH === true && API_BASE === window.location?.origin &&
      response.status === 403 && response.headers.get("X-Rangerbook-Auth-Status") === "401" ? 401 : response.status;
    if (!response.ok) {
      const rawMessage = payload?.detail || payload?.message;
      const message = appStatus>=500 ? "member.unavailable" : typeof rawMessage==="string" ? rawMessage : "member.invalidInput";
      const i18n = window.RangerbookI18n;
      const prefixes = {
        "無法讀取資源更新紀錄：": "site.resources.readError",
        "玩家資料查詢失敗：": "site.pvp.queryError"
      };
      const prefix = Object.keys(prefixes).find(value => typeof message === "string" && message.startsWith(value));
      const displayMessage = typeof message === "string" && message.startsWith("member.") ? (i18n?.t(message, message) || message) : prefix && i18n
        ? i18n.format(prefixes[prefix], [i18n.uiText(message.slice(prefix.length))], message)
        : i18n?.uiText(message) || message;
      const error = new Error(displayMessage);
      error.status = appStatus;
      error.payload = payload;
      const retryAfter = Number(response.headers.get("Retry-After"));
      error.retryAfter = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : 0;
      throw error;
    }

    return payload;
  }

  function setCurrentUser(payload) {
    currentUser = {
      logged_in: Boolean(payload?.logged_in),
      account: payload?.account || null,
      role: payload?.role || "user",
      must_change_password: Boolean(payload?.must_change_password),
      admin_application_status: payload?.admin_application_status || null,
      mfa_required: Boolean(payload?.mfa_required),
      setup_required: Boolean(payload?.setup_required)
    };
    window.dispatchEvent(new CustomEvent("rangerbook:auth-changed", { detail: { ...currentUser } }));
    return { ...currentUser };
  }

  async function refresh() {
    try {
      return setCurrentUser(await api("/auth/me"));
    } catch (error) {
      if (error.status === 401) return setCurrentUser({ logged_in: false, role: "user" });
      console.warn("Unable to refresh Rangerbook auth state", error);
      return setCurrentUser({ logged_in: false, role: "user" });
    }
  }

  function ready() {
    if (!readyPromise) readyPromise = refresh();
    return readyPromise;
  }

  async function login(account, password) {
    const payload = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ account, password })
    });
    readyPromise = Promise.resolve(setCurrentUser(payload));
    return { ...currentUser };
  }

  async function register(account, password, email, captcha) {
    return api("/auth/register", {
      method: "POST",
      body: JSON.stringify({ account, password, email, captcha, locale: window.RangerbookI18n?.locale || 'zh-Hant' })
    });
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    readyPromise = Promise.resolve(setCurrentUser({ logged_in: false, role: "user" }));
  }

  function getUser() {
    return { ...currentUser };
  }

  function isAdmin() {
    return currentUser.logged_in && !currentUser.must_change_password && ADMIN_ROLES.has(currentUser.role);
  }

  function isSuperAdmin() {
    return currentUser.logged_in && !currentUser.must_change_password && currentUser.role === "super_admin";
  }

  window.RangerbookAuth = {
    API_BASE,
    api,
    ready,
    refresh,
    login,
    register,
    logout,
    getUser,
    isAdmin,
    isSuperAdmin
  };
})();

