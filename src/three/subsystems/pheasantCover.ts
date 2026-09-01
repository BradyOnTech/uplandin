import * as THREE from 'three';
import type { GroundSample, LandscapeModel } from '../../game/landscape';
import { PROPERTY_PX_TO_M } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';

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

function habitatGeometry(kind: 'prairie' | 'cattail' | 'stubble'): THREE.BufferGeometry {
  const rng = mulberry32(kind === 'prairie' ? 0x51a7 : kind === 'cattail' ? 0xca77 : 0x57bb1e);
  const positions: number[] = [];
  const colors: number[] = [];
  const push = (vertices: number[], color: THREE.Color): void => {
    positions.push(...vertices);
    for (let i = 0; i < vertices.length / 3; i++) colors.push(color.r, color.g, color.b);
  };
  // Instance tinting multiplies these vertex colors, so keep the blades light.
  // The variation belongs in the instance palette, not in nearly-black stems.
  const straw = new THREE.Color(0xfff0c2);
  const olive = new THREE.Color(0xcdd09f);
  const reed = new THREE.Color(0xe8d7a2);
  const head = new THREE.Color(0x7a5231);

  const count = kind === 'prairie' ? 24 : kind === 'cattail' ? 13 : 16;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.42;
    const sx = Math.sin(angle);
    const sz = Math.cos(angle);
    const px = Math.cos(angle);
    const pz = -Math.sin(angle);
    const root = rng() * (kind === 'stubble' ? 0.38 : kind === 'cattail' ? 0.5 : 0.78);
    const x = sx * root;
    const z = sz * root;
    const width = kind === 'cattail' ? 0.012 : 0.009 + rng() * 0.016;
    const height = kind === 'prairie'
      ? 0.55 + rng() * 0.55
      : kind === 'cattail'
        ? 0.9 + rng() * 0.52
        : 0.11 + rng() * 0.22;
    const lean = kind === 'stubble' ? 0.015 : 0.08 + rng() * (kind === 'cattail' ? 0.18 : 0.34);
    const curve = (rng() - 0.5) * (kind === 'cattail' ? 0.08 : 0.28);
    const tone = kind === 'cattail'
      ? reed.clone().lerp(straw, rng() * 0.22)
      : straw.clone().lerp(olive, rng() * (kind === 'stubble' ? 0.2 : 0.42));
    const midX = x + sx * lean * 0.34 + px * curve * 0.35;
    const midZ = z + sz * lean * 0.34 + pz * curve * 0.35;
    const tipX = x + sx * lean + px * curve;
    const tipZ = z + sz * lean + pz * curve;
    const midY = height * 0.54;
    // Three tapered facets give the blade a visible lower body and a bent
    // silhouette. One root-to-tip triangle reduced prairie to toothpicks.
    push([
      x - px * width, 0, z - pz * width,
      x + px * width, 0, z + pz * width,
      midX + px * width * 0.55, midY, midZ + pz * width * 0.55,
      x - px * width, 0, z - pz * width,
      midX + px * width * 0.55, midY, midZ + pz * width * 0.55,
      midX - px * width * 0.55, midY, midZ - pz * width * 0.55,
      midX - px * width * 0.55, midY, midZ - pz * width * 0.55,
      midX + px * width * 0.55, midY, midZ + pz * width * 0.55,
      tipX, height, tipZ,
    ], tone);

    const seeded = kind === 'cattail' || (kind === 'prairie' && i % 5 === 0);
    if (!seeded) continue;
    const hw = kind === 'cattail' ? 0.032 : 0.021;
    const hh = kind === 'cattail' ? 0.14 : 0.09;
    const cy = height - hh * 0.35;
    const cx = tipX;
    const cz = tipZ;
    push([
      cx - px * hw, cy - hh * 0.5, cz - pz * hw,
      cx + px * hw, cy - hh * 0.5, cz + pz * hw,
      cx + px * hw * 0.72, cy + hh * 0.5, cz + pz * hw * 0.72,
      cx - px * hw, cy - hh * 0.5, cz - pz * hw,
      cx + px * hw * 0.72, cy + hh * 0.5, cz + pz * hw * 0.72,
      cx - px * hw * 0.72, cy + hh * 0.5, cz - pz * hw * 0.72,
    ], kind === 'cattail' ? head : tone.clone().multiplyScalar(0.68));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Prairie grass, grain stubble, and genuine wet-cover reeds for Cattail Coverts. */
export class PheasantCoverSystem implements Subsystem {
  readonly id = 'grass';
  private objects: THREE.InstancedMesh[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private surface: GroundSample = {
    height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0,
  };
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
    const prairieGeo = habitatGeometry('prairie');
    const cattailGeo = habitatGeometry('cattail');
    const stubbleGeo = habitatGeometry('stubble');
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 1,
      emissive: 0x7a6335,
      emissiveIntensity: 0.12,
    });
    this.geometries.push(prairieGeo, cattailGeo, stubbleGeo);
    this.materials.push(material);

    const prairie = this.instanced(prairieGeo, material, high ? 16000 : 7200);
    const cattails = this.instanced(cattailGeo, material, high ? 6200 : 2600);
    const stubble = this.instanced(stubbleGeo, material, high ? 6200 : 2800);
    const patches = ctx.get<HuntCoverQuery>('hunt3d').coverPatches();
    const radius = 236;
    const stepM = high ? 2.15 : 3.05;
    const stepProperty = stepM / PROPERTY_PX_TO_M;
    const minProperty = this.landscape.worldToProperty(-radius, -radius, { x: 0, y: 0 });
    const maxProperty = this.landscape.worldToProperty(radius, radius, { x: 0, y: 0 });
    const minCellX = Math.floor(minProperty.x / stepProperty);
    const maxCellX = Math.ceil(maxProperty.x / stepProperty);
    const minCellY = Math.floor(minProperty.y / stepProperty);
    const maxCellY = Math.ceil(maxProperty.y / stepProperty);
    const straw = new THREE.Color(0xffd995);
    const amber = new THREE.Color(0xd89b55);
    const olive = new THREE.Color(0xb6b16e);
    const reed = new THREE.Color(0xc8b474);
    let prairieCount = 0;
    let cattailCount = 0;
    let stubbleCount = 0;

    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
        const rng = mulberry32(cellSeed(cellX, cellY, this.landscape.area.terrain.seed));
        const propertyX = (cellX + 0.1 + rng() * 0.8) * stepProperty;
        const propertyY = (cellY + 0.1 + rng() * 0.8) * stepProperty;
        if (
          propertyX < this.landscape.area.world.x || propertyY < this.landscape.area.world.y
          || propertyX > this.landscape.area.world.x + this.landscape.area.world.w
          || propertyY > this.landscape.area.world.y + this.landscape.area.world.h
        ) continue;
        this.landscape.propertyToWorld(propertyX, propertyY, this.world);
        const x = this.world.x;
        const z = this.world.z;
        if (Math.abs(x) > radius || Math.abs(z) > radius || Math.hypot(x, z - 40) < 3.2) continue;
        const surface = this.landscape.surfaceAtWorld(x, z, this.surface);
        let cover = 0;
        for (const patch of patches) {
          const dx = (x - patch.cx) / Math.max(1, patch.hx);
          const dz = (z - patch.cz) / Math.max(1, patch.hz);
          cover = Math.max(cover, 1 - Math.min(1, Math.hypot(dx, dz)));
        }

        // Cattails belong to actual wet depressions. Dense dry cover is grass,
        // otherwise the whole prairie reads as a regiment of brown posts.
        const wetChance = Math.max(0, surface.moisture - 0.32) * 1.15 + cover * surface.moisture * 0.18;
        if (cattailCount < cattails.count && wetChance > 0.16 && rng() < wetChance) {
          const vigor = 0.78 + surface.moisture * 0.42 + cover * 0.32 + rng() * 0.28;
          const reedBedY = surface.height + Math.max(0, surface.moisture * 2.7 - 0.4);
          this.write(cattails, cattailCount++, x, reedBedY, z, vigor, rng);
          this.color.copy(reed).lerp(amber, 0.18 + rng() * 0.34).multiplyScalar(0.88 + rng() * 0.2);
          cattails.setColorAt(cattailCount - 1, this.color);
          continue;
        }

        const fieldStripe = 0.5 + 0.5 * Math.sin(propertyX * 0.075 + Math.floor(propertyY / 72) * 1.7);
        const stubbleChance = surface.moisture < 0.38 && cover < 0.2 ? 0.1 + fieldStripe * 0.24 : 0;
        if (stubbleCount < stubble.count && rng() < stubbleChance) {
          const vigor = 0.72 + rng() * 0.5;
          this.write(stubble, stubbleCount++, x, surface.height - 0.02, z, vigor, rng);
          this.color.copy(straw).lerp(amber, 0.16 + rng() * 0.25).multiplyScalar(0.92 + rng() * 0.16);
          stubble.setColorAt(stubbleCount - 1, this.color);
        }

        const grassChance = 0.58 + surface.vegetation * 0.22 + cover * 0.14 - surface.moisture * 0.04;
        if (prairieCount < prairie.count && rng() < grassChance) {
          const vigor = 0.6 + surface.vegetation * 0.24 + cover * 0.42 + rng() * 0.28;
          this.write(prairie, prairieCount++, x, surface.height - 0.035, z, vigor, rng);
          this.color.copy(straw).lerp(olive, surface.moisture * 0.42 + rng() * 0.2).lerp(amber, rng() * 0.16);
          this.color.multiplyScalar(0.91 + rng() * 0.18);
          prairie.setColorAt(prairieCount - 1, this.color);
        }
      }
    }

    this.finish(prairie, prairieCount);
    this.finish(cattails, cattailCount);
    this.finish(stubble, stubbleCount);
    ctx.scene.add(prairie, cattails, stubble);
    this.objects.push(prairie, cattails, stubble);
  }

  private instanced(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  private write(
    mesh: THREE.InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    vigor: number,
    rng: () => number,
  ): void {
    this.position.set(x, y, z);
    this.euler.set((rng() - 0.5) * 0.06, rng() * Math.PI * 2, (rng() - 0.5) * 0.06);
    this.rotation.setFromEuler(this.euler);
    this.scale.set(vigor * (0.86 + rng() * 0.3), vigor, vigor * (0.86 + rng() * 0.3));
    mesh.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
  }

  private finish(mesh: THREE.InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (count > 0) mesh.computeBoundingSphere();
  }

  dispose(ctx: Ctx): void {
    for (const object of this.objects) {
      ctx.scene.remove(object);
      object.dispose();
    }
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.objects.length = 0;
    this.geometries.length = 0;
    this.materials.length = 0;
  }
}
