/** Offline is announced only after installation cached all build dependencies. */
export function enableOfflineHunts(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const status = document.getElementById('offline-status');
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'offline-ready' && status) status.textContent = 'Quail Fields is saved for offline replay.';
  });
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(registration => {
    registration.active?.postMessage({ type: 'offline-status' });
  }).catch(() => {
    if (status) status.textContent = 'Offline storage is unavailable in this browser.';
  });
}
