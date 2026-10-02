import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildHunBody, buildHunWing, poseHunFoldedWings } from '../src/three/assets/hun';
import { buildPrairieChickenBody, buildPrairieChickenWing, posePrairieChickenFoldedWings } from '../src/three/assets/prairieChicken';
import { buildSharptailBody } from '../src/three/assets/sharptail';
import { addCarriedBirdPoses, poseCarriedBird } from '../src/three/carriedBirdPresentation';

// Spans and shoulder pivots are the ones the generic family models flew
// with (birds.ts: wing x .124 * wingSpan, pivot .03/.016/.028 * the
// species shape), so hit tests, flight reads and carry stay where they were.
const BIRDS = {
  hun: { body: buildHunBody, wing: buildHunWing, fold: poseHunFoldedWings, span: .124 * 1.24,
    shoulder: [.03 * 1.22, .016 * 1.18, .028 * 1.12], markings: [0x8c4a2b, 0x262422] },
  'prairie-chicken': { body: buildPrairieChickenBody, wing: buildPrairieChickenWing, fold: posePrairieChickenFoldedWings, span: .124 * 1.5,
    shoulder: [.03 * 1.18, .016 * 1.12, .028 * 1.2], markings: [0x5d4531, 0x33271c, 0xd48a2c, 0x262421] },
} as const;
type Species = keyof typeof BIRDS;

function parts(species: Species) {
  const spec = BIRDS[species], body = spec.body(), left = spec.wing(-1), right = spec.wing(1);
  return { body, left, right, all: [body, left, right], dispose() { for (const geometry of this.all) geometry.dispose(); } };
}
const isColor = (colors: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number, hex: number) => {
  const c = new THREE.Color(hex);
  return Math.abs(colors.getX(i) - c.r) + Math.abs(colors.getY(i) - c.g) + Math.abs(colors.getZ(i) - c.b) < 1e-6;
};
/** Triangle centres of one colour. */
function facets(geometry: THREE.BufferGeometry, hex: number): THREE.Vector3[] {
  const p = geometry.getAttribute('position'), c = geometry.getAttribute('color'), out: THREE.Vector3[] = [];
  for (let i = 0; i < p.count; i += 3) if (isColor(c, i, hex)) {
    out.push(new THREE.Vector3().fromBufferAttribute(p, i).add(new THREE.Vector3().fromBufferAttribute(p, i + 1))
      .add(new THREE.Vector3().fromBufferAttribute(p, i + 2)).multiplyScalar(1 / 3));
  }
  return out;
}

describe.each(Object.keys(BIRDS) as Species[])('authored %s geometry', species => {
  it('flies the existing span in three shared coloured geometries with sound faces and a small budget', () => {
    const bird = parts(species);
    let triangles = 0;
    for (const geometry of bird.all) {
      const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), c = geometry.getAttribute('color');
      triangles += p.count / 3;
      expect(geometry.userData.species).toBe(species);
      expect(geometry.groups).toHaveLength(0);
      expect(n.count).toBe(p.count); expect(c.count).toBe(p.count);
      expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
      expect(Array.from(c.array).every(value => value >= 0 && value <= 1)).toBe(true);
      const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1).sub(a); d.fromBufferAttribute(p, i + 2).sub(a);
        expect(b.cross(d).length()).toBeGreaterThan(1e-10);
        expect(new THREE.Vector3().fromBufferAttribute(n, i).length()).toBeCloseTo(1, 5);
      }
    }
    expect(triangles).toBeLessThanOrEqual(900);
    expect(bird.left.boundingBox!.min.x).toBeCloseTo(-BIRDS[species].span, 6);
    expect(bird.right.boundingBox!.max.x).toBeCloseTo(BIRDS[species].span, 6);
    const box = bird.body.boundingBox!;
    expect(box.min.z).toBeGreaterThan(-.15); expect(box.max.z).toBeLessThan(.15);
    expect(box.max.x - box.min.x).toBeLessThan(.11);
    bird.dispose();
  });

  it('paints its field marks just proud of the faceted body, never sunk into it', () => {
    const body = BIRDS[species].body(), p = body.getAttribute('position'), colors = body.getAttribute('color');
    const isMarking = (i: number) => BIRDS[species].markings.some(hex => isColor(colors, i, hex));
    const shellPositions: number[] = [];
    for (let i = 0; i < p.count; i += 3) if (!isMarking(i)) {
      for (let v = 0; v < 3; v++) shellPositions.push(p.getX(i + v), p.getY(i + v), p.getZ(i + v));
    }
    const shell = new THREE.BufferGeometry(); shell.setAttribute('position', new THREE.Float32BufferAttribute(shellPositions, 3));
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), mesh = new THREE.Mesh(shell, material);
    let measured = 0;
    for (const hex of BIRDS[species].markings) for (const center of facets(body, hex)) {
      const side = Math.sign(center.x), ray = new THREE.Raycaster(new THREE.Vector3(side * .2, center.y, center.z), new THREE.Vector3(-side, 0, 0));
      const hit = ray.intersectObject(mesh)[0];
      expect(hit).toBeDefined();
      // Overlapping patches (an eye on the comb) stack by under a millimetre.
      expect(Math.abs(center.x) - Math.abs(hit.point.x)).toBeGreaterThan(-.0001);
      expect(Math.abs(center.x) - Math.abs(hit.point.x)).toBeLessThan(.001);
      measured++;
    }
    expect(measured).toBeGreaterThan(30);
    body.dispose(); shell.dispose(); material.dispose();
  });

  it('is closed to a ray from every side and takes the shared relaxed carry without moving the grip or shoulders', () => {
    const bird = parts(species), material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
    const body = new THREE.Mesh(bird.body, material);
    for (const direction of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)]) {
      expect(new THREE.Raycaster(direction.clone().multiplyScalar(.3), direction.clone().negate()).intersectObject(body).length).toBeGreaterThan(0);
    }
    for (const [side, geometry] of [[-1, bird.left], [1, bird.right]] as const) {
      const wing = new THREE.Mesh(geometry, material);
      for (const x of [.03, .07, .11, .14]) for (const height of [-.2, .2]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(side * x, height, -.008), new THREE.Vector3(0, -Math.sign(height), 0));
        expect(ray.intersectObject(wing).length).toBeGreaterThan(0);
      }
    }
    addCarriedBirdPoses(bird.body, bird.left, bird.right, species);
    body.updateMorphTargets();
    const wingL = new THREE.Group(), wingR = new THREE.Group();
    const wingLMesh = new THREE.Mesh(bird.left, material), wingRMesh = new THREE.Mesh(bird.right, material);
    wingL.add(wingLMesh); wingR.add(wingRMesh);
    const [sx, sy, sz] = BIRDS[species].shoulder;
    wingL.position.set(-sx, sy, sz); wingR.position.set(sx, sy, sz);
    const root = new THREE.Group(); root.add(body, wingL, wingR);
    BIRDS[species].fold(wingL, wingR);
    const folded = new THREE.Box3().setFromObject(root, true);
    expect(folded.max.x - folded.min.x).toBeLessThan(.19);
    poseCarriedBird({ body, wingL, wingR, wingLMesh, wingRMesh }, 1, 1, false);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (const mesh of [body, wingLMesh, wingRMesh]) {
      const p = mesh.geometry.getAttribute('position');
      expect(mesh.morphTargetInfluences).toEqual([1]);
      for (let i = 0; i < p.count; i++) {
        a.fromBufferAttribute(p, i); mesh.getVertexPosition(i, b);
        expect(b.toArray().every(Number.isFinite)).toBe(true);
        if (mesh === body ? a.z >= -.035 && a.z <= .035 : Math.abs(a.x) < 1e-7) expect(a.distanceTo(b)).toBeLessThan(1e-7);
        if (mesh !== body && Math.abs(a.x) > .14) expect(b.y).toBeLessThan(a.y - .08);
        if (mesh === body && a.z > .115) expect(b.y).toBeLessThan(a.y - .045);
      }
    }
    const carried = new THREE.Box3().setFromObject(root, true);
    expect(carried.max.x - carried.min.x).toBeLessThan(.15);
    material.dispose(); bird.dispose();
  });
});

describe('field marks', () => {
  it('gives the Hun chestnut flank bars, a dark horseshoe low on the breast and rufous tail corners', () => {
    const body = buildHunBody();
    const bars = facets(body, 0x8c4a2b), horseshoe = facets(body, 0x5f2f1e), rufous = facets(body, 0xa04a26);
    // Bars stand on both flanks, behind the breast.
    expect(bars.filter(c => c.x > .02).length).toBeGreaterThan(20);
    expect(bars.filter(c => c.x < -.02).length).toBeGreaterThan(20);
    for (const c of bars) expect(c.z).toBeLessThan(.03);
    // The horseshoe is on the underside, central and forward of the vent.
    expect(horseshoe.length).toBeGreaterThan(3);
    for (const c of horseshoe) { expect(c.y).toBeLessThan(-.02); expect(Math.abs(c.x)).toBeLessThan(.03); expect(c.z).toBeGreaterThan(-.03); }
    // Rufous only at the tail, out at its corners.
    expect(rufous.length).toBeGreaterThan(8);
    for (const c of rufous) expect(c.z).toBeLessThan(-.08);
    expect(Math.max(...rufous.map(c => Math.abs(c.x)))).toBeGreaterThan(.015);
    body.dispose();
  });

  it('gives the prairie chicken fine flank bars, a barred belly and a short dark tail, not the sharptail point', () => {
    const chicken = buildPrairieChickenBody(), sharptail = buildSharptailBody();
    // A square end well short of the sharptail's long central point.
    expect(chicken.boundingBox!.min.z).toBeGreaterThan(sharptail.boundingBox!.min.z + .03);
    const dark = facets(chicken, 0x2f2924);
    expect(dark.length).toBeGreaterThan(10);
    for (const c of dark) expect(c.z).toBeLessThan(-.085);
    // Narrow bars down both flanks, breast to vent, each its own band.
    for (const side of [-1, 1]) {
      const bars = facets(chicken, 0x5d4531).filter(c => Math.sign(c.x) === side);
      expect(bars.length).toBeGreaterThan(30);
      const bands = new Set(bars.map(c => Math.round((c.z - .056) / -.0145)));
      expect(bands.size).toBeGreaterThanOrEqual(8);
      for (const c of bars) { expect(c.z).toBeLessThan(.07); expect(c.z).toBeGreaterThan(-.075); }
    }
    // Underneath, where no side view reaches, rows alternate two close buffs.
    const belly = (hex: number) => new Set(facets(chicken, hex).filter(c => c.y < -.03).map(c => Math.round(c.z * 200)));
    const ground = belly(0xd2bd93), barred = belly(0xb59a70);
    expect(ground.size).toBeGreaterThan(3); expect(barred.size).toBeGreaterThan(3);
    for (const z of barred) expect(ground.has(z)).toBe(false);
    chicken.dispose(); sharptail.dispose();
  });
});
