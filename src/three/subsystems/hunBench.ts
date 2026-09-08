import * as THREE from 'three';
import type { GroundSample, LandscapeModel } from '../../game/landscape';
import { HUNT_WORLD_ANCHOR, PROPERTY_PX_TO_M } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';

interface SlabPlacement {
  x: number;
  z: number;
  y: number;
  length: number;
  depth: number;
  height: number;
  yaw: number;
  color: number;
}

interface SagePlacement {
  x: number;
  z: number;
  y: number;
  scale: number;
  yaw: number;
  color: number;
}

function seeded(seed: number, salt: number): number {
  let value = seed ^ Math.imul(salt, 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  return (value ^ (value >>> 13)) >>> 0;
}

function distanceToAnchor(x: number, z: number): number {
  return Math.hypot(x - HUNT_WORLD_ANCHOR.x, z - HUNT_WORLD_ANCHOR.z);
}

/**
 * Hun benches are open, layered country. The readable geology is a low
 * horizontal shelf beside the contour route, not the tall fractured walls
 * used by Chukar Ridge. One instanced slab and one sage draw keep that
 * vocabulary cheap on the mobile tier.
 */
export class HunBenchSystem implements Subsystem {
  readonly id = 'hun-benches';
  private objects: THREE.Object3D[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private sample: GroundSample = {
    height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0,
  };
  private world = { x: 0, z: 0 };
  private matrix = new THREE.Matrix4();
  private position = new THREE.Vector3();
  private rotation = new THREE.Euler();
  private scale = new THREE.Vector3();
  private color = new THREE.Color();

  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    const area = this.landscape.area;
    const high = ctx.quality === 'high';
    const slabs: SlabPlacement[] = [];
    const sage: SagePlacement[] = [];
    const slabColors = [0xa99570, 0xb9a783, 0x8e8069, 0xc0ae84];
    const sageColors = [0x7b7d5a, 0x8a865d, 0x6c7358];

    for (const [trailIndex, trail] of area.trails.entries()) {
      for (let pointIndex = 1; pointIndex < trail.points.length; pointIndex++) {
        const a = trail.points[pointIndex - 1];
        const b = trail.points[pointIndex];
        const dx = b.x - a.x;
        const dz = b.y - a.y;
        const lengthPx = Math.hypot(dx, dz);
        if (lengthPx < 14) continue;
        const tangentX = dx / lengthPx;
        const tangentZ = dz / lengthPx;
        const normalX = -tangentZ;
        const normalZ = tangentX;
        const midX = (a.x + b.x) * 0.5;
        const midZ = (a.y + b.y) * 0.5;
        const side = (trailIndex + pointIndex) % 2 === 0 ? 1 : -1;
        const offset = 15 + ((trailIndex * 17 + pointIndex * 11) % 17);
        const slabX = midX + normalX * offset * side;
        const slabZ = midZ + normalZ * offset * side;
        this.landscape.propertyToWorld(slabX, slabZ, this.world);
        if (distanceToAnchor(this.world.x, this.world.z) < 20) continue;
        this.landscape.surfaceAtProperty(slabX, slabZ, this.sample);
        const random = mulberry32(seeded(area.terrain.seed, trailIndex * 97 + pointIndex * 31));
        const shelfLength = Math.max(4.8, Math.min(13.5, lengthPx * PROPERTY_PX_TO_M * (.36 + random() * .24)));
        const shelfDepth = 1.15 + random() * 1.45;
        const shelfHeight = .24 + random() * .42;
        slabs.push({
          x: this.world.x,
          z: this.world.z,
          y: this.sample.height + shelfHeight * .42,
          length: shelfLength,
          depth: shelfDepth,
          height: shelfHeight,
          yaw: Math.atan2(tangentZ, tangentX),
          color: slabColors[(trailIndex + pointIndex) % slabColors.length],
        });

        const grassSide = -side;
        for (let tuft = 0; tuft < (high ? 4 : 2); tuft++) {
          const jitter = (random() - .5) * Math.min(14, lengthPx * .18);
          const tuftX = midX + tangentX * jitter + normalX * (offset + 2 + random() * 6) * grassSide;
          const tuftZ = midZ + tangentZ * jitter + normalZ * (offset + 2 + random() * 6) * grassSide;
          this.landscape.propertyToWorld(tuftX, tuftZ, this.world);
          if (distanceToAnchor(this.world.x, this.world.z) < 18) continue;
          this.landscape.surfaceAtProperty(tuftX, tuftZ, this.sample);
          const size = .55 + random() * .62;
          sage.push({
            x: this.world.x,
            z: this.world.z,
            y: this.sample.height + size * .18,
            scale: size,
            yaw: random() * Math.PI * 2,
            color: sageColors[(trailIndex + pointIndex + tuft) % sageColors.length],
          });
        }
      }
    }

    if (slabs.length > 0) {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, vertexColors: true });
      const mesh = new THREE.InstancedMesh(geometry, material, slabs.length);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(slabs.length * 3), 3);
      mesh.castShadow = high;
      mesh.receiveShadow = true;
      for (const [index, slab] of slabs.entries()) {
        this.position.set(slab.x, slab.y, slab.z);
        this.rotation.set(0, -slab.yaw, 0);
        this.scale.set(slab.length, slab.height, slab.depth);
        mesh.setMatrixAt(index, this.matrix.compose(this.position, new THREE.Quaternion().setFromEuler(this.rotation), this.scale));
        mesh.setColorAt(index, this.color.setHex(slab.color));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.name = 'Hun contour bench shelves';
      mesh.computeBoundingSphere();
      ctx.scene.add(mesh);
      this.objects.push(mesh);
      this.geometries.push(geometry);
      this.materials.push(material);
    }

    if (sage.length > 0) {
      const geometry = new THREE.DodecahedronGeometry(1, 0);
      geometry.scale(1.15, .48, .92);
      const material = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, vertexColors: true });
      const mesh = new THREE.InstancedMesh(geometry, material, sage.length);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(sage.length * 3), 3);
      mesh.receiveShadow = true;
      for (const [index, plant] of sage.entries()) {
        this.position.set(plant.x, plant.y, plant.z);
        this.rotation.set(0, plant.yaw, 0);
        this.scale.setScalar(plant.scale);
        mesh.setMatrixAt(index, this.matrix.compose(this.position, new THREE.Quaternion().setFromEuler(this.rotation), this.scale));
        mesh.setColorAt(index, this.color.setHex(plant.color));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.name = 'Hun bench sage islands';
      mesh.computeBoundingSphere();
      ctx.scene.add(mesh);
      this.objects.push(mesh);
      this.geometries.push(geometry);
      this.materials.push(material);
    }
  }

  update(_ctx: Ctx): void { /* static authored set dressing */ }

  dispose(ctx: Ctx): void {
    for (const object of this.objects) ctx.scene.remove(object);
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.objects.length = 0;
    this.geometries.length = 0;
    this.materials.length = 0;
  }
}
