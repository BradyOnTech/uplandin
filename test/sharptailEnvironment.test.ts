import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { LandmarksSystem } from '../src/three/subsystems/landmarks';
import { createSharptailLineShack, sharptailShackYardAt, SHARPTAIL_SHACK_RADIUS } from '../src/three/subsystems/sharptailEnvironment';

function meshFor(groundAt?: (x: number, z: number) => number): THREE.Mesh {
  const root = createSharptailLineShack(new THREE.MeshBasicMaterial({ vertexColors: true }), groundAt);
  (root.children[1] as THREE.Mesh).geometry.dispose();
  return root.children[0] as THREE.Mesh;
}

function rayHits(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): boolean {
  const delta = to.clone().sub(from);
  const ray = new THREE.Raycaster(from, delta.clone().normalize(), .001, delta.length());
  mesh.updateMatrixWorld(true);
  return ray.intersectObject(mesh).length > 0;
}

function dispose(mesh: THREE.Mesh): void {
  mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
}

describe('Sharptail Line Shack environment', () => {
  it('keeps the complete static asset inside the existing movement footprint and two mobile draws', () => {
    const material = new THREE.MeshBasicMaterial({ vertexColors: true });
    const groundMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    const root = createSharptailLineShack(material, undefined, groundMaterial);
    expect(root.children).toHaveLength(2);
    let furthest = 0, triangles = 0;
    for (const [index, mesh] of (root.children as THREE.Mesh[]).entries()) {
      expect(mesh.material).toBe(index === 0 ? material : groundMaterial);
      expect(mesh.geometry.groups).toHaveLength(0);
      const positions = mesh.geometry.getAttribute('position');
      triangles += positions.count / 3;
      expect(mesh.geometry.getAttribute('color').count).toBe(positions.count);
      expect(mesh.geometry.getAttribute('normal').count).toBe(positions.count);
      for (let i = 0; i < positions.count; i++) {
        expect(Number.isFinite(positions.getX(i) + positions.getY(i) + positions.getZ(i))).toBe(true);
        furthest = Math.max(furthest, Math.hypot(positions.getX(i), positions.getZ(i)));
      }
      dispose(mesh);
    }
    expect(triangles).toBeLessThanOrEqual(2800);
    expect(furthest).toBeLessThan(SHARPTAIL_SHACK_RADIUS);
  });

  it('roots the worn yard to the grade and shares a bounded grass-wear field without obstructing the access', () => {
    const ground = (x: number, z: number) => .1 * x - .13 * z + Math.cos(x * .2) * .18;
    const root = createSharptailLineShack(new THREE.MeshBasicMaterial({ vertexColors: true }), ground);
    const yard = root.children[1] as THREE.Mesh, positions = yard.geometry.getAttribute('position');
    expect(yard.castShadow).toBe(false);
    expect(yard.userData.shotSolid).toBe(false);
    for (let i = 0; i < positions.count; i++) {
      const offset = positions.getY(i) - ground(positions.getX(i), positions.getZ(i));
      expect(offset).toBeGreaterThan(.02);
      expect(offset).toBeLessThan(.05);
    }
    expect(sharptailShackYardAt(-1.5, 4)).toBeGreaterThan(.9);
    expect(sharptailShackYardAt(4.1, 3.81)).toBeGreaterThan(.9);
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8;
      expect(sharptailShackYardAt(Math.cos(angle) * 7.8, Math.sin(angle) * 7.8)).toBe(0);
    }
    expect(sharptailShackYardAt(0, 16.46)).toBe(0);
    for (const mesh of root.children as THREE.Mesh[]) mesh.geometry.dispose();
    (yard.material as THREE.Material).dispose();
  });

  it.each([
    { name: 'a cross slope', ground: (x: number, z: number) => x * .14 - z * .09 },
    { name: 'a convex shoulder', ground: (x: number, z: number) => .95 * Math.exp(-(x * x + z * z) / 13) - .3 },
  ])('roots foundation edges on $name instead of lifting the building off its ground', ({ ground }) => {
    const mesh = meshFor(ground);
    // Sample just above terrain at each occupied edge. A corner-only floor
    // or a thin floating slab would let these horizontal rays pass beneath it.
    for (const x of [-5.4, -3.8, -1.5, .4, 2.8]) {
      for (const side of [-1, 1]) {
        const z = side * 2.78, y = ground(x, z) + .02;
        expect(rayHits(mesh, new THREE.Vector3(x, y, side * 8), new THREE.Vector3(x, y, 0)), `main edge ${x},${z}`).toBe(true);
      }
    }
    for (const z of [-2, -.4, 1.8]) {
      const y = ground(6, z) + .02;
      expect(rayHits(mesh, new THREE.Vector3(9, y, z), new THREE.Vector3(4.4, y, z)), `shed edge ${z}`).toBe(true);
    }
    dispose(mesh);
  });

  it('has actual closed walls and gables while leaving sky and the outside route shootable', () => {
    const mesh = meshFor();
    expect(rayHits(mesh, new THREE.Vector3(-1, 1.6, 12), new THREE.Vector3(-1, 1.6, -12))).toBe(true);
    expect(rayHits(mesh, new THREE.Vector3(-12, 4.6, 0), new THREE.Vector3(0, 4.6, 0))).toBe(true);
    expect(rayHits(mesh, new THREE.Vector3(10, 1.3, 0), new THREE.Vector3(4.5, 1.3, 0))).toBe(true);
    expect(rayHits(mesh, new THREE.Vector3(4.1, .65, 8), new THREE.Vector3(4.1, .65, 3.81))).toBe(true);
    expect(rayHits(mesh, new THREE.Vector3(-1, 6.8, 12), new THREE.Vector3(-1, 6.8, -12))).toBe(false);
    expect(rayHits(mesh, new THREE.Vector3(8.2, 1.6, 12), new THREE.Vector3(8.2, 1.6, -12))).toBe(false);
    dispose(mesh);
  });

  it('uses the same landmark location and collision authority from either real drop', () => {
    const area = getArea('sharptail-prairie');
    const shack = area.landmarks.find(landmark => landmark.kind === 'barn')!;
    for (const drop of area.dropPoints) {
      const landscape = new LandscapeModel(area, drop.id), scene = new THREE.Scene();
      const world = landscape.propertyToWorld(shack.position.x, shack.position.y, { x: 0, z: 0 });
      const hunt = {
        areaConfig: () => area, dropPoint: () => drop,
        simToWorld: (x: number, y: number, out: { x: number; z: number }) => landscape.propertyToWorld(x, y, out),
        truckWorld: (out: { x: number; z: number }) => landscape.propertyToWorld(drop.position.x, drop.position.y, out),
      };
      const ctx = { scene, quality: 'lite', get: (id: string) => {
        if (id === 'hunt3d') return hunt;
        if (id === 'terrain') return { heightAt: (x: number, z: number) => landscape.heightAtWorld(x, z) };
        throw new Error(id);
      } } as unknown as Ctx;
      const system = new LandmarksSystem(); system.init(ctx);
      const root = scene.getObjectByName('Sharptail Line Shack and working yard')!;
      expect(root).toBeDefined();
      expect(root.position.x).toBeCloseTo(world.x, 8);
      expect(root.position.z).toBeCloseTo(world.z, 8);
      expect(root.position.y).toBeCloseTo(landscape.heightAtWorld(world.x, world.z), 8);
      expect(system.collisionCircles().filter(circle => circle.x === world.x && circle.z === world.z))
        .toEqual([{ ...world, radius: SHARPTAIL_SHACK_RADIUS }]);
      const height = root.position.y + 2;
      expect(system.blocksShot({ x: world.x - 1, y: height, z: world.z + 12 }, { x: world.x - 1, y: height, z: world.z - 12 })).toBe(true);
      expect(system.blocksShot({ x: world.x - 1, y: height + 8, z: world.z + 12 }, { x: world.x - 1, y: height + 8, z: world.z - 12 })).toBe(false);
      system.dispose(ctx);
      expect(scene.children).toHaveLength(0);
      expect(system.collisionCircles()).toHaveLength(0);
    }
  });
});
