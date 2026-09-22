import { prepareHuntUrl, randomHuntSeed } from '../game/huntSeed';

export type OfflineUpdateState = 'none' | 'ready' | 'applying' | 'other-tabs' | 'unsafe' | 'failed';
interface OfflineOptions {
  /** True only before entry or after results, never merely while paused. */
  canReload?: () => boolean;
  onUpdateState?: (state: OfflineUpdateState) => void;
}
interface PreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const CHOICES_KEY = 'uplandin.3d.installed-choices.v1';
const CHOICES = ['area', 'drop', 'breed', 'coat', 'dog', 'gun', 'tod', 'quality', 'controls', 'challenge'] as const;
let options: OfflineOptions = {};
let registration: ServiceWorkerRegistration | undefined;
let applying = false;
let enabled = false;

function defaultStorage(): PreferenceStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

function rememberChoices(url: URL, storage: PreferenceStorage | undefined): void {
  if (url.searchParams.has('play') || url.searchParams.has('capture') || url.searchParams.has('practice')) return;
  const choices = new URLSearchParams();
  for (const key of CHOICES) {
    const value = url.searchParams.get(key);
    if (value && value.length <= 80) choices.set(key, value);
  }
  try { storage?.setItem(CHOICES_KEY, choices.toString()); } catch { /* Preferences are optional. */ }
}

/** Only the installed icon restores choices. Ordinary links keep their exact setup. */
export function prepareInstalledHuntUrl(
  href: string,
  storage: PreferenceStorage | undefined = defaultStorage(),
  freshSeed: () => number = randomHuntSeed,
): URL {
  let url = new URL(href);
  if (url.searchParams.get('installed') === '1') {
    let saved = new URLSearchParams();
    try { saved = new URLSearchParams(storage?.getItem(CHOICES_KEY) ?? ''); } catch { /* Optional. */ }
    // An explicit property should not inherit a different property's drop.
    const explicitArea = url.searchParams.has('area');
    for (const key of CHOICES) {
      if (key === 'drop' && explicitArea) continue;
      const value = saved.get(key);
      if (!url.searchParams.has(key) && value && value.length <= 80) url.searchParams.set(key, value);
    }
    if (!url.searchParams.has('dog')) url.searchParams.set('dog', 'generated');
    url.searchParams.delete('installed');
    url.searchParams.delete('seed');
    url = prepareHuntUrl(url.href, freshSeed);
  }
  rememberChoices(url, storage);
  return url;
}

function waitingUpdate(reg = registration): ServiceWorker | null {
  const waiting = reg?.waiting;
  // First installation also briefly enters waiting before automatic
  // activation. Only a replacement for an existing worker is an update.
  // Use registration.active: an uncontrolled page can still find a real
  // upgrade, so navigator.serviceWorker.controller is not sufficient.
  return waiting && reg?.active && reg.active !== waiting ? waiting : null;
}

/** UI must offer this only at a completed-hunt or pre-entry transition. */
export function requestOfflineUpdate(): void {
  if (applying) return;
  if (!options.canReload?.()) { options.onUpdateState?.('unsafe'); return; }
  const waiting = waitingUpdate();
  if (!waiting) { options.onUpdateState?.('none'); return; }
  applying = true;
  options.onUpdateState?.('applying');
  waiting.postMessage({ type: 'apply-offline-update' });
}

/** Readiness is announced only by a worker with a completed build cache. */
export function enableOfflineHunts(nextOptions: OfflineOptions = {}): void {
  options = nextOptions;
  if (enabled) return;
  enabled = true;
  const status = document.getElementById('offline-status');
  const writeStatus = (text: string) => { if (status) status.textContent = text; };
  const remember = () => rememberChoices(new URL(location.href), defaultStorage());
  window.addEventListener('pagehide', remember);
  document.addEventListener('visibilitychange', () => { if (document.hidden) remember(); });
  if (!import.meta.env.PROD) { writeStatus('Offline installation is available in the production build.'); return; }
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    writeStatus('Offline installation needs HTTPS or localhost. This connection supports online play.');
    return;
  }
  writeStatus('Preparing the game for offline play…');
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'offline-ready') {
      writeStatus(String(event.data.build).startsWith('uplandin-v3-')
        ? 'An older offline copy is saved. Close game windows after your hunt to finish updating.'
        : '3D game saved for offline play. 2D artwork is saved as you visit it.');
    } else if (event.data?.type === 'offline-unavailable') {
      writeStatus('Offline storage is incomplete. Reconnect and reopen the game to try again.');
    } else if (event.data?.type === 'offline-update-blocked') {
      applying = false;
      options.onUpdateState?.(event.data.reason === 'other-tabs' ? 'other-tabs' : 'failed');
    }
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    navigator.serviceWorker.controller?.postMessage({ type: 'offline-status' });
    // Initial installation or activation in another tab never reloads a hunt.
    if (!applying) return;
    applying = false;
    if (!options.canReload?.()) { options.onUpdateState?.('unsafe'); return; }
    remember();
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
    registration = reg;
    const announceWaiting = () => {
      const waiting = waitingUpdate(reg);
      if (!waiting) return;
      options.onUpdateState?.('ready');
      waiting.postMessage({ type: 'offline-status' });
    };
    const observeInstall = () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed') announceWaiting();
        if (installing.state === 'redundant' && !reg.active) writeStatus('Offline saving did not finish. Reconnect and reopen the game to try again.');
      });
    };
    announceWaiting();
    observeInstall();
    reg.addEventListener('updatefound', observeInstall);
    reg.active?.postMessage({ type: 'offline-status' });
    return navigator.serviceWorker.ready;
  }).then(reg => reg.active?.postMessage({ type: 'offline-status' })).catch(() => {
    writeStatus('Offline storage is unavailable in this browser.');
  });
}
