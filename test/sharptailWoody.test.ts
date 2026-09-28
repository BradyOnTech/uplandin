import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { sharptailForbGeometry, sharptailShrubGeometry } from '../src/three/subsystems/sharptailWoody';

describe('open prairie shrubs and dry forbs', () => {
  it.each([
    ['sage', sharptailShrubGeometry, 260], ['forb', sharptailForbGeometry, 120],
  ] as const)('keeps the %s kit finite, grounded and within its existing single-batch budget', (_name, build, budget) => {
    const geometry = build(), positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    const colors = geometry.getAttribute('color');
    let minArea = Infinity, normalError = 0, darkest = 1, lightest = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < positions.count; i += 3) {
      a.fromBufferAttribute(positions, i); b.fromBufferAttribute(positions, i + 1); c.fromBufferAttribute(positions, i + 2);
      minArea = Math.min(minArea, b.sub(a).cross(c.sub(a)).length());
    }
    for (let i = 0; i < positions.count; i++) {
      normalError = Math.max(normalError, Math.abs(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) - 1));
      darkest = Math.min(darkest, colors.getY(i)); lightest = Math.max(lightest, colors.getY(i));
    }
    expect([...positions.array, ...normals.array, ...colors.array].every(Number.isFinite)).toBe(true);
    expect(positions.count / 3).toBeLessThanOrEqual(budget);
    expect(minArea).toBeGreaterThan(1e-7);
    expect(normalError).toBeLessThan(1e-6);
    expect(geometry.boundingBox!.min.y).toBeGreaterThan(-.025);
    expect(geometry.boundingBox!.max.y).toBeLessThan(.9);
    expect(lightest - darkest).toBeGreaterThan(.4);
    geometry.dispose();
  });

  it('retains a visible shrub mass and true gaps through its upper crown from different sides', () => {
    const geometry = sharptailShrubGeometry(), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material), ray = new THREE.Raycaster();
    const eye = new THREE.Vector3(), direction = new THREE.Vector3(), side = new THREE.Vector3();
    for (const yaw of [0, .8, Math.PI / 2]) {
      direction.set(Math.sin(yaw), 0, Math.cos(yaw)); side.set(direction.z, 0, -direction.x);
      let hits = 0, innerGaps = 0, innerSamples = 0;
      for (let row = 0; row < 20; row++) {
        const occupied: boolean[] = [];
        for (let column = 0; column < 25; column++) {
          eye.copy(side).multiplyScalar(-.4 + column * .8 / 24).addScaledVector(direction, -2);
          eye.y = .24 + row * .51 / 19;
          ray.set(eye, direction); occupied.push(ray.intersectObject(mesh).length > 0);
        }
        const first = occupied.indexOf(true), last = occupied.lastIndexOf(true);
        hits += occupied.filter(Boolean).length;
        if (first >= 0) for (let i = first; i <= last; i++) { innerSamples++; if (!occupied[i]) innerGaps++; }
      }
      // These are geometric coverage bounds, not visual acceptance: neither
      // a closed rock-like lobe nor a nearly invisible twig skeleton passes.
      expect(hits / 500).toBeGreaterThan(.15);
      expect(hits / 500).toBeLessThan(.7);
      expect(innerGaps / innerSamples).toBeGreaterThan(.08);
    }
    geometry.dispose(); material.dispose();
  });

  it('gives the small seed husks outward faces for the existing one-sided forb material', () => {
    const geometry = sharptailForbGeometry(), p = geometry.getAttribute('position');
    const faces = Array.from({ length: p.count / 3 }, (_, face) => Array.from({ length: 3 }, (_, j) => new THREE.Vector3().fromBufferAttribute(p, face * 3 + j)));
    const vertexKey = (v: THREE.Vector3) => `${v.x},${v.y},${v.z}`;
    const atVertex = new Map<string, number[]>();
    faces.forEach((face, i) => face.forEach(v => { const key = vertexKey(v), list = atVertex.get(key) ?? []; list.push(i); atVertex.set(key, list); }));
    const visited = new Set<number>(); let husks = 0;
    for (let face = 0; face < faces.length; face++) {
      if (visited.has(face)) continue;
      const queue = [face], component: number[] = [];
      while (queue.length) {
        const i = queue.pop()!; if (visited.has(i)) continue;
        visited.add(i); component.push(i);
        for (const v of faces[i]) queue.push(...atVertex.get(vertexKey(v))!);
      }
      // The closed four-face pieces are seed husks. Branch cylinders and
      // the open/two-sided dry leaves have different connected topology.
      if (component.length !== 4) continue;
      const vertices = new Map(component.flatMap(i => faces[i].map(v => [vertexKey(v), v] as const)));
      if (vertices.size !== 4) continue;
      husks++;
      const center = [...vertices.values()].reduce((sum, v) => sum.add(v), new THREE.Vector3()).multiplyScalar(.25);
      for (const i of component) {
        const [a, b, c] = faces[i];
        const normal = b.clone().sub(a).cross(c.clone().sub(a));
        const faceCenter = a.clone().add(b).add(c).multiplyScalar(1 / 3);
        expect(normal.dot(faceCenter.sub(center))).toBeGreaterThan(0);
      }
    }
    expect(husks).toBeGreaterThanOrEqual(6);
    geometry.dispose();
  });
});
