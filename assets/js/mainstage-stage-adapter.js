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

  let extremeStageData = null;

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

  function hasUsableAbility(value) {
    if (Array.isArray(value)) return value.some(hasUsableAbility);
    if (value && typeof value === 'object') return true;
    const text = String(value || '').trim();
    return Boolean(text && text !== '無' && text !== '(無)');
  }

  function mergeAwakenAbilities(enemy) {
    if (!enemy || typeof enemy !== 'object') return enemy;
    const awaken = Array.isArray(enemy['覺醒能力']) ? enemy['覺醒能力'].filter(hasUsableAbility) : [];
    if (!awaken.length) return enemy;

    const merged = [];
    const third = enemy['能力3'];
    if (Array.isArray(third)) merged.push(...third.filter(hasUsableAbility));
    else if (hasUsableAbility(third)) merged.push(third);
    merged.push(...awaken);

    return { ...enemy, '能力3': merged };
  }

  async function rewriteExtremeEnemyResponse(response) {
    if (!response || !response.ok) return response;
    try {
      const raw = await response.clone().json();
      const data = Array.isArray(raw) ? raw.map(mergeAwakenAbilities) : raw;
      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (error) {
      console.warn('極限敵人覺醒能力轉換失敗：', error);
      return response;
    }
  }

  if (mode === 'extreme') {
    const originalFetch = window.fetch.bind(window);
    const HARD_STAGE_ENCODED = '%E5%9B%B0%E9%9B%A3%E9%97%9C%E5%8D%A1%E7%94%9F%E7%94%A2%E7%B7%9A.json';
    const EXTREME_STAGE_ENCODED = '%E6%A5%B5%E9%99%90%E9%97%9C%E5%8D%A1%E7%94%9F%E7%94%A2%E7%B7%9A.json';

    window.fetch = function (resource, options) {
      const url = String(resource);
      if (url.includes(HARD_STAGE_ENCODED) || url.includes('困難關卡生產線.json')) {
        return originalFetch(`${ROOT}res/${EXTREME_STAGE_ENCODED}`, options).then((response) => {
          if (response?.ok) {
            response.clone().json().then((data) => {
              extremeStageData = data;
              queueMicrotask(patchUi);
            }).catch(() => {});
          }
          return response;
        });
      }
      if (url.includes('res/hsEnemy_data.json')) {
        return originalFetch(`${ROOT}res/extremeEnemy_data.json`, options).then(rewriteExtremeEnemyResponse);
      }
      return originalFetch(resource, options);
    };
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function gimmickText(item) {
    return [item?.['資料名稱'], item?.['名稱'], item?.['定義']]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  function typeSuffix(value) {
    if (/力量型|\bstr\b|_str(?:_|\b)/i.test(value)) return 'str';
    if (/敏捷型|\bagi\b|_agi(?:_|\b)/i.test(value)) return 'agi';
    if (/智慧型|\bint\b|_int(?:_|\b)/i.test(value)) return 'int';
    return '';
  }

  function elementSuffix(value) {
    if (/火(?:屬性|系|弱化|強化)|\bfire\b|_fire(?:_|\b)/i.test(value)) return 'fire';
    if (/水(?:屬性|系|弱化|強化)|\bwater\b|_water(?:_|\b)/i.test(value)) return 'water';
    if (/木(?:屬性|系|弱化|強化)|\btree\b|_tree(?:_|\b)/i.test(value)) return 'tree';
    if (/光(?:屬性|系|弱化|強化)|\blight\b|_light(?:_|\b)/i.test(value)) return 'light';
    if (/暗(?:屬性|系|弱化|強化)|\bdark\b|_dark(?:_|\b)/i.test(value)) return 'dark';
    return '';
  }

  function activeIconName(value) {
    const candidates = [
      ['hellfire', /hellfire|地獄火/i],
      ['blizzard', /blizzard|暴風雪|冰雪/i],
      ['thunderstorm', /thunderstorm|雷暴|雷雨|雷電|閃電/i],
      ['tower', /tower|哨兵|塔城/i],
      ['beast', /beast|野獸|猛獸/i],
      ['superguard', /superguard|超級防禦|超級防護|護盾|防護罩/i]
    ];
    const hit = candidates.find(([, pattern]) => pattern.test(value));
    return hit ? `active_${hit[0]}.png` : '';
  }

  function passiveIconName(value) {
    const type = typeSuffix(value);
    const element = elementSuffix(value);
    const isDown = /弱化|降低|減少|down/i.test(value);
    const isUp = /強化|提升|增加|up/i.test(value);

    if (type && isDown) return `passive_typedown_${type}.png`;
    if (type && isUp) return `passive_typeup_${type}.png`;
    if (element && isDown) return `passive_elementdown_${element}.png`;
    if (element && isUp) return `passive_elementup_${element}.png`;

    if (/礦物.*(?:上限|最大)|(?:上限|最大).*礦物|mineralmax/i.test(value)) return 'passive_mineralmax.png';
    if (/礦物.*(?:生產|恢復|回復|速度)|(?:生產|恢復|回復).*礦物|mineralregen/i.test(value)) return 'passive_mineralregen.png';
    if (/(?:出動|召喚).*礦物|礦物.*(?:費用|消耗)|mineralsumn|summon.*mineral/i.test(value)) return 'passive_mineralsumn.png';
    if (/unitdebuff|全體.*弱化|弱化.*全體|減益/i.test(value)) return 'passive_unitdebuff.png';
    return '';
  }

  function gimmickIcon(item, active) {
    const filename = active ? activeIconName(gimmickText(item)) : passiveIconName(gimmickText(item));
    return filename ? `${ROOT}assets/extreme_mode/${filename}` : '';
  }

  function renderGimmickItem(item, active) {
    const name = item?.['名稱'] || item?.['資料名稱'] || '未命名機關';
    const description = item?.['定義'] || '';
    const icon = gimmickIcon(item, active);
    return `
      <article class="extreme-gimmick-item">
        <div class="extreme-gimmick-icon-wrap">
          ${icon ? `<img class="extreme-gimmick-icon" src="${icon}" alt="" loading="lazy" onerror="this.remove();">` : '<span class="extreme-gimmick-icon-fallback">機關</span>'}
        </div>
        <div class="extreme-gimmick-copy">
          <h4>${escapeHtml(name)}</h4>
          ${description ? `<p>${escapeHtml(description)}</p>` : ''}
        </div>
      </article>
    `;
  }

  function renderGimmickGroup(title, items, active, detail) {
    return `
      <div class="extreme-gimmick-group ${active ? 'is-active' : 'is-passive'}">
        <div class="extreme-gimmick-group-head">
          <h3>${escapeHtml(title)}</h3>
          ${detail || ''}
        </div>
        <div class="extreme-gimmick-list">
          ${items.length ? items.map((item) => renderGimmickItem(item, active)).join('') : '<div class="empty-state small">沒有機關資料。</div>'}
        </div>
      </div>
    `;
  }

  function renderExtremeGimmicks(stage, stageNo) {
    const passive = Array.isArray(stage?.['被動機關']) ? stage['被動機關'] : [];
    const active = Array.isArray(stage?.['主動機關']) ? stage['主動機關'] : [];
    if (!passive.length && !active.length) return '';

    const timing = [];
    if (stage?.['主動機關首次發動']) timing.push(`<span>首次發動：${escapeHtml(stage['主動機關首次發動'])}</span>`);
    if (stage?.['主動機關冷卻時間']) timing.push(`<span>冷卻時間：${escapeHtml(stage['主動機關冷卻時間'])}</span>`);
    const activeMeta = timing.length ? `<div class="extreme-gimmick-timing">${timing.join('')}</div>` : '';

    return `
      <section id="extremeGimmickBlock" class="extreme-gimmick-section" data-stage-no="${stageNo}">
        <h2 class="endless-detail-section-title">機關</h2>
        <div class="extreme-gimmick-panel">
          ${renderGimmickGroup('被動機關', passive, false, '')}
          ${renderGimmickGroup('主動機關', active, true, activeMeta)}
        </div>
      </section>
    `;
  }

  function currentStageNo() {
    if (directStageNo) return directStageNo;
    const title = document.getElementById('hsStageTitle')?.textContent || '';
    const titleMatch = title.match(/(\d+)/);
    if (titleMatch) return Number(titleMatch[1]);
    const query = new URLSearchParams(window.location.search).get('stage') || '';
    const queryMatch = query.match(/(?:hs|es)(\d+)/i);
    return queryMatch ? Number(queryMatch[1]) : 0;
  }

  function findExtremeStage(stageNo) {
    if (!extremeStageData || typeof extremeStageData !== 'object') return null;
    return Object.entries(extremeStageData).find(([key]) => Number(String(key).match(/\d+/)?.[0] || 0) === stageNo)?.[1] || null;
  }

  function groupProductionLines() {
    const container = document.getElementById('hsStageConditions');
    if (!container || container.querySelector(':scope > .hs-production-line-panel')) return;

    const sections = [...container.querySelectorAll(':scope > .hs-condition-section')];
    if (!sections.length) return;

    const productionTitle = [...container.querySelectorAll(':scope > .endless-detail-section-title')]
      .find((node) => node.textContent.trim() === '敵人生產線');
    if (!productionTitle) return;

    const panel = document.createElement('div');
    panel.className = 'hs-production-line-panel';
    productionTitle.insertAdjacentElement('afterend', panel);
    sections.forEach((section) => panel.appendChild(section));
  }

  function patchExtremeGimmicks() {
    if (mode !== 'extreme') return;
    const stageDetail = document.getElementById('hsStageDetail');
    const container = document.getElementById('hsStageConditions');
    if (!stageDetail || stageDetail.hidden || !container) return;

    const stageNo = currentStageNo();
    if (!stageNo) return;
    const stage = findExtremeStage(stageNo);
    if (!stage) return;

    const existing = document.getElementById('extremeGimmickBlock');
    if (existing?.dataset.stageNo === String(stageNo)) return;
    existing?.remove();

    const productionTitle = [...container.querySelectorAll(':scope > .endless-detail-section-title')]
      .find((node) => node.textContent.trim() === '敵人生產線');
    if (!productionTitle) return;
    productionTitle.insertAdjacentHTML('beforebegin', renderExtremeGimmicks(stage, stageNo));
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

    groupProductionLines();

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
      patchExtremeGimmicks();
    }
  }

  const observer = new MutationObserver(patchUi);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  document.addEventListener('DOMContentLoaded', patchUi);
  queueMicrotask(patchUi);
})();