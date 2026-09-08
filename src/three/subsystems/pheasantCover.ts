import * as THREE from 'three';
import type { GroundSample, LandscapeModel } from '../../game/landscape';
import { PROPERTY_PX_TO_M } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';

import { pheasantCoverAt, pheasantFields, samplePheasantHarvest, pheasantPlantClear, pheasantPonds } from './pheasantLandscape';

function cellSeed(x: number, z: number, seed: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function habitatGeometry(kind: 'prairie' | 'cattail' | 'stubble', lite: boolean): THREE.BufferGeometry {
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

  const count = kind === 'prairie' ? (lite ? 10 : 18) : kind === 'cattail' ? (lite ? 5 : 8) : (lite ? 7 : 12);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.42;
    const sx = Math.sin(angle);
    const sz = Math.cos(angle);
    const px = Math.cos(angle);
    const pz = -Math.sin(angle);
    const root = rng() * (kind === 'stubble' ? 0.67 : kind === 'cattail' ? 0.55 : 0.66);
    const x = sx * root;
    const z = sz * root;
    const width = kind === 'cattail' ? 0.018 : kind === 'prairie' ? 0.025 + rng() * 0.030 : 0.014 + rng() * 0.018;
    const height = kind === 'prairie'
      ? 0.46 + rng() * 0.65
      : kind === 'cattail'
        ? 1.55 + rng() * 0.64
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
  geometry.userData = { kind: `pheasant-${kind}`, triangles: positions.length / 9 };
  return geometry;
}

/** Full-property grain stubble, protective grass and dense rooted wet margins. */
export class PheasantCoverSystem implements Subsystem {
  readonly id = 'grass';
  private objects: THREE.InstancedMesh[] = [];
  private batches: { mesh: THREE.InstancedMesh; center: THREE.Vector3; radius: number; range: number }[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private surface: GroundSample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
  private world = { x: 0, z: 0 };
  private wind = { value: 0 };
  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    const lite = ctx.quality === 'lite', area = this.landscape.area;
    const geometries = { prairie: habitatGeometry('prairie', lite), cattail: habitatGeometry('cattail', lite), stubble: habitatGeometry('stubble', lite) };
    this.geometries.push(...Object.values(geometries));
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
    material.onBeforeCompile = shader => {
      shader.uniforms.uPheasantWind = this.wind;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uPheasantWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
          float phase = instanceMatrix[3].x * .15 + instanceMatrix[3].z * .11;
          transformed.x += (sin(uPheasantWind * 1.35 + phase) * .028 + sin(uPheasantWind * .60 + phase * .32) * .018) * position.y * position.y;
          transformed.z += sin(uPheasantWind * .8 + phase) * .018 * position.y;
          #endif`);
    };
    material.customProgramCacheKey = () => 'pheasant-rooted-cover-wind-v2'; this.materials.push(material);
    // Parcel batches are deliberately larger on the lite tier. The old 72px
    // parcels produced up to 240 tiles × 3 instanced materials on this
    // 1400×800 property, so a phone could spend more time submitting cover
    // draws than rendering the actual hunt. 144px keeps high-tier culling
    // reasonably tight; 216px reduces the mobile batch count to about one
    // eighth while preserving the same deterministic plant distribution.
    const fields = pheasantFields(area), ponds = pheasantPonds(this.landscape);
    const harvestSample = { amount: 0, row: 0, angle: 0 };
    const TILE = lite ? 216 : 144, spacing = 2.8;
    const straw = new THREE.Color(0xb8a477), amber = new THREE.Color(0xb18e59), olive = new THREE.Color(0x919872), reed = new THREE.Color(0xa99b76), color = new THREE.Color();
    type Plant = { x: number; y: number; scale: number; angle: number; color: number };
    for (let ty = area.world.y; ty < area.world.y + area.world.h; ty += TILE) for (let tx = area.world.x; tx < area.world.x + area.world.w; tx += TILE) {
      const groups: Record<keyof typeof geometries, Plant[]> = { prairie: [], cattail: [], stubble: [] };
      for (let row = 0; row < Math.ceil(TILE / spacing); row++) for (let column = 0; column < Math.ceil(TILE / spacing); column++) {
        const cellX = tx + column * spacing, cellY = ty + row * spacing, rng = mulberry32(cellSeed(Math.round(cellX * 10), Math.round(cellY * 10), area.terrain.seed));
        const x = cellX + rng() * Math.min(spacing, tx + TILE - cellX), y = cellY + rng() * Math.min(spacing, ty + TILE - cellY);
        if (!pheasantPlantClear(area, x, y)) continue;
        this.landscape.surfaceAtProperty(x, y, this.surface);
        const { moisture, vegetation, height } = this.surface, cover = pheasantCoverAt(area, x, y);
        samplePheasantHarvest(area, x, y, fields, harvestSample);
        const harvest = harvestSample.amount, keep = rng();
        const pond = ponds.find(p => Math.hypot((x - p.x) * PROPERTY_PX_TO_M / p.rx, (y - p.y) * PROPERTY_PX_TO_M / p.ry) < 1.48);
        const depth = pond ? pond.waterY - height : -10;
        // Rhizomes belong in mud, not on top of the water plane. Very deep
        // open water remains open; the head and blades emerge on the margin.
        if (pond && depth > -.65 && depth < .95 && moisture > .18 && rng() < .68 + moisture * .25) {
          if (!lite || keep > .22) groups.cattail.push({ x, y, scale: .86 + rng() * .32, angle: rng() * Math.PI * 2, color: color.copy(reed).lerp(amber, rng() * .25).getHex() });
          continue;
        }
        if (pond && depth > .12) continue;
        if (harvest > .3 && moisture < .36) {
          // Parallel machinery rows supply agricultural scale. Gaps and a
          // few taller grasses interrupt them along the habitat boundary.
          const stripe = .5 + .5 * Math.cos(harvestSample.row * Math.PI * .88);
          if (rng() < (.25 + stripe * .50) * harvest && (!lite || keep > .35))
            groups.stubble.push({ x, y, scale: .80 + rng() * .55, angle: harvestSample.angle + (rng() - .5) * .12, color: color.copy(straw).lerp(amber, rng() * .35).getHex() });
          continue;
        }
        const drift = .50 + Math.sin(x * .065 + Math.sin(y * .038) * 2.4) * .27 + Math.cos(y * .07) * .20;
        const chance = (cover ? .94 : .23 + vegetation * .28) * (.34 + drift * .72);
        if (rng() < chance && (!lite || keep > .30)) {
          const scale = (cover ? .95 : .60) + rng() * .42;
          groups.prairie.push({ x, y, scale, angle: rng() * Math.PI * 2, color: color.copy(straw).lerp(olive, moisture * .60 + rng() * .16).lerp(amber, rng() * .12).getHex() });
        }
      }
      const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
      const normal = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), yaw = new THREE.Quaternion();
      for (const kind of ['prairie', 'cattail', 'stubble'] as const) {
        const plants = groups[kind]; if (!plants.length) continue;
        const mesh = new THREE.InstancedMesh(geometries[kind], material, plants.length);
        for (const [i, plant] of plants.entries()) {
          this.landscape.propertyToWorld(plant.x, plant.y, this.world); this.landscape.surfaceAtProperty(plant.x, plant.y, this.surface);
          normal.set(-this.surface.gradeX, 1, -this.surface.gradeZ).normalize(); rotation.setFromUnitVectors(up, normal);
          yaw.setFromAxisAngle(up, plant.angle); rotation.multiply(yaw); scale.setScalar(plant.scale);
          position.set(this.world.x, this.surface.height - .022, this.world.z);
          mesh.setMatrixAt(i, matrix.compose(position, rotation, scale)); mesh.setColorAt(i, color.setHex(plant.color));
        }
        mesh.name = `Pheasant ${kind} parcel`; mesh.receiveShadow = true; mesh.computeBoundingSphere();
        const range = kind === 'cattail' ? (lite ? 230 : 330) : kind === 'stubble' ? (lite ? 95 : 145) : (lite ? 130 : 195);
        this.batches.push({ mesh, center: mesh.boundingSphere!.center.clone(), radius: mesh.boundingSphere!.radius + .2, range });
        this.objects.push(mesh); ctx.scene.add(mesh);
      }
    }
    this.update(ctx);
  }

  update(ctx: Ctx): void {
    this.wind.value = ctx.time;
    for (const batch of this.batches) batch.mesh.visible = Math.hypot(ctx.camera.position.x - batch.center.x, ctx.camera.position.z - batch.center.z) < batch.range + batch.radius;
  }

  dispose(ctx: Ctx): void {
    // InstancedMesh has no renderer resource of its own; its shared geometry
    // and material are released below. Removing the batches is enough here
    // and keeps disposal compatible with the mobile Three.js build.
    for (const object of this.objects) ctx.scene.remove(object);
    for (const geometry of this.geometries) geometry.dispose(); for (const material of this.materials) material.dispose();
    this.objects.length = 0; this.batches.length = 0; this.geometries.length = 0; this.materials.length = 0;
  }
}
