import * as THREE from 'three';
import type { LandscapeModel } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { PheasantCrop } from '../../game/pheasantFarm';
import type { Ctx, Subsystem } from '../engine';
import { PHEASANT_MATERIALS } from '../palette';
import { createPheasantFarmMap, samplePheasantFarm, type PheasantFarmMap, type PheasantFarmSample } from './pheasantCropSurface';
import { pheasantPlantClear } from './pheasantLandscape';

/** Row spacing of each crop's residue instances, in metres. Corn and beans
 * match the terrain shader's rows exactly so stalks stand on the drawn rows. */
const ROW_SPACING: Record<PheasantCrop, number> = { corn: .762, beans: .762, wheat: .762, hay: 1.35 };
const STEP_ALONG: Record<PheasantCrop, number> = { corn: 1.0, beans: .9, wheat: 1.2, hay: 1.45 };
const KEEP: Record<PheasantCrop, number> = { corn: .74, beans: .62, wheat: .8, hay: .45 };
const CHUNK = 24;
const RESIDUE_LIFT: Record<string, number> = { dawn: .07, morning: .3, noon: .3, evening: .07, lastlight: .02 };

type Builder = { positions: number[]; colors: number[] };

function quad(b: Builder, a: THREE.Vector3Like, c: THREE.Vector3Like, d: THREE.Vector3Like, e: THREE.Vector3Like, color: THREE.Color): void {
  b.positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z, a.x, a.y, a.z, d.x, d.y, d.z, e.x, e.y, e.z);
  for (let i = 0; i < 6; i++) b.colors.push(color.r, color.g, color.b);
}

/** A four-sided stalk between two points, with a cut top on standing stubs. */
function stalk(b: Builder, from: THREE.Vector3, to: THREE.Vector3, radius: number, side: THREE.Color, cut?: THREE.Color): void {
  const axis = to.clone().sub(from).normalize();
  const u = Math.abs(axis.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const n1 = u.clone().cross(axis).normalize().multiplyScalar(radius);
  const n2 = axis.clone().cross(n1).normalize().multiplyScalar(radius);
  const ring = (p: THREE.Vector3, taper: number) => [n1, n2, n1.clone().negate(), n2.clone().negate()]
    .map(n => p.clone().addScaledVector(n, taper));
  const lo = ring(from, 1), hi = ring(to, .86);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, shade = side.clone().multiplyScalar(.86 + (i % 2) * .14);
    quad(b, lo[i], lo[j], hi[j], hi[i], shade);
  }
  if (cut) quad(b, hi[0], hi[1], hi[2], hi[3], cut);
}

/** Crop residue in local space: +Z runs along the row, X across it. */
function residueGeometry(crop: PheasantCrop, detail: 'near' | 'far'): THREE.BufferGeometry {
  const rng = mulberry32(crop === 'corn' ? 0xc0a2 : crop === 'beans' ? 0xbea5 : crop === 'wheat' ? 0x3ea7 : 0x4a71);
  const b: Builder = { positions: [], colors: [] };
  const near = detail === 'near';
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // Vertex colours stay light; the instance tint carries each field's tone.
  const bleached = new THREE.Color(0xf4ead0), grey = new THREE.Color(0xd3cbb6), pith = new THREE.Color(0xfff8e6);
  if (crop === 'corn') {
    const stubs = near ? 4 : 3;
    for (let i = 0; i < stubs; i++) {
      const z = -.42 + (i + rng() * .7) * (.84 / stubs), x = (rng() - .5) * .07;
      // Combine heads leave 15-35 cm of stalk, many of them split or bent.
      const height = .10 + rng() * .26, lean = (rng() - .5) * .16;
      const tone = bleached.clone().lerp(grey, rng() * .6);
      if (near) stalk(b, v(x, 0, z), v(x + lean, height, z + lean * .4), .015 + rng() * .007, tone, pith);
      else quad(b, v(x - .02, 0, z), v(x + .02, 0, z), v(x + .02 + lean, height, z), v(x - .02 + lean, height, z), tone);
    }
    // Knocked-down stalk pieces and shredded leaves lie across the rows.
    const pieces = near ? 3 : 1;
    for (let i = 0; i < pieces; i++) {
      const angle = rng() * Math.PI, length = .35 + rng() * .55, cx = (rng() - .5) * .6, cz = (rng() - .5) * .8;
      // Lying pieces face the sun; keep them darker than standing stubs.
      const dx = Math.cos(angle) * length / 2, dz = Math.sin(angle) * length / 2, tone = bleached.clone().lerp(grey, .3 + rng() * .5).multiplyScalar(.8);
      if (near) stalk(b, v(cx - dx, .016, cz - dz), v(cx + dx, .026, cz + dz), .014, tone);
      else quad(b, v(cx - dx - dz * .05, .02, cz - dz + dx * .05), v(cx - dx + dz * .05, .02, cz - dz - dx * .05),
        v(cx + dx + dz * .05, .02, cz + dz - dx * .05), v(cx + dx - dz * .05, .02, cz + dz + dx * .05), tone);
    }
    if (near) for (let i = 0; i < 3; i++) {
      const angle = rng() * Math.PI * 2, length = .25 + rng() * .35, w = .03 + rng() * .025;
      const cx = (rng() - .5) * .7, cz = (rng() - .5) * .9, dx = Math.cos(angle), dz = Math.sin(angle);
      const tone = pith.clone().lerp(grey, .3 + rng() * .5).multiplyScalar(.78), y = .012 + rng() * .01;
      quad(b, v(cx - dz * w, y, cz + dx * w), v(cx + dz * w, y, cz - dx * w),
        v(cx + dx * length + dz * w * .3, y + .02, cz + dz * length - dx * w * .3),
        v(cx + dx * length - dz * w * .3, y + .02, cz + dz * length + dx * w * .3), tone);
    }
  } else if (crop === 'wheat') {
    // Four drill rows of cut straw, each a few hands tall.
    const straw = new THREE.Color(0xfff1c4), stemsPerRow = near ? 11 : 4;
    for (const rx of [-.28575, -.09525, .09525, .28575]) for (let i = 0; i < stemsPerRow; i++) {
      if (rng() < .18) continue;
      const z = -.58 + (i + rng()) * (1.16 / stemsPerRow), x = rx + (rng() - .5) * .05;
      const height = .10 + rng() * .14, lean = (rng() - .5) * .08, w = near ? .005 : .014;
      const tone = straw.clone().multiplyScalar(.82 + rng() * .18);
      quad(b, v(x - w, 0, z), v(x + w, 0, z), v(x + w + lean, height, z + lean * .3), v(x - w + lean, height, z + lean * .3), tone);
      if (near) quad(b, v(x, 0, z - w), v(x, 0, z + w), v(x + lean, height, z + w + lean * .3), v(x + lean, height, z - w + lean * .3), tone);
    }
  } else if (crop === 'beans') {
    // Brittle stems snapped a hand above the soil, a few pale pods.
    const stems = near ? 6 : 3;
    for (let i = 0; i < stems; i++) {
      const z = -.4 + rng() * .8, x = (rng() - .5) * .06, height = .05 + rng() * .09, lean = (rng() - .5) * .06;
      const tone = grey.clone().lerp(bleached, rng() * .5).multiplyScalar(.9);
      quad(b, v(x - .006, 0, z), v(x + .006, 0, z), v(x + .005 + lean, height, z), v(x - .005 + lean, height, z), tone);
      if (near && rng() < .6) {
        const px = x + lean, py = height * (.4 + rng() * .5), a = rng() * Math.PI * 2;
        quad(b, v(px, py, z), v(px + Math.cos(a) * .012, py - .004, z + Math.sin(a) * .012),
          v(px + Math.cos(a) * .05, py - .02, z + Math.sin(a) * .05), v(px - Math.sin(a) * .01, py - .012, z + Math.cos(a) * .01), pith);
      }
    }
  } else {
    // Hay aftermath: short, spreading regrowth.
    const green = new THREE.Color(0xd7e2b0), cured = new THREE.Color(0xf1e3b8);
    for (let i = 0; i < (near ? 7 : 3); i++) {
      const a = i / 7 * Math.PI * 2 + rng() * .4, r = rng() * .12, h = .07 + rng() * .1, w = .012;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, tx = x + Math.cos(a) * .08, tz = z + Math.sin(a) * .08;
      const tone = green.clone().lerp(cured, rng() * .7);
      quad(b, v(x - w, 0, z), v(x + w, 0, z), v(tx + w * .2, h, tz), v(tx - w * .2, h, tz), tone);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData = { kind: `pheasant-${crop}-residue-${detail}`, triangles: b.positions.length / 9 };
  return geometry;
}

interface ResidueChunk { key: string; bounds: THREE.Box3; meshes: { mesh: THREE.InstancedMesh; crop: PheasantCrop }[] }

/**
 * Harvest residue close to the hunter: cut corn stalks standing on the rows
 * the terrain shader draws, knocked-down stalks and leaves, wheat straw in
 * drill rows, snapped bean stems and hay regrowth. Chunks stream in around
 * the camera and are released behind it, so the whole farm never exists as
 * geometry at once; beyond the residue range the painted rows carry it.
 */
export class PheasantCropResidueSystem implements Subsystem {
  readonly id = 'crop-residue';
  private chunks = new Map<string, ResidueChunk>();
  private geometries = new Map<string, THREE.BufferGeometry>();
  private material?: THREE.MeshLambertMaterial;
  private farm?: PheasantFarmMap;
  private sample: PheasantFarmSample = { rowsAlongX: false, harvest: 0, verge: 0 };
  private property = { x: 0, y: 0 };
  private ranges = { near: 24, far: 50, build: 64, release: 96 };
  private abort = new AbortController();
  private tint: Record<PheasantCrop, THREE.Color> = {
    corn: new THREE.Color(PHEASANT_MATERIALS.cornResidue),
    beans: new THREE.Color(PHEASANT_MATERIALS.beanChaff),
    wheat: new THREE.Color(PHEASANT_MATERIALS.wheatStraw),
    hay: new THREE.Color(PHEASANT_MATERIALS.hayCured),
  };

  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    const lite = ctx.quality === 'lite';
    this.ranges = lite ? { near: 14, far: 32, build: 44, release: 70 } : { near: 24, far: 50, build: 64, release: 96 };
    this.farm = createPheasantFarmMap(this.landscape);
    for (const crop of ['corn', 'beans', 'wheat', 'hay'] as const) for (const detail of ['near', 'far'] as const) {
      this.geometries.set(`${crop}-${detail}`, residueGeometry(crop, detail));
    }
    // The same faint warm lift as the standing cover, so residue matches the
    // sunlit ground it lies on instead of reading as dark wire.
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x9a8c68, emissiveIntensity: .3 });
    // The lift follows the light: at dawn and dusk the residue must settle
    // into the ground's shadow values rather than glow above them.
    const lift = (tod: string) => { if (this.material) this.material.emissiveIntensity = RESIDUE_LIFT[tod] ?? .3; };
    lift(ctx.timeOfDay);
    ctx.events.addEventListener('tod', event => lift((event as CustomEvent<string>).detail), { signal: this.abort.signal });
    this.update(ctx);
  }

  /** Every residue root placed in a chunk, for tests and review tools. */
  roots(): { crop: PheasantCrop; x: number; z: number }[] {
    const out: { crop: PheasantCrop; x: number; z: number }[] = [];
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
    for (const chunk of this.chunks.values()) for (const { mesh, crop } of chunk.meshes) for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix); out.push({ crop, x: position.x, z: position.z });
    }
    return out;
  }

  update(ctx: Ctx): void {
    if (!this.material) return;
    const cx = ctx.camera.position.x, cz = ctx.camera.position.z;
    let built = 0;
    const reach = Math.ceil(this.ranges.build / CHUNK);
    const ix = Math.floor(cx / CHUNK), iz = Math.floor(cz / CHUNK);
    for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
      const key = `${ix + dx},${iz + dz}`;
      if (this.chunks.has(key)) continue;
      const x0 = (ix + dx) * CHUNK, z0 = (iz + dz) * CHUNK;
      if (distanceToBox(cx, cz, x0, z0, x0 + CHUNK, z0 + CHUNK) > this.ranges.build) continue;
      // Spread construction over frames; an instant capture builds all.
      if (built++ >= (ctx.paused ? 64 : 1)) continue;
      this.chunks.set(key, this.buildChunk(ctx, key, x0, z0));
    }
    for (const [key, chunk] of this.chunks) {
      const distance = distanceToBox(cx, cz, chunk.bounds.min.x, chunk.bounds.min.z, chunk.bounds.max.x, chunk.bounds.max.z);
      if (distance > this.ranges.release) { this.releaseChunk(ctx, chunk); this.chunks.delete(key); continue; }
      for (const { mesh, crop } of chunk.meshes) {
        mesh.visible = distance < this.ranges.far;
        mesh.geometry = this.geometries.get(`${crop}-${distance < this.ranges.near ? 'near' : 'far'}`)!;
      }
    }
  }

  private buildChunk(ctx: Ctx, key: string, x0: number, z0: number): ResidueChunk {
    const area = this.landscape.area, bounds = new THREE.Box3(new THREE.Vector3(x0, -1e3, z0), new THREE.Vector3(x0 + CHUNK, 1e3, z0 + CHUNK));
    const placed: Record<PheasantCrop, { x: number; z: number; y: number; yaw: number; scale: number; tone: number; variant: number }[]> = { corn: [], beans: [], wheat: [], hay: [] };
    const seed = Math.imul(Math.floor(x0 / CHUNK), 73856093) ^ Math.imul(Math.floor(z0 / CHUNK), 19349663) ^ area.terrain.seed;
    const rng = mulberry32(seed >>> 0);
    const up = new THREE.Vector3(0, 1, 0);
    // Walk the row lines of both planter directions; each root keeps only
    // the crop whose field actually runs its rows that way at that spot.
    for (const alongX of [true, false]) for (const crop of ['corn', 'beans', 'wheat', 'hay'] as const) {
      const spacing = ROW_SPACING[crop], step = STEP_ALONG[crop];
      const across0 = alongX ? z0 : x0;
      for (let row = Math.ceil(across0 / spacing); row * spacing < across0 + CHUNK; row++) {
        // Wheat patches span four 7.5-inch drill rows; centre them between
        // two so every straw stands on a row the shader draws.
        const across = row * spacing + (crop === 'wheat' ? .09525 : 0);
        const offset = (row * 0.618) % 1 * step;
        for (let along = (alongX ? x0 : z0) + offset; along < (alongX ? x0 : z0) + CHUNK; along += step) {
          const keep = rng(), jitter = rng(), size = rng(), tone = rng();
          if (keep > KEEP[crop]) continue;
          const wx = alongX ? along + (jitter - .5) * step * .6 : across + (crop === 'hay' ? (jitter - .5) * .8 : 0);
          const wz = alongX ? across + (crop === 'hay' ? (jitter - .5) * .8 : 0) : along + (jitter - .5) * step * .6;
          this.landscape.worldToProperty(wx, wz, this.property);
          samplePheasantFarm(this.farm!, area.world, this.property.x, this.property.y, this.sample);
          if (this.sample.crop !== crop || this.sample.rowsAlongX !== alongX) continue;
          if (this.sample.harvest < .35 + keep * .5) continue;
          if (!pheasantPlantClear(area, this.property.x, this.property.y, .3)) continue;
          // Stalks grow plumb; the wetland's gentle grades need no tilt.
          placed[crop].push({ x: wx, z: wz, y: this.landscape.heightAtProperty(this.property.x, this.property.y), yaw: alongX ? Math.PI / 2 : 0,
            scale: .8 + size * .4, tone,
            variant: Math.floor(((jitter * 9301 + size * 49297) % 1) * 64) });
        }
      }
    }
    const meshes: ResidueChunk['meshes'] = [];
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), yaw = new THREE.Quaternion(), scale = new THREE.Vector3(), color = new THREE.Color();
    for (const crop of ['corn', 'beans', 'wheat', 'hay'] as const) {
      const roots = placed[crop];
      if (!roots.length) continue;
      const mesh = new THREE.InstancedMesh(this.geometries.get(`${crop}-near`)!, this.material!, roots.length);
      roots.forEach((root, i) => {
        // Flip, mirror and slightly skew each hill so the shared residue
        // never lines up into a visible lattice across the field.
        const variant = root.variant;
        yaw.setFromAxisAngle(up, root.yaw + (variant & 1 ? Math.PI : 0) + ((variant >> 2) / 15 - .5) * .35);
        rotation.copy(yaw);
        position.set(root.x, root.y - .01, root.z);
        // Vary stalk height independently of spread: combines cut unevenly.
        scale.set(root.scale * (variant & 2 ? -1 : 1), root.scale * (.7 + ((variant >> 2) % 7) / 7 * .6), root.scale);
        mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
        mesh.setColorAt(i, color.copy(this.tint[crop]).multiplyScalar(.84 + root.tone * .22));
      });
      mesh.name = `Pheasant ${crop} residue`;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.computeBoundingSphere();
      ctx.scene.add(mesh);
      meshes.push({ mesh, crop });
    }
    return { key, bounds, meshes };
  }

  private releaseChunk(ctx: Ctx, chunk: ResidueChunk): void {
    for (const { mesh } of chunk.meshes) { ctx.scene.remove(mesh); mesh.dispose(); }
  }

  dispose(ctx: Ctx): void {
    this.abort.abort();
    for (const chunk of this.chunks.values()) this.releaseChunk(ctx, chunk);
    this.chunks.clear();
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.geometries.clear();
    this.material?.dispose();
    this.material = undefined;
  }
}

function distanceToBox(x: number, z: number, x0: number, z0: number, x1: number, z1: number): number {
  return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
}
