import { expect, it } from 'vitest';
import * as THREE from 'three';
import { QUAIL_WORLD_SCALE, quailLaunchDelay } from '../src/three/quailPresentation';
import { buildBobwhiteBody } from '../src/three/assets/bobwhite';
import { mulberry32 } from '../src/game/math';

it('keeps the rendered bobwhite body proportionate to the metre-authored dog',()=>{
  const body=buildBobwhiteBody();body.computeBoundingBox();
  const length=body.boundingBox!.getSize(new THREE.Vector3()).z*QUAIL_WORLD_SCALE;
  expect(length).toBeGreaterThan(.24);expect(length).toBeLessThan(.30);
  body.dispose();
});
it('launches a dense core with at most one late bird, reproducibly',()=>{
  let late=0;
  for(let seed=0;seed<40;seed++) {
    const rng=mulberry32(seed),delays=Array.from({length:9},(_,i)=>quailLaunchDelay(i,9,rng));
    expect(delays[0]).toBe(0);
    expect(delays.slice(0,-1).every(d=>d>=0&&d<=220)).toBe(true);
    expect(delays.filter(d=>d>220).length).toBeLessThanOrEqual(1);
    if(delays[8]>220){expect(delays[8]).toBeGreaterThanOrEqual(450);expect(delays[8]).toBeLessThanOrEqual(630);late++;}
    const again=mulberry32(seed);
    expect(delays).toEqual(Array.from({length:9},(_,i)=>quailLaunchDelay(i,9,again)));
  }
  expect(late).toBeGreaterThan(0);expect(late).toBeLessThan(40);
});
