(() => {
  const ROOT = window.location.pathname.includes('/rangerbook/') ? '/rangerbook/' : '/';
  const path = window.location.pathname;
  const inferredMode = /\/mainstage\/extreme\/stage\//i.test(path) ? 'extreme' : 'hard';
  const mode = window.__mainstageStageMode || inferredMode;
  if (mode !== 'hard' && mode !== 'extreme') return;

  const pathMatch = mode === 'extreme'
    ? path.match(/\/mainstage\/extreme\/stage\/es(\d+)\/?$/i)
    : path.match(/\/mainstage\/hard\/stage\/hs(\d+)\/?$/i);
  const directStageNo = Number(window.__mainstageStageNo || (pathMatch ? pathMatch[1] : 0));

  if (directStageNo) {
    const NativeURLSearchParams = window.URLSearchParams;
    function MainstageURLSearchParams(init) {
      const params = new NativeURLSearchParams(init);
      const nativeGet = params.get.bind(params);
      params.get = function (name) {
        const value = nativeGet(name);
        if (name === 'stage' && !value) return `hs${directStageNo}`;
        return value;
      };
      return params;
    }
    MainstageURLSearchParams.prototype = NativeURLSearchParams.prototype;
    Object.setPrototypeOf(MainstageURLSearchParams, NativeURLSearchParams);
    window.URLSearchParams = MainstageURLSearchParams;
  }

  if (mode === 'extreme') {
    const originalFetch = window.fetch.bind(window);
    const HARD_STAGE_ENCODED = '%E5%9B%B0%E9%9B%A3%E9%97%9C%E5%8D%A1%E7%94%9F%E7%94%A2%E7%B7%9A.json';
    const EXTREME_STAGE_ENCODED = '%E6%A5%B5%E9%99%90%E9%97%9C%E5%8D%A1%E7%94%9F%E7%94%A2%E7%B7%9A.json';

    window.fetch = function (resource, options) {
      const url = String(resource);
      if (url.includes(HARD_STAGE_ENCODED) || url.includes('困難關卡生產線.json')) {
        return originalFetch(`${ROOT}res/${EXTREME_STAGE_ENCODED}`, options);
      }
      if (url.includes('res/hsEnemy_data.json')) {
        return originalFetch(`${ROOT}res/extremeEnemy_data.json`, options);
      }
      return originalFetch(resource, options);
    };
  }

  function patchUi() {
    const prefix = mode === 'extreme' ? 'es' : 'hs';
    document.querySelectorAll('#hsStageGrid .endless-stage-card').forEach((card) => {
      const no = Number(card.dataset.stageNo || 0);
      if (!no) return;
      card.href = `${ROOT}mainstage/${mode}/stage/${prefix}${no}`;
    });

    const backLink = document.getElementById('hsStageBackLink') || document.querySelector('#hsStageDetail .endless-back-link');
    if (backLink) backLink.href = `${ROOT}mainstage/${mode}/stage/`;

    if (mode === 'extreme') {
      const title = document.getElementById('hsStageTitle');
      if (title && title.textContent.includes('困難關卡')) {
        title.textContent = title.textContent.replace('困難關卡', '極限模式');
      }
      document.querySelectorAll('.empty-state').forEach((node) => {
        if (node.textContent.includes('困難關卡')) {
          node.textContent = node.textContent
            .replaceAll('困難關卡生產線.json', '極限關卡生產線.json')
            .replaceAll('困難關卡', '極限模式');
        }
      });
    }
  }

  const observer = new MutationObserver(patchUi);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  document.addEventListener('DOMContentLoaded', patchUi);
  queueMicrotask(patchUi);
})();
