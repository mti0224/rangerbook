(() => {
  const ROOT = window.location.pathname.includes('/rangerbook/') ? '/rangerbook/' : '/';
  const SUPERGUARD_ICON = `${ROOT}assets/extreme_mode/active_superguard.png`;

  function fixSuperguardIcon() {
    document.querySelectorAll('.extreme-gimmick-item').forEach((item) => {
      const copy = item.querySelector('.extreme-gimmick-copy');
      const value = copy?.textContent || '';
      if (!/超級無敵|superguard/i.test(value)) return;

      const wrap = item.querySelector('.extreme-gimmick-icon-wrap');
      if (!wrap) return;

      const current = wrap.querySelector('.extreme-gimmick-icon');
      if (current) {
        if (!current.src.endsWith('/active_superguard.png')) current.src = SUPERGUARD_ICON;
        return;
      }

      wrap.innerHTML = `<img class="extreme-gimmick-icon" src="${SUPERGUARD_ICON}" alt="" loading="lazy">`;
    });
  }

  const observer = new MutationObserver(fixSuperguardIcon);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  document.addEventListener('DOMContentLoaded', fixSuperguardIcon);
  queueMicrotask(fixSuperguardIcon);
})();