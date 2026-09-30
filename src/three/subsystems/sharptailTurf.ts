import * as THREE from 'three';
import type { LandscapeModel } from '../../game/landscape';
import { PROPERTY_PX_TO_M } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import { sharptailGroundZones } from '../../game/sharptailLandscape';
import { sharptailStoneClearance } from '../../game/sharptailFeatures';
import type { Ctx, Subsystem } from '../engine';
import { sampleQuailGroundHeights } from './quailGroundGeometry';
import { sharptailMeadowAt, sharptailGrassOpening, type SharptailMeadowSample } from './sharptailMeadow';
import { sharptailCommunityAt, tintSharptailCommunity, type SharptailCommunitySample } from './sharptailCommunities';
import { sharptailShackYardAt } from './sharptailEnvironment';

/**
 * The short sward between the bunches. Mixed-grass prairie is a continuous
 * turf of blue grama, buffalograss and cured litter under the taller
 * bunchgrass, not bare till with tufts planted on a lattice. This low mat
 * streams in around the hunter only; beyond it the painted sward and the
 * middle canopy carry the ground. It never touches habitat or placement.
 */
const CHUNK = 16;
const SPACING = .7;

function turfGeometry(detail: 'near' | 'far'): THREE.BufferGeometry {
  const rng = mulberry32(detail === 'near' ? 0x7e4f : 0x7e50);
  const positions: number[] = [], colors: number[] = [];
  const blades = detail === 'near' ? 32 : 10;
  for (let i = 0; i < blades; i++) {
    // A low mat: curly, leaning blades spread over a hand-wide patch.
    const angle = rng() * Math.PI * 2, r = Math.sqrt(rng()) * .38;
    const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
    const lean = rng() * Math.PI * 2, reach = .03 + rng() * .07;
    const h = .07 + rng() * .14, w = (detail === 'near' ? .012 : .03) * (.8 + rng() * .5);
    const tx = x + Math.cos(lean) * reach, tz = z + Math.sin(lean) * reach;
    const px = -Math.sin(lean) * w, pz = Math.cos(lean) * w;
    const base = .78 + rng() * .3, tip = base * 1.14;
    positions.push(x - px, 0, z - pz, x + px, 0, z + pz, tx, h, tz);
    colors.push(base * .92, base * .92, base * .8, base * .92, base * .92, base * .8, tip, tip, tip * .88);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  // Short turf takes the sky, not its own facet: point normals up.
  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 1, 0);
  geometry.computeBoundingSphere();
  geometry.userData = { kind: `sharptail-turf-${detail}`, triangles: blades };
  return geometry;
}

/** Both faces of a turf blade take the upward sky normal; a flipped back
 * face would otherwise read as a black speck against the lit ground. */
function turfMaterial(): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.customProgramCacheKey = () => 'sharptail-turf-up-normal-v1';
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      'vec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;');
  };
  return material;
}

/** Late-season forbs standing out of the turf: a stiff stem with a
 * plume or a loose head, tinted per instance (goldenrod, aster, sage). */
function forbGeometry(): THREE.BufferGeometry {
  const rng = mulberry32(0xf0b5);
  const positions: number[] = [], colors: number[] = [];
  const stem = [.55, .5, .38], head = [1, 1, 1];
  const tri = (a: number[], b: number[], c: number[], color: number[]) => { positions.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) colors.push(...color); };
  for (let k = 0; k < 3; k++) {
    const angle = k / 3 * Math.PI * 2 + rng(), r = .05 + rng() * .06, x = Math.cos(angle) * r, z = Math.sin(angle) * r;
    const h = .38 + rng() * .24, lean = (rng() - .5) * .08, w = .008;
    const top = [x + lean, h, z];
    tri([x - w, 0, z], [x + w, 0, z], top, stem);
    tri([x, 0, z - w], [x, 0, z + w], top, stem);
    // A small faceted head: two crossed diamonds.
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const s = .045 + rng() * .02;
      const a = [top[0] - dx * s, top[1] + .01, top[2] - dz * s], b = [top[0] + dx * s, top[1] + .01, top[2] + dz * s];
      tri(a, [top[0], top[1] + s * 1.6, top[2]], b, head);
      tri(a, b, [top[0], top[1] - s * .5, top[2]], head.map(v => v * .8));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 1, 0);
  geometry.computeBoundingSphere();
  return geometry;
}
const FORB_TINTS = [0xc9a64a, 0x9a86a8, 0xd9d2b6, 0xb88a52].map(c => new THREE.Color(c));

interface TurfChunk { bounds: [number, number, number, number]; mesh?: THREE.InstancedMesh; forbs?: THREE.InstancedMesh }

export class SharptailTurfSystem implements Subsystem {
  readonly id = 'sharptail-turf';
  private chunks = new Map<string, TurfChunk>();
  private near = turfGeometry('near');
  private far = turfGeometry('far');
  private forb = forbGeometry();
  private material = turfMaterial();
  private ranges = { near: 9, visible: 18, build: 26, release: 40 };
  private shack?: { x: number; z: number };
  private zones = { swale: 0, stand: 0 };
  private meadow: SharptailMeadowSample = { crown: 0, hollow: 0, cured: 0, exposed: 0 };
  private community: SharptailCommunitySample = { bluestem: 0, bigBluestem: 0, wheatgrass: 0, needle: 0 };
  private property = { x: 0, y: 0 };

  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    const lite = ctx.quality === 'lite';
    this.ranges = lite ? { near: 5, visible: 11, build: 16, release: 26 } : { near: 9, visible: 18, build: 26, release: 40 };
    const shack = this.landscape.area.landmarks.find(l => l.kind === 'barn');
    if (shack) this.shack = this.landscape.propertyToWorld(shack.position.x, shack.position.y, { x: 0, z: 0 });
    this.update(ctx);
  }

  /** Instance count currently streamed in, for tests and review tools. */
  instances(): number {
    let n = 0;
    for (const chunk of this.chunks.values()) n += chunk.mesh?.count ?? 0;
    return n;
  }

  update(ctx: Ctx): void {
    const cx = ctx.camera.position.x, cz = ctx.camera.position.z;
    const reach = Math.ceil(this.ranges.build / CHUNK), ix = Math.floor(cx / CHUNK), iz = Math.floor(cz / CHUNK);
    let built = 0;
    for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
      const key = `${ix + dx},${iz + dz}`;
      if (this.chunks.has(key)) continue;
      const x0 = (ix + dx) * CHUNK, z0 = (iz + dz) * CHUNK;
      if (boxDistance(cx, cz, x0, z0, x0 + CHUNK, z0 + CHUNK) > this.ranges.build) continue;
      if (built++ >= (ctx.paused ? 64 : 1)) continue;
      this.chunks.set(key, this.build(ctx, x0, z0));
    }
    for (const [key, chunk] of this.chunks) {
      const [x0, z0, x1, z1] = chunk.bounds, distance = boxDistance(cx, cz, x0, z0, x1, z1);
      if (distance > this.ranges.release) {
        for (const mesh of [chunk.mesh, chunk.forbs]) if (mesh) { ctx.scene.remove(mesh); mesh.dispose(); }
        this.chunks.delete(key); continue;
      }
      if (chunk.forbs) chunk.forbs.visible = distance < this.ranges.visible;
      if (!chunk.mesh) continue;
      chunk.mesh.visible = distance < this.ranges.visible;
      chunk.mesh.geometry = distance < this.ranges.near ? this.near : this.far;
    }
  }

  private build(ctx: Ctx, x0: number, z0: number): TurfChunk {
    const chunk: TurfChunk = { bounds: [x0, z0, x0 + CHUNK, z0 + CHUNK] };
    const area = this.landscape.area, rng = mulberry32((Math.imul(x0, 73856093) ^ Math.imul(z0, 19349663) ^ area.terrain.seed) >>> 0);
    const lite = ctx.quality === 'lite';
    const matrices: THREE.Matrix4[] = [], colors: THREE.Color[] = [], forbMatrices: THREE.Matrix4[] = [], forbColors: THREE.Color[] = [];
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), base = new THREE.Color(0x93875f), lee = new THREE.Color(0x6f7a58), dry = new THREE.Color(0xa99a6c);
    for (let z = z0; z < z0 + CHUNK; z += SPACING) for (let x = x0; x < x0 + CHUNK; x += SPACING) {
      const wx = x + rng() * SPACING, wz = z + rng() * SPACING, keep = rng(), turn = rng(), size = rng(), tone = rng();
      this.landscape.worldToProperty(wx, wz, this.property);
      const { x: px, y: py } = this.property;
      if (px < area.world.x || py < area.world.y || px > area.world.x + area.world.w || py > area.world.y + area.world.h) continue;
      if (sharptailStoneClearance(px, py) < .5) continue;
      if (this.shack && sharptailShackYardAt(wx - this.shack.x, wz - this.shack.z) > .2) continue;
      sharptailGroundZones(px, py, this.zones);
      sharptailMeadowAt(px, py, this.zones.swale, this.meadow);
      // Exposed till stays open; everything else carries a mat.
      if (keep < sharptailGrassOpening(this.meadow.exposed, this.zones.stand) * 1.6 + (lite ? .35 : .08)) continue;
      if (trackCentreDistance(area, px, py) < .35) continue;
      const ground = sampleQuailGroundHeights(this.landscape, px, py, undefined, { near: lite ? 24 : 48, far: 14 });
      position.set(wx, Math.min(ground.nearY, this.landscape.heightAtProperty(px, py)) - .005, wz);
      rotation.setFromAxisAngle(up, turn * Math.PI * 2);
      const lush = .8 + this.meadow.hollow * .5 + this.zones.stand * .2 - this.meadow.crown * .2;
      scale.set(.9 + size * .5, lush * (.8 + size * .5), .9 + size * .5);
      matrices.push(matrix.compose(position, rotation, scale).clone());
      const color = base.clone().lerp(lee, this.meadow.hollow * .7).lerp(dry, this.meadow.crown * .45).multiplyScalar(.9 + tone * .18);
      colors.push(tintSharptailCommunity(color, sharptailCommunityAt(px, py, this.meadow, this.community), .5));
      // Forbs gather in loose drifts on the drier ground.
      if (tone > .965 - this.meadow.crown * .02 && keep < .7) {
        forbMatrices.push(matrix.compose(position, rotation, scale.set(.9 + size * .4, .85 + size * .5, .9 + size * .4)).clone());
        forbColors.push(FORB_TINTS[Math.floor(turn * 7) % FORB_TINTS.length].clone().multiplyScalar(.9 + size * .15));
      }
    }
    if (!matrices.length) return chunk;
    const mesh = new THREE.InstancedMesh(this.near, this.material, matrices.length);
    matrices.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, colors[i]); });
    mesh.name = 'Sharptail turf'; mesh.castShadow = false; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    ctx.scene.add(mesh);
    chunk.mesh = mesh;
    if (forbMatrices.length) {
      const forbs = new THREE.InstancedMesh(this.forb, this.material, forbMatrices.length);
      forbMatrices.forEach((m, i) => { forbs.setMatrixAt(i, m); forbs.setColorAt(i, forbColors[i]); });
      forbs.name = 'Sharptail forbs'; forbs.castShadow = false; forbs.receiveShadow = true;
      forbs.computeBoundingSphere(); ctx.scene.add(forbs); chunk.forbs = forbs;
    }
    return chunk;
  }

  dispose(ctx: Ctx): void {
    for (const chunk of this.chunks.values()) for (const mesh of [chunk.mesh, chunk.forbs]) if (mesh) { ctx.scene.remove(mesh); mesh.dispose(); }
    this.chunks.clear();
    this.near.dispose(); this.far.dispose(); this.forb.dispose(); this.material.dispose();
  }
}

function boxDistance(x: number, z: number, x0: number, z0: number, x1: number, z1: number): number {
  return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
}

/** Metres from the nearest authored route centreline (ruts sit ±0.6 m). */
function trackCentreDistance(area: LandscapeModel['area'], x: number, y: number): number {
  let best = Infinity;
  for (const trail of area.trails) for (let i = 1; i < trail.points.length; i++) {
    const a = trail.points[i - 1], b = trail.points[i];
    if (Math.max(a.x, b.x) < x - 4 || Math.min(a.x, b.x) > x + 4 || Math.max(a.y, b.y) < y - 4 || Math.min(a.y, b.y) > y + 4) continue;
    const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(x - a.x - dx * t, y - a.y - dy * t) * PROPERTY_PX_TO_M;
    // Keep the grassy crown between the two wheel marks.
    best = Math.min(best, Math.abs(d - .6));
  }
  return best;
}
