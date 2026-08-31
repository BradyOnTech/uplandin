/*
 * Uplandin service worker: stale-while-revalidate over same-origin GETs.
 * The cached game boots instantly (and offline); fresh assets download in
 * the background and apply on the next launch. Bump the version to force
 * a clean sweep of old caches.
 */
const CACHE = 'uplandin-v2';
const PAGES = ['./index.html', './index3d.html'];
const PRECACHE = ['./', './manifest.webmanifest'];

async function precacheBuild() {
  const cache = await caches.open(CACHE);
  await cache.addAll(PRECACHE);
  for (const page of PAGES) {
    const response = await fetch(page);
    if (!response.ok) throw new Error(`precache failed: ${page}`);
    await cache.put(page, response.clone());
    const html = await response.text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => new URL(match[1], response.url))
      .filter((url) => url.origin === location.origin);
    await Promise.all(assets.map(async (url) => {
      const asset = await fetch(url);
      if (asset.ok) await cache.put(url, asset);
    }));
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheBuild()
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(req).then((cached) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
