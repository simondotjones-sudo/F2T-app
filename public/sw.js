/* Online-only learning: cache only the public, non-personal offline document. */
const CACHE = 'eazysafe-pwa-v1';
const OFFLINE = '/offline.html';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    const response = await fetch(OFFLINE, {cache:'reload', credentials:'omit'});
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html') || !(await response.clone().text()).includes('eazysafe-offline-page')) throw new Error('Offline page unavailable');
    await cache.put(OFFLINE, response);
  }));
  // Updates wait for every open LMS tab to close; never reload an active course.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('eazysafe-pwa-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // APIs, downloads, SCORM iframe documents, POSTs and cross-origin requests pass through.
  if (request.method !== 'GET' || request.mode !== 'navigate' || request.destination !== 'document' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/scorm-content/')) return;
  event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
});
