import type { ShotTriggerSource } from './shotAssistance';

/** Track and release with the firing thumb; cancellation never fires a shot. */
export function bindTouchShotControl(button: HTMLButtonElement, options: {
  signal: AbortSignal;
  enabled: () => boolean;
  look: (dx: number, dy: number) => void;
  fire: (source: ShotTriggerSource) => void;
  begin: () => void;
  cancel: () => void;
  cancelTarget: HTMLElement;
  events: EventTarget;
  viewport: () => { width: number; height: number };
}): void {
  let pointer: { id: number; x: number; y: number; source: ShotTriggerSource; edgeX: number; edgeY: number } | null = null;
  let edgeFrame = 0, edgeTime = 0;
  let suppressPointerClick = false;
  const overCancel = (event: PointerEvent) => {
    const box = options.cancelTarget.getBoundingClientRect();
    return event.clientX >= box.left && event.clientX <= box.right
      && event.clientY >= box.top && event.clientY <= box.bottom;
  };
  const stopEdge = () => {
    if (edgeFrame) cancelAnimationFrame(edgeFrame);
    edgeFrame = 0;
    if (pointer) { pointer.edgeX = 0; pointer.edgeY = 0; }
    button.removeAttribute('data-edge-swing');
  };
  const continueEdge = (now: number) => {
    edgeFrame = 0;
    if (!pointer || !options.enabled()) { cancel(); return; }
    // Virtual drag keeps the existing optical/sensitivity response. Cap a
    // delayed frame so a returning tab cannot suddenly whip the gun around.
    const distance = 720 * Math.min(.05, Math.max(0, now - edgeTime) / 1000);
    edgeTime = now;
    options.look(pointer.edgeX * distance, pointer.edgeY * distance);
    edgeFrame = requestAnimationFrame(continueEdge);
  };
  const edgeAxis = (position: number, extent: number, delta: number, previous: number) => {
    const band = Math.min(36, extent * .1);
    const amount = position < band ? -(band - position) / band
      : position > extent - band ? (position - extent + band) / band : 0;
    // Arm only by deliberately dragging toward the edge. An inward move
    // stops immediately, even before the finger leaves the edge band.
    if (!amount || amount * delta < 0 || (!previous && amount * delta <= 0)) return 0;
    const strength = Math.min(1, Math.abs(amount));
    return Math.sign(amount) * strength * strength * (3 - 2 * strength);
  };
  const updateEdge = (dx: number, dy: number) => {
    if (!pointer || pointer.source !== 'touch') return;
    const viewport = options.viewport();
    pointer.edgeX = edgeAxis(pointer.x, viewport.width, dx, pointer.edgeX);
    pointer.edgeY = edgeAxis(pointer.y, viewport.height, dy, pointer.edgeY);
    if (!pointer.edgeX && !pointer.edgeY) { stopEdge(); return; }
    button.setAttribute('data-edge-swing', 'true');
    if (!edgeFrame) { edgeTime = performance.now(); edgeFrame = requestAnimationFrame(continueEdge); }
  };
  const clear = () => {
    stopEdge();
    const id = pointer?.id; pointer=null; button.removeAttribute('data-tracking');
    button.removeAttribute('data-canceling'); options.cancelTarget.removeAttribute('data-canceling');
    if (id !== undefined && button.hasPointerCapture(id)) button.releasePointerCapture(id);
  };
  const cancel = () => { clear(); options.cancel(); };
  button.addEventListener('pointerdown', event => {
    if(event.button > 0 || !options.enabled() || pointer)return;
    event.preventDefault();suppressPointerClick=true;
    const source = event.pointerType === 'touch' ? 'touch' : event.pointerType === 'mouse' ? 'mouse' : 'other';
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY,source,edgeX:0,edgeY:0};
    button.setPointerCapture(event.pointerId);button.setAttribute('data-tracking','true');
    options.begin();
  },{signal:options.signal});
  button.addEventListener('pointermove',event=>{
    if(pointer?.id!==event.pointerId || !options.enabled())return;
    event.preventDefault();
    const canceling = overCancel(event);
    button.setAttribute('data-canceling', String(canceling));
    options.cancelTarget.setAttribute('data-canceling', String(canceling));
    const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
    if (!canceling) options.look(dx,dy);
    pointer.x=event.clientX;pointer.y=event.clientY;
    if (canceling) stopEdge(); else updateEdge(dx,dy);
  },{signal:options.signal});
  button.addEventListener('pointerup',event=>{
    if(pointer?.id!==event.pointerId)return;
    event.preventDefault();
    if (!options.enabled() || overCancel(event)) cancel();
    else {
      // A fast lift can carry movement after the last pointermove. Apply
      // that sample synchronously so the release fires along the final swing.
      const source = pointer.source;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      if (dx !== 0 || dy !== 0) options.look(dx, dy);
      clear(); options.fire(source);
    }
  },{signal:options.signal});
  for(const name of ['pointercancel','lostpointercapture'])button.addEventListener(name,event=>{
    if(pointer?.id===(event as PointerEvent).pointerId)cancel();
  },{signal:options.signal});
  // Pointer releases can synthesize click; keyboard activation remains available.
  button.addEventListener('click',event=>{
    if(suppressPointerClick && event.detail>0)return;
    if(options.enabled() && !pointer) { options.begin(); options.fire('keyboard'); }
  },{signal:options.signal});
  for (const name of ['pause','input-reset','touch-shot-cancel']) options.events.addEventListener(name,cancel,{signal:options.signal});
  options.signal.addEventListener('abort',cancel,{once:true});
}
