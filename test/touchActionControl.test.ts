import { expect, it, vi } from 'vitest';
import { bindTouchActionControl } from '../src/three/touchActionControl';
function fixture() {
  const button=new EventTarget() as HTMLButtonElement;
  button.setPointerCapture=vi.fn();button.hasPointerCapture=()=>true;button.releasePointerCapture=vi.fn();
  button.getBoundingClientRect=()=>({left:0,right:100,top:0,bottom:100} as DOMRect);
  const events=new EventTarget(),activate=vi.fn(),abort=new AbortController();let enabled=true;
  bindTouchActionControl(button,{signal:abort.signal,enabled:()=>enabled,events,activate});
  const send=(type:string,data:Record<string,unknown>={})=>button.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),
    {pointerId:2,pointerType:'touch',isPrimary:false,clientX:50,clientY:50,...data}));
  return {button,events,activate,abort,send,disable:()=>enabled=false};
}
it('activates secondary touch on release exactly once and captures that finger',()=>{
  const f=fixture();f.send('pointerdown');expect(f.button.setPointerCapture).toHaveBeenCalledWith(2);
  f.send('pointerup',{pointerId:1});expect(f.activate).not.toHaveBeenCalled();
  f.send('pointerup');f.send('click',{detail:1});expect(f.activate).toHaveBeenCalledOnce();
  expect(f.button.releasePointerCapture).toHaveBeenCalledWith(2);
});
it.each(['pointercancel','lostpointercapture','pause','input-reset','abort','outside','disabled'])('cancels touch activation on %s',reason=>{
  const f=fixture();f.send('pointerdown');
  if(reason==='pause'||reason==='input-reset')f.events.dispatchEvent(new Event(reason));
  else if(reason==='abort')f.abort.abort();
  else if(reason==='disabled')f.disable();
  else if(reason!=='outside')f.send(reason);
  f.send('pointerup',{clientX:reason==='outside'?101:50});f.send('click',{detail:1});
  expect(f.activate).not.toHaveBeenCalled();
});
it('retains keyboard and mouse clicks after a canceled touch',()=>{
  const f=fixture();f.send('pointerdown');f.send('pointercancel');
  f.send('click',{detail:0});expect(f.activate).toHaveBeenCalledTimes(1);
  f.send('pointerdown',{pointerType:'mouse'});f.send('pointerup',{pointerType:'mouse'});
  expect(f.activate).toHaveBeenCalledTimes(1);f.send('click',{detail:1});expect(f.activate).toHaveBeenCalledTimes(2);
});
