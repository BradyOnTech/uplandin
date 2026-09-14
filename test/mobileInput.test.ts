import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { preferredInputMode, usesTouchControls } from '../src/three/inputMode';
import { PlayerSystem } from '../src/three/subsystems/player';
import type { Ctx } from '../src/three/engine';

vi.mock('../src/audio', () => ({ unlockAudio:vi.fn(),playFootstep:vi.fn(),playCoverBrush:vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe('Phone input preferences', () => {
  it('lets an explicit choice override automatic touch hardware and saved settings', () => {
    vi.stubGlobal('localStorage', { getItem:()=>'desktop' });
    vi.stubGlobal('matchMedia', (query:string)=>({matches:query==='(any-pointer: coarse)'}));
    expect(preferredInputMode(new URLSearchParams('controls=touch'))).toBe('touch');
    expect(preferredInputMode(new URLSearchParams())).toBe('desktop');
    expect(usesTouchControls('auto')).toBe(true);
    expect(usesTouchControls('desktop')).toBe(false);
    expect(usesTouchControls('touch')).toBe(true);
  });
});

function fixture() {
  const canvas = Object.assign(new EventTarget(), {setPointerCapture:vi.fn(),hasPointerCapture:()=>true,releasePointerCapture:vi.fn()});
  const browser = Object.assign(new EventTarget(), {innerWidth:844});
  vi.stubGlobal('window', browser);
  vi.stubGlobal('document', Object.assign(new EventTarget(), {getElementById:()=>null,body:{classList:{contains:()=>false}}}));
  vi.stubGlobal('location', {search:''});
  vi.stubGlobal('HTMLElement', class {});
  const ctx = {paused:false,camera:new THREE.PerspectiveCamera(70),renderer:{domElement:canvas},events:new EventTarget(),
    get:(id:string)=>id==='terrain'?{heightAt:()=>0}:{coverPatches:()=>[]}} as unknown as Ctx;
  const player = new PlayerSystem(); player.init(ctx);
  const send = (type:string,id:number,x:number,y:number) => canvas.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),
    {pointerType:'touch',pointerId:id,isPrimary:id===1,clientX:x,clientY:y,button:0}));
  return {ctx,player,send,canvas,browser};
}

describe('Two-thumb movement', () => {
  it('walks, runs with a deliberate farther drag, turns with a second thumb, then stops on release', () => {
    const f=fixture();
    try {
      f.send('pointerdown',1,100,270);f.send('pointermove',1,102,273);
      const start=f.ctx.camera.position.clone();f.player.update(f.ctx,1);
      expect(f.ctx.camera.position.distanceTo(start)).toBe(0);
      f.send('pointermove',1,100,212);f.player.update(f.ctx,1);
      expect(f.player.isRunning()).toBe(false);
      expect(Math.hypot(f.ctx.camera.position.x-start.x,f.ctx.camera.position.z-start.z)).toBeCloseTo(2.2);
      f.send('pointermove',1,100,170);expect(f.player.isRunning()).toBe(true);
      const runStart=f.ctx.camera.position.clone();f.player.update(f.ctx,1);
      expect(Math.hypot(f.ctx.camera.position.x-runStart.x,f.ctx.camera.position.z-runStart.z)).toBeCloseTo(4.18);
      const yaw=f.ctx.camera.rotation.y;
      f.send('pointerdown',2,600,260);f.send('pointermove',2,635,250);f.player.update(f.ctx,.1);
      expect(f.ctx.camera.rotation.y).not.toBe(yaw);expect(f.player.isRunning()).toBe(true);
      // An extra finger on the left cannot take over an existing movement.
      f.send('pointerdown',3,160,200);f.send('pointerup',3,160,200);expect(f.player.isRunning()).toBe(true);
      f.send('pointerup',1,100,170);expect(f.player.isRunning()).toBe(false);
      const stopped=f.ctx.camera.position.clone();f.player.update(f.ctx,1);
      expect(f.ctx.camera.position.x).toBe(stopped.x);expect(f.ctx.camera.position.z).toBe(stopped.z);
    } finally { f.player.dispose(); }
  });

  it.each(['pause','input-reset','resize','blur','pointercancel'])('clears a held run on %s without resuming on stale input', reason => {
    const f=fixture();
    try {
      f.send('pointerdown',1,100,270);f.send('pointermove',1,100,170);expect(f.player.isRunning()).toBe(true);
      if(reason==='pointercancel')f.send(reason,1,100,170);
      else if(reason==='pause'||reason==='input-reset')f.ctx.events.dispatchEvent(new Event(reason));
      else f.browser.dispatchEvent(new Event(reason));
      f.send('pointermove',1,100,150);expect(f.player.isRunning()).toBe(false);
      const stopped=f.ctx.camera.position.clone();f.player.update(f.ctx,1);
      expect(f.ctx.camera.position.x).toBe(stopped.x);expect(f.ctx.camera.position.z).toBe(stopped.z);
    } finally { f.player.dispose(); }
  });
});

it('applies independent swing sensitivity immediately while the movement finger stays held',()=>{
  const values=new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null});
  const f=fixture();
  try {
    f.send('pointerdown',1,100,270);f.send('pointermove',1,100,170);
    const yaw=f.ctx.camera.rotation.y;
    f.ctx.events.dispatchEvent(Object.assign(new Event('hunt-touch-look'),{detail:{dx:50,dy:0}}));
    // No render/update needed before a release can use the new shot direction.
    expect(f.ctx.camera.rotation.y-yaw).toBeCloseTo(-.2);expect(f.player.isRunning()).toBe(true);
    values.set('uplandin.3d.touch.swing','1.5');f.ctx.events.dispatchEvent(new Event('touch-sensitivity-change'));
    f.ctx.events.dispatchEvent(Object.assign(new Event('hunt-touch-look'),{detail:{dx:50,dy:0}}));
    expect(f.ctx.camera.rotation.y-yaw).toBeCloseTo(-.5);
    f.send('pointerdown',2,600,260);f.send('pointermove',2,650,260);f.player.update(f.ctx,0);
    expect(f.ctx.camera.rotation.y-yaw).toBeCloseTo(-.7);
  } finally {f.player.dispose();}
});
