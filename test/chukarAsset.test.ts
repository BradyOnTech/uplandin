import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildChukarBody, buildChukarWing, poseChukarFoldedWings } from '../src/three/assets/chukar';
import { addCarriedBirdPoses, poseCarriedBird } from '../src/three/carriedBirdPresentation';

function parts() {
  const body = buildChukarBody(), left = buildChukarWing(-1), right = buildChukarWing(1);
  return { body, left, right, all: [body, left, right], dispose() { for (const geometry of this.all) geometry.dispose(); } };
}

describe('authored Chukar geometry', () => {
  it('keeps the existing flight span in three shared colored geometries with finite, nondegenerate faces', () => {
    const bird = parts();
    let triangles = 0;
    for (const geometry of bird.all) {
      const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), c = geometry.getAttribute('color');
      triangles += p.count / 3;
      expect(geometry.groups).toHaveLength(0);
      expect(n.count).toBe(p.count); expect(c.count).toBe(p.count);
      expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
      expect(Array.from(c.array).every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
      const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1).sub(a); d.fromBufferAttribute(p, i + 2).sub(a);
        expect(b.cross(d).length()).toBeGreaterThan(1e-9);
        expect(new THREE.Vector3().fromBufferAttribute(n, i).length()).toBeCloseTo(1, 5);
      }
    }
    // Face markings are clipped to the torso facets so they cannot sink
    // into the breast. This costs triangles but keeps all three draw calls.
    expect(triangles).toBeLessThanOrEqual(900);
    expect(bird.left.boundingBox!.min.x).toBeCloseTo(-.15872, 6);
    expect(bird.right.boundingBox!.max.x).toBeCloseTo(.15872, 6);
    expect(bird.body.boundingBox!.min.z).toBeGreaterThan(-.15);
    expect(bird.body.boundingBox!.max.z).toBeLessThan(.15);
    expect(bird.body.boundingBox!.max.x - bird.body.boundingBox!.min.x).toBeLessThan(.10);
    bird.dispose();
  });

  it('keeps the identifying flank bars and necklace outside the faceted body surface', () => {
    const body = buildChukarBody(), p = body.getAttribute('position'), colors = body.getAttribute('color');
    const markings = [0x343936, 0x4c4538].map(hex => new THREE.Color(hex));
    const isMarking = (i: number) => markings.some(color => Math.abs(colors.getX(i) - color.r)
      + Math.abs(colors.getY(i) - color.g) + Math.abs(colors.getZ(i) - color.b) < 1e-6);
    const shellPositions: number[] = [];
    for (let i = 0; i < p.count; i += 3) if (!isMarking(i)) {
      for (let v = 0; v < 3; v++) shellPositions.push(p.getX(i + v), p.getY(i + v), p.getZ(i + v));
    }
    const shell = new THREE.BufferGeometry(); shell.setAttribute('position', new THREE.Float32BufferAttribute(shellPositions, 3));
    const material = new THREE.MeshBasicMaterial(), mesh = new THREE.Mesh(shell, material), center = new THREE.Vector3();
    let measured = 0;
    for (let i = 0; i < p.count; i += 3) if (isMarking(i)) {
      center.set(0, 0, 0);
      for (let v = 0; v < 3; v++) center.add(new THREE.Vector3().fromBufferAttribute(p, i + v));
      center.multiplyScalar(1 / 3);
      const side = Math.sign(center.x), ray = new THREE.Raycaster(new THREE.Vector3(side * .2, center.y, center.z), new THREE.Vector3(-side, 0, 0));
      const hit = ray.intersectObject(mesh)[0];
      expect(hit).toBeDefined();
      // Eyes can overlap the necklace by less than a millimeter.
      expect(Math.abs(center.x) - Math.abs(hit.point.x)).toBeGreaterThan(-.0006);
      expect(Math.abs(center.x) - Math.abs(hit.point.x)).toBeLessThan(.001);
      measured++;
    }
    expect(measured).toBeGreaterThan(100);
    body.dispose(); shell.dispose(); material.dispose();
  });

  it('shows exterior faces from both sides and keeps a broad short tail instead of a pointed grouse tail', () => {
    const bird = parts(), material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
    const body = new THREE.Mesh(bird.body, material), point = new THREE.Vector3();
    for (const direction of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)]) {
      const ray = new THREE.Raycaster(direction.clone().multiplyScalar(.3), direction.clone().negate());
      expect(ray.intersectObject(body).length).toBeGreaterThan(0);
    }
    for (const [side, geometry] of [[-1, bird.left], [1, bird.right]] as const) {
      const wing = new THREE.Mesh(geometry, material);
      for (const x of [.03, .07, .12, .15]) for (const height of [-.2, .2]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(side * x, height, -.008), new THREE.Vector3(0, -Math.sign(height), 0));
        expect(ray.intersectObject(wing).length).toBeGreaterThan(0);
      }
    }
    let tipWidth = 0;
    const position = bird.body.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      if (point.z < -.134) tipWidth = Math.max(tipWidth, Math.abs(point.x));
    }
    expect(tipWidth).toBeGreaterThan(.02);
    material.dispose(); bird.dispose();
  });

  it('supports the shared relaxed carry pose without moving the shoulder seams or central grip', () => {
    const bird = parts(); addCarriedBirdPoses(bird.body, bird.left, bird.right, 'chukar');
    const material = new THREE.MeshBasicMaterial(), body = new THREE.Mesh(bird.body, material);
    const wingL = new THREE.Group(), wingR = new THREE.Group();
    const wingLMesh = new THREE.Mesh(bird.left, material), wingRMesh = new THREE.Mesh(bird.right, material);
    wingL.add(wingLMesh); wingR.add(wingRMesh);
    wingL.position.set(-.0348, .01792, .02856); wingR.position.set(.0348, .01792, .02856);
    const root = new THREE.Group(); root.add(body, wingL, wingR);
    poseChukarFoldedWings(wingL, wingR);
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
        if (mesh === body && a.z > .13) expect(b.y).toBeLessThan(a.y - .045);
      }
    }
    const carried = new THREE.Box3().setFromObject(root, true);
    expect(carried.max.x - carried.min.x).toBeLessThan(.15);
    material.dispose(); bird.dispose();
  });
});
