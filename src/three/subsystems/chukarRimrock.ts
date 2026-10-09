import * as THREE from 'three';
import { CHUKAR_RIM_STEP, chukarRimModules, type ChukarRimModule } from '../../game/chukarCanyon';
import { CHUKAR_PLACES } from '../../game/chukarRidge';
import { PROPERTY_PX_TO_M, type LandscapeModel } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import { valueNoise } from '../../game/featureLandform';
import type { Quality } from '../engine';

const rimSwell = valueNoise(9133);

/**
 * Chukar Ridge's rimrock: stacked bands of columnar basalt following the
 * canyon's rim contours (game/chukarCanyon.ts). Each rim module is a short
 * run of hexagonal columns standing on its talus, broken and uneven at the
 * top where the flow's entablature weathers. Placement, collision and the
 * survey map all read the same modules.
 *
 * Draw cost is fixed: one instanced far slab for every module (always drawn,
 * a few triangles each, set just inside the columns so near detail hides it)
 * plus three instanced column variants refilled around the hunter.
 */
export const CHUKAR_RIM_DETAIL = {
  high: { range: 260, columns: 3, backRow: true },
  lite: { range: 150, columns: 2, backRow: false },
} as const;

const COLUMN_RADIUS = .78; // metres, hexagon circumradius
const FRONT_ROW = 1.05; // metres out from the cliff mid-line, toward the talus
const BACK_ROW = -.7;
const BURY = .9; // columns start this far below the talus foot
const LIP = .3; // and finish this far above the bench edge
/** The colonnade stands to this share of the height; the entablature tops it. */
const COLONNADE = .64;
/** The talus cone at the foot reaches this far out (m) and this high (share). */
const SKIRT_REACH = 4.4, SKIRT_HEIGHT = .2;
const MODULE_LENGTH = CHUKAR_RIM_STEP * PROPERTY_PX_TO_M;

/** Basalt: brown-greys, darker in the joints, paler where it weathers. */
const BASALT = [0x645c55, 0x5a534d, 0x6d655c, 0x564f49];
const ENTABLATURE = [0x6f675d, 0x7a7165, 0x655e56];
const WEATHERED = [0x8f8576, 0x857c6e, 0x9a8f7e];
const RUBBLE = [0x6a645c, 0x5f5a53, 0x726b62];
const LICHEN = 0xa07c48;

type Point = [number, number, number];

class FacetSurface {
  positions: number[] = [];
  colors: number[] = [];
  private c = new THREE.Color();
  tri(a: Point, b: Point, c: Point, color: number, value = 1): void {
    this.c.setHex(color).multiplyScalar(value);
    for (const p of [a, b, c]) { this.positions.push(...p); this.colors.push(this.c.r, this.c.g, this.c.b); }
  }
  quad(a: Point, b: Point, c: Point, d: Point, color: number, value = 1): void { this.tri(a, b, c, color, value); this.tri(a, c, d, color, value); }
  geometry(kind: string): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
    g.userData = { kind, triangles: this.positions.length / 9 };
    return g;
  }
}

/**
 * One module in unit height: x along the rim (metres, centred), z out of the
 * cliff (metres), y from 0 (buried foot) to 1 (lip). Columns lean a touch,
 * finish at unequal heights and some tops break off at an angle.
 */
export function chukarRimModuleGeometry(variant: number, quality: Quality): THREE.BufferGeometry {
  const detail = CHUKAR_RIM_DETAIL[quality], rng = mulberry32(9100 + variant * 31), surface = new FacetSurface();
  // Colonnade: tall hexagonal columns, joints dark, faces catching the light.
  const column = (cx: number, cz: number, top: number, shade: number) => {
    const rot = rng() * Math.PI / 3, r = COLUMN_RADIUS * (.85 + rng() * .25), lean = (rng() - .5) * .04;
    const ring = (y: number, k: number): Point[] => Array.from({ length: 6 }, (_, i) => {
      const a = rot + i * Math.PI / 3;
      return [cx + Math.cos(a) * r * k + lean * y, y, cz + Math.sin(a) * r * k];
    });
    const lo = ring(0, 1.05), hi = ring(top, .97);
    const base = BASALT[Math.floor(rng() * BASALT.length)];
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6, face = .78 + .24 * Math.cos(rot + (i + .5) * Math.PI / 3 - .5);
      surface.quad(lo[i], lo[j], hi[j], hi[i], rng() < .05 ? LICHEN : base, shade * face);
    }
    const centre: Point = [cx + lean * top, top + .01, cz];
    for (let i = 0; i < 6; i++) surface.tri(hi[i], centre, hi[(i + 1) % 6], WEATHERED[i % WEATHERED.length], 1.04);
  };
  // Entablature: the flow's broken upper part, irregular blocks and steps,
  // set a little back so the colonnade reads as the cliff face below it.
  const block = (cx: number, cz: number, y0: number, y1: number, w: number, d: number, shade: number) => {
    const j = () => (rng() - .5) * .18;
    const c: Point[] = [[cx - w + j(), y0, cz - d + j()], [cx + w + j(), y0, cz - d + j()], [cx + w + j(), y0, cz + d + j()], [cx - w + j(), y0, cz + d + j()],
      [cx - w * .9 + j(), y1 + j() * .3, cz - d * .9 + j()], [cx + w * .9 + j(), y1 + j() * .3, cz - d * .9 + j()], [cx + w * .9 + j(), y1 + j() * .3, cz + d * .85 + j()], [cx - w * .9 + j(), y1 + j() * .3, cz + d * .85 + j()]];
    const colour = ENTABLATURE[Math.floor(rng() * ENTABLATURE.length)], cap = WEATHERED[Math.floor(rng() * WEATHERED.length)];
    surface.quad(c[3], c[2], c[6], c[7], colour, shade * 1.0); // front, toward the talus
    surface.quad(c[2], c[1], c[5], c[6], colour, shade * .86);
    surface.quad(c[0], c[3], c[7], c[4], colour, shade * .86);
    surface.quad(c[1], c[0], c[4], c[5], colour, shade * .7);
    surface.quad(c[7], c[6], c[5], c[4], cap, 1.06);
  };
  const count = detail.columns, spacing = MODULE_LENGTH / count;
  for (let i = 0; i < count; i++) {
    const x = -MODULE_LENGTH / 2 + spacing * (i + .5) + (rng() - .5) * .16;
    // Now and then a column has broken off well short of the entablature.
    const top = rng() < .18 ? COLONNADE * (.55 + rng() * .25) : COLONNADE * (.96 + rng() * .1);
    column(x, FRONT_ROW + (rng() - .5) * .3, top, .9 + rng() * .12);
  }
  if (detail.backRow) for (let i = 0; i < count - 1; i++) {
    column(-MODULE_LENGTH / 2 + spacing * (i + 1) + (rng() - .5) * .2, BACK_ROW + (rng() - .5) * .2, COLONNADE * (1 + rng() * .08), .82 + rng() * .1);
  }
  // Two or three entablature blocks along the module, stepped in height.
  const pieces = quality === 'high' ? 3 : 2, w = MODULE_LENGTH / pieces / 2;
  for (let i = 0; i < pieces; i++) {
    const x = -MODULE_LENGTH / 2 + w * (2 * i + 1) + (rng() - .5) * .3, top = .9 + rng() * .1 - (rng() < .25 ? .1 : 0);
    block(x, (FRONT_ROW + BACK_ROW) / 2 - .05 + (rng() - .5) * .2, COLONNADE - .02, top, w * 1.02, 1.3 + rng() * .25, .92 + rng() * .1);
  }
  // The talus cone at the foot: a faceted apron of rubble burying the base.
  const skirt: Point[] = [];
  for (let i = 0; i <= 4; i++) {
    const x = -MODULE_LENGTH / 2 - .2 + (MODULE_LENGTH + .4) * i / 4;
    skirt.push([x, SKIRT_HEIGHT * (.45 + rng() * 1.1), FRONT_ROW + COLUMN_RADIUS * (.2 + rng() * .5)],
      [x + (rng() - .5) * .9, SKIRT_HEIGHT * (.25 + rng() * .45), FRONT_ROW + SKIRT_REACH * (.35 + rng() * .3)],
      [x + (rng() - .5) * .6, -.08, FRONT_ROW + SKIRT_REACH * (.8 + rng() * .4)]);
  }
  for (let i = 0; i < 4; i++) for (let r = 0; r < 2; r++) {
    const a = skirt[i * 3 + r], b = skirt[(i + 1) * 3 + r], c = skirt[(i + 1) * 3 + r + 1], d = skirt[i * 3 + r + 1];
    const tone = RUBBLE[(i + r) % RUBBLE.length];
    surface.tri(a, d, b, tone, .95 + rng() * .1); surface.tri(b, d, c, tone, .9 + rng() * .1);
  }
  return surface.geometry('chukar-rim-columns');
}

/** The far slab: a faceted block just inside the columns' envelope. */
export function chukarRimSlabGeometry(): THREE.BufferGeometry {
  const surface = new FacetSurface(), hx = MODULE_LENGTH * .5, front = FRONT_ROW + COLUMN_RADIUS * .55, back = BACK_ROW;
  const p = (x: number, y: number, z: number): Point => [x, y, z];
  const top = .9, base = BASALT[1], cap = WEATHERED[0];
  surface.quad(p(-hx, 0, front), p(hx, 0, front), p(hx, top * .7, front), p(-hx, top * .7, front), base, .9);
  surface.quad(p(-hx, top * .7, front), p(hx, top * .7, front), p(hx, top, front - .15), p(-hx, top, front - .15), cap, .95);
  surface.quad(p(-hx, top, front - .15), p(hx, top, front - .15), p(hx, top, back), p(-hx, top, back), cap, 1.05);
  surface.quad(p(hx, 0, back), p(-hx, 0, back), p(-hx, top, back), p(hx, top, back), base, .8);
  surface.quad(p(hx, 0, front), p(hx, 0, back), p(hx, top, back), p(hx, top, front), base, .85);
  surface.quad(p(-hx, 0, back), p(-hx, 0, front), p(-hx, top, front), p(-hx, top, back), base, .85);
  return surface.geometry('chukar-rim-slab');
}

interface Placed { module: ChukarRimModule; matrix: THREE.Matrix4; x: number; z: number; variant: number }

/** Column height boost at Castle Rock: the middle rim's tower stands proud. */
function towerLift(m: ChukarRimModule): number {
  const d = Math.hypot(m.x - CHUKAR_PLACES.castleRock.x, m.y - CHUKAR_PLACES.castleRock.y);
  return m.rim === 'middle-rim' ? 1 + .18 * Math.max(0, 1 - d / 40) : 1;
}

export class ChukarRimrock {
  readonly root = new THREE.Group();
  readonly far: THREE.InstancedMesh;
  private readonly near: THREE.InstancedMesh[];
  private readonly placed: Placed[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private lastRefill = new THREE.Vector2(Infinity, Infinity);
  private readonly range: number;

  constructor(private readonly landscape: LandscapeModel, quality: Quality, material: THREE.Material) {
    this.root.name = 'Chukar columnar basalt rims';
    this.range = CHUKAR_RIM_DETAIL[quality].range;
    const modules = chukarRimModules();
    const slab = chukarRimSlabGeometry(), variants = [0, 1, 2].map(v => chukarRimModuleGeometry(v, quality));
    this.geometries.push(slab, ...variants);
    const world = { x: 0, z: 0 }, q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const m of modules) {
      landscape.propertyToWorld(m.x, m.y, world);
      // Measure the real ground just below and above the face.
      const fx = m.x + m.nx * 2.2, fy = m.y + m.ny * 2.2, bx = m.x - m.nx * 2.2, by = m.y - m.ny * 2.2;
      const foot = Math.min(landscape.heightAtProperty(fx, fy), landscape.heightAtProperty(m.x, m.y));
      const lip = Math.max(landscape.heightAtProperty(bx, by), landscape.heightAtProperty(m.x, m.y));
      // Weathered stretches stand lower, shrinking to rubble toward a break;
      // the lip rises and falls along the rim rather than ruling a line.
      const height = Math.max(1.2, (lip - foot) * (1 - m.decay * .4) * towerLift(m) * (1 + .05 * rimSwell(m.x * .045, m.y * .045)));
      const yaw = Math.atan2(m.nx, m.ny); // local +z points downhill in property (= world) axes
      q.setFromAxisAngle(up, yaw);
      // Buttresses: stretches of the face stand out over their talus.
      const jut = m.jut * PROPERTY_PX_TO_M;
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(world.x + m.nx * jut, foot - BURY, world.z + m.ny * jut), q,
        new THREE.Vector3(1.06 + m.variant * .06, height + BURY + LIP, .95 + m.variant * .12));
      this.placed.push({ module: m, matrix, x: world.x, z: world.z, variant: Math.floor(m.variant * 3) % 3 });
    }
    this.far = new THREE.InstancedMesh(slab, material, this.placed.length);
    this.placed.forEach((p, i) => this.far.setMatrixAt(i, p.matrix));
    this.far.name = 'Chukar rim slabs (far)'; this.far.castShadow = true; this.far.receiveShadow = true;
    this.far.computeBoundingSphere();
    this.near = variants.map((geometry, v) => {
      const capacity = this.placed.filter(p => p.variant === v).length;
      const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity));
      mesh.count = 0; mesh.name = `Chukar rim columns ${v}`; mesh.castShadow = true; mesh.receiveShadow = true;
      // Instances move with the hunter; bounds are refreshed on refill.
      mesh.frustumCulled = false;
      return mesh;
    });
    this.root.add(this.far, ...this.near);
  }

  /** Refill the column variants around the camera when it has moved. */
  update(camera: THREE.Vector3Like): void {
    if (Math.hypot(camera.x - this.lastRefill.x, camera.z - this.lastRefill.y) < 12) return;
    this.lastRefill.set(camera.x, camera.z);
    const counts = [0, 0, 0];
    for (const p of this.placed) {
      if (Math.hypot(p.x - camera.x, p.z - camera.z) > this.range) continue;
      this.near[p.variant].setMatrixAt(counts[p.variant]++, p.matrix);
    }
    this.near.forEach((mesh, v) => { mesh.count = counts[v]; mesh.instanceMatrix.needsUpdate = true; });
  }

  /** Triangles the column tier would submit with every module near. */
  stats(): { modules: number; farTriangles: number; nearTriangles: number[] } {
    return { modules: this.placed.length, farTriangles: (this.far.geometry.userData.triangles as number) * this.placed.length,
      nearTriangles: this.near.map(mesh => (mesh.geometry.userData.triangles as number) * mesh.count) };
  }

  dispose(): void {
    this.root.removeFromParent();
    this.far.dispose(); for (const mesh of this.near) mesh.dispose();
    for (const geometry of this.geometries) geometry.dispose();
  }
}
