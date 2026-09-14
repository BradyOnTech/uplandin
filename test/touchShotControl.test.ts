import { expect, it, vi } from 'vitest';
import { bindTouchShotControl } from '../src/three/touchShotControl';
function fixture() {
  const target=new EventTarget() as HTMLButtonElement;
  target.setPointerCapture=vi.fn();target.setAttribute=vi.fn();target.removeAttribute=vi.fn();
  target.hasPointerCapture=()=>true;target.releasePointerCapture=vi.fn();
  const events=new EventTarget(),fire=vi.fn(),look=vi.fn(),abort=new AbortController();
  let enabled=true;
  bindTouchShotControl(target,{signal:abort.signal,enabled:()=>enabled,fire,look,events});
  const send=(name:string,data:Record<string,unknown>={})=>target.dispatchEvent(Object.assign(new Event(name,{cancelable:true}),{pointerId:7,pointerType:'touch',clientX:100,clientY:100,...data}));
  return {send,fire,look,events,abort,setEnabled:(value:boolean)=>enabled=value};
}
it('tracks with the firing finger and fires once on release, not its synthetic click',()=>{
  const f=fixture();f.send('pointerdown');f.send('pointermove',{clientX:125,clientY:90});
  expect(f.look).toHaveBeenCalledWith(25,-10);expect(f.fire).not.toHaveBeenCalled();
  f.send('pointerup');f.send('click',{detail:1});expect(f.fire).toHaveBeenCalledTimes(1);
});
it.each(['pointercancel','lostpointercapture','pause','input-reset','abort'])('cancels a firing gesture on %s',reason=>{
  const f=fixture();f.send('pointerdown');
  if(reason==='pause'||reason==='input-reset')f.events.dispatchEvent(new Event(reason));else if(reason==='abort')f.abort.abort();else f.send(reason);
  f.send('pointerup');f.send('click',{detail:1});expect(f.fire).not.toHaveBeenCalled();
});
it('ignores unrelated fingers and preserves keyboard activation',()=>{
  const f=fixture();f.send('pointerdown');f.send('pointermove',{pointerId:8,clientX:200});f.send('pointerup',{pointerId:8});
  expect(f.look).not.toHaveBeenCalled();expect(f.fire).not.toHaveBeenCalled();
  f.send('pointercancel');f.send('click',{detail:0});expect(f.fire).toHaveBeenCalledTimes(1);
});
it('does not fire or track while disabled and removes listeners on disposal',()=>{
  const f=fixture();f.send('pointerdown');f.setEnabled(false);f.send('pointermove',{clientX:130});f.send('pointerup');
  expect(f.look).not.toHaveBeenCalled();expect(f.fire).not.toHaveBeenCalled();
  f.setEnabled(true);f.abort.abort();f.send('pointerdown');f.send('pointerup');expect(f.fire).not.toHaveBeenCalled();
});
