import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createGeneratedGsp } from '../src/three/dogs/generatedGsp';
import { GeneratedAttention } from '../src/three/dogs/generatedAttention';
import { BirdsSystem } from '../src/three/subsystems/birds';

describe('generated marking attention',()=>{
  it('follows a world target with bounded neck/head movement and leaves all paws fixed',()=>{
    const asset=createGeneratedGsp('lite',true),attention=new GeneratedAttention();
    asset.root.position.set(5,2,-7);asset.root.rotation.y=Math.PI/2;
    asset.root.updateMatrixWorld(true);
    const target=asset.root.localToWorld(new THREE.Vector3(4,6,8));
    const before=asset.paws.map(p=>p.getWorldPosition(new THREE.Vector3()));
    for(let i=0;i<60;i++){asset.setPose('stand');attention.update(asset,target,1/60);}
    expect(attention.yaw).toBeGreaterThan(.3);expect(attention.yaw).toBeLessThanOrEqual(.65);
    expect(attention.pitch).toBeGreaterThan(.3);expect(attention.pitch).toBeLessThanOrEqual(.45);
    asset.paws.forEach((p,i)=>expect(p.getWorldPosition(new THREE.Vector3()).distanceTo(before[i])).toBeLessThan(1e-8));
    for(let i=0;i<90;i++){asset.setPose('stand');attention.update(asset,null,1/60);}
    expect(Math.abs(attention.yaw)).toBeLessThan(.0001);expect(Math.abs(attention.pitch)).toBeLessThan(.0001);
    asset.dispose();
  });
  it('prefers a falling bird from the watched covey and ignores other coveys',()=>{
    const birds=new BirdsSystem();
    Object.assign(birds,{slots:[{simId:1,status:'flying',x:20,y:8,z:10},{simId:2,status:'falling',x:4,y:3,z:7},
      {simId:3,status:'falling',x:100,y:50,z:100}]});
    const out=new THREE.Vector3();
    expect(birds.markingTarget([1,2],out)).toBe(true);expect(out.toArray()).toEqual([4,3,7]);
    expect(birds.markingTarget([1],out)).toBe(true);expect(out.toArray()).toEqual([20,8,10]);
    expect(birds.markingTarget([99],out)).toBe(false);
  });
});
