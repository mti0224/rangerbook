/* Optional enhancement: no auth hooks, no automatic refresh, no new preference store. */
(() => {
  'use strict';
  if(window.top!==window) return; // The personal-team iframe shares its top-level app UI.
  if(window.RangerbookPwa) return;
  const root=new URL('../../',document.currentScript.src);
  let registration, installPrompt, status='', dismissed='', update=false, applying=false;
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  const iosBrowser=ios && /Safari\//.test(navigator.userAgent) && !/FBAN|FBAV|Instagram|Line\//i.test(navigator.userAgent);
  let box,panel;
  const t=key=>{const full='pwa.'+key,value=window.RangerbookI18n?.t(full,'');return value===full?'':value || '';};
  function button(key, action) {
    const b=document.createElement('button');b.type='button';b.textContent=t(key);b.addEventListener('click',action);return b;
  }
  function refresh() {
    if(!box || !t('offline')) return;
    const kind=update?'update':status;
    box.hidden=!kind || dismissed===kind;
    box.replaceChildren();
    if(!box.hidden) {
      const p=document.createElement('p');p.textContent=t(kind);box.append(p);
      const actions=document.createElement('div');actions.className='rb-pwa-actions';
      actions.append(button(update?'updateNow':'retry',update?applyUpdate:()=>location.reload()),button('later',()=>{dismissed=kind;refresh();}));
      box.append(actions);
    }
    if(!panel) return;
    const install=panel.querySelector('[data-pwa-install]');
    const help=panel.querySelector('[data-pwa-ios]');
    install.hidden=standalone() || !installPrompt;
    help.hidden=standalone() || !iosBrowser;
    const availability=panel.querySelector('[data-pwa-availability]');
    const key=standalone()?'installed':installPrompt || iosBrowser?'installHelp':'browserHelp';
    availability.dataset.i18n='pwa.'+key;
    availability.textContent=t(key);
  }
  function report(kind) {
    const map={'cached-data':'cached','cached-page':'offline','data-unavailable':'missing','update-required':'release','network-required':'offline'};
    status=map[kind] || kind;refresh();
    if(kind==='update-required') check();
  }
  function waiting() { update=Boolean(registration?.waiting && navigator.serviceWorker.controller);refresh(); }
  async function check() {
    if(!registration || !navigator.onLine) return;
    try {await registration.update();waiting();} catch(_) {/* Active release remains usable. */}
  }
  async function applyUpdate() {
    if(!registration?.waiting || applying) return;
    applying=true;
    const previous=navigator.serviceWorker.controller;
    let accepted=false,decided=false,changed=false,reloaded=false;
    const reload=()=>{if(!reloaded){reloaded=true;location.reload();}};
    const onChange=()=>{changed=true;if(decided && accepted)reload();};
    // Listen before posting: activation can beat the MessageChannel reply.
    navigator.serviceWorker.addEventListener('controllerchange',onChange,{once:true});
    const channel=new MessageChannel();
    accepted=await new Promise(resolve=>{
      const timer=setTimeout(()=>resolve(false),5000);
      channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data.ok);};
      registration.waiting.postMessage({type:'RB_ACTIVATE_UPDATE'},[channel.port2]);
    });
    decided=true;
    if(!accepted) {navigator.serviceWorker.removeEventListener('controllerchange',onChange);applying=false;update=false;status='closeTabs';refresh();return;}
    // Refresh only this consenting document, exactly once after activation.
    if(changed || navigator.serviceWorker.controller!==previous) reload();
  }
  async function install() {
    const prompt=installPrompt;if(!prompt) return;
    installPrompt=null;refresh();
    try {await prompt.prompt();await prompt.userChoice;} catch(_) {}
    refresh(); // appinstalled/display-mode determines installed state, never userChoice.
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;refresh();});
  window.addEventListener('appinstalled',()=>{installPrompt=null;refresh();});
  window.addEventListener('rangerbook:pwa-status',event=>report(event.detail.kind));
  window.addEventListener('rangerbook:locale-ready',refresh);
  window.addEventListener('offline',()=>report('offline'));
  window.addEventListener('online',()=>{dismissed='';report('restored');check();});
  window.addEventListener('pageshow',check);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
  async function start() {
    const css=document.querySelector('link[href*="/assets/css/pwa.css"]');
    if(css)document.head.append(css); // Safe areas follow the existing shared CSS.
    box=document.createElement('aside');box.className='rb-pwa-status';box.hidden=true;box.setAttribute('role','status');box.setAttribute('aria-live','polite');box.dataset.i18nIgnore='';document.body.append(box);
    panel=document.getElementById('pwaSettings');
    panel?.querySelector('[data-pwa-install]')?.addEventListener('click',install);
    document.querySelector('[data-pwa-retry]')?.addEventListener('click',()=>location.reload());
    const home=document.querySelector('[data-pwa-home]');if(home)home.href=root.href;
    if(!navigator.onLine)status='offline';
    refresh();
    if(!('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='RB_PWA_STATUS')report(event.data.kind);});
    try {
      registration=await navigator.serviceWorker.register(new URL('sw.js',root),{scope:root.pathname,updateViaCache:'none'});
      registration.addEventListener('updatefound',()=>{
        const worker=registration.installing;
        worker?.addEventListener('statechange',()=>{if(worker.state==='installed')waiting();});
      });
      waiting();check();
    } catch(_) {/* The ordinary online website continues if registration is unavailable. */}
  }
  window.RangerbookPwa={checkUpdate:check,get standalone(){return standalone();}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
