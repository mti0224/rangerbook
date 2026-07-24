(() => {
  const DEFAULT_API_BASE = "https://rangerbook-auth.warmycat.com";
  const API_BASE = String(window.RANGERBOOK_AUTH_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
  const ADMIN_ROLES = new Set(["admin", "super_admin"]);

  let currentUser = {
    logged_in: false,
    account: null,
    role: "user",
    admin_application_status: null
  };
  let readyPromise = null;

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: "include"
    });

    let payload = null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      const text = await response.text();
      payload = text ? { detail: text } : null;
    }

    if (!response.ok) {
      const message = payload?.detail || payload?.message || `HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  function setCurrentUser(payload) {
    currentUser = {
      logged_in: Boolean(payload?.logged_in),
      account: payload?.account || null,
      role: payload?.role || "user",
      admin_application_status: payload?.admin_application_status || null
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

  async function register(account, password) {
    return api("/auth/register", {
      method: "POST",
      body: JSON.stringify({ account, password })
    });
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      readyPromise = Promise.resolve(setCurrentUser({ logged_in: false, role: "user" }));
    }
  }

  function getUser() {
    return { ...currentUser };
  }

  function isAdmin() {
    return currentUser.logged_in && ADMIN_ROLES.has(currentUser.role);
  }

  function isSuperAdmin() {
    return currentUser.logged_in && currentUser.role === "super_admin";
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
