import * as THREE from 'three';
import type { AreaConfig } from '../../game/areas';
import { PROPERTY_PX_TO_M, type GroundSample, type LandscapeModel } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import { chukarLandmarkClearance } from './chukarLandmarks';

const TILE = 80;
const STONE = [0xb39b78, 0x8c8573, 0x9f896c, 0x7a776d];
const SAGE = [0x819483, 0x9ba18b, 0x71887d];
const STRAW = [0xb9a477, 0xc3af83, 0xa0926a, 0x919779];
const SAMPLE: GroundSample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
function seed(x: number, y: number, salt = 0): number {
  return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(salt + 7701, 83492791)) >>> 0;
}

interface Plant { x: number; y: number; yaw: number; sx: number; sy: number; sz: number; color: number }
interface Batch { mesh: THREE.InstancedMesh; range: number; radius: number; center: THREE.Vector3; shadow: boolean }
interface Formation { x: number; y: number; yaw: number; length: number; height: number; seed: number }

/** Property-space distance keeps the same paths open from either parking place. */
export function chukarTrackDistance(area: AreaConfig, x: number, y: number): number {
  let distance = Infinity;
  for (const trail of area.trails) for (let i = 1; i < trail.points.length; i++) {
    const a = trail.points[i - 1], b = trail.points[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1));
    distance = Math.min(distance, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
  }
  return distance * PROPERTY_PX_TO_M;
}

function coverAt(area: AreaConfig, x: number, y: number, margin = 0): boolean {
  return area.patches.some(p => x >= p.x - margin && x <= p.x + p.w + margin && y >= p.y - margin && y <= p.y + p.h + margin);
}

/** Broad sedimentary ribs with broken shoulders. They flank the hunt instead
 * of erecting a repeated wall directly across the walking/working corridor. */
function formations(area: AreaConfig): Formation[] {
  const result: Formation[] = [];
  for (const [i, drop] of area.dropPoints.entries()) {
    const f = { x: Math.cos(drop.heading), y: Math.sin(drop.heading) }, r = { x: -f.y, y: f.x };
    for (let n = 0; n < 3; n++) {
      const distance = 92 + n * 84, side = (n % 2 ? -1 : 1) * (55 + n * 16);
      result.push({ x: drop.position.x + f.x * distance + r.x * side, y: drop.position.y + f.y * distance + r.y * side,
        yaw: Math.atan2(r.y, r.x) + (n - 1) * .22, length: 30 + n * 16, height: 4.5 + n * 2.8, seed: 217 + i * 53 + n * 19 });
    }
  }
  for (const [i, [x, y, length, height]] of [[.23, .18, 56, 9], [.48, .20, 78, 13], [.69, .45, 62, 10], [.86, .23, 76, 15], [.87, .70, 52, 8]].entries()) {
    result.push({ x: area.world.x + area.world.w * x, y: area.world.y + area.world.h * y, yaw: -.36 + i * .11, length, height, seed: 691 + i * 93 });
  }
  return result;
}

/** A fractured seven-sided slab with broad, uneven bedding planes. */
export function chukarStoneGeometry(variant = 0, gravel = false): THREE.BufferGeometry {
  const rng = mulberry32(seed(variant, 3, 31)), positions: number[] = [], colors: number[] = [];
  const outline = gravel ? [[-.5, -.38], [.42, -.47], [.53, .32], [-.34, .49]]
    : [[-.5, -.38], [-.19, -.56], [.45, -.44], [.56, -.06], [.39, .52], [-.14, .42], [-.54, .23]];
  const rings = (gravel ? [0, 1] : [0, .38, 1]).map((y, ring) => outline.map(([x, z], n) => {
    const spread = ring === 0 ? .89 : ring === 1 && !gravel ? 1.03 : .72 + rng() * .16;
    return new THREE.Vector3(x * spread + y * .11, y + (y > 0 ? Math.sin(n * 2.7 + variant) * .065 : 0), z * spread - y * .08);
  }));
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, shade: number) => {
    for (const p of [a, b, c]) { positions.push(p.x, p.y, p.z); colors.push(shade, shade * .98, shade * .94); }
  };
  for (let ring = 0; ring < rings.length - 1; ring++) for (let n = 0; n < outline.length; n++) {
    const next = (n + 1) % outline.length, shade = (.79 + ring * .11) + rng() * .12;
    tri(rings[ring][n], rings[ring + 1][next], rings[ring][next], shade);
    tri(rings[ring][n], rings[ring + 1][n], rings[ring + 1][next], shade);
  }
  const top = rings[rings.length - 1];
  for (let n = 1; n < outline.length - 1; n++) {
    tri(top[0], top[n + 1], top[n], .98 + rng() * .055);
    tri(rings[0][0], rings[0][n], rings[0][n + 1], .72);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  geometry.computeBoundingSphere(); geometry.userData = { kind: gravel ? 'chukar-talus' : 'chukar-bedded-rock', triangles: positions.length / 9 };
  return geometry;
}

/** Silver sage grows in branching sprays, with air between the leaves. */
function sageGeometry(lite: boolean): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], rng = mulberry32(9961);
  const shoots = lite ? 5 : 7;
  const tri = (a: number[], b: number[], c: number[], shade: number) => {
    for (const p of [a, b, c]) { positions.push(...p); colors.push(shade, shade, shade); }
  };
  for (let shoot = 0; shoot < shoots; shoot++) {
    const angle = shoot * 2.399, height = .38 + rng() * .42, reach = .20 + rng() * .19;
    let previous = [0, -.025, 0];
    for (let level = 1; level <= 4; level++) {
      const t = level / 4, center = [Math.sin(angle) * reach * t * t, height * t, Math.cos(angle) * reach * t * t];
      tri([previous[0] - .007, previous[1], previous[2]], [previous[0] + .007, previous[1], previous[2]], center, .64);
      for (const side of [-1, 1]) {
        const az = angle + level * .74 + side * 1.12, length = .10 + rng() * .07;
        const tip = [center[0] + Math.sin(az) * length, center[1] + .045, center[2] + Math.cos(az) * length];
        const mid = center.map((v, i) => (v + tip[i]) * .5), width = .022;
        const edge = [mid[0] + Math.cos(az) * width, mid[1] - .007, mid[2] - Math.sin(az) * width];
        tri(center, edge, tip, .90 + t * .08);
        tri(center, tip, [mid[0] - Math.cos(az) * width, mid[1] - .016, mid[2] + Math.sin(az) * width], .85 + t * .08);
      }
      previous = center;
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  geometry.userData = { kind: 'chukar-silver-sage', triangles: positions.length / 9 }; return geometry;
}

function grassGeometry(lite: boolean): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], rng = mulberry32(578);
  for (let blade = 0; blade < (lite ? 8 : 14); blade++) {
    const az = blade * 2.399, height = .28 + rng() * .40, reach = .13 + rng() * .17, width = .014 + rng() * .009;
    const x = Math.sin(az) * .07, z = Math.cos(az) * .07;
    const base = [x, 0, z], mid = [x + Math.sin(az) * reach * .30, height * .76, z + Math.cos(az) * reach * .30];
    const a = [mid[0] + Math.cos(az) * width, mid[1], mid[2] - Math.sin(az) * width];
    const b = [mid[0] - Math.cos(az) * width, mid[1], mid[2] + Math.sin(az) * width];
    const tip = [x + Math.sin(az) * reach, height * (blade % 3 ? .86 : 1), z + Math.cos(az) * reach];
    for (const [triangle, stages] of [[[base, b, a], [0, .76, .76]], [[a, b, tip], [.76, .76, 1]]] as const)
      for (const [i, p] of triangle.entries()) { positions.push(...p); const shade = .59 + stages[i] * .42; colors.push(shade, shade, shade * .94); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  geometry.userData = { kind: 'chukar-dry-bunchgrass', triangles: positions.length / 9 }; return geometry;
}

/** Full-property Great Basin environment. Geometry is instanced in local cells
 * so the view does not submit every rock and plant across the whole property. */
export class ChukarEnvironmentSystem implements Subsystem {
  readonly id = 'chukar-environment';
  private root = new THREE.Group();
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private batches: Batch[] = [];
  private wind = { value: 0 };
  private sample = { ...SAMPLE };
  private world = { x: 0, z: 0 };
  private obstacles: { x: number; z: number; radius: number }[] = [];
  private landmarkClearance: { x: number; y: number; radius: number }[];
  constructor(private readonly landscape: LandscapeModel) { this.landmarkClearance = chukarLandmarkClearance(landscape.area); }

  collisionCircles(): readonly { x: number; z: number; radius: number }[] { return this.obstacles; }

  private clear(x: number, y: number, radius: number, keepHabitat = false): boolean {
    const area = this.landscape.area, margin = radius / PROPERTY_PX_TO_M;
    if (x < area.world.x + margin || y < area.world.y + margin || x > area.world.x + area.world.w - margin || y > area.world.y + area.world.h - margin) return false;
    if (chukarTrackDistance(area, x, y) < 2.6 + radius) return false;
    if (area.dropPoints.some(d => Math.hypot(x - d.position.x, y - d.position.y) * PROPERTY_PX_TO_M < 10 + radius)) return false;
    if (area.landmarks.some(l => Math.hypot(x - l.position.x, y - l.position.y) * PROPERTY_PX_TO_M < 14 + radius)) return false;
    if (this.landmarkClearance.some(l => Math.hypot(x - l.x, y - l.y) * PROPERTY_PX_TO_M < l.radius + radius)) return false;
    return !keepHabitat || !coverAt(area, x, y, margin + 3);
  }

  private batch(geometry: THREE.BufferGeometry, material: THREE.Material, plants: Plant[], range: number, shadow: boolean, rock = false): void {
    if (!plants.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, plants.length), matrix = new THREE.Matrix4(), position = new THREE.Vector3();
    const rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), color = new THREE.Color(), normal = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), yaw = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
    for (const [i, p] of plants.entries()) {
      this.landscape.propertyToWorld(p.x, p.y, this.world); this.landscape.surfaceAtProperty(p.x, p.y, this.sample);
      let ground = this.sample.height;
      if (rock) {
        // Bury the foot below its lowest corner on a sidehill; no floating
        // downhill corners or flat support disks beneath the geology.
        const radius = Math.max(p.sx, p.sz) * .42;
        for (const [dx, dz] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius]])
          ground = Math.min(ground, this.landscape.heightAtWorld(this.world.x + dx, this.world.z + dz));
        rotation.setFromAxisAngle(axis, p.yaw);
      } else {
        normal.set(-this.sample.gradeX, 1, -this.sample.gradeZ).normalize(); rotation.setFromUnitVectors(up, normal);
        yaw.setFromAxisAngle(axis, p.yaw); rotation.multiply(yaw);
      }
      position.set(this.world.x, ground - (rock ? .10 : .018), this.world.z); scale.set(p.sx, p.sy, p.sz);
      mesh.setMatrixAt(i, matrix.compose(position, rotation, scale)); mesh.setColorAt(i, color.setHex(p.color));
      if (rock && ground + p.sy - this.sample.height > .75)
        this.obstacles.push({ x: this.world.x, z: this.world.z, radius: Math.min(p.sx, p.sz) * .37 });
    }
    mesh.name = `Chukar ${geometry.userData.kind ?? 'scenery'}`; mesh.receiveShadow = true; mesh.computeBoundingSphere();
    this.root.add(mesh); this.batches.push({ mesh, range, radius: mesh.boundingSphere!.radius, center: mesh.boundingSphere!.center.clone(), shadow });
  }

  init(ctx: Ctx): void {
    const lite = ctx.quality === 'lite', area = this.landscape.area;
    this.root.name = 'Chukar Ridge — sage benches and broken rimrock'; ctx.scene.add(this.root);
    const stones = [0, 1, 2].map(i => chukarStoneGeometry(i)), gravel = chukarStoneGeometry(3, true), grass = grassGeometry(lite), sage = sageGeometry(lite);
    for (const geometry of [...stones, gravel, grass, sage]) this.geometries.add(geometry);
    const rockMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
    this.materials.add(rockMat); this.materials.add(leafMat);
    leafMat.onBeforeCompile = shader => {
      shader.uniforms.uChukarWind = this.wind;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uChukarWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
          float windPhase = instanceMatrix[3].x * .15 + instanceMatrix[3].z * .23;
          transformed.x += sin(uChukarWind * 1.4 + windPhase) * position.y * position.y * .045;
          #endif`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(mix(normal, normalize((viewMatrix * vec4(0., 1., 0., 0.)).xyz), .65));');
    };
    leafMat.customProgramCacheKey = () => 'chukar-open-sage-wind-v1';

    // Each formation has a strong central rib and lower detached shoulders;
    // loose stone spills downslope from its foot, rather than random boulders
    // being distributed at equal density everywhere.
    for (const formation of formations(area)) {
      const rng = mulberry32(formation.seed), ribs: Plant[] = [], apron: Plant[] = [];
      for (let n = 0; n < 11; n++) {
        const u = n / 10 - .5, x = formation.x + Math.cos(formation.yaw) * u * formation.length,
          y = formation.y + Math.sin(formation.yaw) * u * formation.length;
        const width = 3.4 + rng() * 3, depth = 3.5 + rng() * 2.2;
        if (!this.clear(x, y, Math.max(width, depth) * .6, true)) continue;
        this.landscape.surfaceAtProperty(x, y, this.sample);
        const height = formation.height * (.42 + (1 - Math.abs(u) * 1.75) * .65) * (.82 + rng() * .25);
        ribs.push({ x, y, sx: width, sy: height, sz: depth, yaw: Math.PI / 2 - formation.yaw + (rng() - .5) * .22, color: STONE[n % STONE.length] });
        const slopeLength = Math.hypot(this.sample.gradeX, this.sample.gradeZ) || 1;
        const dx = -this.sample.gradeX / slopeLength, dy = -this.sample.gradeZ / slopeLength;
        for (let chip = 0; chip < (lite ? 5 : 9); chip++) {
          const reach = 3 + rng() * 13, px = x + dx * reach + (rng() - .5) * 6, py = y + dy * reach + (rng() - .5) * 6;
          const size = .32 + rng() * .75;
          if (this.clear(px, py, size * .65)) apron.push({ x: px, y: py, sx: size * 1.5, sy: size * .45, sz: size, yaw: rng() * Math.PI, color: STONE[chip % STONE.length] });
        }
      }
      this.batch(stones[formation.seed % 3], rockMat, ribs, 1250, true, true);
      this.batch(gravel, rockMat, apron, lite ? 150 : 230, false, true);
    }

    const spacing = 5.4;
    for (let ty = area.world.y; ty < area.world.y + area.world.h; ty += TILE) for (let tx = area.world.x; tx < area.world.x + area.world.w; tx += TILE) {
      const bunches: Plant[] = [], bushes: Plant[] = [], chips: Plant[] = [], outcrops: Plant[] = [];
      for (let row = 0; row < Math.ceil(TILE / spacing); row++) for (let column = 0; column < Math.ceil(TILE / spacing); column++) {
        const cellX = tx + column * spacing, cellY = ty + row * spacing, rng = mulberry32(seed(Math.round(cellX * 10), Math.round(cellY * 10), 19));
        const x = cellX + rng() * Math.min(spacing, tx + TILE - cellX), y = cellY + rng() * Math.min(spacing, ty + TILE - cellY);
        if (!this.clear(x, y, .5)) continue;
        this.landscape.surfaceAtProperty(x, y, this.sample);
        const { slope, rockiness, vegetation } = this.sample;
        const patch = coverAt(area, x, y), band = clamp(.48 + Math.sin(x * .027 + Math.sin(y * .016) * 2) * .30 + Math.cos(y * .034) * .21);
        const qualityKeep = rng();
        if (rng() < (.07 + vegetation * .80 + (patch ? .18 : 0)) * (.30 + band * .82) && slope < .95) {
          const size = .66 + rng() * .76 + (patch ? .28 : 0);
          if (!lite || qualityKeep > .28) bunches.push({ x, y, sx: size, sy: size, sz: size, yaw: rng() * Math.PI * 2, color: STRAW[Math.floor(rng() * STRAW.length)] });
        }
        if (rng() < (.012 + vegetation * .11 + (patch ? .045 : 0)) * band && slope < .72 && rockiness < .76) {
          const size = .70 + rng() * .83;
          if (!lite || qualityKeep > .30) bushes.push({ x, y, sx: size * 1.13, sy: size, sz: size, yaw: rng() * Math.PI * 2, color: SAGE[Math.floor(rng() * SAGE.length)] });
        }
        if (rng() < (.018 + rockiness * .22) * (1 - band * .45)) {
          const size = .16 + rng() * .50;
          if (!lite || qualityKeep > .40) chips.push({ x, y, sx: size * 1.5, sy: size * .43, sz: size, yaw: rng() * Math.PI * 2, color: STONE[Math.floor(rng() * STONE.length)] });
        }
        if (rng() < .0015 + rockiness * .012 && this.clear(x, y, 2.8, true)) {
          const size = 1.4 + rng() * 2.3;
          outcrops.push({ x, y, sx: size * 1.7, sy: size * .75, sz: size, yaw: Math.atan2(this.sample.gradeX, this.sample.gradeZ) + Math.PI / 2, color: STONE[Math.floor(rng() * STONE.length)] });
        }
      }
      this.batch(grass, leafMat, bunches, lite ? 100 : 165, false);
      this.batch(sage, leafMat, bushes, lite ? 210 : 320, false);
      this.batch(gravel, rockMat, chips, lite ? 100 : 170, false, true);
      this.batch(stones[seed(tx, ty) % 3], rockMat, outcrops, 800, true, true);
    }
    this.buildTrack(); this.update(ctx);
  }

  private buildTrack(): void {
    const positions: number[] = [], colors: number[] = [], dust = new THREE.Color(0xb19b78), edge = new THREE.Color(0x887e64);
    for (const trail of this.landscape.area.trails) for (let n = 1; n < trail.points.length; n++) {
      const a = trail.points[n - 1], b = trail.points[n], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      if (length < .01) continue;
      const count = Math.ceil(length / 2.5), rx = -dy / length, ry = dx / length;
      const row = (t: number) => [-1, -.55, .55, 1].map((across, i) => {
        const x = a.x + dx * t + rx * across * 2.2, y = a.y + dy * t + ry * across * 2.2;
        this.landscape.propertyToWorld(x, y, this.world);
        return { p: [this.world.x, this.landscape.heightAtProperty(x, y) + .035, this.world.z], c: i === 0 || i === 3 ? edge : dust };
      });
      for (let i = 0; i < count; i++) {
        const near = row(i / count), far = row((i + 1) / count);
        for (let across = 0; across < 3; across++) for (const v of [near[across], far[across], near[across + 1], near[across + 1], far[across], far[across + 1]]) {
          positions.push(...v.p); colors.push(v.c.r, v.c.g, v.c.b);
        }
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Chukar dusty contour access tracks'; mesh.receiveShadow = true;
    this.geometries.add(geometry); this.materials.add(material); this.root.add(mesh);
  }

  update(ctx: Ctx): void {
    this.wind.value = ctx.time;
    for (const batch of this.batches) {
      const distance = Math.hypot(ctx.camera.position.x - batch.center.x, ctx.camera.position.z - batch.center.z);
      batch.mesh.visible = distance < batch.range + batch.radius;
      batch.mesh.castShadow = batch.shadow && distance < 110 + batch.radius;
    }
  }

  dispose(ctx: Ctx): void {
    ctx.scene.remove(this.root); for (const batch of this.batches) batch.mesh.dispose();
    for (const geometry of this.geometries) geometry.dispose(); for (const material of this.materials) material.dispose();
    this.root.clear(); this.batches.length = 0; this.obstacles.length = 0; this.geometries.clear(); this.materials.clear();
  }
}
