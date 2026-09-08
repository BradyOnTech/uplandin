import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it } from 'vitest';

it('keeps already saved 2D artwork usable offline when a new 3D build activates', async () => {
  class MemoryCache {
    data = new Map<string, Response>();
    async keys() { return [...this.data.keys()].map(url => new Request(url)); }
    async match(key: string | Request) { return this.data.get(typeof key === 'string' ? key : key.url)?.clone(); }
    async put(key: string | Request, response: Response) { this.data.set(typeof key === 'string' ? key : key.url, response.clone()); }
  }
  const stores = new Map<string, MemoryCache>();
  const caches = {
    async open(name: string) { if (!stores.has(name)) stores.set(name, new MemoryCache()); return stores.get(name)!; },
    async keys() { return [...stores.keys()]; },
    async delete(name: string) { return stores.delete(name); },
  };
  const artUrl = 'https://game.test/art/title.png';
  const old = await caches.open('uplandin-v3-old');
  await old.put(artUrl, new Response('saved illustration'));
  await old.put('https://game.test/assets/old.js', new Response('old shell'));
  await caches.open('unrelated-app');
  const handlers = new Map<string, (event: unknown) => void>();
  const self = { addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler), clients: { claim: async () => undefined } };
  const offlineFetch = async () => { throw new Error('network offline'); };
  vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8').replace('__BUILD_ID__', 'new'), {
    self, caches, URL, Request, location: { origin: 'https://game.test' }, fetch: offlineFetch,
  });
  let activation!: Promise<void>;
  handlers.get('activate')!({ waitUntil: (promise: Promise<void>) => { activation = promise; } });
  await activation;
  expect(stores.has('uplandin-v3-old')).toBe(false);
  expect(stores.has('unrelated-app')).toBe(true);
  expect(await (await caches.open('uplandin-public-art-v1')).match(artUrl).then(response => response?.text())).toBe('saved illustration');
  let response!: Promise<Response>;
  const background: Promise<unknown>[] = [];
  handlers.get('fetch')!({ request: new Request(artUrl), respondWith: (promise: Promise<Response>) => { response = promise; }, waitUntil: (promise: Promise<unknown>) => background.push(promise) });
  expect(await (await response).text()).toBe('saved illustration');
  await Promise.all(background);
});
