import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { getArea, getDropPoint } from '../src/game/areas';
import { GeneratedDogSystem } from '../src/three/subsystems/generatedDog';
import type { Ctx } from '../src/three/engine';
afterEach(() => vi.unstubAllGlobals());

it('lowers the generated muzzle at pickup, carries smoothly and offers the bird without moving planted paws', () => {
  vi.stubGlobal('window', {});
  let holdMs = 0, x = 0;
  const dog = { state: 'heel', gait: 'still', scentStage: 'none', carryingBirdId: null as number | null,
    retrieveHoldTimeMs: () => holdMs };
  const hunt = { areaConfig: () => getArea('quail-fields'), dropPoint: () => getDropPoint(getArea('quail-fields')),
    huntState: () => ({ birds: [{ id: 99, speciesId: 'ringneck' }, { id: 8, speciesId: 'bobwhite' }] }),
    dog: () => dog, dogRenderWorld: (_alpha:number,out:{x:number;z:number}) => Object.assign(out,{x,z:0}),
    dogRenderHeading: () => 0, dogRenderTravelHeading: () => 0 };
  const ctx = { scene: new THREE.Scene(), quality: 'lite', fixedAlpha: 1,
    get: (id:string) => id === 'hunt3d' ? hunt : { heightAt: () => 0 } } as unknown as Ctx;
  const system = new GeneratedDogSystem(); system.init(ctx); system.update(ctx,1/60);
  const mouth = new THREE.Vector3(); system.mouthWorld(mouth); const standing = mouth.y;
  const audit = () => (window as unknown as {__generatedDogAudit:()=>{jawAngle:number;feet:{actual:number[]}[]}}).__generatedDogAudit();
  const feet = audit().feet.map(foot=>foot.actual);
  dog.state='retrieving';
  let previous=mouth.y;
  for(let frame=0;frame<42;frame++) {
    holdMs=(frame+1)*1000/60;system.update(ctx,1/60);system.mouthWorld(mouth);
    expect(mouth.y).toBeLessThanOrEqual(previous+.001);previous=mouth.y;
  }
  expect(mouth.y).toBeLessThan(standing-.35);
  expect(mouth.y).toBeGreaterThan(.035);
  expect(mouth.y).toBeLessThan(.20);
  audit().feet.forEach((foot,i)=>expect(new THREE.Vector3(...foot.actual).distanceTo(new THREE.Vector3(...feet[i]))).toBeLessThan(.002));
  dog.carryingBirdId=8; dog.gait='trot'; holdMs=0;
  let maxJump=0;
  for(let frame=0;frame<36;frame++) {
    previous=mouth.y;x+=.02;system.update(ctx,1/60);system.mouthWorld(mouth);maxJump=Math.max(maxJump,Math.abs(mouth.y-previous));
  }
  expect(maxJump).toBeLessThan(.08);expect(mouth.y).toBeGreaterThan(.45);
  // The carried ID selects the compact quail grasp, not an unrelated
  // pheasant earlier in the hunt's bird list.
  expect(audit().jawAngle).toBeGreaterThan(.38);expect(audit().jawAngle).toBeLessThan(.42);
  const carryHeight=mouth.y;dog.gait='still';
  for(let frame=0;frame<21;frame++){holdMs+=1000/60;system.update(ctx,1/60);}
  system.mouthWorld(mouth);expect(mouth.y).toBeGreaterThan(carryHeight);
  system.dispose();
});

it('keeps swimming and a settled point above retrieval pose inputs', async () => {
  const { GeneratedFieldMotion } = await import('../src/three/dogs/generatedFieldMotion');
  let depth=0;
  const control=new GeneratedFieldMotion('lite',()=>0,()=>depth);
  const retrieve=new GeneratedFieldMotion('lite',()=>0,()=>depth);
  for(let frame=0;frame<42;frame++)retrieve.update(0,0,0,1/60,false,false,{stage:'pickup',holdMs:frame*1000/60});
  depth=.8;
  for(let frame=0;frame<30;frame++) {
    control.update(0,0,0,1/60,false,false);
    retrieve.update(0,0,0,1/60,false,false,{stage:'pickup',holdMs:700});
  }
  expect(retrieve.swimming).toBe(true);
  expect(retrieve.asset.joints.head.quaternion.angleTo(control.asset.joints.head.quaternion)).toBeLessThan(.00001);
  depth=0;
  for(let frame=0;frame<60;frame++) {
    control.update(0,0,0,1/60,false,true);
    retrieve.update(0,0,0,1/60,false,true,{stage:'pickup',holdMs:700});
  }
  expect(retrieve.asset.joints.head.quaternion.angleTo(control.asset.joints.head.quaternion)).toBeLessThan(.00001);
  retrieve.contactSnapshot().forEach((foot,i)=>expect(new THREE.Vector3(...foot.actual)
    .distanceTo(new THREE.Vector3(...control.contactSnapshot()[i].actual))).toBeLessThan(.002));
  control.dispose();retrieve.dispose();
});
