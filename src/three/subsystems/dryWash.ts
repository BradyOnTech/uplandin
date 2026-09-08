import * as THREE from 'three';
import type { AreaConfig, AreaTrail } from '../../game/areas';
import { PROPERTY_PX_TO_M, type GroundSample, type LandscapeModel } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import { P } from '../palette';

const UP = new THREE.Vector3(0, 1, 0);
const SAMPLE: GroundSample = {
  height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0,
};

type Point3 = { x: number; y: number; z: number };

interface WashSection {
  x: number;
  y: number;
  tangentX: number;
  tangentY: number;
  normalX: number;
  normalY: number;
  innerHalfPx: number;
  outerHalfPx: number;
  bankRise: number;
}

interface AccentPlacement {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  yaw: number;
  gradeX: number;
  gradeZ: number;
  color: number;
}

interface GeometryBuffers {
  positions: number[];
  colors: number[];
  indices: number[];
}

function seeded(areaSeed: number, trailIndex: number, pointIndex: number, salt: number): number {
  const value = areaSeed ^ Math.imul(trailIndex + 19, 0x9e3779b1)
    ^ Math.imul(pointIndex + 31, 0x85ebca6b) ^ Math.imul(salt + 7, 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function addQuad(
  target: GeometryBuffers,
  a: Point3,
  b: Point3,
  c: Point3,
  d: Point3,
  colors: readonly number[],
): void {
  const start = target.positions.length / 3;
  for (const [point, colorHex] of [[a, colors[0]], [b, colors[1]], [c, colors[2]], [d, colors[3]]] as const) {
    target.positions.push(point.x, point.y, point.z);
    const color = new THREE.Color(colorHex);
    target.colors.push(color.r, color.g, color.b);
  }
  target.indices.push(start, start + 1, start + 2, start + 2, start + 1, start + 3);
}

function makeGeometry(buffers: GeometryBuffers): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
  geometry.setIndex(buffers.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function distanceToSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
}

function distanceToTrails(x: number, y: number, trails: readonly AreaTrail[]): number {
  let nearest = Infinity;
  for (const trail of trails) {
    for (let index = 1; index < trail.points.length; index++) {
      const a = trail.points[index - 1];
      const b = trail.points[index];
      nearest = Math.min(nearest, distanceToSegment(x, y, a.x, a.y, b.x, b.y));
    }
  }
  return nearest;
}

function trailSections(trail: AreaTrail, areaSeed: number, trailIndex: number): WashSection[] {
  const sections: WashSection[] = [];
  for (let index = 0; index < trail.points.length; index++) {
    const point = trail.points[index];
    const before = trail.points[Math.max(0, index - 1)];
    const after = trail.points[Math.min(trail.points.length - 1, index + 1)];
    let tangentX = after.x - before.x;
    let tangentY = after.y - before.y;
    const length = Math.hypot(tangentX, tangentY);
    if (length < 0.01) {
      tangentX = 1;
      tangentY = 0;
    } else {
      tangentX /= length;
      tangentY /= length;
    }
    const random = mulberry32(seeded(areaSeed, trailIndex, index, 101));
    const innerHalfPx = (2.25 + random() * 0.82) / PROPERTY_PX_TO_M;
    const outerHalfPx = innerHalfPx + (1.45 + random() * 1.2) / PROPERTY_PX_TO_M;
    sections.push({
      x: point.x,
      y: point.y,
      tangentX,
      tangentY,
      normalX: -tangentY,
      normalY: tangentX,
      innerHalfPx,
      outerHalfPx,
      bankRise: 0.10 + random() * 0.16,
    });
  }
  return sections;
}

function samplePoint(
  landscape: LandscapeModel,
  propertyX: number,
  propertyY: number,
  yOffset: number,
): Point3 {
  const world = { x: 0, z: 0 };
  const sample = { ...SAMPLE };
  landscape.propertyToWorld(propertyX, propertyY, world);
  landscape.surfaceAtProperty(propertyX, propertyY, sample);
  return { x: world.x, y: sample.height + yOffset, z: world.z };
}

function washGeometry(landscape: LandscapeModel): { bed: THREE.BufferGeometry; banks: THREE.BufferGeometry } {
  const bed: GeometryBuffers = { positions: [], colors: [], indices: [] };
  const banks: GeometryBuffers = { positions: [], colors: [], indices: [] };
  const bedColors = [P.rimrockShade, P.soilDark, P.rimrockSoil, P.rimrockShade];
  const bankColors = [P.rimrockDust, P.rimrockSoil, P.rimrockStoneLight, P.rimrockDust];
  const area = landscape.area;

  for (const [trailIndex, trail] of area.trails.entries()) {
    if (trail.points.length < 2) continue;
    const sections = trailSections(trail, area.terrain.seed, trailIndex);
    const crossSections = sections.map((section) => {
      const leftInner = samplePoint(
        landscape,
        section.x + section.normalX * section.innerHalfPx,
        section.y + section.normalY * section.innerHalfPx,
        section.bankRise + 0.02,
      );
      const rightInner = samplePoint(
        landscape,
        section.x - section.normalX * section.innerHalfPx,
        section.y - section.normalY * section.innerHalfPx,
        section.bankRise + 0.02,
      );
      const leftOuter = samplePoint(
        landscape,
        section.x + section.normalX * section.outerHalfPx,
        section.y + section.normalY * section.outerHalfPx,
        0.035,
      );
      const rightOuter = samplePoint(
        landscape,
        section.x - section.normalX * section.outerHalfPx,
        section.y - section.normalY * section.outerHalfPx,
        0.035,
      );
      // A shallow, dark ribbon under a raised pair of edges reads as an
      // arroyo without requiring a second terrain heightfield or a costly
      // boolean cut into the tiled ground.
      const leftBed = { ...leftInner, y: leftInner.y - section.bankRise + 0.018 };
      const rightBed = { ...rightInner, y: rightInner.y - section.bankRise + 0.018 };
      return { leftBed, rightBed, leftInner, rightInner, leftOuter, rightOuter };
    });

    for (let index = 1; index < crossSections.length; index++) {
      const previous = crossSections[index - 1];
      const current = crossSections[index];
      const variation = (trailIndex + index) % bedColors.length;
      addQuad(bed, previous.leftBed, previous.rightBed, current.leftBed, current.rightBed, [
        bedColors[variation], bedColors[(variation + 1) % bedColors.length],
        bedColors[(variation + 2) % bedColors.length], bedColors[variation],
      ]);
      addQuad(banks, previous.leftOuter, previous.leftInner, current.leftOuter, current.leftInner, [
        bankColors[(variation + 1) % bankColors.length], bankColors[variation],
        bankColors[(variation + 2) % bankColors.length], bankColors[(variation + 1) % bankColors.length],
      ]);
      addQuad(banks, previous.rightInner, previous.rightOuter, current.rightInner, current.rightOuter, [
        bankColors[variation], bankColors[(variation + 1) % bankColors.length],
        bankColors[(variation + 1) % bankColors.length], bankColors[(variation + 2) % bankColors.length],
      ]);
    }
  }

  return { bed: makeGeometry(bed), banks: makeGeometry(banks) };
}

function creosoteGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  geometry.scale(1.2, 0.58, 0.92);
  geometry.translate(0, 0.60, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function yuccaGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const leaves = 8;
  for (let index = 0; index < leaves; index++) {
    const angle = index / leaves * Math.PI * 2;
    const lean = 0.14 + (index % 3) * 0.035;
    const height = 1.12 + (index % 4) * 0.12;
    const width = 0.045 + (index % 2) * 0.012;
    const sx = Math.sin(angle);
    const sz = Math.cos(angle);
    const px = Math.cos(angle);
    const pz = -Math.sin(angle);
    const base = [sx * 0.06, 0.06, sz * 0.06];
    const mid = [sx * lean * 0.42, height * 0.5, sz * lean * 0.42];
    const tip = [sx * lean, height, sz * lean];
    const leftBase = [base[0] + px * width, base[1], base[2] + pz * width];
    const rightBase = [base[0] - px * width, base[1], base[2] - pz * width];
    const leftMid = [mid[0] + px * width * 0.58, mid[1], mid[2] + pz * width * 0.58];
    const rightMid = [mid[0] - px * width * 0.58, mid[1], mid[2] - pz * width * 0.58];
    positions.push(
      ...leftBase, ...rightBase, ...leftMid,
      ...rightBase, ...rightMid, ...leftMid,
      ...leftMid, ...rightMid, ...tip,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function washRockGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  geometry.scale(0.82, 0.38, 0.62);
  geometry.translate(0, 0.38, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function accentClear(area: AreaConfig, x: number, y: number, radiusPx: number): boolean {
  if (x < area.world.x + radiusPx || y < area.world.y + radiusPx
    || x > area.world.x + area.world.w - radiusPx || y > area.world.y + area.world.h - radiusPx) return false;
  if (area.dropPoints.some((drop) => Math.hypot(x - drop.position.x, y - drop.position.y) < drop.safetyRadius + radiusPx + 12)) return false;
  return !area.landmarks.some((landmark) => Math.hypot(x - landmark.position.x, y - landmark.position.y) < 15 + radiusPx);
}

function accentAt(
  landscape: LandscapeModel,
  area: AreaConfig,
  x: number,
  y: number,
  scale: [number, number, number],
  yaw: number,
  color: number,
): AccentPlacement | undefined {
  const footprintPx = Math.max(scale[0], scale[2]) / PROPERTY_PX_TO_M * 1.4;
  if (!accentClear(area, x, y, footprintPx)) return undefined;
  const sample = { ...SAMPLE };
  const world = { x: 0, z: 0 };
  landscape.surfaceAtProperty(x, y, sample);
  if (sample.slope > 0.94 || sample.vegetation < 0.14) return undefined;
  landscape.propertyToWorld(x, y, world);
  return {
    x: world.x,
    y: sample.height,
    z: world.z,
    sx: scale[0],
    sy: scale[1],
    sz: scale[2],
    yaw,
    gradeX: sample.gradeX,
    gradeZ: sample.gradeZ,
    color,
  };
}

function buildAccents(
  landscape: LandscapeModel,
  high: boolean,
): { creosote: AccentPlacement[]; yucca: AccentPlacement[]; rocks: AccentPlacement[] } {
  const area = landscape.area;
  const creosote: AccentPlacement[] = [];
  const yucca: AccentPlacement[] = [];
  const rocks: AccentPlacement[] = [];
  const maxCreosote = high ? 62 : 30;
  const maxYucca = high ? 24 : 11;
  const maxRocks = high ? 66 : 30;
  const creosoteColors = [P.rimrockSage, P.grassOlive, P.oliveMid];
  const yuccaColors = [P.rimrockLichen, P.rimrockSage, P.grassOlive];
  const rockColors = [P.rimrockStone, P.rimrockStoneLight, P.rimrockShade];

  // Route-side accents make the dry wash readable as a habitat corridor.
  // They are placed from the authored path outward, never re-rolled when a
  // candidate is rejected, so both quality tiers retain the same composition.
  for (const [trailIndex, trail] of area.trails.entries()) {
    for (let segmentIndex = 1; segmentIndex < trail.points.length; segmentIndex++) {
      const a = trail.points[segmentIndex - 1];
      const b = trail.points[segmentIndex];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length < 18) continue;
      const tangentX = dx / length;
      const tangentY = dy / length;
      const normalX = -tangentY;
      const normalY = tangentX;
      const steps = Math.max(1, Math.floor(length / 82));
      for (let step = 0; step < steps; step++) {
        const random = mulberry32(seeded(area.terrain.seed, trailIndex, segmentIndex * 17 + step, 211));
        const t = (step + 0.38 + random() * 0.34) / steps;
        const side = random() < 0.5 ? -1 : 1;
        const offsetPx = 7 + random() * 16;
        const propertyX = a.x + dx * t + normalX * side * offsetPx;
        const propertyY = a.y + dy * t + normalY * side * offsetPx;
        const choice = random();
        const yaw = random() * Math.PI * 2;
        if (choice < 0.56 && creosote.length < maxCreosote) {
          const size = 0.72 + random() * 0.62;
          const placement = accentAt(landscape, area, propertyX, propertyY, [size * 1.05, size, size * 0.92], yaw, creosoteColors[Math.floor(random() * creosoteColors.length)]);
          if (placement) creosote.push(placement);
        } else if (choice < 0.80 && yucca.length < maxYucca) {
          const size = 0.72 + random() * 0.54;
          const placement = accentAt(landscape, area, propertyX, propertyY, [size, size, size], yaw, yuccaColors[Math.floor(random() * yuccaColors.length)]);
          if (placement) yucca.push(placement);
        } else if (rocks.length < maxRocks) {
          const size = 0.32 + random() * 0.54;
          const placement = accentAt(landscape, area, propertyX, propertyY, [size * 1.18, size, size * 0.88], yaw, rockColors[Math.floor(random() * rockColors.length)]);
          if (placement) rocks.push(placement);
        }
      }
    }
  }

  // A low-probability cell fill keeps the spaces between named washes from
  // reading as empty, while its hard caps make the mobile budget predictable.
  const step = high ? 74 : 102;
  for (let y = area.world.y + 18; y < area.world.y + area.world.h - 18; y += step) {
    for (let x = area.world.x + 18; x < area.world.x + area.world.w - 18; x += step) {
      const ix = Math.floor((x - area.world.x) / step);
      const iy = Math.floor((y - area.world.y) / step);
      const random = mulberry32(seeded(area.terrain.seed, ix, iy, 307));
      if (random() > (high ? 0.16 : 0.11)) continue;
      const propertyX = x + random() * Math.min(step, area.world.x + area.world.w - x);
      const propertyY = y + random() * Math.min(step, area.world.y + area.world.h - y);
      if (distanceToTrails(propertyX, propertyY, area.trails) < 12) continue;
      const choice = random();
      const yaw = random() * Math.PI * 2;
      if (choice < 0.64 && creosote.length < maxCreosote) {
        const size = 0.66 + random() * 0.55;
        const placement = accentAt(landscape, area, propertyX, propertyY, [size * 1.05, size, size * 0.9], yaw, creosoteColors[Math.floor(random() * creosoteColors.length)]);
        if (placement) creosote.push(placement);
      } else if (yucca.length < maxYucca) {
        const size = 0.68 + random() * 0.48;
        const placement = accentAt(landscape, area, propertyX, propertyY, [size, size, size], yaw, yuccaColors[Math.floor(random() * yuccaColors.length)]);
        if (placement) yucca.push(placement);
      }
    }
  }

  return { creosote, yucca, rocks };
}

/** Desert-wash visual adapter: shallow arroyos, raised banks, and sparse
 * creosote/yucca create a dry water-to-water hunting corridor. Every mesh is
 * deterministic and instanced; the lite tier keeps the same route language
 * while reducing accent counts and shadow cost. */
export class DryWashSystem implements Subsystem {
  readonly id = 'desert-wash';
  private objects: THREE.Object3D[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    const high = ctx.quality === 'high';
    const wash = washGeometry(this.landscape);
    const washMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    const bankMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    const bed = new THREE.Mesh(wash.bed, washMaterial);
    bed.name = 'Desert washes arroyo beds';
    bed.receiveShadow = true;
    const banks = new THREE.Mesh(wash.banks, bankMaterial);
    banks.name = 'Desert washes bank facets';
    banks.receiveShadow = true;
    ctx.scene.add(bed, banks);
    this.objects.push(bed, banks);
    this.geometries.push(wash.bed, wash.banks);
    this.materials.push(washMaterial, bankMaterial);

    const accents = buildAccents(this.landscape, high);
    this.addInstanced(ctx, creosoteGeometry(), accents.creosote, 'Desert washes creosote', high);
    this.addInstanced(ctx, yuccaGeometry(), accents.yucca, 'Desert washes yucca', high);
    this.addInstanced(ctx, washRockGeometry(), accents.rocks, 'Desert washes bank stones', high);
  }

  private addInstanced(
    ctx: Ctx,
    geometry: THREE.BufferGeometry,
    placements: readonly AccentPlacement[],
    name: string,
    castShadow: boolean,
  ): void {
    if (placements.length === 0) {
      geometry.dispose();
      return;
    }
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(placements.length * 3), 3);
    mesh.matrixAutoUpdate = false;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const yaw = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (const [index, placement] of placements.entries()) {
      position.set(placement.x, placement.y, placement.z);
      normal.set(-placement.gradeX, 1, -placement.gradeZ).normalize();
      rotation.setFromUnitVectors(UP, normal);
      yaw.setFromAxisAngle(UP, placement.yaw);
      rotation.multiply(yaw);
      scale.set(placement.sx, placement.sy, placement.sz);
      mesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
      mesh.setColorAt(index, new THREE.Color(placement.color));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    ctx.scene.add(mesh);
    this.objects.push(mesh);
    this.geometries.push(geometry);
    this.materials.push(material);
  }

  update(_ctx: Ctx): void { /* static authored wash */ }

  dispose(ctx: Ctx): void {
    for (const object of this.objects) {
      ctx.scene.remove(object);
    }
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.objects.length = 0;
    this.geometries.length = 0;
    this.materials.length = 0;
  }
}
