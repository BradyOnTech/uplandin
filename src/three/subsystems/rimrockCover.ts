import * as THREE from 'three';
import type { GroundSample, LandscapeModel } from '../../game/landscape';
import { PROPERTY_PX_TO_M } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import { P } from '../palette';

interface CoverPatch {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
}

interface HuntCoverQuery extends Subsystem {
  coverPatches(): readonly CoverPatch[];
}

function cellSeed(x: number, z: number, seed: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function bunchgrassGeometry(): THREE.BufferGeometry {
  const rng = mulberry32(0x71b2a9);
  const positions: number[] = [];
  for (let i = 0; i < 26; i++) {
    const angle = (i / 26) * Math.PI * 2 + (rng() - 0.5) * 0.32;
    const height = 0.34 + rng() * 0.42;
    const width = 0.011 + rng() * 0.016;
    const root = 0.04 + rng() * 0.24;
    const lean = 0.07 + rng() * 0.23;
    const sx = Math.sin(angle);
    const sz = Math.cos(angle);
    const rx = Math.cos(angle) * width;
    const rz = -Math.sin(angle) * width;
    const bx = sx * root;
    const bz = sz * root;
    const tx = bx + sx * lean;
    const tz = bz + sz * lean;
    positions.push(
      bx - rx, 0, bz - rz,
      bx + rx, 0, bz + rz,
      tx, height, tz,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Sparse Great Basin bunchgrass and sage, registered to property cells. */
export class RimrockCoverSystem implements Subsystem {
  readonly id = 'grass';
  private objects: THREE.Object3D[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private surface: GroundSample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
  private matrix = new THREE.Matrix4();
  private position = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private euler = new THREE.Euler();
  private scale = new THREE.Vector3();
  private color = new THREE.Color();
  private world = { x: 0, z: 0 };

  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    const high = ctx.quality === 'high';
    const grassGeometry = bunchgrassGeometry();
    const sageGeometry = new THREE.DodecahedronGeometry(0.48, 0);
    sageGeometry.scale(1.15, 0.45, 0.95);
    const grassMaterial = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      vertexColors: false,
      side: THREE.DoubleSide,
    });
    const sageMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      flatShading: true,
      emissive: P.rimrockSage,
      emissiveIntensity: 0.12,
    });
    this.geometries.push(grassGeometry, sageGeometry);
    this.materials.push(grassMaterial, sageMaterial);

    const grassCapacity = high ? 9000 : 4200;
    const sageCapacity = high ? 1500 : 700;
    const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, grassCapacity);
    const sage = new THREE.InstancedMesh(sageGeometry, sageMaterial, sageCapacity);
    grass.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(grassCapacity * 3), 3);
    sage.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(sageCapacity * 3), 3);
    grass.receiveShadow = true;
    sage.castShadow = high;
    sage.receiveShadow = true;
    grass.matrixAutoUpdate = false;
    sage.matrixAutoUpdate = false;

    const patches = ctx.get<HuntCoverQuery>('hunt3d').coverPatches();
    const radius = 232;
    const stepM = high ? 2.5 : 3.55;
    const stepProperty = stepM / PROPERTY_PX_TO_M;
    const minProperty = this.landscape.worldToProperty(-radius, -radius, { x: 0, y: 0 });
    const maxProperty = this.landscape.worldToProperty(radius, radius, { x: 0, y: 0 });
    const minCellX = Math.floor(minProperty.x / stepProperty);
    const maxCellX = Math.ceil(maxProperty.x / stepProperty);
    const minCellY = Math.floor(minProperty.y / stepProperty);
    const maxCellY = Math.ceil(maxProperty.y / stepProperty);
    const grassGold = new THREE.Color(P.grassGold);
    const straw = new THREE.Color(P.straw);
    const pale = new THREE.Color(P.strawPale);
    const sageBase = new THREE.Color(P.rimrockSage);
    const sageShade = new THREE.Color(P.rimrockSage).lerp(new THREE.Color(P.straw), 0.18);
    let grassCount = 0;
    let sageCount = 0;

    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
        const rng = mulberry32(cellSeed(cellX, cellY, this.landscape.area.terrain.seed));
        const propertyX = (cellX + 0.12 + rng() * 0.76) * stepProperty;
        const propertyY = (cellY + 0.12 + rng() * 0.76) * stepProperty;
        if (
          propertyX < this.landscape.area.world.x
          || propertyY < this.landscape.area.world.y
          || propertyX > this.landscape.area.world.x + this.landscape.area.world.w
          || propertyY > this.landscape.area.world.y + this.landscape.area.world.h
        ) continue;
        this.landscape.propertyToWorld(propertyX, propertyY, this.world);
        const x = this.world.x;
        const z = this.world.z;
        if (Math.abs(x) > radius || Math.abs(z) > radius || Math.hypot(x, z - 40) < 3.5) continue;
        const surface = this.landscape.surfaceAtWorld(x, z, this.surface);
        let cover = 0;
        for (let i = 0; i < patches.length; i++) {
          const p = patches[i];
          const dx = (x - p.cx) / Math.max(1, p.hx);
          const dz = (z - p.cz) / Math.max(1, p.hz);
          cover = Math.max(cover, 1 - Math.min(1, Math.hypot(dx, dz)));
        }
        if (surface.slope > 0.86 || surface.rockiness > 0.86) continue;

        const grassChance = 0.28 + surface.vegetation * 0.62 + cover * 0.2;
        if (grassCount < grassCapacity && rng() < grassChance) {
          this.position.set(x, surface.height - 0.025, z);
          this.euler.set((rng() - 0.5) * 0.1, rng() * Math.PI * 2, (rng() - 0.5) * 0.1);
          this.rotation.setFromEuler(this.euler);
          const vigor = (0.72 + rng() * 0.48) * (0.78 + surface.vegetation * 0.42 + cover * 0.12);
          this.scale.set(vigor * (0.9 + rng() * 0.34), vigor, vigor * (0.9 + rng() * 0.34));
          grass.setMatrixAt(grassCount, this.matrix.compose(this.position, this.rotation, this.scale));
          this.color.copy(straw).lerp(grassGold, 0.28 + rng() * 0.42);
          if (rng() < 0.16) this.color.lerp(pale, 0.28);
          this.color.multiplyScalar(0.92 + rng() * 0.2);
          grass.setColorAt(grassCount, this.color);
          grassCount++;
        }

        const sageChance = 0.025 + surface.vegetation * 0.1 + cover * 0.19;
        if (sageCount < sageCapacity && rng() < sageChance && surface.rockiness < 0.65) {
          const scale = 0.45 + rng() * 0.95 + cover * 0.35;
          this.position.set(x + (rng() - 0.5) * 1.5, surface.height + 0.18 * scale, z + (rng() - 0.5) * 1.5);
          this.euler.set(0, rng() * Math.PI * 2, 0);
          this.rotation.setFromEuler(this.euler);
          this.scale.set(scale * (0.8 + rng() * 0.45), scale, scale * (0.75 + rng() * 0.4));
          sage.setMatrixAt(sageCount, this.matrix.compose(this.position, this.rotation, this.scale));
          this.color.copy(sageBase).lerp(sageShade, 0.08 + rng() * 0.26).multiplyScalar(0.98 + rng() * 0.2);
          sage.setColorAt(sageCount, this.color);
          sageCount++;
        }
      }
    }

    grass.count = grassCount;
    sage.count = sageCount;
    grass.instanceMatrix.needsUpdate = true;
    sage.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    if (sage.instanceColor) sage.instanceColor.needsUpdate = true;
    grass.computeBoundingSphere();
    sage.computeBoundingSphere();
    ctx.scene.add(grass, sage);
    this.objects.push(grass, sage);
  }

  dispose(ctx: Ctx): void {
    for (const object of this.objects) {
      ctx.scene.remove(object);
      if (object instanceof THREE.InstancedMesh) object.dispose();
    }
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.objects.length = 0;
    this.geometries.length = 0;
    this.materials.length = 0;
  }
}
