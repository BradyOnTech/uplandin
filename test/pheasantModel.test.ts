import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { buildPheasantBody, buildPheasantWing, buildPheasantTail, posePheasantFoldedWings } from '../src/three/assets/pheasant';

describe('shared pheasant geometry', () => {
  it('relaxes the neck below the body without moving the grip or adding topology', () => {
    for(const hen of [false,true]) {
      const geo=buildPheasantBody(hen),base=geo.attributes.position,relaxed=geo.morphAttributes.position![0];
      expect(relaxed.count).toBe(base.count);
      expect(geo.morphAttributes.normal![0].count).toBe(base.count);
      let headDrop=0;
      for(let i=0;i<base.count;i++) {
        if(base.getZ(i)<.04) {
          expect(relaxed.getY(i)).toBeCloseTo(base.getY(i),6);
          expect(relaxed.getZ(i)).toBeCloseTo(base.getZ(i),6);
        }
        if(base.getZ(i)>.14)headDrop=Math.max(headDrop,base.getY(i)-relaxed.getY(i));
      }
      expect(headDrop).toBeGreaterThan(.07);
      geo.dispose();
    }
  });
  it('builds complete colored rooster and hen meshes within a small per-bird budget', () => {
    for (const hen of [false,true]) {
      const parts=[buildPheasantBody(hen),buildPheasantWing(-1,hen),buildPheasantWing(1,hen),buildPheasantTail(hen)];
      let triangles=0;
      for(const geo of parts) {
        const p=geo.attributes.position;
        expect(geo.attributes.color.count).toBe(p.count);
        expect(geo.attributes.normal.count).toBe(p.count);
        expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
        triangles+=(geo.index?.count ?? p.count)/3;
        geo.dispose();
      }
      expect(triangles).toBeLessThan(3000);
    }
  });
  it('folds the flight feathers aft instead of lifting them above a carried bird', () => {
    const left=new THREE.Group(),right=new THREE.Group();
    const a=buildPheasantWing(-1),b=buildPheasantWing(1);
    left.add(new THREE.Mesh(a));right.add(new THREE.Mesh(b));
    posePheasantFoldedWings(left,right);
    for(const wing of [left,right]) {
      const bounds=new THREE.Box3().setFromObject(wing);
      expect(bounds.max.y).toBeLessThan(.06);
      expect(bounds.min.z).toBeLessThan(-.1);
    }
    a.dispose();b.dispose();
  });
  it('gives the hen a shorter tail and mirrors the two flight wings', () => {
    const rooster=buildPheasantTail(),hen=buildPheasantTail(true);
    rooster.computeBoundingBox();hen.computeBoundingBox();
    expect(Math.abs(rooster.boundingBox!.min.z)).toBeGreaterThan(Math.abs(hen.boundingBox!.min.z)*1.4);
    const left=buildPheasantWing(-1),right=buildPheasantWing(1);
    left.computeBoundingBox();right.computeBoundingBox();
    expect(left.boundingBox!.min.x).toBeCloseTo(-right.boundingBox!.max.x,5);
    expect(left.boundingBox!.max.z).toBeCloseTo(right.boundingBox!.max.z,5);
    for(const geo of [rooster,hen,left,right])geo.dispose();
  });
});
