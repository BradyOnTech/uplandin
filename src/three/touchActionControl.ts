/** Activate discrete actions with any touch, including a second movement thumb. */
export function bindTouchActionControl(button: HTMLButtonElement, options: {
  signal: AbortSignal;
  enabled: () => boolean;
  activate: () => void;
  events: EventTarget;
}): void {
  let pointer: number | null = null;
  let suppressTouchClick = false;
  const clear = () => {
    const id = pointer;
    pointer = null;
    if (id !== null && button.hasPointerCapture(id)) button.releasePointerCapture(id);
  };
  button.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') { suppressTouchClick = false; return; }
    suppressTouchClick = true;
    if (!options.enabled() || pointer !== null) return;
    event.preventDefault();
    pointer = event.pointerId;
    button.setPointerCapture(pointer);
  }, { signal: options.signal });
  button.addEventListener('pointerup', event => {
    if (pointer !== event.pointerId) return;
    event.preventDefault();
    const rect = button.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
    clear();
    if (inside && options.enabled()) options.activate();
  }, { signal: options.signal });
  for (const name of ['pointercancel', 'lostpointercapture']) button.addEventListener(name, event => {
    if (pointer === (event as PointerEvent).pointerId) clear();
  }, { signal: options.signal });
  button.addEventListener('click', event => {
    if (suppressTouchClick && event.detail > 0) return;
    if (options.enabled()) options.activate();
  }, { signal: options.signal });
  options.events.addEventListener('pause', clear, { signal: options.signal });
  options.events.addEventListener('input-reset', clear, { signal: options.signal });
  options.signal.addEventListener('abort', clear, { once: true });
}
