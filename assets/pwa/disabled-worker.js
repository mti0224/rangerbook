/* Rollback worker: keep /sw.js reachable until installed clients migrate out. */
self.addEventListener('message',event=>{
  if(event.data?.type!=='RB_ACTIVATE_UPDATE')return;
  event.waitUntil((async()=>{
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    if(clients.some(c=>c.frameType!=='nested' && c.id!==event.source?.id && c.url.startsWith(self.registration.scope))) {
      event.ports[0]?.postMessage({ok:false});return;
    }
    event.ports[0]?.postMessage({ok:true});await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const prefix='rangerbook-pwa-'+new URL(self.registration.scope).pathname.replace(/[^a-z0-9]/gi,'_')+'-';
  for(const key of await caches.keys())if(key.startsWith(prefix))await caches.delete(key);
  await self.registration.unregister();
  // No forced navigation. Existing pages return to network on their next load.
})()));
