import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { createQuailWindmill } from '../src/three/subsystems/quailLandmarks';

const area = getArea('quail-fields');
const feature = area.landmarks.find((landmark) => landmark.kind === 'windmill')!.position;

function vertices(mesh: THREE.Mesh): THREE.Vector3[] {
  const positions = mesh.geometry.getAttribute('position');
  return Array.from({ length: positions.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(positions, i));
}

function materialMesh(root: THREE.Group, name: string): THREE.Mesh {
  return root.children.find((child) => child instanceof THREE.Mesh && (child.material as THREE.Material).name === name) as THREE.Mesh;
}

function dispose(root: THREE.Group): void {
  const materials = new Set<THREE.Material>();
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) { child.geometry.dispose(); materials.add(child.material as THREE.Material); }
  });
  for (const mat of materials) mat.dispose();
}

describe('Quail windmill grounded geometry', () => {
  it.each(['south-gate', 'west-track'])('supports the actual merged tank and all tower feet from %s', (drop) => {
    const landscape = new LandscapeModel(area, drop);
    const origin = landscape.propertyToWorld(feature.x, feature.y, { x: 0, z: 0 });
    const originHeight = landscape.heightAtWorld(origin.x, origin.z);
    const ground = (x: number, z: number) => landscape.heightAtWorld(origin.x + x, origin.z + z) - originHeight;
    const root = createQuailWindmill(ground); root.updateMatrixWorld(true);
    const gravel = materialMesh(root, 'Quail stock tank gravel');
    const footings = materialMesh(root, 'Quail windmill footings');
    const water = materialMesh(root, 'Quail stock tank water');
    expect(gravel).toBeDefined(); expect(footings).toBeDefined();
    const steel = root.children.find((child) => child instanceof THREE.Mesh
      && (child.material as THREE.MeshStandardMaterial).color.getHex() === 0x8f9388) as THREE.Mesh;
    const tank = vertices(steel).filter((p) => p.x > 1.9 && p.y < 1.3);
    expect(tank.length).toBeGreaterThan(30);
    const bottom = Math.min(...tank.map((p) => p.y));
    const bottomRing = tank.filter((p) => Math.abs(p.y - bottom) < 1e-5);
    const ray = new THREE.Raycaster();
    for (const p of bottomRing) {
      ray.set(new THREE.Vector3(p.x, p.y + .1, p.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(gravel)[0];
      expect(hit, 'Each actual metal bottom-ring vertex needs solid support').toBeDefined();
      expect(Math.abs(p.y - hit.point.y)).toBeLessThan(1e-5);
    }
    // Both the water and the rim are horizontal, while the two foundations
    // account for their distinct footprints on the sloping property.
    const waterHeights = vertices(water).map((p) => p.y);
    expect(Math.max(...waterHeights) - Math.min(...waterHeights)).toBeLessThan(1e-6);
    expect(waterHeights[0] - bottom).toBeCloseTo(.52, 5);
    const steelVertices = vertices(steel);
    const supportedFeet: number[] = [];
    for (const x of [-1.15, 1.15]) for (const z of [-1.15, 1.15]) {
      ray.set(new THREE.Vector3(x, 1, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(footings)[0]; expect(hit).toBeDefined();
      const legEnd = steelVertices.filter((p) => Math.hypot(p.x - x, p.z - z) < .075 && p.y < .4);
      expect(legEnd.length).toBeGreaterThan(5);
      const lowest = Math.min(...legEnd.map((p) => p.y));
      expect(lowest).toBeLessThanOrEqual(hit.point.y + .002);
      expect(lowest).toBeGreaterThan(hit.point.y - .02);
      supportedFeet.push(hit.point.y);
    }
    expect(Math.max(...supportedFeet) - Math.min(...supportedFeet)).toBeLessThan(1e-6);
    expect(Math.abs(supportedFeet[0] - bottom)).toBeGreaterThan(.04);
    for (const foundation of [gravel, footings]) {
      const points = vertices(foundation); const top = Math.max(...points.map((p) => p.y));
      const underside = points.filter((p) => p.y < top - .02);
      expect(underside.length).toBeGreaterThan(10);
      for (const p of underside) {
        const clearance = p.y - ground(p.x, p.z);
        expect(clearance).toBeLessThan(-.05);
        expect(clearance).toBeGreaterThan(-.08);
      }
      for (const p of points.filter((p) => Math.abs(p.y - top) < 1e-5)) {
        expect(p.y - ground(p.x, p.z)).toBeGreaterThan(.02);
        expect(p.y - ground(p.x, p.z)).toBeLessThan(.16);
      }
    }
    dispose(root);
  });

  it('retains the rotating wheel, continuous ladder rails and consolidated materials', () => {
    const root = createQuailWindmill(); root.updateMatrixWorld(true);
    const rotor = root.getObjectByName('Quail wind rotor') as THREE.Group;
    expect(rotor.parent).toBe(root); expect(rotor.children).toHaveLength(3);
    expect(root.children.filter((child) => child instanceof THREE.Mesh)).toHaveLength(5);
    const fixed = root.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    const before = fixed.map((mesh) => mesh.geometry.getAttribute('position').array.slice());
    const rotorVertex = (rotor.children[0] as THREE.Mesh).geometry.getAttribute('position');
    const point = new THREE.Vector3().fromBufferAttribute(rotorVertex, 1);
    const original = point.clone().applyMatrix4(rotor.matrixWorld);
    rotor.rotation.z = Math.PI / 3; root.updateMatrixWorld(true);
    expect(point.applyMatrix4(rotor.matrixWorld).distanceTo(original)).toBeGreaterThan(.01);
    fixed.forEach((mesh, i) => expect(mesh.geometry.getAttribute('position').array).toEqual(before[i]));
    // Actual dark-material triangles contain a narrow rail crossing every
    // interval between successive rung ends; the previous isolated bars fail.
    const ladder = fixed.find((mesh) => (mesh.material as THREE.MeshStandardMaterial).color.getHex() === 0x626b61)!;
    const p = vertices(ladder); const index = ladder.geometry.index!;
    const railTriangles = Array.from({ length: index.count / 3 }, (_, n) => [p[index.getX(n * 3)], p[index.getX(n * 3 + 1)], p[index.getX(n * 3 + 2)]]);
    for (const side of [-1, 1]) {
      const rail = railTriangles.filter((tri) => tri.every((v) => Math.abs(v.x - side * .18) < .025)
        && Math.max(...tri.map((v) => v.y)) - Math.min(...tri.map((v) => v.y)) > 8);
      expect(rail.length).toBeGreaterThan(5);
    }
    dispose(root);
  });
});
