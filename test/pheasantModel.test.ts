import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { buildPheasantBody, buildPheasantWing, buildPheasantTail, posePheasantFoldedWings, pheasantWingbeat } from '../src/three/assets/pheasant';

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
      // Precise bounds evaluate the active pose, excluding the unused
      // flight-recovery target from a carried bird's bounding envelope.
      const bounds=new THREE.Box3().setFromObject(wing,true);
      expect(bounds.max.y).toBeLessThan(.06);
      expect(bounds.min.z).toBeLessThan(-.1);
    }
    a.dispose();b.dispose();
  });
  it('recovers the outer hand aft and inward while anchoring the shoulder', () => {
    for (const hen of [false,true]) for (const side of [-1,1] as const) {
      const wing=buildPheasantWing(side,hen),base=wing.attributes.position,recovery=wing.morphAttributes.position![0];
      expect(recovery.count).toBe(base.count);
      expect(wing.morphAttributes.normal![0].count).toBe(base.count);
      let openSpan=0,foldedSpan=0;
      for (let i=0;i<base.count;i++) {
        const x=side*base.getX(i);
        openSpan=Math.max(openSpan,x);
        foldedSpan=Math.max(foldedSpan,side*recovery.getX(i));
        if (x<=.064) {
          expect(recovery.getX(i)).toBe(base.getX(i));
          expect(recovery.getY(i)).toBe(base.getY(i));
          expect(recovery.getZ(i)).toBe(base.getZ(i));
        }
        if (x>.13) {
          expect(side*recovery.getX(i)).toBeLessThan(x);
          expect(recovery.getZ(i)).toBeLessThan(base.getZ(i)-.045);
        }
      }
      expect(foldedSpan/openSpan).toBeLessThan(.8);
      wing.dispose();
    }
  });
  it('opens for the power stroke and folds on recovery without changing cadence', () => {
    // The decay is negligible here; quarter-cycle samples isolate the
    // broad downward drive from the narrower upward return.
    const seconds=4,hz=9,climb=.65;
    const basePhase=(seconds*hz+1.1*(1-Math.exp(-seconds/.55)))*Math.PI*2;
    const up=pheasantWingbeat(seconds,hz,climb,-basePhase);
    const down=pheasantWingbeat(seconds,hz,climb,Math.PI-basePhase);
    expect(up.angle).toBeCloseTo(down.angle,6);
    expect(up.recovery).toBe(1);
    expect(down.recovery).toBe(0);
    for(let ms=0;ms<=1800;ms+=8) {
      const beat=pheasantWingbeat(ms/1000,hz,climb,.7);
      const burst=Math.exp(-ms/550);
      const oldAngle=.05+Math.sin((ms/1000*hz+1.1*(1-burst))*Math.PI*2+.7)*(.58+climb*.28+burst*.28);
      expect(beat.angle).toBeCloseTo(oldAngle,10);
      expect(beat.recovery).toBeGreaterThanOrEqual(0);
      expect(beat.recovery).toBeLessThanOrEqual(1);
    }
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
