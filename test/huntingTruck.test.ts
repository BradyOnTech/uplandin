import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { createHuntingTruck } from '../src/three/subsystems/huntingTruck';
import { LandmarksSystem } from '../src/three/subsystems/landmarks';
import { deriveQuailParkingPose } from '../src/three/subsystems/quailEntrances';

function meshes(root: THREE.Object3D) {
  const result: THREE.Mesh[] = []; root.traverse(object => { if (object instanceof THREE.Mesh) result.push(object); }); return result;
}
function dispose(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  for (const mesh of meshes(root)) { mesh.geometry.dispose(); materials.add(mesh.material as THREE.Material); }
  for (const material of materials) material.dispose();
}

describe('shared hunting pickup and dog box', () => {
  it('keeps a small material-batched asset with a passable hinged exit and supported foot anchors', () => {
    const truck = createHuntingTruck();
    try {
      const parts = meshes(truck.root);
      expect(parts).toHaveLength(5); expect(new Set(parts.map(mesh => mesh.material)).size).toBe(3);
      expect(parts.reduce((sum, mesh) => sum + mesh.geometry.index!.count / 3, 0)).toBeLessThan(2500);
      truck.root.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(.26, 1.38, 3), new THREE.Vector3(0, 0, -1), 0, 1.15);
      expect(ray.intersectObject(truck.crateDoor, true).length).toBeGreaterThan(0);
      truck.setRelease({ crateDoor: 1, tailgate: 1 });
      expect(ray.intersectObject(truck.crateDoor, true)).toHaveLength(0);
      expect(ray.intersectObject(truck.root, true)).toHaveLength(0);
      for (const name of ['crateFloor', 'boxThreshold', 'tailgateEdge'] as const) {
        const p = truck.localSite[name];
        ray.set(new THREE.Vector3(p.x, p.y + .2, p.z), new THREE.Vector3(0, -1, 0)); ray.far = .3;
        const hit = ray.intersectObject(truck.root, true)[0];
        expect(hit, name).toBeDefined(); expect(Math.abs(hit.point.y - p.y), name).toBeLessThan(.01);
      }
      const hinges = [truck.crateDoor.position.clone(), truck.tailgate.position.clone()];
      truck.setRelease({ crateDoor: -1, tailgate: -1 });
      expect(truck.crateDoor.rotation.y).toBeCloseTo(0, 10); expect(truck.tailgate.rotation.x).toBeCloseTo(0, 10);
      expect(truck.crateDoor.position).toEqual(hinges[0]); expect(truck.tailgate.position).toEqual(hinges[1]);
    } finally { dispose(truck.root); }
  });

  const cases = ['quail-fields', 'pheasant-coverts', 'chukar-ridge', 'sharptail-prairie'].flatMap(areaId =>
    getArea(areaId).dropPoints.flatMap(drop => (['high', 'lite'] as const).map(quality => ({ areaId, dropId: drop.id, quality }))));
  it.each(cases)('grounds wheel contacts and the released dog without moving parking or solids at $areaId / $dropId / $quality', ({ areaId, dropId, quality }) => {
    const area = getArea(areaId), landscape = new LandscapeModel(area, dropId), drop = landscape.dropPoint;
    const parking = deriveQuailParkingPose(area, dropId);
    const position = parking?.position ?? { x: drop.position.x - Math.cos(drop.heading) * 6, y: drop.position.y - Math.sin(drop.heading) * 6 };
    const expected = landscape.propertyToWorld(position.x, position.y, { x: 0, z: 0 });
    const hunt = { areaConfig: () => area, dropPoint: () => drop,
      simToWorld: (x: number, y: number, out: { x: number; z: number }) => landscape.propertyToWorld(x, y, out),
      truckWorld: (out: { x: number; z: number }) => Object.assign(out, expected) };
    const system = new LandmarksSystem(), ctx = { scene: new THREE.Scene(), quality, time: 0,
      get: (id: string) => id === 'hunt3d' ? hunt : { heightAt: (x: number, z: number) => landscape.heightAtWorld(x, z) } } as unknown as Ctx;
    system.init(ctx); ctx.scene.updateMatrixWorld(true);
    const truck = ctx.scene.children.at(-1)!, truckParts = meshes(truck);
    const geometryDisposals = truckParts.map(mesh => vi.spyOn(mesh.geometry, 'dispose'));
    const materialDisposals = [...new Set(truckParts.map(mesh => mesh.material as THREE.Material))].map(material => vi.spyOn(material, 'dispose'));
    try {
      expect(truck.position.x).toBe(expected.x); expect(truck.position.z).toBe(expected.z);
      expect(truck.rotation.y).toBe(parking?.yaw ?? -drop.heading);
      const site = system.arrivalSite()!; expect(site).toBeDefined();
      expect(site.landing.y).toBeCloseTo(landscape.heightAtWorld(site.landing.x, site.landing.z), 7);
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(truck.quaternion);
      expect(Math.cos(site.releaseHeading)).toBeCloseTo(forward.x, 10);
      expect(Math.sin(site.releaseHeading)).toBeCloseTo(forward.z, 10);
      expect(site.fieldHeading).toBe(drop.heading);
      for (const circle of system.collisionCircles()) {
        expect(Math.hypot(site.landing.x - circle.x, site.landing.z - circle.z)).toBeGreaterThan(circle.radius + .45);
      }
      const tyres = truckParts.find(mesh => mesh.name === 'Hunting pickup tyres')!;
      const positions = tyres.geometry.getAttribute('position');
      for (const x of [-.99, .99]) for (const z of [-1.42, 1.53]) {
        const points = Array.from({ length: positions.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(positions, i))
          .filter(p => Math.abs(p.x - x) < .14 && Math.abs(p.z - z) < .46);
        const bottom = Math.min(...points.map(p => p.y));
        const contacts = points.filter(p => p.y - bottom < 1e-5).map(p => p.applyMatrix4(tyres.matrixWorld));
        expect(contacts.length).toBeGreaterThan(1);
        for (const p of contacts) {
          const gap = p.y - landscape.heightAtWorld(p.x, p.z);
          expect(gap).toBeGreaterThan(-.02); expect(gap).toBeLessThan(.02);
        }
      }
      const solids = JSON.stringify(system.collisionCircles());
      system.setTruckRelease({ crateDoor: 1, tailgate: 1 });
      expect(JSON.stringify(system.collisionCircles())).toBe(solids);
      expect(system.arrivalSite()).toBe(site);
    } finally { system.dispose(ctx); }
    expect(ctx.scene.children).toHaveLength(0); expect(system.arrivalSite()).toBeUndefined();
    geometryDisposals.forEach(spy => expect(spy).toHaveBeenCalledOnce());
    materialDisposals.forEach(spy => expect(spy).toHaveBeenCalledOnce());
  });
});
