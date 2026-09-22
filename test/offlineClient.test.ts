import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

async function fixture(canReload = false, phase: 'update' | 'fresh-install' | 'fresh-waiting' = 'update', controlled = true) {
  vi.stubEnv('PROD', true);
  const states: string[] = [];
  const status = { textContent: '' };
  const windowEvents = new EventTarget();
  const documentEvents = new EventTarget();
  const waiting = Object.assign(new EventTarget(), { state: phase === 'fresh-install' ? 'installing' : 'installed', postMessage: vi.fn() });
  const active = { postMessage: vi.fn() };
  const reg = Object.assign(new EventTarget(), {
    waiting: phase === 'fresh-install' ? null : waiting,
    active: phase === 'update' ? active : null,
    installing: phase === 'fresh-install' ? waiting : null,
  });
  const serviceWorker = Object.assign(new EventTarget(), { controller: controlled ? reg.active : null, ready: Promise.resolve(reg), register: vi.fn(async () => reg) });
  const reload = vi.fn();
  vi.stubGlobal('window', Object.assign(windowEvents, { isSecureContext: true }));
  vi.stubGlobal('document', Object.assign(documentEvents, { hidden: false, getElementById: () => status }));
  vi.stubGlobal('navigator', { serviceWorker });
  vi.stubGlobal('location', { href: 'https://game.test/play/index3d.html?area=chukar-ridge&seed=1', reload });
  const module = await import('../src/three/offline');
  let safe = canReload;
  module.enableOfflineHunts({ canReload: () => safe, onUpdateState: state => states.push(state) });
  await Promise.resolve();
  await Promise.resolve();
  return { module, states, waiting, active, reg, serviceWorker, reload, status, setSafe: (value: boolean) => { safe = value; } };
}

it.each(['fresh-install', 'fresh-waiting'] as const)('does not advertise or apply a new version during a %s lifecycle', async phase => {
  const f = await fixture(true, phase);
  if (phase === 'fresh-install') {
    // The first worker briefly occupies waiting between install and activate.
    f.reg.waiting = f.waiting; f.reg.installing = null; f.waiting.state = 'installed';
    f.waiting.dispatchEvent(new Event('statechange'));
  }
  expect(f.states).not.toContain('ready');
  f.module.requestOfflineUpdate();
  expect(f.states.at(-1)).toBe('none');
  expect(f.waiting.postMessage).not.toHaveBeenCalledWith({ type: 'apply-offline-update' });
  f.reg.active = f.waiting; f.reg.waiting = null; f.serviceWorker.controller = f.waiting;
  f.waiting.state = 'activated'; f.serviceWorker.dispatchEvent(new Event('controllerchange'));
  f.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'offline-ready', build: 'first' } }));
  expect(f.status.textContent).toContain('saved for offline play');
  expect(f.states).not.toContain('ready'); expect(f.reload).not.toHaveBeenCalled();
});

it('still advertises an actual upgrade when this page has not acquired the older active controller', async () => {
  const f = await fixture(true, 'update', false);
  expect(f.serviceWorker.controller).toBeNull();
  expect(f.states).toContain('ready');
  f.module.requestOfflineUpdate();
  expect(f.waiting.postMessage).toHaveBeenCalledWith({ type: 'apply-offline-update' });
});

it('recognizes a later upgrade in the same page after its first installation', async () => {
  const f = await fixture(true, 'fresh-waiting');
  f.reg.active = f.waiting; f.reg.waiting = null; f.serviceWorker.controller = f.waiting;
  f.waiting.state = 'activated'; f.serviceWorker.dispatchEvent(new Event('controllerchange'));
  const replacement = Object.assign(new EventTarget(), { state: 'installing', postMessage: vi.fn() });
  f.reg.installing = replacement; f.reg.dispatchEvent(new Event('updatefound'));
  f.reg.waiting = replacement; f.reg.installing = null; replacement.state = 'installed';
  replacement.dispatchEvent(new Event('statechange'));
  expect(f.states).toEqual(['ready']);
  f.module.requestOfflineUpdate();
  expect(replacement.postMessage).toHaveBeenCalledWith({ type: 'apply-offline-update' });
  expect(f.reload).not.toHaveBeenCalled();
});

it('advertises a waiting update without reloading or activating it during a hunt', async () => {
  const f = await fixture();
  expect(f.states).toContain('ready');
  expect(f.waiting.postMessage).toHaveBeenCalledWith({ type: 'offline-status' });
  f.module.requestOfflineUpdate();
  expect(f.states.at(-1)).toBe('unsafe');
  expect(f.waiting.postMessage).not.toHaveBeenCalledWith({ type: 'apply-offline-update' });
  f.serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(f.reload).not.toHaveBeenCalled();
});

it('reloads once only for an explicit safe update and keeps another-window blocking recoverable', async () => {
  const f = await fixture(true);
  f.module.requestOfflineUpdate();
  expect(f.waiting.postMessage).toHaveBeenCalledWith({ type: 'apply-offline-update' });
  f.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'offline-update-blocked', reason: 'other-tabs' } }));
  expect(f.states.at(-1)).toBe('other-tabs');
  expect(f.reload).not.toHaveBeenCalled();
  f.module.requestOfflineUpdate();
  f.serviceWorker.dispatchEvent(new Event('controllerchange'));
  f.serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(f.reload).toHaveBeenCalledTimes(1);
});

it('rechecks safety if field entry races an update activation', async () => {
  const f = await fixture(true);
  f.module.requestOfflineUpdate();
  f.setSafe(false);
  f.serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(f.reload).not.toHaveBeenCalled();
  expect(f.states.at(-1)).toBe('unsafe');
});

it('reports actual cache readiness without claiming only Quail or all 2D art is saved', async () => {
  const f = await fixture();
  f.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'offline-ready', build: 'fresh' } }));
  expect(f.status.textContent).toBe('3D game saved for offline play. 2D artwork is saved as you visit it.');
  f.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'offline-unavailable' } }));
  expect(f.status.textContent).toContain('incomplete');
});
