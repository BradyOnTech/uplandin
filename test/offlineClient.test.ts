import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

async function fixture(canReload = false) {
  vi.stubEnv('PROD', true);
  const states: string[] = [];
  const status = { textContent: '' };
  const windowEvents = new EventTarget();
  const documentEvents = new EventTarget();
  const waiting = { postMessage: vi.fn() };
  const active = { postMessage: vi.fn() };
  const reg = Object.assign(new EventTarget(), { waiting, active, installing: null });
  const serviceWorker = Object.assign(new EventTarget(), { controller: active, ready: Promise.resolve(reg), register: vi.fn(async () => reg) });
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
  return { module, states, waiting, serviceWorker, reload, status, setSafe: (value: boolean) => { safe = value; } };
}

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
