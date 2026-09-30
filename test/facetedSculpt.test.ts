import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FacetBuilder, patchWeight, type CoatPainter } from '../src/three/dogs/facetedSculpt';

const white = new THREE.Color(1, 1, 1), liver = new THREE.Color(.3, .15, .1), fleck = new THREE.Color(.5, .2, .1);
const plain: CoatPainter = () => ({ color: white, marking: false });

function triangles(geometry: THREE.BufferGeometry) {
  const p = geometry.getAttribute('position'), out: THREE.Vector3[][] = [];
  for (let i = 0; i < p.count; i += 3) out.push([0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p, i + k)));
  return out;
}

describe('faceted sculpt kit', () => {
  it('orients every lofted facet outward from the part axis', () => {
    const b = new FacetBuilder(plain);
    b.loftZ([{ y: 0, z: -.2, w: .08, top: .1, bottom: .12 }, { y: .02, z: 0, w: .11, top: .13, bottom: .16 }, { y: 0, z: .2, w: .06, top: .07, bottom: .08 }], undefined, false, true, true, 2);
    const { coat } = b.build();
    for (const [a, c, d] of triangles(coat!)) {
      const normal = c.clone().sub(a).cross(d.clone().sub(a));
      const centroid = a.clone().add(c).add(d).multiplyScalar(1 / 3);
      const axis = new THREE.Vector3(0, 0, THREE.MathUtils.clamp(centroid.z, -.2, .2));
      if (Math.abs(centroid.z) < .19) expect(normal.dot(centroid.clone().sub(axis))).toBeGreaterThan(0);
    }
  });

  it('paints whole facets and lays flush flecks on them', () => {
    const painter: CoatPainter = p => p.x > 0 ? { color: liver, marking: true } : { color: white, marking: false, fleck };
    const b = new FacetBuilder(painter);
    b.loftY([{ y: 0, z: 0, w: .03, front: .03, back: .03 }, { y: -.2, z: 0, w: .02, front: .02, back: .02 }]);
    const { coat, marking } = b.build();
    expect(coat).not.toBeNull(); expect(marking).not.toBeNull();
    const colors = marking!.getAttribute('color');
    let flecks = 0;
    for (let i = 0; i < colors.count; i++) if (Math.abs(colors.getX(i) - fleck.r) < 1e-6) flecks++;
    expect(flecks).toBeGreaterThan(0);
  });

  it('builds a domed foot entirely above its sole', () => {
    const b = new FacetBuilder(plain);
    b.foot(-.013, .07, .025, .033, .5, undefined, .014);
    const box = new THREE.Box3().setFromBufferAttribute(b.build().coat!.getAttribute('position') as THREE.BufferAttribute);
    expect(box.min.y).toBeCloseTo(-.013, 6);
    expect(box.max.y).toBeGreaterThan(.015);
    expect(box.max.z).toBeGreaterThan(box.max.x);
  });

  it('marks body regions with an irregular but bounded edge', () => {
    expect(patchWeight(new THREE.Vector3(0, 0, 0), [0, 0, 0], [.1, .1, .1])).toBe(1);
    expect(patchWeight(new THREE.Vector3(.5, 0, 0), [0, 0, 0], [.1, .1, .1])).toBe(0);
  });
});
