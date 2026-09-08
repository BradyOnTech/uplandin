import { getArea, getDropPoint } from '../src/game/areas';
import { afterEach,expect,it,vi } from 'vitest';
import * as THREE from 'three';
import { GeneratedDogSystem } from '../src/three/subsystems/generatedDog';
import type { Ctx } from '../src/three/engine';
afterEach(()=>vi.unstubAllGlobals());
it('does not interpret the first live placement as running, and preserves speed during zero-time renders',()=>{
  const scope:{__generatedDogAudit?:()=>{speed:number;gait:string}}={};vi.stubGlobal('window',scope);
  let x=100,z=100;
  const dog={state:'heel',gait:'still',scentStage:'none',carryingBirdId:null};
  const hunt={areaConfig:()=>getArea('quail-fields'),dropPoint:()=>getDropPoint(getArea('quail-fields')),dog:()=>dog,dogRenderWorld:(_alpha:number,out:{x:number;z:number})=>Object.assign(out,{x,z}),dogRenderHeading:()=>0,dogRenderTravelHeading:()=>0};
  const ctx={scene:new THREE.Scene(),quality:'lite',fixedAlpha:1,get:(id:string)=>id==='hunt3d'?hunt:{heightAt:()=>0}} as unknown as Ctx;
  const system=new GeneratedDogSystem();system.init(ctx);
  system.update(ctx,0);x=0;z=0;system.update(ctx,1/60);
  expect(scope.__generatedDogAudit!().speed).toBe(0);expect(scope.__generatedDogAudit!().gait).toBe('walk');
  dog.state='quartering';dog.gait='run';
  for(let f=0;f<60;f++){x+=.05;system.update(ctx,1/60);}
  const speed=scope.__generatedDogAudit!().speed;expect(speed).toBeGreaterThan(2.9);expect(speed).toBeLessThan(3.01);
  system.update(ctx,0);expect(scope.__generatedDogAudit!().speed).toBe(speed);
  x+=20;system.update(ctx,1/60);expect(scope.__generatedDogAudit!().speed).toBe(0);
  system.dispose();expect(scope.__generatedDogAudit).toBeUndefined();expect(ctx.scene.children).toHaveLength(0);
});
