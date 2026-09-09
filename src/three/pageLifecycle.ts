/** A cached document retains its hunt. Only a final departure releases it. */
export function bindFieldPageLifecycle(target: EventTarget, pause: () => void, dispose: () => void): void {
  let disposed = false;
  target.addEventListener('pagehide', event => {
    if (disposed) return;
    if ((event as PageTransitionEvent).persisted) pause();
    else { disposed = true; dispose(); }
  });
  target.addEventListener('pageshow', event => {
    // Returning must never resume an encounter before the player is ready.
    if (!disposed && (event as PageTransitionEvent).persisted) pause();
  });
}
