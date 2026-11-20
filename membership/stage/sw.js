/* Acceptance-only worker: online-only, no fetch proxy, no private/offline caching. */
'use strict';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  // Clean up a previous Rangerbook cache on this origin only, if one existed.
  // CacheStorage is origin-isolated; production's different hostname is untouched.
  for (const name of await caches.keys()) {
    if (name.startsWith('rangerbook-pwa-')) await caches.delete(name);
  }
  await self.clients.claim();
})()));
// Deliberately no fetch handler: browser handles Basic Auth and every request
// over the network with the server's Cache-Control: no-store, private.
