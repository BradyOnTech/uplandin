/* Every build has its own complete shell; updates wait for a safe transition. */
const BUILD = '__BUILD_ID__';
const SCOPE = self.registration.scope;
const PREFIX = `uplandin-v4-${encodeURIComponent(new URL(SCOPE).pathname)}-`;
const CACHE = `${PREFIX}${BUILD}`;
const ART_CACHE = `uplandin-art-v2-${encodeURIComponent(new URL(SCOPE).pathname)}`;
const MENU_ART = new URL('art/menus3d/', SCOPE).href;
const READY = new URL('__offline-ready__', SCOPE).href;
const ACTIVE = new URL('__offline-active__', SCOPE).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const response = await fetch(new URL('precache.json', SCOPE), { cache: 'no-store' });
    if (!response.ok) throw new Error('Offline manifest unavailable');
    const manifest = await response.json();
    if (manifest.build !== BUILD || !Array.isArray(manifest.files) || !manifest.files.length) {
      throw new Error('Offline manifest belongs to a different build');
    }
    const cache = await caches.open(CACHE);
    try {
      await cache.addAll(manifest.files.map(file => new Request(new URL(file, SCOPE), { cache: 'reload' })));
      await cache.put(READY, new Response(JSON.stringify({ build: BUILD })));
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
    // No skipWaiting: installing a build must never interrupt an open hunt.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const art = await caches.open(ART_CACHE);
    const previous = [];
    const legacyShells = [];
    for (const key of await caches.keys()) {
      if (key === CACHE || key === ART_CACHE) continue;
      const owned = key.startsWith(PREFIX);
      const legacy = key.startsWith('uplandin-v3-') || key === 'uplandin-public-art-v1';
      if (!owned && !legacy) continue;
      const cache = await caches.open(key);
      const requests = await cache.keys();
      if (legacy && requests.length && requests.every(request => request.url.startsWith(SCOPE))) {
        legacyShells.push(key);
      }
      // Preserve previously visited 2D images, including the prior cache format.
      for (const request of requests) {
        if (!request.url.startsWith(SCOPE) || request.url.startsWith(MENU_ART)
          || !new URL(request.url).pathname.includes('/art/') || await art.match(request)) continue;
        const response = await cache.match(request);
        if (response) await art.put(request, response);
      }
      if (owned) {
        const active = await cache.match(ACTIVE);
        const activatedAt = active ? Number(await active.text()) : 0;
        previous.push({ key, activatedAt });
      }
    }
    // Retain the last activated shell, not a newer abandoned staging cache.
    // Explicit activation is blocked while another game window is open.
    previous.sort((a, b) => b.activatedAt - a.activatedAt);
    const retained = previous.find(item => item.activatedAt > 0)?.key;
    for (const item of previous) if (item.key !== retained) await caches.delete(item.key);
    // One legacy shell survives the first upgrade for its still-loaded page.
    // Once a scoped predecessor exists, retire that migration copy as well.
    for (const key of legacyShells) {
      if (key === 'uplandin-public-art-v1' || retained) await caches.delete(key);
    }
    await (await caches.open(CACHE)).put(ACTIVE, new Response(String(Date.now())));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'offline-status') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      const ready = Boolean(await cache.match(READY));
      event.source?.postMessage({ type: ready ? 'offline-ready' : 'offline-unavailable', build: BUILD });
    })());
  }
  if (event.data?.type === 'apply-offline-update') {
    event.waitUntil((async () => {
      const windows = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
        .filter(client => client.url.startsWith(SCOPE));
      if (!event.source || windows.some(client => client.id !== event.source.id)) {
        event.source?.postMessage({ type: 'offline-update-blocked', reason: 'other-tabs' });
        return;
      }
      if (!(await (await caches.open(CACHE)).match(READY))) {
        event.source.postMessage({ type: 'offline-update-blocked', reason: 'incomplete' });
        return;
      }
      await self.skipWaiting();
    })());
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin || !url.href.startsWith(SCOPE)) return;
  // Never pin the update manifest or service worker in the application cache.
  if (url.pathname.endsWith('/precache.json') || url.pathname.endsWith('/sw.js')) return;
  event.respondWith((async () => {
    // Menu art is bundled with this shell, unlike visited legacy 2D artwork.
    // Keeping it versioned also makes precached images available before their
    // first online visit instead of looking only in the shared artwork cache.
    const publicArt = url.pathname.includes('/art/') && !url.href.startsWith(MENU_ART);
    const cache = await caches.open(publicArt ? ART_CACHE : CACHE);
    const navigation = request.mode === 'navigate';
    const key = navigation ? new URL(url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname, url.origin).href : request;
    const cached = await cache.match(key);
    if (cached && publicArt) {
      event.waitUntil(fetch(request).then(response => response.ok ? cache.put(key, response) : undefined).catch(() => undefined));
      return cached;
    }
    if (cached) return cached;
    // Content-hashed lazy chunks may belong to a tab loaded just before an
    // update. Never mix HTML or mutable public assets across shell versions.
    if (!navigation && /\/assets\/[^/]+-[\w-]+\.(?:js|css)$/.test(url.pathname)) {
      for (const name of await caches.keys()) {
        if (name === CACHE || (!name.startsWith(PREFIX) && !name.startsWith('uplandin-v3-'))) continue;
        const old = await (await caches.open(name)).match(request);
        if (old) return old;
      }
    }
    const fresh = await fetch(request);
    if (fresh.ok) event.waitUntil(cache.put(key, fresh.clone()));
    return fresh;
  })());
});
