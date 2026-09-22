import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it } from 'vitest';

const workerSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const scope = 'https://game.test/play/';
const prefix = 'uplandin-v4-%2Fplay%2F-';
const readyUrl = `${scope}__offline-ready__`;
const activeUrl = `${scope}__offline-active__`;

class MemoryCache {
  data = new Map<string, Response>();
  constructor(private network: (request: Request) => Promise<Response>) {}
  async keys() { return [...this.data.keys()].map(url => new Request(url)); }
  async match(key: string | Request) { return this.data.get(typeof key === 'string' ? key : key.url)?.clone(); }
  async put(key: string | Request, response: Response) { this.data.set(typeof key === 'string' ? key : key.url, response.clone()); }
  async addAll(requests: Request[]) {
    const responses = await Promise.all(requests.map(request => this.network(request)));
    if (responses.some(response => !response.ok)) throw new Error('Incomplete precache');
    for (let i = 0; i < requests.length; i++) await this.put(requests[i], responses[i]);
  }
}

function fixture(build = 'new') {
  let online = true;
  const networkFiles = new Map<string, string>([
    [`${scope}precache.json`, JSON.stringify({ build, files: ['index3d.html', 'assets/boot-new.js'] })],
    [`${scope}index3d.html`, '<script src="assets/boot-new.js"></script>'],
    [`${scope}assets/boot-new.js`, 'new game'],
  ]);
  const fetch = async (request: Request | URL) => {
    if (!online) throw new Error('network offline');
    const url = request instanceof URL ? request.href : request.url;
    const body = networkFiles.get(url);
    return new Response(body ?? 'missing', { status: body === undefined ? 404 : 200 });
  };
  const stores = new Map<string, MemoryCache>();
  const caches = {
    async open(name: string) { if (!stores.has(name)) stores.set(name, new MemoryCache(fetch)); return stores.get(name)!; },
    async keys() { return [...stores.keys()]; },
    async delete(name: string) { return stores.delete(name); },
  };
  const handlers = new Map<string, (event: any) => void>();
  const windows = [{ id: 'first', url: `${scope}index3d.html` }];
  let skipCount = 0;
  let claimCount = 0;
  const self = {
    registration: { scope },
    addEventListener: (name: string, handler: (event: any) => void) => handlers.set(name, handler),
    skipWaiting: async () => { skipCount++; },
    clients: { claim: async () => { claimCount++; }, matchAll: async () => windows },
  };
  vm.runInNewContext(workerSource.replace('__BUILD_ID__', build), {
    self, caches, URL, Request, Response, Date, location: { origin: 'https://game.test' }, fetch,
  });
  async function dispatch(name: string, detail: Record<string, unknown> = {}) {
    const tasks: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    handlers.get(name)!({ ...detail, waitUntil: (task: Promise<unknown>) => tasks.push(task), respondWith: (task: Promise<Response>) => { response = task; } });
    const result = response ? await response : undefined;
    await Promise.all(tasks);
    return result;
  }
  return { stores, caches, windows, networkFiles, dispatch, offline: () => { online = false; }, skipCount: () => skipCount, claimCount: () => claimCount };
}

it('stages a complete build without replacing an open hunt, then cold-launches offline below a subpath', async () => {
  const f = fixture();
  await f.dispatch('install');
  expect(f.skipCount()).toBe(0);
  const messages: unknown[] = [];
  await f.dispatch('message', { data: { type: 'offline-status' }, source: { postMessage: (message: unknown) => messages.push(message) } });
  expect(messages).toEqual([{ type: 'offline-ready', build: 'new' }]);
  await f.dispatch('activate');
  f.offline();
  // Navigation queries select the hunt, not another cached shell.
  const html = await f.dispatch('fetch', { request: { method: 'GET', mode: 'navigate', url: `${scope}index3d.html?area=chukar-ridge&installed=1` } });
  expect(await html?.text()).toContain('boot-new.js');
  const js = await f.dispatch('fetch', { request: new Request(`${scope}assets/boot-new.js`) });
  expect(await js?.text()).toBe('new game');
});

it('rejects interrupted or mixed-deployment installs and leaves the old shell usable', async () => {
  const f = fixture();
  const old = await f.caches.open(`${prefix}old`);
  await old.put(`${scope}assets/boot-old.js`, new Response('old game'));
  f.networkFiles.delete(`${scope}assets/boot-new.js`);
  await expect(f.dispatch('install')).rejects.toThrow('Incomplete precache');
  expect(f.stores.has(`${prefix}new`)).toBe(false);
  expect(await (await old.match(`${scope}assets/boot-old.js`))?.text()).toBe('old game');
  f.networkFiles.set(`${scope}precache.json`, JSON.stringify({ build: 'wrong', files: ['index3d.html'] }));
  await expect(f.dispatch('install')).rejects.toThrow('different build');
  expect(f.skipCount()).toBe(0);
});

it('refuses explicit activation while any other scoped window is open, including an old 2D tab', async () => {
  const f = fixture();
  await f.dispatch('install');
  const messages: unknown[] = [];
  const source = { id: 'first', postMessage: (message: unknown) => messages.push(message) };
  f.windows.push({ id: 'legacy', url: `${scope}index.html` });
  await f.dispatch('message', { data: { type: 'apply-offline-update' }, source });
  expect(f.skipCount()).toBe(0);
  expect(messages).toEqual([{ type: 'offline-update-blocked', reason: 'other-tabs' }]);
  f.windows.pop();
  f.windows.push({ id: 'unrelated', url: 'https://game.test/another-app/' });
  await f.dispatch('message', { data: { type: 'apply-offline-update' }, source });
  expect(f.skipCount()).toBe(1);
});

it('keeps the last activated lazy chunks, discards abandoned staging/older shells, and preserves visited 2D art', async () => {
  const f = fixture();
  const old = await f.caches.open(`${prefix}old`);
  await old.put(activeUrl, new Response('20'));
  await old.put(`${scope}assets/boot-old.js`, new Response('old lazy chunk'));
  await old.put(`${scope}art/title.png`, new Response('saved illustration'));
  const older = await f.caches.open(`${prefix}older`);
  await older.put(activeUrl, new Response('10'));
  await f.caches.open(`${prefix}abandoned`);
  await f.caches.open('unrelated-app');
  await f.caches.open('uplandin-v4-%2Fother%2F-keep');
  await f.dispatch('install');
  await f.dispatch('activate');
  expect(f.stores.has(`${prefix}old`)).toBe(true);
  expect(f.stores.has(`${prefix}older`)).toBe(false);
  expect(f.stores.has(`${prefix}abandoned`)).toBe(false);
  expect(f.stores.has('unrelated-app')).toBe(true);
  expect(f.stores.has('uplandin-v4-%2Fother%2F-keep')).toBe(true);
  f.offline();
  expect(await (await f.dispatch('fetch', { request: new Request(`${scope}art/title.png`) }))?.text()).toBe('saved illustration');
  expect(await (await f.dispatch('fetch', { request: new Request(`${scope}assets/boot-old.js`) }))?.text()).toBe('old lazy chunk');
  expect([...f.stores.keys()].filter(key => key.startsWith(prefix))).toHaveLength(2);
});

it('migrates visited 2D artwork from the existing worker without claiming uncached art is saved', async () => {
  const f = fixture();
  const legacy = await f.caches.open('uplandin-v3-old');
  await legacy.put(`${scope}art/title.png`, new Response('legacy art'));
  await f.dispatch('install');
  await f.dispatch('activate');
  f.offline();
  expect(await (await f.dispatch('fetch', { request: new Request(`${scope}art/title.png`) }))?.text()).toBe('legacy art');
  await expect(f.dispatch('fetch', { request: new Request(`${scope}art/unvisited.png`) })).rejects.toThrow('network offline');
});

it('does not report readiness or activate an incomplete cache', async () => {
  const f = fixture();
  const messages: unknown[] = [];
  const source = { id: 'first', postMessage: (message: unknown) => messages.push(message) };
  await f.dispatch('message', { data: { type: 'offline-status' }, source });
  await f.dispatch('message', { data: { type: 'apply-offline-update' }, source });
  expect(messages).toEqual([{ type: 'offline-unavailable', build: 'new' }, { type: 'offline-update-blocked', reason: 'incomplete' }]);
  expect(f.skipCount()).toBe(0);
  expect(await (await f.caches.open(`${prefix}new`)).match(readyUrl)).toBeUndefined();
});

it('retires the legacy shell after one scoped predecessor exists and leaves other deployment scopes alone', async () => {
  const f = fixture();
  const legacy = await f.caches.open('uplandin-v3-old');
  await legacy.put(`${scope}assets/boot-legacy.js`, new Response('legacy chunk'));
  await legacy.put(`${scope}art/title.png`, new Response('legacy art'));
  const foreign = await f.caches.open('uplandin-v3-other');
  await foreign.put('https://game.test/other/assets/boot.js', new Response('other app'));
  const old = await f.caches.open(`${prefix}old`);
  await old.put(activeUrl, new Response('10'));
  await f.dispatch('install');
  await f.dispatch('activate');
  expect(f.stores.has('uplandin-v3-old')).toBe(false);
  expect(f.stores.has('uplandin-v3-other')).toBe(true);
  f.offline();
  expect(await (await f.dispatch('fetch', { request: new Request(`${scope}art/title.png`) }))?.text()).toBe('legacy art');
});
