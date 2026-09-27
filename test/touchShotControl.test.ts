import { expect, it, vi } from 'vitest';
import { bindTouchShotControl } from '../src/three/touchShotControl';
function fixture() {
  const target=new EventTarget() as HTMLButtonElement;
  target.setPointerCapture=vi.fn();target.setAttribute=vi.fn();target.removeAttribute=vi.fn();
  target.hasPointerCapture=()=>true;target.releasePointerCapture=vi.fn();
  const events=new EventTarget(),fire=vi.fn(),look=vi.fn(),begin=vi.fn(),cancel=vi.fn(),abort=new AbortController();
  const cancelTarget={getBoundingClientRect:()=>({left:10,right:60,top:10,bottom:60}),removeAttribute:vi.fn(),setAttribute:vi.fn()} as unknown as HTMLElement;
  let enabled=true;
  bindTouchShotControl(target,{signal:abort.signal,enabled:()=>enabled,fire,look,events,begin,cancel,cancelTarget});
  const send=(name:string,data:Record<string,unknown>={})=>target.dispatchEvent(Object.assign(new Event(name,{cancelable:true}),{pointerId:7,pointerType:'touch',clientX:100,clientY:100,...data}));
  return {send,fire,look,begin,cancel,events,abort,setEnabled:(value:boolean)=>enabled=value};
}
it('tracks with the firing finger and fires once on release, not its synthetic click',()=>{
  const f=fixture();f.send('pointerdown');f.send('pointermove',{clientX:125,clientY:90});
  expect(f.look).toHaveBeenCalledWith(25,-10);expect(f.fire).not.toHaveBeenCalled();
  f.send('pointerup');f.send('click',{detail:1});expect(f.fire).toHaveBeenCalledTimes(1);
});
it('applies the final release position before firing when no last pointermove was delivered',()=>{
  const f=fixture();f.send('pointerdown');f.send('pointermove',{clientX:125,clientY:90});
  f.look.mockClear();
  f.send('pointerup',{clientX:137,clientY:84});
  expect(f.look).toHaveBeenCalledExactlyOnceWith(12,-6);
  expect(f.look.mock.invocationCallOrder[0]).toBeLessThan(f.fire.mock.invocationCallOrder[0]);
  expect(f.fire).toHaveBeenCalledExactlyOnceWith('touch');
  f.send('click',{detail:1});expect(f.fire).toHaveBeenCalledTimes(1);
});
it('does not turn on a canceled release or resend an already applied final position',()=>{
  const f=fixture();f.send('pointerdown');f.send('pointermove',{clientX:125,clientY:90});
  f.look.mockClear();f.send('pointerup',{clientX:125,clientY:90});
  expect(f.look).not.toHaveBeenCalled();expect(f.fire).toHaveBeenCalledOnce();
  f.fire.mockClear();f.send('pointerdown');f.send('pointerup',{clientX:40,clientY:40});
  expect(f.look).not.toHaveBeenCalled();expect(f.fire).not.toHaveBeenCalled();
  expect(f.cancel).toHaveBeenCalledOnce();
});
it.each(['pointercancel','lostpointercapture','pause','input-reset','touch-shot-cancel','abort'])('cancels a firing gesture on %s',reason=>{
  const f=fixture();f.send('pointerdown');
  if(reason==='pause'||reason==='input-reset'||reason==='touch-shot-cancel')f.events.dispatchEvent(new Event(reason));else if(reason==='abort')f.abort.abort();else f.send(reason);
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

it('raises on press without firing, tracks outside the original button, and cancels by releasing over Lower',()=>{
  const f=fixture();f.send('pointerdown');expect(f.begin).toHaveBeenCalledOnce();
  expect(f.fire).not.toHaveBeenCalled();
  f.send('pointermove',{clientX:350,clientY:120});expect(f.look).toHaveBeenCalledWith(250,20);
  f.send('pointermove',{clientX:40,clientY:40});
  f.send('pointerup',{clientX:40,clientY:40});f.send('click',{detail:1});
  expect(f.cancel).toHaveBeenCalledOnce();expect(f.fire).not.toHaveBeenCalled();
});
it('can leave the cancel target and continue the shot without a camera jump',()=>{
  const f=fixture();f.send('pointerdown');f.send('pointermove',{clientX:40,clientY:40});
  f.send('pointermove',{clientX:70,clientY:70});expect(f.look).toHaveBeenLastCalledWith(30,30);
  f.send('pointerup',{clientX:70,clientY:70});expect(f.fire).toHaveBeenCalledOnce();
});
it('supports consecutive press swing release shots and mouse preview without duplicate clicks',()=>{
  const f=fixture();
  for(let i=0;i<2;i++) {f.send('pointerdown',{pointerType:'mouse',button:0});f.send('pointerup',{pointerType:'mouse'});f.send('click',{detail:1});}
  expect(f.begin).toHaveBeenCalledTimes(2);expect(f.fire).toHaveBeenCalledTimes(2);
});

it.each([['touch','touch'],['mouse','mouse'],['pen','other'],['','other']])('carries the actual %s gesture source through release', (pointerType, source) => {
  const f = fixture();
  f.send('pointerdown', {pointerType});
  f.send('pointerup', {pointerType:'touch'});
  expect(f.fire).toHaveBeenCalledWith(source);
});

it('tags keyboard activation independently of the previous touch gesture', () => {
  const f = fixture();
  f.send('pointerdown'); f.send('pointerup');
  expect(f.fire).toHaveBeenLastCalledWith('touch');
  f.send('click', {detail:0});
  expect(f.fire).toHaveBeenLastCalledWith('keyboard');
  expect(f.fire).toHaveBeenCalledTimes(2);
});
