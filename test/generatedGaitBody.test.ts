import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createGaitBodyPose, writeGaitBodyPose } from '../src/three/dogs/generatedGaitBody';
import { GeneratedFieldMotion } from '../src/three/dogs/generatedFieldMotion';
import { TURN_LEAN_MAX } from '../src/three/dogs/generatedBodySupport';

const GAITS = ['walk', 'trot', 'canter', 'gallop', 'bound'] as const;

describe('the trunk over the stride', () => {
  it('is continuous through the stride boundary for every gait and lead', () => {
    for (const gait of GAITS) for (const lead of ['left', 'right'] as const) {
      const a = writeGaitBodyPose(gait, 1 - 1e-6, lead, 1, createGaitBodyPose()), b = writeGaitBodyPose(gait, 1e-6, lead, 1, createGaitBodyPose());
      for (const key of ['pitch', 'heave', 'loin', 'hipRoll'] as const) expect(Math.abs(a[key] - b[key])).toBeLessThan(1e-3);
    }
  });

  it('rocks a canter and a gallop far more than it moves a trot', () => {
    const range = (gait: typeof GAITS[number], key: 'pitch' | 'heave' | 'loin') => {
      let low = Infinity, high = -Infinity;
      for (let i = 0; i < 200; i++) { const v = writeGaitBodyPose(gait, i / 200, 'left', 1, createGaitBodyPose())[key]; low = Math.min(low, v); high = Math.max(high, v); }
      return high - low;
    };
    expect(range('gallop', 'loin')).toBeGreaterThan(.3);
    expect(range('gallop', 'pitch')).toBeGreaterThan(.1);
    expect(range('canter', 'pitch')).toBeGreaterThan(.12);
    expect(range('trot', 'pitch')).toBeLessThan(.03);
    expect(range('trot', 'loin')).toBeLessThan(.05);
    // A trot lifts in each diagonal's short suspension; a walk barely rises.
    expect(range('trot', 'heave')).toBeGreaterThan(range('walk', 'heave'));
  });

  it('gathers the gallop in its short flight and stretches it in the long one', () => {
    const at = (c: number) => writeGaitBodyPose('gallop', c, 'left', 1, createGaitBodyPose());
    // Hinds land at 0, fores at .5: gathered just before the hinds, extended just before the fores.
    expect(at(.91).loin).toBeGreaterThan(.15);
    expect(at(.42).loin).toBeLessThan(-.12);
    // The forehand rides up off the hind drive and drops to catch on the fores.
    expect(at(.33).pitch).toBeGreaterThan(.05);
    expect(at(.83).pitch).toBeLessThan(-.05);
    // Highest in the long extended flight, lowest at mid-support.
    expect(at(.40).heave).toBeGreaterThan(at(.65).heave + .03);
  });
});

/** Gallop round a circle of this radius (m) at this speed; turning toward +x when `toward` is 1. */
function circle(motion: GeneratedFieldMotion, speed: number, radius: number, toward: 1 | -1, frames: number, onFrame?: () => void) {
  let x = 0, z = 0, yaw = 0;
  const rate = speed / radius;
  for (let f = 0; f < frames; f++) {
    const dt = 1 / 60;
    // Model yaw: increasing turns the nose toward +x.
    yaw += toward * rate * Math.min(1, f / 60) * dt;
    x += Math.sin(yaw) * speed * dt; z += Math.cos(yaw) * speed * dt;
    motion.update(x, z, yaw, dt, true, false, undefined, undefined, speed);
    onFrame?.();
  }
}

describe('running turns', () => {
  it('leans into the turn from the feet, inside the reach of every leg', () => {
    for (const toward of [1, -1] as const) {
      const motion = new GeneratedFieldMotion('lite', () => 0);
      let clamped = 0;
      circle(motion, 5, 3.5, toward, 240, () => { clamped += motion.clamped; });
      const roll = motion.asset.joints.body.rotation.z;
      // Positive roll tilts the back toward -x: the lean is toward the inside.
      expect(-Math.sign(roll)).toBe(toward);
      expect(Math.abs(roll)).toBeGreaterThan(.25);
      expect(Math.abs(roll)).toBeLessThanOrEqual(TURN_LEAN_MAX + 1e-9);
      expect(clamped).toBe(0);
      motion.dispose();
    }
  });

  it('takes the inside lead and swaps leads in the air without sliding a planted paw', () => {
    for (const [toward, lead] of [[1, 'right'], [-1, 'left']] as const) {
      const motion = new GeneratedFieldMotion('lite', () => 0);
      const previous = motion.feet.map(() => new THREE.Vector3()), held = [false, false, false, false];
      let worst = 0;
      circle(motion, 5.4, 4, toward, 300, () => {
        motion.feet.forEach((foot, i) => {
          const actual = motion.asset.paws[i].getWorldPosition(new THREE.Vector3());
          if (foot.locked && foot.step === 0 && held[i]) worst = Math.max(worst, Math.hypot(actual.x - previous[i].x, actual.z - previous[i].z));
          held[i] = foot.locked && foot.step === 0; previous[i].copy(actual);
        });
      });
      expect(motion.gait).toBe('gallop');
      expect(motion.lead).toBe(lead);
      expect(worst).toBeLessThan(.002);
      motion.dispose();
    }
  });
});

describe('ground contact', () => {
  it('plants paws on the drawn surface where it departs from the smooth heightfield', () => {
    // A coarse drawn surface: flat facets stepping 6 cm under a smooth slope.
    const smooth = (x: number, z: number) => .2 * z + .02 * x;
    const drawn = (x: number, z: number) => smooth(x, z) - .06 * (.5 + .5 * Math.sin(z * 2.1));
    const motion = new GeneratedFieldMotion('lite', smooth, () => 0, 'liver-white', 'smooth', drawn);
    let z = 0, planted = 0;
    for (let f = 0; f < 240; f++) {
      const moving = f < 180; if (moving) z += 2.2 / 60;
      motion.update(0, z, 0, 1 / 60, moving, !moving);
      for (const foot of motion.contactSnapshot()) if (foot.locked && foot.step === 0) {
        planted++;
        const [x, y, fz] = foot.actual;
        expect(Math.abs(y - drawn(x, fz) - .023)).toBeLessThan(.0015);
      }
    }
    expect(planted).toBeGreaterThan(400);
    motion.dispose();
  });
});

describe('stopping to check', () => {
  it('stands braced on the feet it stopped on, and squares up only if it stays', () => {
    const motion = new GeneratedFieldMotion('lite', () => 0);
    let z = 0, steps = 0;
    const stepping = () => motion.feet.filter(foot => foot.step > 0).length;
    for (let f = 0; f < 150; f++) { z += 5.5 / 60; motion.update(0, z, 0, 1 / 60, true, false, undefined, undefined, 5.5); }
    // A third of a second's check, as the scent beat makes it.
    let was = 0;
    for (let f = 0; f < 20; f++) {
      motion.update(0, z, 0, 1 / 60, false, false);
      const now = stepping(); if (now > was) steps += now - was; was = now;
    }
    expect(steps).toBeLessThanOrEqual(1);
    // Kept standing, it squares its stance up.
    for (let f = 0; f < 150; f++) motion.update(0, z, 0, 1 / 60, false, false);
    expect(motion.clamped).toBe(0);
    for (const foot of motion.contactSnapshot()) expect(foot.locked).toBe(true);
    motion.dispose();
  });
});

describe('search carriage', () => {
  it('glances off to either side at irregular moments and wags on a drifting beat', async () => {
    const { GeneratedScentMotion } = await import('../src/three/dogs/generatedScentMotion');
    const { createGeneratedGsp } = await import('../src/three/dogs/generatedGsp');
    const dog = createGeneratedGsp('lite', true), motion = new GeneratedScentMotion();
    motion.setBreed({ headFreedom: .7, tailAction: .65 });
    const intent = { state: 'quartering' as const, scentStage: 'none' as const, scentProgress: 0, waitingForHandler: false, intentYaw: 0 };
    const yaws: number[] = [], crossings: number[] = [];
    let lastTail = 0;
    for (let f = 0; f < 60 * 20; f++) {
      dog.setPose('stand');
      motion.update(dog, intent, true, 0, 1 / 60, false);
      yaws.push(dog.joints.neck.rotation.y);
      const tail = dog.joints.tail.rotation.y;
      if (lastTail < 0 && tail >= 0) crossings.push(f / 60);
      lastTail = tail;
    }
    expect(Math.max(...yaws)).toBeGreaterThan(.08);
    expect(Math.min(...yaws)).toBeLessThan(-.08);
    const beats = crossings.slice(1).map((t, i) => t - crossings[i]);
    const mean = beats.reduce((a, b) => a + b, 0) / beats.length;
    expect(Math.max(...beats) - Math.min(...beats)).toBeGreaterThan(mean * .15);
    dog.dispose();
  });
});
