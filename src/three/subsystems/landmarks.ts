import * as THREE from 'three';
import type { AreaLandmark } from '../../game/areas';
import type { Ctx, Subsystem } from '../engine';
import type { Hunt3DSystem } from './hunt3d';
import { SIM_PX_TO_M } from './hunt3d';
import type { TerrainSystem } from './terrain';

const MAT = {
  wood: new THREE.MeshStandardMaterial({ color: 0x6d5134, roughness: 1, flatShading: true }),
  metal: new THREE.MeshStandardMaterial({ color: 0x9a9a8b, roughness: 0.85, flatShading: true }),
  wall: new THREE.MeshStandardMaterial({ color: 0x7f3828, roughness: 1, flatShading: true }),
  roof: new THREE.MeshStandardMaterial({ color: 0x3e332e, roughness: 1, flatShading: true }),
  water: new THREE.MeshStandardMaterial({ color: 0x4d8292, roughness: 0.4, transparent: true, opacity: 0.82 }),
  truck: new THREE.MeshStandardMaterial({ color: 0x345044, roughness: 0.9, flatShading: true }),
  tire: new THREE.MeshStandardMaterial({ color: 0x171916, roughness: 1 }),
};

function box(parent: THREE.Object3D, size: [number, number, number], pos: [number, number, number], material = MAT.wood): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...pos);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Code-native low-poly landmarks projected from the shared covert map. */
export class LandmarksSystem implements Subsystem {
  readonly id = 'landmarks';

  init(ctx: Ctx): void {
    const hunt = ctx.get<Hunt3DSystem>('hunt3d');
    const terrain = ctx.get<TerrainSystem>('terrain');
    for (const landmark of hunt.areaConfig().landmarks) {
      const world = hunt.simToWorld(landmark.position.x, landmark.position.y, { x: 0, z: 0 });
      const root = this.buildLandmark(landmark);
      root.position.set(world.x, terrain.heightAt(world.x, world.z), world.z);
      ctx.scene.add(root);
    }

    const drop = hunt.dropPoint();
    const world = hunt.truckWorld({ x: 0, z: 0 });
    const truck = this.buildTruck();
    truck.position.set(world.x, terrain.heightAt(world.x, world.z), world.z);
    truck.rotation.y = -drop.heading;
    ctx.scene.add(truck);
  }

  private buildLandmark(landmark: AreaLandmark): THREE.Group {
    const root = new THREE.Group();
    if (landmark.kind === 'pond') {
      const water = new THREE.Mesh(new THREE.CircleGeometry(7, 12), MAT.water);
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.03;
      root.add(water);
      return root;
    }
    if (landmark.kind === 'barn') {
      box(root, [7, 3.8, 5], [0, 1.9, 0], MAT.wall);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.2, 4), MAT.roof);
      roof.position.y = 4.7;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      root.add(roof);
      return root;
    }
    if (landmark.kind === 'windmill') {
      box(root, [0.25, 7, 0.25], [0, 3.5, 0], MAT.metal);
      const wheel = new THREE.Group();
      wheel.position.set(0, 7, 0);
      for (let i = 0; i < 8; i++) {
        const blade = box(wheel, [0.13, 4.2, 0.08], [0, 2.1, 0], MAT.metal);
        blade.rotation.z = i * Math.PI / 4;
      }
      wheel.rotation.y = Math.PI / 2;
      root.add(wheel);
      return root;
    }
    const length = landmark.kind === 'fence' ? 12 : 5;
    box(root, [0.25, 2.4, 0.25], [-length / 2, 1.2, 0]);
    box(root, [0.25, 2.4, 0.25], [length / 2, 1.2, 0]);
    box(root, [length, 0.2, 0.2], [0, 0.8, 0]);
    box(root, [length, 0.2, 0.2], [0, 1.75, 0]);
    return root;
  }

  private buildTruck(): THREE.Group {
    const root = new THREE.Group();
    box(root, [2.1, 1.2, 4.5], [0, 1.05, 0], MAT.truck);
    box(root, [2, 1.1, 1.7], [0, 2, -1], MAT.truck);
    for (const x of [-1.05, 1.05]) {
      for (const z of [-1.35, 1.35]) {
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10), MAT.tire);
        tire.rotation.z = Math.PI / 2;
        tire.position.set(x, 0.55, z);
        root.add(tire);
      }
    }
    root.scale.setScalar(Math.min(1, SIM_PX_TO_M));
    return root;
  }
}
