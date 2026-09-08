/* The build fingerprints the shell, lazy chunks, and complete GSP asset set. */
const CACHE = 'uplandin-v3-__BUILD_ID__';
const ART_CACHE = 'uplandin-public-art-v1';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const response = await fetch('./precache.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Offline manifest unavailable');
    const manifest = await response.json();
    const cache = await caches.open(CACHE);
    await cache.addAll(manifest.files.map(file => new Request(new URL(file, self.registration.scope), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const art = await caches.open(ART_CACHE);
    for (const key of await caches.keys()) {
      if (!key.startsWith('uplandin-') || key === CACHE || key === ART_CACHE) continue;
      // Preserve previously visited 2D content while replacing the versioned
      // application shell. Public art is not part of the 3D preload manifest.
      const previous = await caches.open(key);
      for (const request of await previous.keys()) {
        if (!new URL(request.url).pathname.includes('/art/') || await art.match(request)) continue;
        const response = await previous.match(request);
        if (response) await art.put(request, response);
      }
      await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'offline-status') event.source?.postMessage({ type: 'offline-ready', build: CACHE });
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  event.respondWith((async () => {
    const publicArt = url.pathname.includes('/art/');
    const cache = await caches.open(publicArt ? ART_CACHE : CACHE);
    // Launch parameters choose a hunt, while every launch uses the same shell.
    const navigation = request.mode === 'navigate';
    const key = navigation ? new URL(url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname, url.origin).href : request;
    const cached = await cache.match(key);
    // Existing 2D art uses stable public filenames; retain its background
    // refresh behavior rather than pinning those images to a JS build hash.
    if (cached && publicArt) {
      event.waitUntil(fetch(request).then(response => response.ok ? cache.put(key, response) : undefined).catch(() => undefined));
      return cached;
    }
    if (cached) return cached;
    const fresh = await fetch(request);
    if (fresh.ok) event.waitUntil(cache.put(key, fresh.clone()));
    return fresh;
  })());
});
