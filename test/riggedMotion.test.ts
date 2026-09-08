import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { advancePhaseDrivenAction, chooseDogClip, contactWeight, crossFadeDogAction, dogClipBlendSeconds, dogTorsoHeading, planPointSettling, POINT_SETTLE_SECONDS, sampleClipContacts, sampleCorrectiveStep, supportingGait, type DogMotionInput } from '../src/three/dogs/riggedMotion';

const dog: DogMotionInput = { state: 'quartering', gait: 'run', scentStage: 'none', carryingBirdId: null };

describe('authored dog performance follows the hunt', () => {
  it('preserves the current pose when gait changes interrupt a partially faded pickup rise', () => {
    const root = new THREE.Object3D();
    const mixer = new THREE.AnimationMixer(root);
    const action = (name: string, y: number) => mixer.clipAction(new THREE.AnimationClip(name, 1, [
      new THREE.NumberKeyframeTrack('.position[y]', [0, 1], [y, y]),
    ])).play();
    const pickup = action('pickup', 0.14); mixer.update(0);
    const carry = action('carry', 0.65); crossFadeDogAction(carry, pickup, 0.3);
    mixer.update(0.06);
    const before = root.position.y;
    expect(carry.getEffectiveWeight()).toBeCloseTo(0.2);
    const trot = action('trot', 0.65); crossFadeDogAction(trot, carry, 0.16);
    mixer.update(0);
    expect(root.position.y).toBeCloseTo(before);
    mixer.update(0.2);
    expect(root.position.y).toBeGreaterThan(before);
    mixer.stopAllAction(); mixer.uncacheRoot(root);
  });
  it('samples the point contact from the asset without moving the live skeleton', () => {
    const model = new THREE.Group();
    model.position.y = 0.1;
    const foot = new THREE.Bone(); foot.name = 'HindContactL'; foot.position.set(0.065, 0.009, -0.36); model.add(foot);
    const clip = new THREE.AnimationClip('point', 1, [
      new THREE.VectorKeyframeTrack('HindContactL.position', [0, 1], [0.065, 0.009, -0.54, 0.065, 0.009, -0.54]),
    ]);
    const sampled = sampleClipContacts(model, clip, ['HindContactL']).get('HindContactL')!;
    expect(sampled.z).toBeCloseTo(-0.54);
    expect(sampled.y).toBeCloseTo(0.109);
    expect(foot.position.z).toBe(-0.36);
  });

  it('settles a 17.1cm hind stance mismatch sequentially while preserving an already aligned front support', () => {
    const from = (x: number, z: number) => ({ x, y: 0.002, z });
    const plans = planPointSettling([
      { id: 'HL', planted: true, from: from(0.065, -0.36), to: from(0.065, -0.531) },
      { id: 'HR', planted: true, from: from(-0.065, -0.36), to: from(-0.065, -0.531) },
      { id: 'FR', planted: true, from: from(-0.064, 0.199), to: from(-0.064, 0.199) },
    ]);
    expect(plans.map(plan => plan.id)).toEqual(['HL', 'HR']);
    expect(plans[1].delay - plans[0].delay).toBe(POINT_SETTLE_SECONDS);
    const out = from(0, 0);
    sampleCorrectiveStep(from(0.065, -0.36), from(0.065, -0.531), 0.5, () => 0, out);
    expect(out.y).toBeGreaterThan(0.07);
    expect(out.z).toBeCloseTo(-0.4455);
  });

  it('finishes existing airborne feet before releasing another supporting foot', () => {
    const plans = planPointSettling([
      { id: 'HL', planted: true, from: { x: 0, y: 0.002, z: -0.36 }, to: { x: 0, y: 0.002, z: -0.54 } },
      { id: 'HR', planted: false, from: { x: 0, y: 0.08, z: -0.54 }, to: { x: 0, y: 0.002, z: -0.54 } },
    ]);
    expect(plans).toEqual([{ id: 'HR', delay: 0 }, { id: 'HL', delay: POINT_SETTLE_SECONDS }]);
  });

  it('lifts the low pickup pose continuously only after the carried transition starts', () => {
    const root = new THREE.Object3D();
    const mixer = new THREE.AnimationMixer(root);
    const pickup = mixer.clipAction(new THREE.AnimationClip('pickup', 1, [
      new THREE.NumberKeyframeTrack('.position[y]', [0, 1], [0.65, 0.14]),
    ])).play();
    pickup.time = 1; pickup.setEffectiveTimeScale(0); mixer.update(0);
    const carry = mixer.clipAction(new THREE.AnimationClip('carry', 1, [
      new THREE.NumberKeyframeTrack('.position[y]', [0, 1], [0.65, 0.65]),
    ])).play();
    carry.crossFadeFrom(pickup, dogClipBlendSeconds('pickup', 'carry'), false);
    mixer.update(0);
    expect(root.position.y).toBeCloseTo(0.14);
    mixer.update(0.15);
    expect(root.position.y).toBeCloseTo(0.395);
    mixer.update(0.15);
    expect(root.position.y).toBeCloseTo(0.65);
    expect(dogClipBlendSeconds('stalk', 'lock')).toBe(0.16);
    mixer.stopAllAction(); mixer.uncacheRoot(root);
  });
  it('faces the actual 43-degree quartering weave rather than the base scent bearing', () => {
    const travel = 43 * Math.PI / 180;
    expect(dogTorsoHeading(dog, 5.5, travel, 0, 0, 1 / 60)).toBeCloseTo(travel);
    expect(dogTorsoHeading(dog, 5.5, travel, 0, 0, 0)).toBe(0);
    expect(dogTorsoHeading(dog, 0.001, -2, 0, travel, 1 / 60)).toBe(travel);
  });

  it('settles a stationary point on scent intent and samples it exactly for capture', () => {
    const pointing: DogMotionInput = { ...dog, state: 'pointing', gait: 'still' };
    let heading = Math.PI - 0.1;
    const intent = -Math.PI + 0.1;
    for (let n = 0; n < 90; n++) heading = dogTorsoHeading(pointing, 0, -1.2, intent, heading, 1 / 60);
    expect(Math.sin(heading)).toBeCloseTo(Math.sin(intent), 7);
    expect(heading).toBeGreaterThan(Math.PI); // shorter turn across the wrap
    expect(dogTorsoHeading(pointing, 0, 2, intent, 0, 0, true)).toBe(intent);
  });
  it('lifts a released paw and lands it through a continuous corrective step', () => {
    const ground = (x: number, z: number) => 0.1 * x + 0.05 * z;
    const from = { x: 0, y: 0.002, z: 0 };
    const end = { x: 0.18, y: 0, z: -0.08 };
    const out = { ...from };
    expect(sampleCorrectiveStep(from, end, 0, ground, out)).toEqual(from);
    sampleCorrectiveStep(from, end, 0.5, ground, out);
    expect(out.x).toBeCloseTo(0.09);
    expect(out.z).toBeCloseTo(-0.04);
    expect(out.y - ground(out.x, out.z)).toBeGreaterThan(0.07);
    sampleCorrectiveStep(from, end, 1, ground, out);
    expect(out.x).toBe(end.x); expect(out.z).toBe(end.z);
    expect(out.y - ground(out.x, out.z)).toBeCloseTo(0.002);
  });
  it('crossfades into the scent-driven lock without advancing its authored phase', () => {
    const root = new THREE.Object3D();
    const mixer = new THREE.AnimationMixer(root);
    const outgoing = mixer.clipAction(new THREE.AnimationClip('stalk', 1, [
      new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 0]),
    ])).play();
    mixer.update(0.1);
    const lock = mixer.clipAction(new THREE.AnimationClip('lock', 1, [
      new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [1, 2]),
    ])).play();
    lock.crossFadeFrom(outgoing, 0.16, false);

    advancePhaseDrivenAction(mixer, lock, 0.25, 0.08);
    expect(lock.getEffectiveWeight()).toBeCloseTo(0.5);
    expect(lock.time).toBe(0.25);
    expect(root.position.x).toBeCloseTo(0.625);

    advancePhaseDrivenAction(mixer, lock, 0.8, 0.1);
    expect(outgoing.getEffectiveWeight()).toBe(0);
    expect(lock.getEffectiveWeight()).toBe(1);
    expect(lock.time).toBe(0.8);
    expect(root.position.x).toBeCloseTo(1.8);
    const beforePause = mixer.time;
    advancePhaseDrivenAction(mixer, lock, 0.8, 0);
    expect(mixer.time).toBe(beforePause);
    mixer.stopAllAction(); mixer.uncacheRoot(root);
  });
  it('uses travelling leg motion when a scent posture is too slow for actual movement', () => {
    expect(supportingGait('stalk', 3, 0.25)).toBe('trot');
    expect(supportingGait('locate', 1.8, 0.45)).toBe('trot');
    expect(supportingGait('stalk', 0.3, 0.25)).toBe('stalk');
    expect(supportingGait('point', 3, 0)).toBe('point');
  });
  it('settles into a point while measured speed is still smoothing down', () => {
    expect(chooseDogClip({ ...dog, state: 'pointing', gait: 'still' }, 3, 1)).toBe('point');
    expect(chooseDogClip({ ...dog, state: 'honoring', gait: 'still' }, 3, 1)).toBe('point');
    expect(chooseDogClip({ ...dog, state: 'tracking', scentStage: 'locking' }, 2, 1)).toBe('lock');
  });
  it('distinguishes searching at the fall, carrying and delivery despite residual velocity', () => {
    const retrieving = { ...dog, state: 'retrieving' as const };
    expect(chooseDogClip({ ...retrieving, gait: 'still' }, 2, 0)).toBe('pickup');
    expect(chooseDogClip({ ...retrieving, carryingBirdId: 8 }, 2, 0)).toBe('carry');
    expect(chooseDogClip({ ...retrieving, carryingBirdId: 8, gait: 'still' }, 2, 0)).toBe('deliver');
  });
  it('holds the raised paw out of terrain locking throughout a point loop', () => {
    for (let phase = 0; phase <= 2; phase += 0.013) {
      expect(contactWeight(phase, 0, 0)).toBe(0);
      expect(contactWeight(phase, 0, 1)).toBe(1);
    }
    expect(contactWeight(0.2, 0, 0.42)).toBe(1);
    expect(contactWeight(0.2, 0.5, 0.42)).toBe(0);
  });
});
