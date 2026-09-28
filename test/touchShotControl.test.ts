import { afterEach, expect, it, vi } from 'vitest';
import { bindTouchShotControl } from '../src/three/touchShotControl';
function fixture() {
  const target=new EventTarget() as HTMLButtonElement;
  target.setPointerCapture=vi.fn();target.setAttribute=vi.fn();target.removeAttribute=vi.fn();
  target.hasPointerCapture=()=>true;target.releasePointerCapture=vi.fn();
  const events=new EventTarget(),fire=vi.fn(),look=vi.fn(),begin=vi.fn(),cancel=vi.fn(),abort=new AbortController();
  const cancelTarget={getBoundingClientRect:()=>({left:10,right:60,top:10,bottom:60}),removeAttribute:vi.fn(),setAttribute:vi.fn()} as unknown as HTMLElement;
  let enabled=true;
  bindTouchShotControl(target,{signal:abort.signal,enabled:()=>enabled,fire,look,events,begin,cancel,cancelTarget,
    viewport:()=>({width:844,height:390})});
  const send=(name:string,data:Record<string,unknown>={})=>target.dispatchEvent(Object.assign(new Event(name,{cancelable:true}),{pointerId:7,pointerType:'touch',clientX:100,clientY:100,...data}));
  return {send,fire,look,begin,cancel,events,abort,setEnabled:(value:boolean)=>enabled=value};
}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

function frames() {
  let time=0, id=0;const pending=new Map<number,FrameRequestCallback>();
  vi.spyOn(performance,'now').mockImplementation(()=>time);
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{pending.set(++id,callback);return id;});
  vi.stubGlobal('cancelAnimationFrame',(handle:number)=>pending.delete(handle));
  return {step:(ms=1000/60)=>{time+=ms;const callbacks=[...pending.values()];pending.clear();callbacks.forEach(callback=>callback(time));},
    pending:()=>pending.size};
}

it('keeps a crossing shot swinging when the firing thumb reaches the screen edge',()=>{
  const clock=frames(),f=fixture();
  f.send('pointerdown',{clientX:784,clientY:328});
  f.send('pointermove',{clientX:842,clientY:328});f.look.mockClear();
  for(let i=0;i<30;i++)clock.step();
  // The same held contact must turn farther without invented pointer travel.
  expect(f.look.mock.calls.reduce((sum,[dx])=>sum+dx,0)).toBeGreaterThan(250);
  expect(f.fire).not.toHaveBeenCalled();
  f.send('pointerup',{clientX:842,clientY:328});
  expect(f.fire).toHaveBeenCalledExactlyOnceWith('touch');expect(clock.pending()).toBe(0);
});

it('stops edge turning immediately on inward movement and over Lower',()=>{
  const clock=frames(),f=fixture();f.send('pointerdown',{clientX:784,clientY:328});
  f.send('pointermove',{clientX:842,clientY:328});clock.step();
  f.send('pointermove',{clientX:835,clientY:328});f.look.mockClear();clock.step();
  expect(f.look).not.toHaveBeenCalled();
  f.send('pointermove',{clientX:842,clientY:328});clock.step();
  f.send('pointermove',{clientX:20,clientY:20});f.look.mockClear();clock.step();
  expect(f.look).not.toHaveBeenCalled();f.send('pointerup',{clientX:20,clientY:20});
  expect(f.fire).not.toHaveBeenCalled();expect(clock.pending()).toBe(0);
});

it.each(['pointercancel','lostpointercapture','pause','input-reset','touch-shot-cancel','abort','disabled'])('clears continuous edge turning on %s',reason=>{
  const clock=frames(),f=fixture();f.send('pointerdown',{clientX:784,clientY:328});
  f.send('pointermove',{clientX:842,clientY:328});clock.step();f.look.mockClear();
  if(reason==='disabled')f.setEnabled(false);
  else if(reason==='abort')f.abort.abort();
  else if(['pause','input-reset','touch-shot-cancel'].includes(reason))f.events.dispatchEvent(new Event(reason));
  else f.send(reason);
  clock.step();expect(f.look).not.toHaveBeenCalled();expect(f.fire).not.toHaveBeenCalled();expect(clock.pending()).toBe(0);
});

it('requires an outward touch drag; tapping at the edge and mouse preview never auto-turn',()=>{
  const clock=frames(),f=fixture();f.send('pointerdown',{clientX:842,clientY:328});clock.step();
  expect(f.look).not.toHaveBeenCalled();f.send('pointercancel');
  f.send('pointerdown',{pointerType:'mouse',clientX:784,clientY:328});
  f.send('pointermove',{pointerType:'mouse',clientX:842,clientY:328});f.look.mockClear();clock.step();
  expect(f.look).not.toHaveBeenCalled();expect(clock.pending()).toBe(0);
});

it('continues a downward swing at the bottom edge at the same rate on 30 and 60 Hz displays',()=>{
  const run=(hz:number)=>{const clock=frames(),f=fixture();
    f.send('pointerdown',{clientX:740,clientY:328});f.send('pointermove',{clientX:740,clientY:388});f.look.mockClear();
    for(let i=0;i<hz;i++)clock.step(1000/hz);
    const dy=f.look.mock.calls.reduce((sum,[,y])=>sum+y,0);f.abort.abort();vi.restoreAllMocks();return dy;};
  const a=run(30),b=run(60);expect(a).toBeGreaterThan(500);expect(a).toBeCloseTo(b,8);
});
it.each([[100,200,2,200,-1,0],[740,100,740,2,0,-1]])('supports an intentional swing toward the left or top edge', (x,y,endX,endY,sx,sy)=>{
  const clock=frames(),f=fixture();f.send('pointerdown',{clientX:x,clientY:y});
  f.send('pointermove',{clientX:endX,clientY:endY});f.look.mockClear();clock.step();
  const [dx,dy]=f.look.mock.calls[0];expect(Math.sign(dx)).toBe(sx);expect(Math.sign(dy)).toBe(sy);f.abort.abort();
});
it('bounds a delayed frame and lets the active thumb alone control the edge gesture',()=>{
  const clock=frames(),f=fixture();f.send('pointerdown',{clientX:784,clientY:328});
  f.send('pointermove',{clientX:842,clientY:328});f.look.mockClear();
  f.send('pointermove',{pointerId:8,clientX:400,clientY:200});clock.step(2000);
  expect(f.look.mock.calls[0][0]).toBeGreaterThan(0);expect(f.look.mock.calls[0][0]).toBeLessThanOrEqual(36);
  f.send('pointerup',{pointerId:8});expect(f.fire).not.toHaveBeenCalled();
  f.abort.abort();expect(clock.pending()).toBe(0);
});
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
