import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import { deriveQuailEntrances } from '../src/three/subsystems/quailEntrances';
import { buildQuailTrackGeometry, quailTrackDistanceAt, quailTrackNetwork } from '../src/three/subsystems/quailTracks';
import { buildQuailFenceGeometry } from '../src/three/subsystems/quailFences';

const area = getArea('quail-fields');

describe('Quail connected roads and entrances', () => {
  it('continues both approach roads and the windmill service bend without changing shared geography', () => {
    const shared = JSON.stringify(area);
    const network = quailTrackNetwork(area);
    expect(network.branches).toEqual(expect.arrayContaining([{ x: 540, y: 469 }, { x: 660, y: 336 }]));
    expect(network.branches).toHaveLength(2);
    for (const entrance of deriveQuailEntrances(area)) {
      expect(network.paths.some(path => [path[0], path.at(-1)!].some(p => p.x === entrance.boundaryCenter.x && p.y === entrance.boundaryCenter.y))).toBe(true);
      expect(network.paths.some(path => path.some((p, i) => i > 0 && i < path.length - 1 && p.x === entrance.dropCenter.x && p.y === entrance.dropCenter.y))).toBe(true);
      for (const p of entrance.centerline) expect(quailTrackDistanceAt(area, p.x, p.y)).toBeLessThan(1e-8);
    }
    const windmill = area.trails.find(t => t.id === 'windmill-track')!.points.at(-1)!;
    expect(network.paths.some(path => path.some((p, i) => i > 0 && i < path.length - 1 && p.x === windmill.x && p.y === windmill.y))).toBe(true);
    expect(JSON.stringify(area)).toBe(shared);
  });

  it('uses a single opaque worn surface over faded ribbon ends at each branch', () => {
    const landscape = new LandscapeModel(area), geometry = buildQuailTrackGeometry(landscape);
    const positions = geometry.getAttribute('position'), colors = geometry.getAttribute('color');
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), bary = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      expect(Number.isFinite(positions.getX(i) + positions.getY(i) + positions.getZ(i))).toBe(true);
      expect(colors.getW(i)).toBeGreaterThanOrEqual(0); expect(colors.getW(i)).toBeLessThanOrEqual(1);
    }
    for (const branch of quailTrackNetwork(area).branches) for (const [dx, dy] of [[.23, .31], [-.41, .27], [.29, -.37]]) {
      const world = landscape.propertyToWorld(branch.x + dx, branch.y + dy, { x: 0, z: 0 });
      ray.set(new THREE.Vector3(world.x, 100, world.z), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObject(mesh).map(hit => {
        const face = hit.face!;
        a.fromBufferAttribute(positions, face.a); b.fromBufferAttribute(positions, face.b); c.fromBufferAttribute(positions, face.c);
        THREE.Triangle.getBarycoord(hit.point, a, b, c, bary);
        return colors.getW(face.a) * bary.x + colors.getW(face.b) * bary.y + colors.getW(face.c) * bary.z;
      });
      expect(hits.filter(alpha => alpha > .99)).toHaveLength(1);
      expect(hits.filter(alpha => alpha > .001 && alpha < .99)).toHaveLength(0);
    }
    geometry.dispose(); material.dispose();
  });

  it.each(['south-gate', 'west-track'])('connects terrain-following fence wires while leaving gate openings from %s', drop => {
    const landscape = new LandscapeModel(area, drop), fence = buildQuailFenceGeometry(landscape);
    const positions = fence.wires.getAttribute('position'), openings = deriveQuailEntrances(area).map(e => e.boundaryOpening);
    for (let i = 0; i < positions.count; i += 2) {
      const x = (positions.getX(i) + positions.getX(i + 1)) / 2, z = (positions.getZ(i) + positions.getZ(i + 1)) / 2;
      const point = landscape.worldToProperty(x, z, { x: 0, y: 0 });
      for (const { a, b } of openings) {
        const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
        const along = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (length * length);
        const across = Math.abs((point.x - a.x) * dy - (point.y - a.y) * dx) / length;
        expect(across < .001 && along > .001 && along < .999, 'No perimeter wire may span the service gate').toBe(false);
      }
      for (const n of [i, i + 1]) {
        const clearance = positions.getY(n) - landscape.heightAtWorld(positions.getX(n), positions.getZ(n));
        expect(Math.min(...[.52, .93, 1.22].map(h => Math.abs(clearance - h)))).toBeLessThan(.0001);
      }
    }
    for (const entrance of deriveQuailEntrances(area)) for (const { a, b } of entrance.laneFences) {
      const length = Math.hypot(b.x - a.x, b.y - a.y) * PROPERTY_PX_TO_M;
      for (let distance = 0; distance <= length; distance += .1) {
        const t = distance / length;
        const p = landscape.propertyToWorld(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, { x: 0, z: 0 });
        const nearest = Math.min(...fence.laneObstacles.map(o => Math.hypot(p.x - o.x, p.z - o.z) - o.radius));
        expect(nearest).toBeLessThan(.32); // Hunter collision radius: no walk-through gaps.
      }
    }
    fence.wires.dispose();
  });
});
