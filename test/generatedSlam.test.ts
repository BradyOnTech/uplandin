import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GeneratedFieldMotion } from '../src/three/dogs/generatedFieldMotion';
import type { GeneratedFieldIntent } from '../src/three/dogs/generatedScentMotion';

const DT = 1 / 60;
const quartering: GeneratedFieldIntent = { state: 'quartering', scentStage: 'none', scentProgress: 0, waitingForHandler: false, intentYaw: 0 };
const lock = (slam: number, progress: number): GeneratedFieldIntent =>
  ({ state: 'tracking', scentStage: 'locking', scentProgress: progress, waitingForHandler: false, intentYaw: 0, slam });

/** A dog galloping along +Z that hits scent and slams: a 0.34 s skid, then the settle. */
function slamRun(coat: 'liver-white' | 'orange-belton', look: 'smooth' | 'faceted') {
  const motion = new GeneratedFieldMotion('high', () => 0, () => 0, coat, look);
  let z = 0;
  for (let i = 0; i < 90; i++) { z += 5 * DT; motion.update(0, z, 0, DT, true, false, undefined, quartering, 5); }
  const frames: { slam: number; z: number; steps: number; pawY: number[]; pitch: number; tail: number; locked: boolean[] }[] = [];
  const skidFrames = Math.round(.34 / DT);
  for (let i = 1; i <= skidFrames + 30; i++) {
    const slam = Math.min(1, i / skidFrames);
    // Even deceleration from 5 m/s to rest over the skid.
    if (slam < 1) z += 5 * (1 - (i - .5) / skidFrames) * DT;
    motion.update(0, z, 0, DT, false, false, undefined, lock(slam, i / (skidFrames + 12)), 0);
    const paws = motion.asset.paws.map(paw => paw.getWorldPosition(new THREE.Vector3()).y);
    frames.push({ slam, z, steps: motion.feet.filter(foot => foot.step > 0).length, pawY: paws,
      pitch: motion.asset.joints.body.rotation.x, tail: motion.asset.joints.tail.rotation.x, locked: motion.feet.map(foot => foot.locked) });
  }
  return { motion, frames, skidFrames };
}

describe('slam into point on the skinned rig', () => {
  for (const [coat, look] of [['liver-white', 'smooth'], ['orange-belton', 'faceted']] as const) {
    it(`skids on four planted feet, tips onto the forehand and only then lifts the paw (${look})`, () => {
      const { motion, frames, skidFrames } = slamRun(coat, look);
      const skid = frames.slice(0, skidFrames - 1);
      // Every paw stays on the ground and slides with the dog: no stepping.
      for (const frame of skid) {
        expect(frame.steps).toBe(0);
        expect(frame.locked.every(Boolean)).toBe(true);
        for (const y of frame.pawY) expect(y).toBeLessThan(.06);
      }
      // The weight goes onto the forehand mid-skid, then rocks back.
      const mid = skid[Math.round(skidFrames * .35)];
      expect(mid.pitch).toBeGreaterThan(skid[0].pitch + .05);
      expect(frames[skidFrames + 10].pitch).toBeLessThan(mid.pitch - .05);
      // The tail is at its point carriage before the dog has stopped.
      expect(skid.at(-1)!.tail).toBeGreaterThan(frames.at(-1)!.tail - .08);
      // The pointing forefoot rises only after the stop, and not in one jump.
      const lift = frames.slice(skidFrames - 1).map(frame => frame.pawY[0]);
      for (let i = 1; i < lift.length; i++) expect(lift[i] - lift[i - 1]).toBeLessThan(.03);
      expect(lift.at(-1)!).toBeGreaterThan(lift[0] + .08);
      motion.dispose();
    });
  }
});

describe('bounding through tall cover on the skinned rig', () => {
  const searching = (coverHeight: number, state: GeneratedFieldIntent['state'] = 'quartering'): GeneratedFieldIntent =>
    ({ state, scentStage: 'none', scentProgress: 0, waitingForHandler: false, intentYaw: 0, coverHeight });
  function run(coverHeight: number, speed = 4, state: GeneratedFieldIntent['state'] = 'quartering', frames = 150) {
    const motion = new GeneratedFieldMotion('high', () => 0, () => 0, 'liver-white', 'smooth');
    let z = 0;
    const samples: { gait: string; body: number; head: number; paws: number[]; clamped: number }[] = [];
    for (let i = 0; i < frames; i++) {
      z += speed * DT;
      motion.update(0, z, 0, DT, true, false, undefined, searching(coverHeight, state), speed);
      const world = new THREE.Vector3();
      samples.push({ gait: motion.gait, body: motion.asset.joints.body.getWorldPosition(world).y,
        head: motion.asset.joints.head.getWorldPosition(world).y, clamped: motion.clamped,
        paws: motion.asset.paws.map(paw => paw.getWorldPosition(new THREE.Vector3()).y) });
    }
    return { motion, samples };
  }

  it('leaps a searching dog through cover taller than its back, clearing the ground between strides', () => {
    const { motion, samples } = run(1.6);
    const bounding = samples.filter(sample => sample.gait === 'bound');
    expect(bounding.length).toBeGreaterThan(80);
    const open = run(0).samples.slice(60);
    const runningBody = Math.max(...open.map(sample => sample.body)), runningHead = Math.max(...open.map(sample => sample.head));
    // Over the top of each leap the body and head are well up over a running dog's.
    expect(Math.max(...bounding.map(sample => sample.body))).toBeGreaterThan(runningBody + .3);
    expect(Math.max(...bounding.map(sample => sample.head))).toBeGreaterThan(runningHead + .3);
    // In the air all four paws are up; between leaps the dog lands on its feet.
    const top = bounding.reduce((best, sample) => sample.body > best.body ? sample : best);
    for (const y of top.paws) expect(y).toBeGreaterThan(.2);
    expect(Math.min(...bounding.map(sample => Math.min(...sample.paws)))).toBeLessThan(.03);
    // The legs never have to stretch past their length to stay on the arc.
    expect(Math.max(...bounding.map(sample => sample.clamped))).toBe(0);
    motion.dispose();
  });

  it('leaps as a body thrown would: a higher leap spends longer in the air', () => {
    const aloft = (cover: number, speed: number) => {
      const { motion, samples } = run(cover, speed, 'quartering', 240);
      // The longest run of frames with every paw off the ground.
      let best = 0, current = 0;
      for (const sample of samples.slice(60)) { current = Math.min(...sample.paws) > .06 ? current + 1 : 0; best = Math.max(best, current); }
      motion.dispose();
      return best * DT;
    };
    const low = aloft(1.0, 4), high = aloft(1.65, 4);
    expect(high).toBeGreaterThan(low + .12);
    // Close to the time a 0.6 m ballistic arc takes (paw clearance trims the ends).
    expect(high).toBeGreaterThan(.5); expect(high).toBeLessThan(.75);
  });

  it('runs on normally in the open, at a jog, and while working scent', () => {
    for (const [cover, speed, state] of [[0, 4, 'quartering'], [1.6, 1.8, 'quartering'], [1.6, 4, 'tracking']] as const) {
      const { motion, samples } = run(cover, speed, state, 90);
      expect(samples.some(sample => sample.gait === 'bound')).toBe(false);
      motion.dispose();
    }
  });

  it('comes back to its running gait at a take-off once it leaves the cover', () => {
    const motion = new GeneratedFieldMotion('high', () => 0, () => 0, 'liver-white', 'smooth');
    let z = 0;
    const step = (cover: number) => { z += 4 * DT; motion.update(0, z, 0, DT, true, false, undefined, searching(cover), 4); };
    for (let i = 0; i < 120; i++) step(1.6);
    expect(motion.gait).toBe('bound');
    let body = Infinity;
    for (let i = 0; i < 120 && motion.gait === 'bound'; i++) { step(0); body = motion.asset.joints.body.position.y; }
    expect(motion.gait).not.toBe('bound');
    // The change comes on the ground, never out of the top of a leap.
    expect(body).toBeLessThan(.05);
    motion.dispose();
  });
});
