(() => {
  "use strict";
  const themeOptions = [...document.querySelectorAll('input[name="theme"]')];
  const languageOptions = [...document.querySelectorAll('input[name="language"]')];
  const feedback = document.getElementById("settingsFeedback");
  function theme() {
    try { return localStorage.getItem("rangerbook-theme") === "dark" ? "dark" : "light"; }
    catch (_) { return document.documentElement.dataset.theme === "dark" ? "dark" : "light"; }
  }
  function locale() {
    return window.RangerbookI18n?.locale || "zh-Hant";
  }
  function sync() {
    themeOptions.forEach(input => { input.checked = input.value === theme(); });
    languageOptions.forEach(input => { input.checked = input.value === locale(); });
  }
  function announce() {
    feedback.textContent = window.RangerbookI18n?.t("settings.saved", "設定已更新") || "設定已更新";
  }
  themeOptions.forEach(input => input.addEventListener("change", () => {
    if (!input.checked) return;
    const selected = input.value === "dark" ? "dark" : "light";
    try { localStorage.setItem("rangerbook-theme", selected); } catch (_) {}
    document.documentElement.dataset.theme = selected;
    document.querySelectorAll(".site-settings-icon").forEach(icon => {
      const root = location.pathname.startsWith("/rangerbook/") ? "/rangerbook/" : "/";
      icon.src = root + "assets/setting_icon/setting_" + selected + ".png";
    });
    announce();
  }));
  languageOptions.forEach(input => input.addEventListener("change", () => {
    if (!input.checked || input.value === locale()) return;
    window.RangerbookI18n?.setLocale(input.value);
  }));
  sync();
  window.addEventListener("rangerbook:locale-ready", sync);
})();
