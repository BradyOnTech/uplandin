import * as THREE from 'three';
import type { AreaLandmark } from '../../game/areas';
import { PROPERTY_PX_TO_M, LandscapeModel } from '../../game/landscape';
import { createChukarLandmarks } from './chukarLandmarks';
import type { Ctx, Subsystem } from '../engine';
import type { Hunt3DSystem } from './hunt3d';
import type { TerrainSystem } from './terrain';
import { createQuailGate, createQuailTruck, createQuailWindmill } from './quailLandmarks';
import { deriveQuailEntrances, deriveQuailParkingPose, QUAIL_GATE } from './quailEntrances';

const MAT = {
  wood: new THREE.MeshStandardMaterial({ color: 0x6d5134, roughness: 1, flatShading: true }),
  metal: new THREE.MeshStandardMaterial({ color: 0x9a9a8b, roughness: 0.85, flatShading: true }),
  wall: new THREE.MeshStandardMaterial({ color: 0x7f3828, roughness: 1, flatShading: true }),
  roof: new THREE.MeshStandardMaterial({ color: 0x3e332e, roughness: 1, flatShading: true }),
  barnWood: new THREE.MeshStandardMaterial({ color: 0x6a645a, roughness: 1, flatShading: true, emissive: 0x39352f, emissiveIntensity: 0.16 }),
  barnWoodLight: new THREE.MeshStandardMaterial({ color: 0x817666, roughness: 1, flatShading: true, emissive: 0x463f36, emissiveIntensity: 0.18 }),
  barnVoid: new THREE.MeshBasicMaterial({ color: 0x171816 }),
  water: new THREE.MeshStandardMaterial({ color: 0x4d8292, roughness: 0.4, transparent: true, opacity: 0.82 }),
  truck: new THREE.MeshStandardMaterial({ color: 0x345044, roughness: 0.9, flatShading: true }),
  tire: new THREE.MeshStandardMaterial({ color: 0x171916, roughness: 1 }),
};

function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  pos: [number, number, number],
  material: THREE.Material = MAT.wood,
): THREE.Mesh {
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
  private objects: THREE.Object3D[] = [];
  private rotor?: THREE.Object3D;
  private quail = false;
  private chukar?:ReturnType<typeof createChukarLandmarks>;
  private landscape?: LandscapeModel;
  private obstacles: { x: number; z: number; radius: number }[] = [];

  collisionCircles(): readonly { x: number; z: number; radius: number }[] { return this.obstacles; }

  init(ctx: Ctx): void {
    const hunt = ctx.get<Hunt3DSystem>('hunt3d');
    const terrain = ctx.get<TerrainSystem>('terrain');
    this.landscape = new LandscapeModel(hunt.areaConfig());
    this.quail = hunt.areaConfig().id === 'quail-fields';
    if(hunt.areaConfig().id==='chukar-ridge'){
      this.chukar=createChukarLandmarks(new LandscapeModel(hunt.areaConfig(),hunt.dropPoint().id),ctx.quality);
      ctx.scene.add(this.chukar.root);this.obstacles.push(...this.chukar.obstacles);
    }
    const entrances = deriveQuailEntrances(hunt.areaConfig());
    for (const landmark of hunt.areaConfig().landmarks) {
      // Bespoke scenery systems own these compositions. Do not stack the
      // generic landmark primitives on top of their authored wetland, fence,
      // or alder-bottom structures.
      const areaId = hunt.areaConfig().id;
      if ((areaId === 'pheasant-coverts' && (landmark.kind === 'pond' || landmark.kind === 'fence'))
        || (areaId === 'woodcock-bottoms' && landmark.kind === 'pond')) continue;
      const world = hunt.simToWorld(landmark.position.x, landmark.position.y, { x: 0, z: 0 });
      if (this.quail && landmark.kind === 'gate') {
        this.addQuailGate(ctx, terrain, world, landmark.id === 'west-gate', false);
        continue;
      }
      const ground = terrain.heightAt(world.x, world.z);
      const root = this.quail
        ? landmark.kind === 'windmill' ? createQuailWindmill((x, z) => terrain.heightAt(world.x + x, world.z + z) - ground) : this.buildLandmark(landmark)
        : this.buildLandmark(landmark);
      root.position.set(world.x, ground, world.z);
      ctx.scene.add(root);
      this.objects.push(root);
      // The named set pieces are part of the traversable world. Keep the
      // hunter and dog from walking through a hut, corral, or tower on the
      // generic property pass; bespoke Quail/Chukar systems already provide
      // their own more detailed collision shapes.
      if (!this.quail && !this.chukar) {
        const radius = landmark.kind === 'barn' ? 7.8
          : landmark.kind === 'fence' ? 5.2
            : landmark.kind === 'windmill' ? 2.8 : 0;
        if (radius > 0) this.obstacles.push({ x: world.x, z: world.z, radius });
      }
      if (this.quail && landmark.kind === 'windmill') {
        this.rotor = root.getObjectByName('Quail wind rotor');
        this.obstacles.push({ x: world.x, z: world.z, radius: 1.3 }, { x: world.x + 3.35, z: world.z + 0.35, radius: 1.3 });
      }
    }
    for (const entrance of entrances) {
      const world = hunt.simToWorld(entrance.boundaryCenter.x, entrance.boundaryCenter.y, { x: 0, z: 0 });
      this.addQuailGate(ctx, terrain, world, entrance.insetGateId === 'west-gate', true);
    }

    const drop = hunt.dropPoint();
    const world = hunt.truckWorld({ x: 0, z: 0 });
    const ground = terrain.heightAt(world.x, world.z);
    const yaw = deriveQuailParkingPose(hunt.areaConfig(), drop.id)?.yaw ?? -drop.heading;
    const truck = this.quail ? createQuailTruck((x, z) => terrain.heightAt(
      world.x + Math.cos(yaw) * x + Math.sin(yaw) * z,
      world.z - Math.sin(yaw) * x + Math.cos(yaw) * z) - ground) : this.buildTruck();
    truck.position.set(world.x, ground, world.z);
    truck.rotation.y = yaw;
    ctx.scene.add(truck);
    this.objects.push(truck);
    if (this.quail) {
      // Three overlapping circles approximate the truck without an oversized invisible wall.
      for (const offset of [-1.4, 0, 1.4]) this.obstacles.push({ x: world.x + Math.sin(truck.rotation.y) * offset, z: world.z + Math.cos(truck.rotation.y) * offset, radius: 1.08 });
    } else this.obstacles.push({ x: world.x, z: world.z, radius: 2.8 });
  }

  private addQuailGate(ctx: Ctx, terrain: TerrainSystem, world: { x: number; z: number }, west: boolean, closed: boolean): void {
    const yaw = west ? Math.PI / 2 : 0; const c = Math.cos(yaw), s = Math.sin(yaw);
    const ground = terrain.heightAt(world.x, world.z);
    const localToWorld = (x: number, z: number) => ({ x: world.x + c * x + s * z, z: world.z - s * x + c * z });
    const root = createQuailGate(west, { closed, groundAt: (x, z) => {
      const p = localToWorld(x, z); return terrain.heightAt(p.x, p.z) - ground;
    } });
    root.position.set(world.x, ground, world.z); ctx.scene.add(root); this.objects.push(root);
    const { wingHalfWidth: w, hingeHalfWidth: h, leafLength: length, openAngle } = QUAIL_GATE;
    for (const x of closed ? [-h, h] : [-w, -h, h, w]) this.obstacles.push({ ...localToWorld(x, 0), radius: .17 });
    const blockSegment = (ax: number, az: number, bx: number, bz: number) => {
      const count = Math.ceil(Math.hypot(bx - ax, bz - az) / .45);
      for (let n = 0; n <= count; n++) this.obstacles.push({ ...localToWorld(ax + (bx - ax) * n / count, az + (bz - az) * n / count), radius: .09 });
    };
    if (closed) blockSegment(-h, 0, h, 0);
    else for (const side of [-1, 1]) {
      blockSegment(side * h, 0, side * w, 0);
      const angle = side * (west ? -1 : 1) * openAngle;
      blockSegment(side * h, 0, side * (h - length * Math.cos(angle)), side * length * Math.sin(angle));
    }
  }

  update(ctx: Ctx): void {
    if (this.rotor) this.rotor.rotation.z = -ctx.time * 0.32;
  }

  dispose(ctx: Ctx): void {
    this.chukar?.dispose();this.chukar=undefined;
    const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>();
    for (const object of this.objects) {
      ctx.scene.remove(object);
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          geometries.add(child.geometry);
          if (this.quail) for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
        }
      });
    }
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.objects.length = 0; this.obstacles.length = 0; this.rotor = undefined;
    this.landscape = undefined;
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
      const terrainKind = this.landscape?.area.terrain.kind;
      if (terrainKind === 'alpine') return this.buildWarmingHut();
      if (terrainKind === 'woods') return this.buildLoggingShed();
      if (terrainKind === 'oak-savanna') return this.buildPumpHouse();
      box(root, [14, 4.1, 5.8], [0, 2.05, 0], MAT.barnWood);
      for (let i = -6; i <= 6; i++) {
        box(root, [0.08, 4, 0.08], [i, 2.06, 2.94], i % 3 === 0 ? MAT.barnWoodLight : MAT.barnWood);
      }
      const leftRoof = box(root, [14.7, 0.24, 3.8], [0, 4.85, -1.55], MAT.roof);
      leftRoof.rotation.x = -0.48;
      const rightRoof = box(root, [14.7, 0.24, 3.8], [0, 4.85, 1.55], MAT.roof);
      rightRoof.rotation.x = 0.48;
      box(root, [2.5, 3, 0.1], [0, 1.5, 2.96], MAT.barnVoid);
      box(root, [1.25, 1.15, 0.1], [-4.6, 2.4, 2.96], MAT.barnVoid);
      box(root, [1.25, 1.15, 0.1], [4.6, 2.4, 2.96], MAT.barnVoid);
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
    if (landmark.kind === 'fence' && this.landscape?.area.terrain.kind === 'canyon') {
      return this.buildCanyonCorral();
    }
    box(root, [0.25, 2.4, 0.25], [-length / 2, 1.2, 0]);
    box(root, [0.25, 2.4, 0.25], [length / 2, 1.2, 0]);
    box(root, [length, 0.2, 0.2], [0, 0.8, 0]);
    box(root, [length, 0.2, 0.2], [0, 1.75, 0]);
    return root;
  }

  private buildWarmingHut(): THREE.Group {
    const root = new THREE.Group();
    box(root, [9.5, 3.4, 6.2], [0, 1.7, 0], MAT.barnWoodLight);
    const roof = box(root, [10.2, 0.26, 7.1], [0, 3.72, 0], MAT.roof);
    roof.rotation.x = 0.08;
    box(root, [2.1, 2.25, 0.1], [0, 1.15, 3.12], MAT.barnVoid);
    box(root, [0.12, 2.6, 0.12], [-3.6, 1.3, 3.14], MAT.barnWood);
    box(root, [0.12, 2.6, 0.12], [3.6, 1.3, 3.14], MAT.barnWood);
    return root;
  }

  private buildLoggingShed(): THREE.Group {
    const root = new THREE.Group();
    box(root, [11.5, 3.8, 5.4], [0, 1.9, 0], MAT.barnWood);
    const roof = box(root, [12.3, 0.3, 6.4], [0, 4.08, 0], MAT.roof);
    roof.rotation.x = 0.18;
    box(root, [2.4, 2.7, 0.1], [0, 1.35, 2.74], MAT.barnVoid);
    for (let i = -4; i <= 4; i += 2) box(root, [0.08, 3.6, 0.08], [i, 1.85, 2.78], MAT.barnWoodLight);
    return root;
  }

  private buildPumpHouse(): THREE.Group {
    const root = new THREE.Group();
    box(root, [7.6, 3.1, 5.2], [0, 1.55, 0], MAT.barnWoodLight);
    const roof = box(root, [8.4, 0.28, 5.9], [0, 3.3, 0], MAT.roof);
    roof.rotation.x = 0.12;
    box(root, [1.8, 2.1, 0.1], [0, 1.05, 2.64], MAT.barnVoid);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 1.7, 10), MAT.metal);
    tank.position.set(4.8, 0.9, -0.5); tank.castShadow = true; tank.receiveShadow = true; root.add(tank);
    return root;
  }

  private buildCanyonCorral(): THREE.Group {
    const root = new THREE.Group();
    const postPositions: [number, number][] = [[-5.5, -2.8], [5.5, -2.8], [-5.5, 2.8], [5.5, 2.8]];
    for (const [x, z] of postPositions) box(root, [0.26, 2.2, 0.26], [x, 1.1, z], MAT.wood);
    for (const z of [-2.8, 2.8]) {
      box(root, [11.3, 0.18, 0.18], [0, 0.78, z], MAT.wood);
      box(root, [11.3, 0.18, 0.18], [0, 1.62, z], MAT.wood);
    }
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
    root.scale.setScalar(Math.min(1, PROPERTY_PX_TO_M));
    return root;
  }
}
