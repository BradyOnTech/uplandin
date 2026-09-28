import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createGeneratedGsp, GENERATED_MOUTH_GRIP } from '../src/three/dogs/generatedGsp';
import { GeneratedFieldMotion } from '../src/three/dogs/generatedFieldMotion';

describe('generated GSP jaw and retrieve performance', () => {
  for (const detail of ['high', 'lite'] as const) it(`${detail} opens the actual lower jaw without moving the upper muzzle or bird grip`, () => {
    const dog = createGeneratedGsp(detail, true);
    const position = dog.skin.geometry.getAttribute('position');
    const index = dog.skin.geometry.getAttribute('skinIndex');
    const weight = dog.skin.geometry.getAttribute('skinWeight');
    const jawIndex = dog.skeleton.bones.indexOf(dog.joints.jaw);
    const headIndex = dog.skeleton.bones.indexOf(dog.joints.head);
    // A blended cheek may list the head first and still follow the jaw.
    // The rigid muzzle/lower jaw contract depends on total influence, not slot order.
    const vertices = (bone: number) => Array.from({ length: position.count }, (_, i) => i)
      .filter(i => {
        let influence = 0;
        for (let channel = 0; channel < 4; channel++) {
          if (index.array[i * 4 + channel] === bone) influence += weight.array[i * 4 + channel];
        }
        return influence > .99999;
      })
      .map(i => ({ i, point: dog.skin.applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(position, i)) }));
    const lower = vertices(jawIndex), upper = vertices(headIndex);
    expect(lower.length).toBeGreaterThan(50);
    expect(upper.length).toBeGreaterThan(50);
    const grip = dog.joints.head.localToWorld(new THREE.Vector3(...GENERATED_MOUTH_GRIP));
    dog.joints.jaw.rotation.x = .60; dog.root.updateMatrixWorld(true); dog.skeleton.update();
    let largestDrop = 0;
    for (const { i, point } of lower) {
      const open = dog.skin.applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(position, i));
      largestDrop = Math.max(largestDrop, point.y - open.y);
    }
    expect(largestDrop).toBeGreaterThan(.07); expect(largestDrop).toBeLessThan(.10);
    for (const { i, point } of upper) expect(dog.skin.applyBoneTransform(i,
      new THREE.Vector3().fromBufferAttribute(position, i)).distanceTo(point)).toBeLessThan(1e-6);
    expect(dog.joints.head.localToWorld(new THREE.Vector3(...GENERATED_MOUTH_GRIP)).distanceTo(grip)).toBeLessThan(1e-8);
    expect(dog.stats.meshes).toBe(1); expect(dog.stats.materials).toBe(1);
    dog.dispose();
  });

  it('opens before pickup, holds quietly through travel, softens at handoff and closes after release', () => {
    const motion = new GeneratedFieldMotion('lite', () => 0);
    const frame = (retrieve?: Parameters<typeof motion.update>[6], z = 0, moving = false) => {
      motion.update(0, z, 0, 1 / 60, moving, false, retrieve);
      return motion.asset.joints.jaw.rotation.x;
    };
    frame(); const feet = motion.contactSnapshot().map(foot => new THREE.Vector3(...foot.actual));
    let previous = 0, widest = 0;
    for (let f = 1; f <= 42; f++) {
      const angle = frame({ stage: 'pickup', holdMs: f * 1000 / 60 });
      expect(Math.abs(angle - previous)).toBeLessThan(.12); previous = angle; widest = Math.max(widest, angle);
    }
    expect(widest).toBeGreaterThan(.70); expect(previous).toBeGreaterThan(.59); expect(previous).toBeLessThan(.64);
    motion.contactSnapshot().forEach((foot, i) => expect(new THREE.Vector3(...foot.actual).distanceTo(feet[i])).toBeLessThan(.002));
    for (let f = 1; f <= 60; f++) frame({ stage: 'carry', holdMs: 0 }, f * .035, true);
    expect(motion.mouthMotion.angle).toBeCloseTo(.60, 5);
    for (let f = 1; f <= 54; f++) frame({ stage: 'deliver', holdMs: f * 1000 / 60 }, 2.1);
    expect(motion.mouthMotion.angle).toBeGreaterThan(.69);
    for (let f = 0; f < 24; f++) frame(undefined, 2.1);
    expect(motion.mouthMotion.angle).toBeLessThan(.001);
    motion.dispose();
  });

  it('fits a smaller quiet grip to quail while keeping each acquired bird socket fixed during the offer', () => {
    const results: { species: string; angle: number; y: number }[] = [];
    for (const speciesId of ['bobwhite', 'chukar', 'sharptail', 'ringneck']) {
      const motion = new GeneratedFieldMotion('lite', () => 0);
      for (let f = 0; f < 45; f++) motion.update(0, 0, 0, 1 / 60, false, false,
        { stage: 'carry', holdMs: 0, speciesId });
      const grip = motion.mouthMotion.grip.clone();
      results.push({ species: speciesId, angle: motion.mouthMotion.angle, y: grip.y });
      for (let f = 0; f < 54; f++) {
        motion.update(0, 0, 0, 1 / 60, false, false, { stage: 'deliver', holdMs: f * 1000 / 60, speciesId });
        expect(motion.mouthMotion.grip.distanceTo(grip)).toBe(0);
      }
      motion.dispose();
    }
    expect(results[0].angle).toBeLessThan(results[1].angle - .15);
    expect(results[0].y).toBeGreaterThan(results[1].y);
    expect(results[2].angle).toBeGreaterThan(results[1].angle);
    expect(results[3].angle).toBeGreaterThan(results[2].angle);
  });
});
