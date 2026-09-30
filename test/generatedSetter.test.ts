import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createGeneratedGsp, generatedBreedForCoat, isGeneratedCoatId } from '../src/three/dogs/generatedGsp';
import { ENGLISH_SETTER_COATS } from '../src/three/dogs/englishSetter';
import { GSP_COATS } from '../src/three/dogs/germanShorthairedPointer';
import { GSP_HEAD_HIGH } from '../src/three/dogs/generatedGspHeadData';
import { setterHeadVertex } from '../src/three/dogs/generatedGspHead';

describe('smooth English Setter', () => {
  it('names each breed from its coat', () => {
    for (const coat of ENGLISH_SETTER_COATS) expect(generatedBreedForCoat(coat.id)).toBe('english-setter');
    for (const coat of GSP_COATS) expect(generatedBreedForCoat(coat.id)).toBe('gsp');
    expect(isGeneratedCoatId('orange-belton')).toBe(true);
    expect(isGeneratedCoatId('brindle')).toBe(false);
  });

  for (const detail of ['high', 'lite'] as const) it(`builds a valid ${detail} single-skin setter for every belton coat`, () => {
    for (const coat of ENGLISH_SETTER_COATS) {
      const dog = createGeneratedGsp(detail, false, coat.id);
      try {
        expect(dog.root.userData.breedId).toBe('english-setter');
        expect(dog.root.userData.coatLabel).toBe(coat.label);
        expect(dog.stats.triangles).toBeLessThanOrEqual(detail === 'high' ? 3600 : 2200);
        expect(dog.stats.meshes).toBe(1); expect(dog.stats.materials).toBe(1);
        const weights = dog.skin.geometry.getAttribute('skinWeight');
        for (let i = 0; i < weights.count; i++) expect(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i)).toBeCloseTo(1, 6);
        for (const name of ['position', 'normal', 'color']) {
          expect(Array.from(dog.skin.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
        }
        // Feathering and the flag hang free of the ground.
        const standing = new THREE.Box3().setFromObject(dog.root);
        expect(standing.min.y).toBeGreaterThanOrEqual(0);
        expect(standing.min.y).toBeLessThan(.01);
      } finally { dog.dispose(); }
    }
  });

  it('shares the GSP skeleton topology, with a slightly longer setter back', () => {
    const gsp = createGeneratedGsp('high', false, 'liver-white'), setter = createGeneratedGsp('high', false, 'blue-belton');
    try {
      expect(Object.keys(setter.joints)).toEqual(Object.keys(gsp.joints));
      // The forequarter and head rig are identical; only the loin length differs.
      for (const name of ['neck', 'head', 'jaw', 'front-left', 'front-left-lower', 'front-left-distal', 'front-left-paw'])
        expect(setter.joints[name].position.distanceTo(gsp.joints[name].position)).toBe(0);
      expect(setter.joints['hind-left'].position.z).toBeLessThan(gsp.joints['hind-left'].position.z);
      expect(gsp.joints['front-left'].position.z - gsp.joints['hind-left'].position.z).toBeLessThan(.48);
    } finally { gsp.dispose(); setter.dispose(); }
  });

  it('has a longer tail and a longer, lower-hanging ear than the GSP', () => {
    const extent = (coat: 'liver-white' | 'orange-belton') => {
      const dog = createGeneratedGsp('high', false, coat);
      try { return new THREE.Box3().setFromObject(dog.root); } finally { dog.dispose(); }
    };
    expect(extent('orange-belton').min.z).toBeLessThan(extent('liver-white').min.z - .1);
    const lowestEar = (vertices: readonly (readonly number[])[]) => Math.min(...vertices.filter(v => v[3] === 2).map(v => v[1]));
    expect(lowestEar(GSP_HEAD_HIGH.vertices.map(setterHeadVertex))).toBeLessThan(lowestEar(GSP_HEAD_HIGH.vertices) - .01);
  });

  it('keeps coincident lip vertices closed after the setter head transform', () => {
    for (const [a, b] of GSP_HEAD_HIGH.lipPairs) {
      expect(setterHeadVertex(GSP_HEAD_HIGH.vertices[a]).slice(0, 3)).toEqual(setterHeadVertex(GSP_HEAD_HIGH.vertices[b]).slice(0, 3));
    }
  });

  it('raises a high flag on point', () => {
    const tailPitch = (coat: 'liver-white' | 'orange-belton') => {
      const dog = createGeneratedGsp('high', false, coat);
      try { dog.setPose('point', 1); return dog.joints.tail.rotation.x; } finally { dog.dispose(); }
    };
    expect(tailPitch('orange-belton')).toBeGreaterThan(tailPitch('liver-white') + .4);
  });
});
