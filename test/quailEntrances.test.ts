import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { deriveQuailEntrances, deriveQuailParkingPose } from '../src/three/subsystems/quailEntrances';
import { createQuailGate, createQuailTruck } from '../src/three/subsystems/quailLandmarks';
import { LandmarksSystem } from '../src/three/subsystems/landmarks';

const area = getArea('quail-fields');
function vertices(mesh: THREE.Mesh): THREE.Vector3[] {
  const attribute = mesh.geometry.getAttribute('position');
  return Array.from({ length: attribute.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(attribute, i));
}
function meshByMaterial(root: THREE.Group, name: string): THREE.Mesh {
  return root.children.find((child) => child instanceof THREE.Mesh && (child.material as THREE.Material).name === name) as THREE.Mesh;
}
function dispose(root: THREE.Group): void {
  const materials = new Set<THREE.Material>();
  root.traverse((child) => { if (child instanceof THREE.Mesh) { child.geometry.dispose(); materials.add(child.material as THREE.Material); } });
  for (const material of materials) material.dispose();
}

describe('Quail inset entrance lanes', () => {
  it('derives joined lane endpoints without moving shared map geography', () => {
    const before = JSON.stringify(area); const entrances = deriveQuailEntrances(area);
    expect(entrances).toHaveLength(2);
    expect(entrances[0].centerline).toEqual([{ x: 504, y: 700 }, { x: 504, y: 670 }, { x: 504, y: 658 }]);
    expect(entrances[1].centerline).toEqual([{ x: 0, y: 406 }, { x: 30, y: 406 }, { x: 42, y: 406 }]);
    for (const entrance of entrances) {
      for (let i = 0; i < 2; i++) {
        const wing = entrance.insetWingPosts[i]; const hinge = entrance.boundaryGatePosts[i];
        expect(Math.hypot(wing.x - entrance.insetCenter.x, wing.y - entrance.insetCenter.y) * PROPERTY_PX_TO_M).toBeCloseTo(8, 10);
        expect(Math.hypot(hinge.x - entrance.boundaryCenter.x, hinge.y - entrance.boundaryCenter.y) * PROPERTY_PX_TO_M).toBeCloseTo(4.2, 10);
        expect(entrance.laneFences[i]).toEqual({ a: wing, b: hinge });
      }
      expect(entrance.boundaryOpening).toEqual({ a: entrance.boundaryGatePosts[0], b: entrance.boundaryGatePosts[1] });
    }
    expect(JSON.stringify(area)).toBe(before);
    expect(deriveQuailEntrances(getArea('pheasant-coverts'))).toEqual([]);
  });

  it.each(['south-gate', 'west-track'])('grounds upright gate posts and opens leaves outward from %s', (dropId) => {
    const landscape = new LandscapeModel(area, dropId);
    for (const entrance of deriveQuailEntrances(area)) for (const closed of [false, true]) {
      const center = closed ? entrance.boundaryCenter : entrance.insetCenter;
      const origin = landscape.propertyToWorld(center.x, center.y, { x: 0, z: 0 });
      const height = landscape.heightAtWorld(origin.x, origin.z);
      const c = Math.cos(entrance.yaw), s = Math.sin(entrance.yaw);
      const ground = (x: number, z: number) => landscape.heightAtWorld(origin.x + c * x + s * z, origin.z - s * x + c * z) - height;
      const root = createQuailGate(entrance.insetGateId === 'west-gate', { closed, groundAt: ground });
      const timber = vertices(meshByMaterial(root, 'Quail gate timber'));
      const steel = vertices(meshByMaterial(root, 'Quail gate steel'));
      expect(root.children).toHaveLength(3);
      for (const x of closed ? [-4.2, 4.2] : [-8, -4.2, 4.2, 8]) {
        const post = timber.filter((p) => Math.abs(p.x - x) < .091);
        const bottom = Math.min(...post.map((p) => p.y));
        const tips = post.filter((p) => Math.abs(p.y - bottom) < 1e-5);
        expect(tips.length).toBeGreaterThan(3);
        for (const p of tips) {
          expect(p.y - ground(p.x, p.z)).toBeLessThan(-.05);
          expect(p.y - ground(p.x, p.z)).toBeGreaterThan(-.09);
        }
      }
      for (const p of steel) expect(p.y - ground(p.x, p.z)).toBeGreaterThan(.1);
      if (closed) {
        expect(Math.max(...steel.map((p) => Math.abs(p.z)))).toBeLessThan(.04);
        const left = steel.filter((p) => p.x < 0); const right = steel.filter((p) => p.x > 0);
        expect(Math.min(...right.map((p) => p.x)) - Math.max(...left.map((p) => p.x))).toBeLessThan(.4);
        expect(Math.max(...left.map((p) => p.y))).toBeCloseTo(Math.max(...right.map((p) => p.y)), 5);
      } else {
        // Actual merged leaves leave the 3.8m track clear, and project toward
        // the derived boundary rather than toward the parked truck.
        expect(Math.min(...steel.map((p) => Math.abs(p.x)))).toBeGreaterThan(2);
        const outward = new THREE.Vector2(entrance.boundaryCenter.x - center.x, entrance.boundaryCenter.y - center.y).normalize();
        const projected = steel.map((p) => (c * p.x + s * p.z) * outward.x + (-s * p.x + c * p.z) * outward.y);
        expect(Math.min(...projected)).toBeGreaterThan(-.04);
        expect(Math.max(...projected)).toBeGreaterThan(3);
      }
      dispose(root);
    }
  });

  it.each(['south-gate', 'west-track'])('seats actual tyre contacts without changing truck XZ from %s', (dropId) => {
    const landscape = new LandscapeModel(area, dropId); const drop = landscape.dropPoint;
    const origin = landscape.propertyToWorld(drop.position.x - Math.cos(drop.heading) * 6, drop.position.y - Math.sin(drop.heading) * 6, { x: 0, z: 0 });
    const height = landscape.heightAtWorld(origin.x, origin.z); const c = Math.cos(-drop.heading), s = Math.sin(-drop.heading);
    const ground = (x: number, z: number) => landscape.heightAtWorld(origin.x + c * x + s * z, origin.z - s * x + c * z) - height;
    const truck = createQuailTruck(ground); const flat = createQuailTruck();
    const rubber = truck.children.find((mesh) => mesh instanceof THREE.Mesh && (mesh.material as THREE.MeshStandardMaterial).color.getHex() === 0x252b29) as THREE.Mesh;
    const points = vertices(rubber);
    for (const x of [-.99, .99]) for (const z of [-1.42, 1.53]) {
      const tyre = points.filter((p) => Math.abs(p.x - x) < .14 && Math.abs(p.z - z) < .46);
      const bottom = Math.min(...tyre.map((p) => p.y));
      const contact = tyre.filter((p) => Math.abs(p.y - bottom) < 1e-5);
      expect(contact.length).toBeGreaterThan(1);
      for (const p of contact) {
        expect(p.y - ground(p.x, p.z)).toBeLessThan(.005);
        expect(p.y - ground(p.x, p.z)).toBeGreaterThan(-.02);
      }
    }
    truck.children.forEach((mesh, n) => {
      const a = vertices(mesh as THREE.Mesh); const b = vertices(flat.children[n] as THREE.Mesh);
      a.forEach((p, i) => { expect(p.x).toBe(b[i].x); expect(p.z).toBe(b[i].z); });
    });
    dispose(truck); dispose(flat);
  });

  it('integrates closed boundary gates and matching collisions without obstructing the open center lanes', () => {
    const landscape = new LandscapeModel(area); const scene = new THREE.Scene();
    const hunt = { areaConfig: () => area, dropPoint: () => landscape.dropPoint,
      simToWorld: (x: number, y: number, out: { x: number; z: number }) => landscape.propertyToWorld(x, y, out),
      truckWorld: (out: { x: number; z: number }) => {
        const p = deriveQuailParkingPose(area, landscape.dropPoint.id)!.position;
        return landscape.propertyToWorld(p.x, p.y, out);
      } };
    const terrain = { heightAt: (x: number, z: number) => landscape.heightAtWorld(x, z) };
    const ctx = { scene, get: (id: string) => id === 'hunt3d' ? hunt : terrain } as unknown as Ctx;
    const landmarks = new LandmarksSystem(); landmarks.init(ctx);
    expect(scene.children.filter((child) => child.name === 'Closed property service gate')).toHaveLength(2);
    for (const entrance of deriveQuailEntrances(area)) {
      const outer = landscape.propertyToWorld(entrance.boundaryCenter.x, entrance.boundaryCenter.y, { x: 0, z: 0 });
      expect(landmarks.collisionCircles().some((circle) => Math.hypot(circle.x - outer.x, circle.z - outer.z) < circle.radius + .32)).toBe(true);
      const gate = landscape.propertyToWorld(entrance.insetCenter.x, entrance.insetCenter.y, { x: 0, z: 0 });
      const c = Math.cos(entrance.yaw), s = Math.sin(entrance.yaw);
      for (const side of [-1, 1]) {
        const wing = { x: gate.x + c * side * 6, z: gate.z - s * side * 6 };
        expect(landmarks.collisionCircles().some((circle) => Math.hypot(circle.x - wing.x, circle.z - wing.z) < circle.radius + .32)).toBe(true);
      }
      for (let along = -3; along <= 3; along += .5) for (const across of [-1.5, 0, 1.5]) {
        const p = { x: gate.x + c * across + s * along, z: gate.z - s * across + c * along };
        expect(landmarks.collisionCircles().some((circle) => Math.hypot(circle.x - p.x, circle.z - p.z) < circle.radius + .32)).toBe(false);
      }
    }
    landmarks.dispose(ctx);
  });
});
