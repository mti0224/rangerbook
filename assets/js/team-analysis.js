/* Search-page view. Every refresh replaces the previous player's analysis. */
(() => {
  'use strict';
  const host = document.getElementById('pvpPlayerTeamAnalysis');
  if (!host) return;
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const t = id => window.RangerbookI18n?.t('analysis.'+id) || id;
  const percent = value => `${Number(value.toFixed(2))}%`;
  let modelPromise, sequence = 0, result, tab = 'WEAPON', category, role = 'INT';
  let topObserver, roleHelpDialog;
  let helpDialog;
  function closeHelp() {
    if (helpDialog?.open) helpDialog.close();
  }
  function openHelp() {
    if (!helpDialog) {
      helpDialog = document.createElement('dialog');
      helpDialog.className = 'ta-help-dialog';
      helpDialog.setAttribute('aria-labelledby','taEquipmentHelpTitle');
      helpDialog.innerHTML = `<header class="ta-help-header"><h2 id="taEquipmentHelpTitle">${escape(t('help.title'))}</h2>
        <button type="button" class="ta-help-close" aria-label="${escape(window.RangerbookI18n.t('copy.close','關閉'))}">×</button></header>
        <div class="ta-help-content">
          <section><h3>${escape(t('help.gearTitle'))}</h3><p>${escape(t('help.gearBody'))}</p></section>
          <section><h3>${escape(t('tab.surehit'))}</h3><p>${escape(t('help.surehitBody'))}</p>
            <ul>${['int','agi','str'].map(role => `<li>${escape(t('help.'+role))}</li>`).join('')}</ul></section>
          <section><h3>${escape(t('tab.element'))}</h3><p>${escape(t('help.elementBody'))}</p></section>
        </div>`;
      helpDialog.querySelector('.ta-help-close').addEventListener('click',closeHelp);
      helpDialog.addEventListener('close',() => document.documentElement.classList.remove('ta-help-open'));
      helpDialog.addEventListener('click',event => {
        if (event.target !== helpDialog) return;
        const bounds = helpDialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeHelp();
      });
      document.body.appendChild(helpDialog);
    }
    if (!helpDialog.open) {
      helpDialog.showModal();
      document.documentElement.classList.add('ta-help-open');
    }
  }
  const image = code => `https://rangers.lerico.net/res/${encodeURIComponent(code)}/${encodeURIComponent(code)}-thum.png`;
  async function model() {
    if (!modelPromise) modelPromise = (async () => {
      await window.RangerbookI18n?.ready;
      const v2 = window.RangerbookV2;
      const [r,e,a,f] = await Promise.all(['rangers','equipment','abilities','equipment-effects'].map(n => v2.data(n)));
      const catalogs = {rangers:r.rangers,equipment:e.equipment,abilities:a.abilities,effects:f.effects};
      return {
        analysis:window.RangerbookTeamAnalysisModel.create(catalogs),
        overview:window.RangerbookTeamOverviewModel.create(catalogs)
      };
    })().catch(error => { modelPromise = null; throw error; });
    return modelPromise;
  }
  const metricText = m => m.average === null ? t(m.pending ? 'pending' : 'noData') : percent(m.average);
  function radar() {
    const cx=200, cy=150, radius=98;
    const point = (i,r) => {const angle=-Math.PI/2+i*Math.PI/3; return [cx+Math.cos(angle)*r,cy+Math.sin(angle)*r];};
    const polygon = r => result.radar.map((_,i) => point(i,r).join(',')).join(' ');
    const rings = [.25,.5,.75,1].map(scale => `<polygon class="ta-radar-ring" points="${polygon(radius*scale)}"/>`).join('');
    const axes = result.radar.map((m,i) => {
      const [x,y]=point(i,radius),[lx,ly]=point(i,radius+31);
      return `<g data-metric="${i}"><line class="ta-radar-axis" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>
        <text class="ta-radar-label" x="${lx}" y="${ly-4}" text-anchor="middle">${escape(t('short.'+m.id))}<tspan x="${lx}" dy="16">0–${m.max}%</tspan></text></g>`;
    }).join('');
    // An incomplete metric has no inferred plotted value. Keep the other axes as points.
    const complete = result.radar.every(m => m.normalized !== null);
    const shape = complete ? `<polygon class="ta-radar-value" points="${result.radar.map((m,i) => point(i,m.normalized*radius).join(',')).join(' ')}"/>` : '';
    const dots = result.radar.map((m,i) => {
      const [x,y]=point(i,(m.normalized ?? 0)*radius);
      return `<g class="ta-radar-target" tabindex="0" data-metric="${i}" aria-label="${escape(t('metric.'+m.id)+': '+metricText(m))}"><title>${escape(t('metric.'+m.id)+': '+metricText(m))}</title><circle class="ta-radar-hit" cx="${point(i,radius)[0]}" cy="${point(i,radius)[1]}" r="22"/>${m.normalized !== null ? `<circle class="ta-radar-dot" cx="${x}" cy="${y}" r="4"/>` : ''}</g>`;
    }).join('');
    return `<svg class="ta-radar" viewBox="0 0 400 300" role="img" aria-label="${escape(t('radar'))}">${rings}${axes}${shape}${dots}</svg>
      <div class="ta-radar-tooltip" role="status" aria-live="polite">${escape(t('radarHint'))}</div>
      <dl class="ta-metric-list">${result.radar.map((m,i) => `<div tabindex="0" data-metric="${i}"><dt>${escape(t('metric.'+m.id))}</dt><dd>${escape(metricText(m))}</dd></div>`).join('')}</dl>`;
  }
  const formatValue = (n, suffix = '') => n === null || !Number.isFinite(n) ?
    t('role.noData') : Number(n.toFixed(2)).toLocaleString(window.RangerbookI18n?.locale === 'th' ? 'th-TH' : window.RangerbookI18n?.locale === 'jp' ? 'ja-JP' : 'en-US') + suffix;
  const roleFields = ['attack','hp','range','resistance','evade','surehit','invalid','penetration','mineral','respawn'];
  const percentFields = new Set(['resistance','evade','surehit','invalid','penetration']);
  const labelFor = (group,item) => {
    const key=item.key;
    if(group==='star' && key==='ultra8') return t('overview.ultra8');
    if(group==='star' && key==='hyper8') return t('overview.hyper8');
    if(group==='star'||group==='gearStar') return key==='unknown'?t('overview.unknown'):
      (window.RangerbookI18n?.format('analysis.overview.starLabel',[key],key+'★')||key+'★');
    if(group==='talent') return key==='unknown'?t('overview.unknown'):
      (window.RangerbookI18n?.format('analysis.overview.talentLabel',[key],key)||key);
    if(group==='condition'){
      if(key==='none')return t('overview.noAdvanced');
      if(key==='always')return t('overview.any');
    }
    return t('category.'+key)==='analysis.category.'+key?t('overview.unknown'):t('category.'+key);
  };
  function distributionBar(name,items){
    const total=items.reduce((sum,x)=>sum+x.count,0);
    const segments=items.length?items.map((item,index)=>{
      const label=labelFor(name,item);
      return '<span class="ta-dist-segment ta-dist-shade-'+(index%5)+'" style="width:'+ (100*item.ratio)+'%" title="'+escape(label+' '+item.count+'/'+total)+'" aria-label="'+escape(label+': '+formatValue(100*item.ratio,'%'))+'">'+
        (item.ratio>=.16?'<span>'+escape(label)+' '+formatValue(100*item.ratio,'%')+'</span>':'')+'</span>';
    }).join(''):'';
    return '<div class="ta-distribution-item"><div class="ta-dist-heading">'+escape(t('overview.'+name))+
      '<small>'+total+'</small></div><div class="ta-dist-track" role="img" aria-label="'+escape(t('overview.'+name)+': '+items.map(x=>labelFor(name,x)+ ' '+formatValue(x.ratio*100,'%')).join(', '))+'">'+segments+'</div></div>';
  }
  function overview(){
    const data=result.overview;
    const groups=['star','role','element','talent','gearStar','condition'];
    return '<div class="ta-overview-inner" tabindex="0">'+
      (data.membersCount?groups.map(k=>distributionBar(k,data.distribution[k])).join(''):
        '<p class="ta-note">'+escape(t('overview.none'))+'</p>')+
      '<h4 class="ta-overview-production-title">'+escape(t('overview.production'))+'</h4>'+
      '<div class="ta-production-grid">'+
      '<div><span>'+escape(t('overview.mineral'))+'</span><strong>'+escape(formatValue(data.overall.mineral))+'</strong></div>'+
      '<div><span>'+escape(t('overview.respawn'))+'</span><strong>'+escape(formatValue(data.overall.respawn,'s'))+'</strong></div></div></div>';
  }
  function roleStats(){
    const row=result.overview.roles[role];
    const panel=host.querySelector('.ta-role-body');
    if(!panel)return;
    const metric=field=>{
      const value=row?.stats?.[field]??null;
      return '<div class="ta-role-stat"><span>'+escape(t('role.metric.'+field))+'</span><strong>'+
        escape(formatValue(value,percentFields.has(field)?'%':field==='respawn'?'s':''))+'</strong></div>';
    };
    panel.innerHTML='<p class="ta-note">'+escape(t('role.average'))+' · '+
      escape(window.RangerbookI18n?.format('analysis.role.units',[row.count],row.count)||row.count)+'</p>'+
      (row.count?'<div class="ta-role-metrics">'+roleFields.map(metric).join('')+'</div>':
        '<p class="ta-note">'+escape(t('role.empty'))+'</p>');
    host.querySelectorAll('[data-role]').forEach(button=>{
      const active=button.dataset.role===role;
      button.setAttribute('aria-selected',String(active));
      button.tabIndex=active?0:-1;
    });
  }
  function showRoleHelp(){
    if(!roleHelpDialog){
      roleHelpDialog=document.createElement('dialog');
      roleHelpDialog.className='ta-help-dialog';
      const closeText=window.RangerbookI18n?.t('copy.close','關閉')||'關閉';
      roleHelpDialog.innerHTML='<header class="ta-help-header"><h2>'+escape(t('role.title'))+'</h2>'+
        '<button type="button" class="ta-help-close" aria-label="'+escape(closeText)+'">×</button></header>'+
        '<div class="ta-help-content"><p>'+escape(t('role.help'))+'</p></div>';
      roleHelpDialog.querySelector('button').addEventListener('click',()=>roleHelpDialog.close());
      document.body.appendChild(roleHelpDialog);
    }
    roleHelpDialog.showModal();
  }
  function alignOverview(){
    const radar=host.querySelector('.ta-radar-panel'),panel=host.querySelector('.ta-overview-panel');
    if(!radar||!panel)return;
    const height=radar.getBoundingClientRect().height;
    if(window.matchMedia('(min-width: 761px)').matches && height>0)
      panel.style.height=Math.ceil(height)+'px';
    else panel.style.removeProperty('height');
  }
  function syncOverview(){
    topObserver?.disconnect();
    const radar=host.querySelector('.ta-radar-panel');
    if(window.ResizeObserver&&radar){
      topObserver=new ResizeObserver(alignOverview);
      topObserver.observe(radar);
    }
    requestAnimationFrame(alignOverview);
  }
  window.addEventListener('resize',alignOverview);
  function memberList() {
    const row = result.tabs[tab].find(r => r.category === category);
    const panel = host.querySelector('.ta-members');
    if (!row) { panel.innerHTML = ''; return; }
    panel.setAttribute('aria-label',t('category.'+category));
    panel.innerHTML = `<h4>${escape(t('category.'+category))} · ${row.numerator}/${row.denominator}</h4>
      <p class="ta-legend"><span class="ta-pass-label">${escape(t('matched'))}</span><span class="ta-fail-label">${escape(t('unmatched'))}</span></p>
      <div class="ta-member-grid">${row.entries.map(entry => {
        const name = window.RangerbookV2.render(entry.ranger.nameKey,window.RangerbookV2.locale);
        return `<button type="button" class="pvp-player-unit-button ta-member ${entry.ok ? 'ta-pass' : 'ta-fail'}" data-analysis-unit="${entry.index}" title="${escape(name)}" aria-label="${escape(name+': '+t('reason.'+entry.reason))}">
          <span class="pvp-player-unit-image-wrap"><img class="pvp-player-unit-image" src="${image(entry.unit.unitCode)}" alt="" loading="lazy" onerror="this.remove()"></span>
          <span class="pvp-player-unit-name">${escape(name)}</span><small>${escape(t('reason.'+entry.reason))}</small></button>`;
      }).join('')}</div>${row.entries.length ? '' : `<p class="ta-note">${escape(t('noEligible'))}</p>`}`;
    host.querySelectorAll('[data-category]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.category === category)));
  }
  function bars() {
    const rows = result.tabs[tab];
    category = rows.find(r => r.denominator)?.category || rows[0]?.category;
    host.querySelector('.ta-bars').innerHTML = rows.map(row => `<button type="button" class="ta-bar" data-category="${row.category}" aria-pressed="false" aria-controls="taMembers">
      <span class="ta-bar-heading"><strong>${escape(t('category.'+row.category))}</strong><span>${row.numerator}/${row.denominator} (${row.ratio === null ? '—' : percent(row.ratio*100)})</span></span>
      <span class="ta-bar-track" aria-hidden="true"><span style="width:${(row.ratio || 0)*100}%"></span></span></button>`).join('');
    host.querySelectorAll('[data-analysis-tab]').forEach(b => {
      const active = b.dataset.analysisTab === tab;
      b.setAttribute('aria-selected',String(active));
      b.tabIndex = active ? 0 : -1;
    });
    const activeTab = host.querySelector(`[data-analysis-tab="${tab}"]`);
    host.querySelector('.ta-tab-panel').setAttribute('aria-labelledby',activeTab.id);
    memberList();
  }
  function render() {
    host.hidden = false;
    host.setAttribute('aria-label',t('title'));
    host.innerHTML = `<h2>${escape(t('title'))}</h2><div class="ta-columns">
      <section class="ta-panel ta-radar-panel"><h3>${escape(t('radar'))}</h3>${radar()}</section>
      <section class="ta-panel ta-overview-panel"><h3>${escape(t('overview.title'))}</h3>${overview()}</section>
      <section class="ta-panel ta-role-panel"><div class="ta-panel-heading"><h3>${escape(t('role.title'))}</h3>
        <button type="button" class="ta-help-button" data-role-help aria-label="${escape(t('role.title'))}"><span aria-hidden="true">?</span></button></div>
        <div class="ta-tabs ta-role-tabs" role="tablist" aria-label="${escape(t('role.title'))}">${['INT','AGI','STR'].map(k => `<button type="button" role="tab" data-role="${k}">${escape(t('category.'+k))}</button>`).join('')}</div>
        <div class="ta-role-body" role="tabpanel"></div></section>
      <section class="ta-panel ta-equipment-panel"><div class="ta-panel-heading"><h3>${escape(t('equipment'))}</h3>
        <button type="button" class="ta-help-button" data-equipment-help aria-haspopup="dialog" aria-label="${escape(t('help.open'))}"><span aria-hidden="true">?</span></button></div>
        <div class="ta-tabs" role="tablist" aria-label="${escape(t('equipment'))}">${['WEAPON','ARMOR','ACC','surehit','element'].map(id => `<button type="button" id="taTab-${id}" role="tab" data-analysis-tab="${id}" aria-controls="taTabPanel">${escape(t('tab.'+id))}</button>`).join('')}</div>
        <div class="ta-tab-panel" id="taTabPanel" role="tabpanel"><p class="ta-note">${escape(t('barHint'))}</p><div class="ta-bars"></div><div id="taMembers" class="ta-members" aria-live="polite"></div></div>
      </section></div>`;
    bars();
    roleStats();
    syncOverview();
  }
  function selectCategory(target) {
    const button = target.closest('[data-category]');
    if (button && button.dataset.category !== category) {category = button.dataset.category; memberList();}
  }
  function showRadarMetric(target) {
    const metric = target.closest('[data-metric]');
    if (metric) {
      const m = result.radar[Number(metric.dataset.metric)];
      host.querySelector('.ta-radar-tooltip').textContent = `${t('metric.'+m.id)}: ${metricText(m)}`;
    }
  }
  // Hover and focus only preview radar values. Category selection must be
  // explicitly activated by click, tap or keyboard (native button click).
  host.addEventListener('pointermove',e => { if (e.pointerType !== 'touch') showRadarMetric(e.target); });
  host.addEventListener('focusin',e => showRadarMetric(e.target));
  host.addEventListener('click',e => {
    if (e.target.closest('[data-equipment-help]')) {openHelp(); return;}
    if (e.target.closest('[data-role-help]')) {showRoleHelp(); return;}
    const roleButton=e.target.closest('[data-role]');
    if(roleButton){role=roleButton.dataset.role;roleStats();return;}
    const button=e.target.closest('[data-analysis-tab]');
    if (button) {tab=button.dataset.analysisTab; bars(); return;}
    selectCategory(e.target);
    showRadarMetric(e.target);
    const member=e.target.closest('[data-analysis-unit]');
    if (member) document.querySelector(`#pvpPlayerSearchTeamGrid [data-unit-index="${member.dataset.analysisUnit}"]`)?.click();
  });
  host.addEventListener('keydown',e => {
    const roleButton=e.target.closest('[data-role]');
    if(roleButton && ['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){
      e.preventDefault();
      const types=['INT','AGI','STR'];
      const at=types.indexOf(roleButton.dataset.role);
      const next=e.key==='Home'?0:e.key==='End'?types.length-1:
        (at+(e.key==='ArrowRight'?1:-1)+types.length)%types.length;
      role=types[next];roleStats();host.querySelector('[data-role="'+role+'"]')?.focus();return;
    }
    const button=e.target.closest('[data-analysis-tab]');
    if (!button || !['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
    e.preventDefault();
    const tabs=[...host.querySelectorAll('[data-analysis-tab]')],index=tabs.indexOf(button);
    const next=e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length-1 : (index+(e.key === 'ArrowRight' ? 1 : -1)+tabs.length)%tabs.length;
    tab=tabs[next].dataset.analysisTab; bars(); tabs[next].focus();
  });
  window.RangerbookTeamAnalysis = {
    clear() {closeHelp();if(roleHelpDialog?.open)roleHelpDialog.close();topObserver?.disconnect();
      sequence++; result=null;host.hidden=true;host.replaceChildren();},
    async setUnits(units) {
      closeHelp();
      const request=++sequence;
      host.hidden=false;
      host.textContent=t('loading');
      try {
        const engine=await model();
        if (request !== sequence) return;
        result=engine.analysis.analyze(units);
        result.overview=engine.overview.summarize(units);
        category=null;role='INT';render();
      } catch (error) {
        if (request !== sequence) return;
        host.textContent=t('error');console.error('Team analysis unavailable',error);
      }
    }
  };
})();
