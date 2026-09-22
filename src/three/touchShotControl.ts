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
}): void {
  let pointer: { id: number; x: number; y: number; source: ShotTriggerSource } | null = null;
  let suppressPointerClick = false;
  const overCancel = (event: PointerEvent) => {
    const box = options.cancelTarget.getBoundingClientRect();
    return event.clientX >= box.left && event.clientX <= box.right
      && event.clientY >= box.top && event.clientY <= box.bottom;
  };
  const clear = () => {
    const id = pointer?.id; pointer=null; button.removeAttribute('data-tracking');
    button.removeAttribute('data-canceling'); options.cancelTarget.removeAttribute('data-canceling');
    if (id !== undefined && button.hasPointerCapture(id)) button.releasePointerCapture(id);
  };
  const cancel = () => { clear(); options.cancel(); };
  button.addEventListener('pointerdown', event => {
    if(event.button > 0 || !options.enabled() || pointer)return;
    event.preventDefault();suppressPointerClick=true;
    const source = event.pointerType === 'touch' ? 'touch' : event.pointerType === 'mouse' ? 'mouse' : 'other';
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY,source};
    button.setPointerCapture(event.pointerId);button.setAttribute('data-tracking','true');
    options.begin();
  },{signal:options.signal});
  button.addEventListener('pointermove',event=>{
    if(pointer?.id!==event.pointerId || !options.enabled())return;
    event.preventDefault();
    const canceling = overCancel(event);
    button.setAttribute('data-canceling', String(canceling));
    options.cancelTarget.setAttribute('data-canceling', String(canceling));
    if (!canceling) options.look(event.clientX-pointer.x,event.clientY-pointer.y);
    pointer.x=event.clientX;pointer.y=event.clientY;
  },{signal:options.signal});
  button.addEventListener('pointerup',event=>{
    if(pointer?.id!==event.pointerId)return;
    event.preventDefault();
    if (!options.enabled() || overCancel(event)) cancel();
    else { const source = pointer.source; clear(); options.fire(source); }
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
