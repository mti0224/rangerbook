/* Exact release allowlists: no runtime URL discovery, opaque or private caching. */
'use strict';
const RELEASE = /* PWA_RELEASE */;
const BASE = new URL('./', self.registration.scope);
const PREFIX = 'rangerbook-pwa-'+BASE.pathname.replace(/[^a-z0-9]/gi,'_')+'-';
const CORE = PREFIX+'app-'+RELEASE.appVersion+'-'+RELEASE.dataVersion;
const DATA = PREFIX+'data-'+RELEASE.dataVersion;
const CORE_LIMIT = 8*1024*1024, DATA_LIMIT = 32*1024*1024;
const BOOT = ['offline.html','404.html','assets/css/style.css','assets/css/game-tech.css','assets/css/pwa.css',
  'assets/js/visitor-region.js','assets/js/i18n.js','assets/js/pwa.js','assets/js/pwa-head.js','assets/js/pwa-data.js',
  'assets/locales/ui.json','assets/locales/game-custom.json','assets/locales/pwa.json','assets/locales/sitewide-overrides.json',
  'manifest.webmanifest','assets/pwa/icon-192.png','assets/pwa/icon-512.png',
  'assets/pwa/apple-touch-icon.png','pwa-data.json'];
const absolute = name => new URL(name,BASE).href;
const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
  .map(x=>x.toString(16).padStart(2,'0')).join('');
let writes = Promise.resolve();
async function notify(kind) {
  const clients=await self.clients.matchAll({type:'window'});
  for(const client of clients) client.postMessage({type:'RB_PWA_STATUS',kind});
}
async function verified(response, entry, allow404=false) {
  return response && (response.ok || (allow404 && response.status===404)) && response.type!=='opaque' &&
    !response.redirected && await sha(await response.clone().arrayBuffer())===entry.hash;
}
function put(cacheName,name,response) {
  // Serialize eviction/writes: bursts of concurrent JSON requests cannot race
  // past the byte budget. Cache failure must never turn a successful read into failure.
  writes = writes.catch(()=>{}).then(async()=>{
    const cache=await caches.open(cacheName), keys=await cache.keys();
    const entries=cacheName===DATA?RELEASE.data:RELEASE.core;
    const budget=cacheName===DATA?DATA_LIMIT:CORE_LIMIT;
    const size=entries[name]?.size || 0;
    if(size>budget) return;
    let total=0;
    for(const key of keys) total+=entries[new URL(key.url).pathname.slice(BASE.pathname.length)]?.size || 0;
    const exists=keys.find(k=>k.url===absolute(name));
    if(exists) { await cache.delete(exists);total-=size; }
    for(const key of keys) {
      if(total+size<=budget) break;
      const old=new URL(key.url).pathname.slice(BASE.pathname.length);
      if(cacheName===CORE && BOOT.includes(old)) continue;
      await cache.delete(key);total-=entries[old]?.size || 0;
    }
    try { await cache.put(absolute(name),response); }
    catch(error) {
      // Storage quota is optional; preserve the tiny offline shell.
      if(cacheName===DATA) await caches.delete(DATA);
    }
  });
  return writes;
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  // A failed new install leaves the active worker and its caches untouched.
  try {
    for(const name of BOOT) {
      const response=await fetch(absolute(name),{cache:'no-store',credentials:'omit'});
      if(!await verified(response,RELEASE.core[name])) throw new Error('Incomplete PWA shell: '+name);
      await put(CORE,name,response);
    }
    const cache=await caches.open(CORE);
    for(const name of BOOT) if(!await cache.match(absolute(name))) throw new Error('PWA shell storage failed');
  } catch(error) {
    await caches.delete(CORE);
    throw error;
  }
  // No skipWaiting: an update waits for consent or all old windows to close.
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys()) if(key.startsWith(PREFIX) && key!==CORE && key!==DATA) await caches.delete(key);
  // Do not claim an uncontrolled/older document midway through its initial load.
})()));
self.addEventListener('message',event=>{
  if(event.data?.type!=='RB_ACTIVATE_UPDATE') return;
  event.waitUntil((async()=>{
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const scoped=clients.filter(c=>c.frameType!=='nested' && c.url.startsWith(BASE.href));
    // Preserve running analyses in every other tab/window.
    if(scoped.some(c=>c.id!==event.source?.id)) {event.ports[0]?.postMessage({ok:false});return;}
    event.ports[0]?.postMessage({ok:true});
    await self.skipWaiting();
  })());
});
function privateRequest(request,url) {
  return request.method!=='GET' || url.origin!==BASE.origin || !url.pathname.startsWith(BASE.pathname) ||
    request.headers.has('Authorization') || /(?:token|session|auth|code|password)/i.test([...url.searchParams.keys()].join(' ')) ||
    /^(?:admin|account|account-action|personal-teams|auth|api|sponsor|payment)(?:\/|$)/i.test(url.pathname.slice(BASE.pathname.length));
}
const detailRoute = name => /^gear\/[^/]+\/?$/.test(name) ||
  /^endless\/stage\/end\d+\/?$/i.test(name) || /^mainstage\/(hard|extreme)\/stage\/(hs|es)\d+\/?$/i.test(name);
async function resource(name,request,isData,event) {
  const table=isData?RELEASE.data:RELEASE.core, cacheName=isData?DATA:CORE;
  // A release hash identifies immutable bytes. Never wait ten seconds for the
  // network when this exact verified release is already stored locally.
  const cache=await caches.open(cacheName), cached=await cache.match(absolute(name));
  if(cached && await verified(cached,table[name])) return cached;
  if(cached) await cache.delete(absolute(name));
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),10000);
  try {
    const versioned=new URL(absolute(name));versioned.search='?rb-v='+table[name].hash;
    const response=await fetch(new Request(versioned,{cache:'force-cache',credentials:'omit',signal:controller.signal}));
    if(await verified(response,table[name])) {
      event.waitUntil(put(cacheName,name,response.clone()));return response;
    }
    event.waitUntil(notify('update-required'));
  } catch(_) {} finally {clearTimeout(timer);}
  if(request.mode==='navigate') return (await caches.open(CORE)).match(absolute('offline.html'));
  event.waitUntil(notify(isData?'data-unavailable':'update-required'));
  return new Response(JSON.stringify({error:'RANGERBOOK_OFFLINE_OR_RELEASE_MISMATCH'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(privateRequest(request,url)) {
    // Preserve original credentials/body/fallback semantics; bypass HTTP cache too.
    const publicAsset=url.origin!==BASE.origin && ['image','font','script','style','video','audio'].includes(request.destination);
    event.respondWith(fetch(request,publicAsset?undefined:{cache:'no-store'}).catch(async error=>{
      if(request.mode==='navigate' && url.origin===BASE.origin) return (await caches.open(CORE)).match(absolute('offline.html'));
      if(request.destination==='') event.waitUntil(notify('network-required'));
      throw error;
    }));return;
  }
  let name=url.pathname.slice(BASE.pathname.length);
  if(request.mode==='navigate') {
    const ranger=name.match(/^ranger\/ranger\/([^/]+)\/?$/);
    if(ranger && !RELEASE.core[name]) {event.respondWith(Promise.resolve(Response.redirect(absolute('ranger/ranger/')+'?detail='+encodeURIComponent(decodeURIComponent(ranger[1])),302)));return;}
    if(detailRoute(name) && !RELEASE.core[name]) name='404.html';
    if(name.endsWith('/') || !name) name+='index.html';
    else if(RELEASE.core[name+'/index.html']) {
      // Preserve the server's trailing-slash redirect and relative asset resolution.
      event.respondWith(Promise.resolve(Response.redirect(absolute(name+'/')+url.search,302)));return;
    }
    // ranger.js supports these pretty URLs; return the real shell with a
    // redirect so relative imports keep their original base, online and offline.
    if(!RELEASE.core[name]) {
      // Unknown routes keep the actual Pages 404 behavior. Offline gets a
      // reconnect page, never an unrelated home page or cached private screen.
      event.respondWith(fetch(request,{cache:'no-store'}).catch(async()=> (await caches.open(CORE)).match(absolute('offline.html'))));return;
    }
  }
  if(RELEASE.data[name]) {event.respondWith(resource(name,request,true,event));return;}
  if(RELEASE.core[name] && name!=='assets/pwa/service-worker.js') {event.respondWith(resource(name,request,false,event));return;}
  // Non-allowlisted resources (including all animation/images on other hosts)
  // are never added to Cache Storage.
});

