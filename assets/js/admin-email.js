(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const auth = window.RangerbookAuth;
  const card = byId("adminEmailRecoveryCard");
  const authCard = byId("adminAuthCard");
  const profile = byId("adminEmailProfileCard");
  const forgotForm = byId("adminForgotPasswordForm");
  const resetForm = byId("adminResetPasswordForm");
  const recoveryMessage = byId("adminEmailRecoveryMessage");
  const profileMessage = byId("adminEmailProfileMessage");
  if (!auth || !card || !authCard || !profile) return;

  let currentToken = null;
  let activeAction = null;

  function message(node, value, type) {
    node.textContent = value || "";
    node.className = "admin-message" + (type ? " " + type : "");
  }

  function showRecovery(action) {
    activeAction = action;
    card.hidden = false;
    authCard.hidden = true;
    forgotForm.hidden = action !== "forgot";
    resetForm.hidden = action !== "reset";
    byId("adminEmailRecoveryTitle").textContent =
      action === "forgot" ? "找回密碼" : action === "reset" ? "重設密碼" : "驗證電子郵件";
    byId("adminEmailRecoveryHint").textContent =
      action === "forgot" ? "請輸入先前驗證過的電子郵件。" :
      action === "reset" ? "此連結只能使用一次，並將於寄送後 30 分鐘失效。" :
      "正在核對一次性驗證連結。";
    message(recoveryMessage);
  }

  async function loadProfile(user) {
    profile.hidden = !user?.logged_in;
    if (!user?.logged_in) return;
    try {
      const state = await auth.api("/auth/email/status");
      if (!auth.getUser().logged_in) return;
      byId("adminEmailStatus").textContent = state.verified
        ? "已驗證：" + state.email
        : state.pending_email
          ? "待驗證：" + state.pending_email + "（請至信箱點擊連結）"
          : "尚未綁定電子郵件。為保障帳號，建議盡快綁定。";
    } catch (error) {
      byId("adminEmailStatus").textContent = error.message || "無法取得郵件驗證狀態。";
    }
  }

  byId("adminForgotPasswordLink")?.addEventListener("click", () => showRecovery("forgot"));
  byId("adminRecoveryBack")?.addEventListener("click", () => {
    currentToken = null;
    activeAction = null;
    card.hidden = true;
    authCard.hidden = Boolean(auth.getUser().logged_in);
    message(recoveryMessage);
  });

  forgotForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const button = forgotForm.querySelector("[type=submit]");
    button.disabled = true;
    message(recoveryMessage, "處理中…");
    try {
      const reply = await auth.api("/auth/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email: byId("adminForgotEmail").value.trim() })
      });
      message(recoveryMessage, reply.message || "若信箱已完成驗證，系統將寄送重設連結。", "success");
      forgotForm.reset();
    } catch (error) {
      message(recoveryMessage, error.message || "無法寄送重設郵件。", "error");
    } finally {
      button.disabled = false;
    }
  });

  resetForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const password = byId("adminResetPassword").value;
    if (password !== byId("adminResetConfirm").value) {
      message(recoveryMessage, "兩次輸入的密碼不一致。", "error");
      return;
    }
    const button = resetForm.querySelector("[type=submit]");
    button.disabled = true;
    try {
      const reply = await auth.api("/auth/password/reset", {
        method: "POST",
        body: JSON.stringify({ token: currentToken, new_password: password })
      });
      currentToken = null;
      resetForm.reset();
      resetForm.hidden = true;
      message(recoveryMessage, reply.message || "密碼已更新，請重新登入。", "success");
      setTimeout(() => {
        card.hidden = true;
        authCard.hidden = false;
      }, 1500);
    } catch (error) {
      message(recoveryMessage, error.message || "密碼重設失敗。", "error");
    } finally {
      button.disabled = false;
    }
  });

  byId("adminEmailBindForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("[type=submit]");
    button.disabled = true;
    message(profileMessage, "寄送中…");
    try {
      const response = await auth.api("/auth/email/request-verification", {
        method: "POST",
        body: JSON.stringify({
          email: byId("adminBindEmail").value.trim(),
          current_password: byId("adminBindPassword").value
        })
      });
      form.reset();
      message(profileMessage, response.message || "驗證郵件已寄出。", "success");
      await loadProfile(auth.getUser());
    } catch (error) {
      message(profileMessage, error.message || "寄送失敗。", "error");
    } finally {
      button.disabled = false;
    }
  });

  const linkPayload = window.RANGERBOOK_EMAIL_ACTION || {};
  delete window.RANGERBOOK_EMAIL_ACTION;
  const action = linkPayload.action;
  const token = linkPayload.token;
  if ((action === "verify" || action === "reset") && token && token.length >= 32) {
    // Strip the bearer token before analytics or any subsequent page navigation.
    history.replaceState(null, "", location.pathname + location.search);
    currentToken = token;
    showRecovery(action);
    if (action === "verify") {
      auth.api("/auth/email/confirm", {
        method: "POST",
        body: JSON.stringify({ token })
      }).then(async reply => {
        currentToken = null;
        message(recoveryMessage, reply.message || "電子郵件驗證完成。", "success");
        await loadProfile(auth.getUser());
      }).catch(error => {
        message(recoveryMessage, error.message || "連結無效或已過期。", "error");
      });
    }
  }

  window.addEventListener("rangerbook:auth-changed", event => loadProfile(event.detail));
  auth.ready().then(async user => {
    await loadProfile(user);
    if (activeAction) authCard.hidden = true;
  });
})();