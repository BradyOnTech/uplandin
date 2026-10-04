import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createGeneratedGsp, generatedBreedForCoat, generatedCoatFor, isGeneratedCoatId } from '../src/three/dogs/generatedGsp';
import { GRIFFON_COATS, griffonMarkerTone } from '../src/three/dogs/griffon';
import { GSP_HEAD_HIGH, GSP_HEAD_LITE } from '../src/three/dogs/generatedGspHeadData';
import { createGeneratedGriffonHead, GENERATED_COAT_MARKER, griffonHeadVertex } from '../src/three/dogs/generatedGspHead';
import { coatSwatch } from '../src/three/dogs/coatSwatch';
import { DEFAULT_DOG_STYLE, effectiveDogStyle } from '../src/three/dogs/dogStyle';

const extent = (coat: 'liver-white' | 'orange-belton' | 'steel-gray') => {
  const dog = createGeneratedGsp('high', false, coat, 'faceted');
  try { return new THREE.Box3().setFromObject(dog.root); } finally { dog.dispose(); }
};

describe('Wirehaired Pointing Griffon', () => {
  it('is named by its coat, and keeps only its own coat', () => {
    for (const coat of GRIFFON_COATS) expect(generatedBreedForCoat(coat.id)).toBe('griffon');
    expect(isGeneratedCoatId('steel-gray')).toBe(true);
    expect(generatedCoatFor('griffon', 'orange-belton')).toBe('steel-gray');
    expect(generatedCoatFor('griffon', undefined)).toBe('steel-gray');
    expect(generatedCoatFor('gsp', 'black-roan')).toBe('black-roan');
  });

  it('draws in the faceted look, Brady’s choice for its rough coat', () => {
    expect(DEFAULT_DOG_STYLE.griffon).toBe('faceted');
    expect(effectiveDogStyle('griffon', null)).toBe('faceted');
  });

  for (const detail of ['high', 'lite'] as const) for (const look of ['faceted', 'smooth'] as const) {
    it(`builds a valid ${detail} single-skin ${look} Griffon`, () => {
      const dog = createGeneratedGsp(detail, false, 'steel-gray', look);
      try {
        expect(dog.root.userData.breedId).toBe('griffon');
        expect(dog.root.userData.coatLabel).toBe('Steel gray and brown');
        expect(dog.stats.triangles).toBeLessThanOrEqual(detail === 'high' ? 3600 : 2400);
        expect(dog.stats.meshes).toBe(1); expect(dog.stats.materials).toBe(1);
        const weights = dog.skin.geometry.getAttribute('skinWeight');
        for (let i = 0; i < weights.count; i++) expect(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i)).toBeCloseTo(1, 6);
        for (const name of ['position', 'normal', 'color']) {
          expect(Array.from(dog.skin.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
        }
        // The beard and the ragged edge under the chest hang free of the ground.
        const standing = new THREE.Box3().setFromObject(dog.root);
        expect(standing.min.y).toBeGreaterThanOrEqual(0);
        expect(standing.min.y).toBeLessThan(.01);
      } finally { dog.dispose(); }
    });
  }

  it('shares the rig, a little longer in the back than the GSP and shorter than the setter', () => {
    const gsp = createGeneratedGsp('high', false, 'liver-white'), setter = createGeneratedGsp('high', false, 'orange-belton');
    const griffon = createGeneratedGsp('high', false, 'steel-gray', 'faceted');
    try {
      expect(Object.keys(griffon.joints)).toEqual(Object.keys(gsp.joints));
      for (const name of ['neck', 'head', 'jaw', 'front-left', 'front-left-lower', 'front-left-distal', 'front-left-paw'])
        expect(griffon.joints[name].position.distanceTo(gsp.joints[name].position)).toBe(0);
      const hind = (dog: typeof gsp) => dog.joints['hind-left'].position.z;
      expect(hind(griffon)).toBeLessThan(hind(gsp));
      expect(hind(griffon)).toBeGreaterThan(hind(setter));
    } finally { gsp.dispose(); setter.dispose(); griffon.dispose(); }
  });

  it('has a docked tail, nothing like the setter’s flag, and shorter, high-set ears', () => {
    const griffon = extent('steel-gray'), gsp = extent('liver-white'), setter = extent('orange-belton');
    expect(griffon.min.z).toBeGreaterThan(setter.min.z + .1);
    expect(Math.abs(griffon.min.z - gsp.min.z)).toBeLessThan(.06);
    const lowestEar = (vertices: readonly (readonly number[])[]) => Math.min(...vertices.filter(v => v[3] === 2).map(v => v[1]));
    expect(lowestEar(GSP_HEAD_HIGH.vertices.map(griffonHeadVertex))).toBeGreaterThan(lowestEar(GSP_HEAD_HIGH.vertices) + .01);
    // The set of the ear does not move.
    const highestEar = (vertices: readonly (readonly number[])[]) => Math.max(...vertices.filter(v => v[3] === 2).map(v => v[1]));
    expect(highestEar(GSP_HEAD_HIGH.vertices.map(griffonHeadVertex))).toBeCloseTo(highestEar(GSP_HEAD_HIGH.vertices), 6);
  });

  it('keeps coincident lip vertices closed after the head transform', () => {
    for (const table of [GSP_HEAD_HIGH, GSP_HEAD_LITE]) for (const [a, b] of table.lipPairs) {
      expect(griffonHeadVertex(table.vertices[a]).slice(0, 3)).toEqual(griffonHeadVertex(table.vertices[b]).slice(0, 3));
    }
  });

  it('wears a beard that drops with the jaw and a moustache that stays on the muzzle', () => {
    const head = createGeneratedGriffonHead('lite', 'steel-gray', true);
    try {
      const position = head.getAttribute('position'), bone = head.getAttribute('headBone'), weight = head.getAttribute('headWeight');
      // The furnishings follow the authored surface's own vertices.
      const first = GSP_HEAD_LITE.faces.length * 3;
      expect(position.count).toBeGreaterThan(first);
      let lowest = 0;
      for (let i = first; i < position.count; i++) {
        const y = position.getY(i);
        lowest = Math.min(lowest, y);
        expect(bone.getX(i)).toBe(1);
        if (y < -.045) expect(weight.getX(i)).toBe(1);
        if (y > -.01) expect(weight.getX(i)).toBe(0);
      }
      // The beard hangs well below the jaw (the GSP's chin is at -0.053 m).
      expect(lowest).toBeLessThan(-.07);
    } finally { head.dispose(); }
  });

  it('carries each facet’s lock of hair in the coat marker, still read as coat by the shader', () => {
    const linear = (hex: number) => new THREE.Color(hex);
    const darkest = linear(griffonMarkerTone(GENERATED_COAT_MARKER, 0)), lightest = linear(griffonMarkerTone(GENERATED_COAT_MARKER, 1));
    // The coat shaders treat a vertex colour as coat above 0.25 in every channel.
    expect(Math.min(darkest.r, darkest.g, darkest.b)).toBeGreaterThan(.25);
    expect(griffonMarkerTone(GENERATED_COAT_MARKER, 1)).toBe(GENERATED_COAT_MARKER);
    expect(lightest.r).toBeGreaterThan(darkest.r);
  });

  it('holds its docked tail nearly level on point, lower than the GSP’s', () => {
    const tailPitch = (coat: 'liver-white' | 'steel-gray') => {
      const dog = createGeneratedGsp('high', false, coat);
      try { dog.setPose('point', 1); return dog.joints.tail.rotation.x; } finally { dog.dispose(); }
    };
    expect(tailPitch('steel-gray')).toBeLessThan(tailPitch('liver-white'));
    expect(tailPitch('steel-gray')).toBeGreaterThanOrEqual(0);
  });

  it('has a coat swatch of its own', () => {
    expect(coatSwatch('steel-gray')).not.toBe(coatSwatch('unknown'));
  });
});
