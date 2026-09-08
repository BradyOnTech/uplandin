/** Pointer capture is unavailable in some embedded browsers. Keep a real
 * mouse-input path there instead of silently disabling the player's view. */
export function bindMouseLook(canvas: HTMLCanvasElement, options: {
  signal: AbortSignal;
  paused: () => boolean;
  turn: (dx: number, dy: number) => void;
  fallbackChanged: (active: boolean) => void;
}) {
  const { signal } = options;
  let fallback = false, dragging = false, x = 0, y = 0;
  const unavailable = () => {
    if (signal.aborted) return;
    fallback = true; options.fallbackChanged(true);
  };
  document.addEventListener('pointerlockerror', unavailable, { signal });
  document.addEventListener('pointerlockchange', () => {
    dragging = false;
    if (document.pointerLockElement === canvas) {
      fallback = false; options.fallbackChanged(false);
    }
  }, { signal });
  canvas.addEventListener('click', event => {
    if (options.paused() || event.pointerType === 'touch' || fallback || document.pointerLockElement === canvas) return;
    try {
      if (!canvas.requestPointerLock) unavailable();
      else canvas.requestPointerLock()?.catch(unavailable);
    } catch { unavailable(); }
  }, { signal });
  canvas.addEventListener('mousedown', event => {
    if (options.paused() || !fallback || (event.button !== 0 && event.button !== 2)) return;
    dragging = true; x = event.clientX; y = event.clientY;
  }, { signal });
  window.addEventListener('mousemove', event => {
    if (options.paused()) { dragging = false; return; }
    if (document.pointerLockElement === canvas) options.turn(event.movementX, event.movementY);
    else if (fallback && dragging) {
      if (!(event.buttons & 3)) { dragging = false; return; }
      options.turn(event.clientX - x, event.clientY - y);
      x = event.clientX; y = event.clientY;
    }
  }, { signal });
  const release = () => { dragging = false; };
  window.addEventListener('mouseup', event => {
    // Firing releases the left button while the right is still held. Keep
    // the mounted drag alive so the player can track a second bird.
    if (!(event.buttons & 3)) release();
  }, { signal });
  window.addEventListener('blur', release, { signal });
  return { release };
}
