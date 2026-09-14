/** Track and release with the firing thumb; cancellation never fires a shot. */
export function bindTouchShotControl(button: HTMLButtonElement, options: {
  signal: AbortSignal;
  enabled: () => boolean;
  look: (dx: number, dy: number) => void;
  fire: () => void;
  events: EventTarget;
}): void {
  let pointer: { id: number; x: number; y: number } | null = null;
  let suppressTouchClick = false;
  const clear = () => {
    const id = pointer?.id; pointer=null; button.removeAttribute('data-tracking');
    if (id !== undefined && button.hasPointerCapture(id)) button.releasePointerCapture(id);
  };
  button.addEventListener('pointerdown', event => {
    if(event.pointerType!=='touch'){suppressTouchClick=false;return;}
    if(!options.enabled() || pointer)return;
    event.preventDefault();suppressTouchClick=true;
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY};
    button.setPointerCapture(event.pointerId);button.setAttribute('data-tracking','true');
  },{signal:options.signal});
  button.addEventListener('pointermove',event=>{
    if(pointer?.id!==event.pointerId || !options.enabled())return;
    event.preventDefault();options.look(event.clientX-pointer.x,event.clientY-pointer.y);
    pointer.x=event.clientX;pointer.y=event.clientY;
  },{signal:options.signal});
  button.addEventListener('pointerup',event=>{
    if(pointer?.id!==event.pointerId)return;
    event.preventDefault();clear();if(options.enabled())options.fire();
  },{signal:options.signal});
  for(const name of ['pointercancel','lostpointercapture'])button.addEventListener(name,event=>{
    if(pointer?.id===(event as PointerEvent).pointerId)clear();
  },{signal:options.signal});
  // A touch release can also synthesize click. Keyboard activation (detail=0)
  // and a subsequent mouse pointer remain available without a duplicate shot.
  button.addEventListener('click',event=>{
    if(suppressTouchClick && event.detail>0)return;
    if(options.enabled())options.fire();
  },{signal:options.signal});
  options.events.addEventListener('pause',clear,{signal:options.signal});
  options.events.addEventListener('input-reset',clear,{signal:options.signal});
  options.signal.addEventListener('abort',clear,{once:true});
}
