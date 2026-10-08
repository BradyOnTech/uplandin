import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createGeneratedGsp } from '../src/three/dogs/generatedGsp';
import { BLAZE_ORANGE } from '../src/three/dogs/generatedCollar';

/** Skinned (posed) vertex positions of a mesh on the CPU. */
function skinned(mesh: THREE.SkinnedMesh): THREE.Vector3[] {
  mesh.skeleton.update();
  const position = mesh.geometry.getAttribute('position');
  return Array.from({ length: position.count }, (_, i) => mesh.applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(position, i)));
}

/** Farthest any collar vertex sits from the skin surface (its triangles). */
function worstGap(collar: THREE.Vector3[], skin: THREE.Triangle[]): number {
  const closest = new THREE.Vector3();
  return collar.reduce((worst, c) => Math.max(worst,
    skin.reduce((best, triangle) => Math.min(best, triangle.closestPointToPoint(c, closest).distanceTo(c)), Infinity)), 0);
}

const BREEDS = [['gsp', 'liver-white'], ['english-setter', 'orange-belton'], ['griffon', 'steel-gray']] as const;

describe('the field collar', () => {
  for (const [breed, coat] of BREEDS) for (const detail of ['high', 'lite'] as const) it(`fits a ${detail} ${breed} and rides its neck`, () => {
    const dog = createGeneratedGsp(detail, false, coat);
    try {
      expect(dog.root.userData.breedId).toBe(breed);
      // The body keeps its single skin and material; the collar is its own band.
      expect(dog.stats.meshes).toBe(1); expect(dog.stats.materials).toBe(1);
      expect(dog.collarStats.triangles).toBeGreaterThan(0);
      expect(dog.collarStats.triangles).toBeLessThanOrEqual(200);
      expect(dog.collar.skeleton).toBe(dog.skeleton);
      expect((dog.collar.material as THREE.MeshLambertMaterial).color.getHex()).toBe(BLAZE_ORANGE);

      // Snug on the neck standing, and still snug with the head right down
      // at a pickup: the band follows the skin rather than floating off it.
      // Neck skin triangles are chosen by bind position, so it is the same skin in every pose.
      const bind = dog.skin.geometry.getAttribute('position'), neckTriangles: number[] = [];
      const inNeck = (i: number) => bind.getZ(i) > .2 && bind.getZ(i) < .45 && bind.getY(i) > .5;
      for (let i = 0; i + 2 < bind.count; i += 3) if (inNeck(i) && inNeck(i + 1) && inNeck(i + 2)) neckTriangles.push(i);
      const neckSkin = () => { const posed = skinned(dog.skin); return neckTriangles.map(i => new THREE.Triangle(posed[i], posed[i + 1], posed[i + 2])); };
      dog.setPose('stand'); dog.root.updateMatrixWorld(true);
      expect(worstGap(skinned(dog.collar), neckSkin())).toBeLessThan(.015);
      dog.joints.neck.rotation.x += 1.25; dog.root.updateMatrixWorld(true);
      expect(worstGap(skinned(dog.collar), neckSkin())).toBeLessThan(.015);
    } finally { dog.dispose(); }
  });
});
