(() => {
  const auth = window.RangerbookAuth;
  const card = document.getElementById("adminPasswordCard");
  const form = document.getElementById("adminPasswordForm");
  const message = document.getElementById("adminPasswordMessage");
  const submit = document.getElementById("adminPasswordSubmit");
  if (!auth || !card || !form || !message) return;

  function setMessage(text = "", type = "") {
    message.textContent = text;
    message.className = `admin-message ${type}`.trim();
  }

  function updateVisibility(user = auth.getUser()) {
    const visible = Boolean(user?.logged_in && auth.isAdmin());
    card.hidden = !visible;
    if (!visible) {
      form.reset();
      setMessage();
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const currentPassword = document.getElementById("adminCurrentPassword")?.value || "";
    const newPassword = document.getElementById("adminNewPassword")?.value || "";
    const confirmPassword = document.getElementById("adminNewPasswordConfirm")?.value || "";

    if (newPassword !== confirmPassword) {
      setMessage("兩次輸入的新密碼不一致。", "error");
      return;
    }
    if (currentPassword === newPassword) {
      setMessage("新密碼不得與目前密碼相同。", "error");
      return;
    }

    setMessage("更新密碼中…");
    if (submit) submit.disabled = true;

    try {
      await auth.api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });
      form.reset();
      setMessage("密碼已更新。其他裝置的登入狀態已登出，本裝置仍保持登入。", "success");
    } catch (error) {
      setMessage(error.message || "密碼更新失敗。", "error");
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  window.addEventListener("rangerbook:auth-changed", (event) => {
    updateVisibility(event.detail);
  });

  auth.ready().then(updateVisibility);
})();
