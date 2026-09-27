import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getSpecies } from '../src/game/species';
import type { Ctx } from '../src/three/engine';
import { BirdsSystem } from '../src/three/subsystems/birds';
import type { CarriedBirdParts } from '../src/three/carriedBirdPresentation';

interface ReviewSlot extends CarriedBirdParts {
  root: THREE.Group; species: ReturnType<typeof getSpecies>; status: string; simId: number;
  x: number; y: number; z: number; airMs: number; vxW: number; vyW: number; vzW: number;
}

function fixture(speciesId: string) {
  const system = new BirdsSystem(), mouth = new THREE.Vector3(3,.58,4);
  const bird = { id: 12, state: 'carried' };
  const dog = { carryingBirdId: 12, gait: 'trot', heading: 0 };
  const internals = system as unknown as {
    mat: THREE.Material; hunt: unknown; terrain: unknown; frozen: boolean; refinedQuail: boolean;
    slots: ReviewSlot[]; buildPool(ctx: Ctx): void;
    applySpeciesAppearance(slot: ReviewSlot, species: ReturnType<typeof getSpecies>): void;
  };
  internals.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  internals.hunt = { huntState: () => ({ birds: [bird] }), dogCount: () => 1, dog: () => dog,
    dogRenderWorld: (_alpha: number, out: {x:number;z:number}) => Object.assign(out,{x:3,z:4}) };
  internals.terrain = { heightAt: () => 0 }; internals.frozen = false; internals.refinedQuail = speciesId === 'bobwhite';
  const ctx = { scene: new THREE.Scene(), fixedAlpha: 1, camera: new THREE.PerspectiveCamera(),
    get: () => ({ mouthWorld: (out: THREE.Vector3) => { out.copy(mouth); return true; } }) } as unknown as Ctx;
  internals.buildPool(ctx); const slot = internals.slots[0];
  internals.applySpeciesAppearance(slot,getSpecies(speciesId));slot.simId=bird.id;slot.status='grounded';
  return { system, slot, internals, ctx, mouth, dog, bird };
}

describe('carried bird presentation in the pooled renderer',()=>{
  it.each(['sharptail','bobwhite','chukar','ringneck'])('relaxes %s around a stable mouth grip without changing hunt state',species=>{
    const f=fixture(species), physical=JSON.stringify({bird:f.bird,dog:f.dog});
    const meshCount=f.slot.root.children.length;
    for(let frame=0;frame<36;frame++) {
      f.mouth.x+=.03;f.system.update(f.ctx,1/60);
      expect(f.slot.root.position.distanceTo(f.mouth)).toBeLessThan(.000001);
      expect(JSON.stringify({bird:f.bird,dog:f.dog})).toBe(physical);
    }
    expect(f.slot.root.children.length).toBe(meshCount);
    for(const wing of [f.slot.wingLMesh,f.slot.wingRMesh]) {
      const carryIndex=wing.morphTargetDictionary!['carried-rest'];
      expect(wing.morphTargetInfluences![carryIndex]).toBe(1);
      const base=wing.geometry.getAttribute('position'),point=new THREE.Vector3();let lower=0;
      for(let i=0;i<base.count;i++) {
        wing.getVertexPosition(i,point);
        if(Math.abs(base.getX(i))<.000001)expect(point.distanceTo(new THREE.Vector3().fromBufferAttribute(base,i))).toBeLessThan(.000001);
        if(point.y<base.getY(i)-.035)lower++;
      }
      expect(lower).toBeGreaterThan(20);
    }
    f.slot.root.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(f.slot.root,true),size=bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeGreaterThan(.1);
    expect(Math.max(size.x,size.z)).toBeLessThan(species==='ringneck'?.95:species==='bobwhite'?.35:.65);
    f.system.dispose(f.ctx);
  });

  it('holds the rendered pose while paused and clears carry morphs when the pool slot is reused',()=>{
    const f=fixture('sharptail');
    f.system.update(f.ctx,.08);
    const rotation=f.slot.root.quaternion.clone(),left=f.slot.wingL.quaternion.clone();
    const weights=f.slot.wingLMesh.morphTargetInfluences!.slice();
    for(let i=0;i<20;i++)f.system.update(f.ctx,0);
    expect(f.slot.root.quaternion.angleTo(rotation)).toBeLessThan(.000001);
    expect(f.slot.wingL.quaternion.angleTo(left)).toBeLessThan(.000001);
    expect(f.slot.wingLMesh.morphTargetInfluences).toEqual(weights);
    f.internals.applySpeciesAppearance(f.slot,getSpecies('sharptail'));
    for(const mesh of [f.slot.body,f.slot.wingLMesh,f.slot.wingRMesh])expect(mesh.morphTargetInfluences!.every(value=>value===0)).toBe(true);
    f.slot.status='flying';f.slot.x=9;f.slot.y=4;f.slot.z=12;f.slot.vxW=3;f.slot.vzW=6;
    f.system.update(f.ctx,1/60);
    expect(f.slot.root.position.toArray()).toEqual([9,4,12]);
    expect(f.slot.wingLMesh.morphTargetInfluences![f.slot.wingLMesh.morphTargetDictionary!['carried-rest']]).toBe(0);
    f.system.dispose(f.ctx);
  });

  it('reaches resting size before touchdown and retains it through pickup',()=>{
    const f=fixture('sharptail');f.bird.state='down';f.slot.status='falling';
    const scales:number[]=[];
    for(const height of [2,1,.4,.06]) { f.slot.y=height;f.system.update(f.ctx,1/60);scales.push(f.slot.root.scale.x); }
    expect(scales[0]).toBeGreaterThan(scales[1]);expect(scales[1]).toBeGreaterThan(scales[2]);
    f.slot.status='grounded';f.system.update(f.ctx,1/60);
    expect(f.slot.root.scale.x).toBeCloseTo(scales.at(-1)!);
    f.bird.state='carried';f.system.update(f.ctx,1/60);
    expect(f.slot.root.scale.x).toBeCloseTo(scales.at(-1)!);
    f.system.dispose(f.ctx);
  });
});
