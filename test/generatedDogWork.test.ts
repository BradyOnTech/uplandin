import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Dog } from '../src/game/dog';
import { getBreed } from '../src/game/breeds';
import { getArea, getDropPoint } from '../src/game/areas';
import type { Ctx } from '../src/three/engine';
import { GeneratedDogSystem } from '../src/three/subsystems/generatedDog';
import { GeneratedFieldMotion } from '../src/three/dogs/generatedFieldMotion';

afterEach(() => vi.unstubAllGlobals());

/** The real dog renderer over a hand-driven shared dog, as the hunt would drive it. */
function fixture(target: { marking?: THREE.Vector3; fall?: THREE.Vector3 }) {
  vi.stubGlobal('window', {});
  const area = getArea('chukar-ridge');
  const dog = new Dog({ x: 0, y: 0 }, { breed: getBreed('gsp'), level: 8 }, () => .25);
  dog.heading = Math.PI / 2;
  const at = { x: 0, z: 0 };
  const hunt = {
    areaConfig: () => area, dropPoint: () => getDropPoint(area), dog: () => dog,
    dogRenderWorld: (_: number, out: { x: number; z: number }) => Object.assign(out, at),
    dogRenderHeading: () => dog.heading, dogRenderTravelHeading: () => dog.heading,
    huntState: () => ({ birds: [{ id: 1, speciesId: 'chukar' }] }),
  };
  const birds = {
    markingTarget: (_ids: readonly number[], out: THREE.Vector3) => !!target.marking && !!out.copy(target.marking),
    groundedTarget: (_id: number, out: THREE.Vector3) => !!target.fall && !!out.copy(target.fall),
  };
  const ctx = { scene: new THREE.Scene(), quality: 'lite', fixedAlpha: 1,
    get: (id: string) => id === 'hunt3d' ? hunt : id === 'birds' ? birds : { heightAt: () => 0 } } as unknown as Ctx;
  const renderer = new GeneratedDogSystem();
  renderer.init(ctx);
  const motion = (renderer as unknown as { motion: GeneratedFieldMotion }).motion;
  const attention = (renderer as unknown as { attention: { yaw: number } }).attention;
  return { dog, at, ctx, renderer, motion, attention, step: () => renderer.update(ctx, 1 / 60) };
}

describe('marking the birds and the fall', () => {
  it('turns where it stands to keep a bird out to one side in front of it', () => {
    // Model forward is +z for a heading of pi/2; the bird is square off its side.
    const f = fixture({ marking: new THREE.Vector3(12, 4, 0) });
    try {
      f.dog.state = 'heel'; f.dog.gait = 'still';
      for (let i = 0; i < 30; i++) f.step();
      f.dog.state = 'marking'; Object.assign(f.dog, { markingBirdIds: [1] });
      for (let i = 0; i < 90; i++) f.step();
      const nose = new THREE.Vector3(0, 0, 1).applyQuaternion(f.motion.asset.root.quaternion);
      const off = nose.angleTo(new THREE.Vector3(12, 0, 0).normalize());
      expect(off).toBeLessThan(.6);
      expect(f.motion.clamped).toBe(0);
      // The head carries the rest of the look.
      expect(Math.abs(f.attention.yaw)).toBeGreaterThan(.2);
    } finally { f.renderer.dispose(); }
  });

  it('has its eyes on the fall while running out, and lets the pickup have the head close in', () => {
    const f = fixture({ fall: new THREE.Vector3(6, 0, 20) });
    try {
      f.dog.state = 'retrieving'; f.dog.gait = 'run'; f.dog.carryingBirdId = null;
      Object.assign(f.dog, { retrieveTargetId: 1 });
      for (let i = 0; i < 40; i++) { f.at.z += 5 / 60; f.step(); }
      expect(f.attention.yaw).toBeGreaterThan(.1);
      // Within a couple of metres the look lets go.
      f.at.x = 5.8; f.at.z = 19;
      for (let i = 0; i < 60; i++) { f.at.z += .2 / 60; f.step(); }
      expect(Math.abs(f.attention.yaw)).toBeLessThan(.02);
    } finally { f.renderer.dispose(); }
  });
});

describe('stops and creeps', () => {
  it('brakes onto its forehand when pulled up from a run, then rocks back', () => {
    const motion = new GeneratedFieldMotion('lite', () => 0);
    let z = 0;
    for (let f = 0; f < 120; f++) { z += 5.5 / 60; motion.update(0, z, 0, 1 / 60, true, false, undefined, undefined, 5.5); }
    let deepest = 0;
    for (let f = 0; f < 12; f++) { motion.update(0, z, 0, 1 / 60, false, false); deepest = Math.max(deepest, motion.asset.joints.body.rotation.x); }
    // Nose down (positive pitch) through the brake, and level again after it.
    expect(deepest).toBeGreaterThan(.03);
    for (let f = 0; f < 60; f++) motion.update(0, z, 0, 1 / 60, false, false);
    expect(Math.abs(motion.asset.joints.body.rotation.x)).toBeLessThan(.005);
    expect(motion.clamped).toBe(0);
    motion.dispose();
  });

  it('creeps low on longer, slower strides than an ordinary walk at the same pace', () => {
    const walk = (creeping: boolean) => {
      const motion = new GeneratedFieldMotion('lite', () => 0);
      const field = { state: 'pointing' as const, scentStage: 'none' as const, scentProgress: 0, waitingForHandler: false, intentYaw: 0, creeping };
      let z = 0, cycles = 0, last = 0, height = 0;
      for (let f = 0; f < 120; f++) {
        z += 1.28 / 60; motion.update(0, z, 0, 1 / 60, true, false, undefined, field, 1.28);
        if (motion.cycle < last) cycles++; last = motion.cycle;
        if (f > 60) height += motion.asset.joints.body.getWorldPosition(new THREE.Vector3()).y / 59;
      }
      motion.dispose();
      return { cycles, height };
    };
    const creep = walk(true), plain = walk(false);
    expect(creep.height).toBeLessThan(plain.height - .015);
    expect(creep.cycles).toBeLessThan(plain.cycles);
  });
});

describe('the creep keeps the point', () => {
  it('holds the breed\'s point flag high and still through a creep step', () => {
    for (const coat of ['orange-belton', 'liver-roan', 'steel-gray'] as const) {
      const motion = new GeneratedFieldMotion('lite', () => 0, () => 0, coat, coat === 'liver-roan' ? 'smooth' : 'faceted');
      const field = { state: 'pointing' as const, scentStage: 'none' as const, scentProgress: 0, waitingForHandler: false, intentYaw: 0, creeping: true };
      let z = 0;
      const pitch: number[] = [], yaw: number[] = [];
      for (let f = 0; f < 84; f++) {
        z += 1.28 / 60; motion.update(0, z, 0, 1 / 60, true, false, undefined, field, 1.28);
        if (f > 30) { pitch.push(motion.asset.joints.tail.rotation.x); yaw.push(motion.asset.joints.tail.rotation.y); }
      }
      for (const p of pitch) expect(p).toBeCloseTo(motion.asset.pointTail, 2);
      expect(Math.max(...yaw.map(Math.abs))).toBeLessThan(.01);
      motion.dispose();
    }
  });
});
