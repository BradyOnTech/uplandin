import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createGeneratedGsp } from '../src/three/dogs/generatedGsp';
import { GSP_HEAD_HIGH, GSP_HEAD_LITE } from '../src/three/dogs/generatedGspHeadData';
import { GeneratedFieldMotion } from '../src/three/dogs/generatedFieldMotion';

for (const detail of ['high', 'lite'] as const) describe(`${detail} authored GSP head`, () => {
  it('keeps corresponding lip edges closed at rest and opens the actual lower jaw', () => {
    const table = detail === 'high' ? GSP_HEAD_HIGH : GSP_HEAD_LITE;
    expect(table.lipPairs).toHaveLength(36);
    for (const [a, b] of table.lipPairs) expect(table.vertices[a].slice(0, 3)).toEqual(table.vertices[b].slice(0, 3));
    const pair = table.lipPairs.find(([a]) => table.vertices[a][2] > .12)!;
    const source = table.vertices[pair[0]], dog = createGeneratedGsp(detail);
    try {
      const target = dog.joints.head.localToWorld(new THREE.Vector3(source[0], source[1], source[2]));
      const geometry = dog.skin.geometry, positions = geometry.getAttribute('position');
      const indices = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
      const head = dog.skeleton.bones.indexOf(dog.joints.head), jaw = dog.skeleton.bones.indexOf(dog.joints.jaw);
      const matches: { i: number; jawWeight: number }[] = [];
      for (let i = 0; i < positions.count; i++) if (new THREE.Vector3().fromBufferAttribute(positions, i).distanceTo(target) < 1e-6) {
        let jawWeight = 0;
        for (let channel = 0; channel < 4; channel++) if (indices.array[i * 4 + channel] === jaw) jawWeight += weights.array[i * 4 + channel];
        matches.push({ i, jawWeight });
      }
      const upper = matches.find(v => v.jawWeight < .001), lower = matches.find(v => v.jawWeight > .99);
      expect(upper).toBeDefined(); expect(lower).toBeDefined();
      expect(head).not.toBe(jaw);
      const skinPoint = (i: number) => dog.skin.applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(positions, i));
      expect(skinPoint(upper!.i).distanceTo(skinPoint(lower!.i))).toBeLessThan(1e-6);
      dog.joints.jaw.rotation.x = .55; dog.root.updateMatrixWorld(true); dog.skeleton.update();
      expect(skinPoint(upper!.i).distanceTo(target)).toBeLessThan(1e-6);
      expect(skinPoint(lower!.i).distanceTo(target)).toBeGreaterThan(.03);
    } finally { dog.dispose(); }
  });
  it('settles the ears during an actual pickup and resets them through water and relocation', () => {
    let depth = 0;
    const motion = new GeneratedFieldMotion(detail, () => 0, () => depth);
    try {
      for (let frame = 0; frame < 45; frame++) motion.update(0, 0, .7, 1 / 60, false, false);
      const origins = ['ear-left', 'ear-right'].map(name => motion.asset.joints[name].position.clone());
      for (let frame = 1; frame <= 42; frame++) motion.update(0, 0, .7, 1 / 60, false, false, {
        stage: 'pickup', holdMs: frame * 1000 / 60, speciesId: 'chukar',
        target: { x: Math.sin(.7) * .62, y: .06, z: Math.cos(.7) * .62 },
      });
      const check = () => ['ear-left', 'ear-right'].forEach((name, i) => {
        const ear = motion.asset.joints[name];
        const down = new THREE.Vector3(0, -1, 0).applyQuaternion(ear.getWorldQuaternion(new THREE.Quaternion()));
        expect(down.dot(new THREE.Vector3(0, -1, 0))).toBeGreaterThan(.98);
        expect(ear.position.distanceTo(origins[i])).toBe(0);
      });
      check();
      depth = .8; motion.update(0, 0, -.4, 1 / 60, true, false); check();
      depth = 0; motion.update(5, 3, 2, 1 / 60, false, true); check();
    } finally { motion.dispose(); }
  });
});
