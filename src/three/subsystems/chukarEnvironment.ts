import * as THREE from 'three';
import type { AreaConfig } from '../../game/areas';
import { chukarRimBlockers, chukarRimModules, type ChukarRimModule } from '../../game/chukarCanyon';
import { chukarGroundAt, type ChukarGround } from '../../game/chukarHabitat';
import { PROPERTY_PX_TO_M, type GroundSample, type LandscapeModel } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import { chukarLandmarkClearance } from './chukarLandmarks';
import { applyChukarRockWeathering } from './chukarRockMaterial';
import { chukarPlantGroupAt, chukarTrackSectionAt } from './chukarSurface';
import { VegetationWind, VEGETATION_GUST_GLSL, VEGETATION_INSTANCE_WIND_GLSL } from './vegetationWind';
import { chukarGrassGeometry, chukarSageGeometry } from '../assets/chukarPlants';
import { CHUKAR_GROUND_DETAIL } from './chukarTerrain';
import { groundQuailTrackGeometry, applyQuailTrackGroundLod, sampleQuailGroundHeights } from './quailGroundGeometry';
import { applyQuailGrassGroundLod, createQuailGrassGroundGeometry } from './quailGrassGround';
import { SolidShotGeometry } from '../solidShotGeometry';
import { buildChukarHistory, chukarHistoryOccupies } from './chukarHistory';
import { ChukarRimrock } from './chukarRimrock';
import { chukarCattleTrails } from './chukarCattleTrails';

/** Plant and talus tiles stream in around the hunter, property yards. */
const TILE = 128;
const TRACK_HALF_WIDTH_M = .8;
const SPACING = 2.65;
/** Ranges (metres) at which each kind of scatter is drawn. */
const RANGE = {
  high: { grass: 150, sage: 190, chips: 130, talus: 300, build: 320 },
  lite: { grass: 95, sage: 130, chips: 80, talus: 200, build: 215 },
} as const;
/** Past this distance (m) from a tile's edge only its thinned share is
 * drawn: one grass bunch in THIN_GRASS and one sage in THIN_SAGE. */
const DENSE_RANGE = { high: 45, lite: 30 } as const;
const THIN_GRASS = 3, THIN_SAGE = 2;
/** Share of grass and sage candidates each tier keeps up close. */
const KEEP = { high: { grass: .62, sage: .7 }, lite: { grass: .34, sage: .4 } } as const;
/** Tiles built per frame while walking; a jump builds everything at once. */
const TILES_PER_FRAME = 1;

/** Basalt talus: dark grey-brown blocks, a few paler weathered faces. */
const STONE = [0x6d665e, 0x5f5953, 0x7b746b, 0x857e74, 0x67615a];
/** Big sagebrush in October: silver-grey, never saturated green. */
export const CHUKAR_SAGE_TONES = [0x828a78, 0x767d6c, 0x8c9282, 0x7d8373];
const SAGE = CHUKAR_SAGE_TONES;
/** Cheatgrass bleached to gold; bluebunch wheatgrass cured tawny. */
const CHEAT = [0xc5b086, 0xcfba8e, 0xb9a47b, 0xd5c299];
const BUNCH = [0xab9c6d, 0xb5a576, 0x9f936b, 0xa89a72];
const SEEP_GREEN = [0x6f8c4c, 0x7f9a55, 0x8ea65e];
const SAMPLE: GroundSample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
function seed(x: number, y: number, salt = 0): number {
  return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(salt + 7701, 83492791)) >>> 0;
}

interface Plant { x: number; y: number; yaw: number; sx: number; sy: number; sz: number; color: number; /** Kept in the thinned far share. */ far?: boolean }
interface Batch { mesh: THREE.InstancedMesh; range: number; radius: number; center: THREE.Vector3; shadow: boolean; nearGeometry: THREE.BufferGeometry; farGeometry?: THREE.BufferGeometry; detailRange: number; shadowRange: number; owned: THREE.BufferGeometry[];
  /** Instances in the far share (drawn first); the rest only up close. */ farCount: number; total: number }
interface Tile { key: number; x: number; y: number; batches: Batch[] }

/** Property-space distance keeps the same paths open from either parking place. */
export function chukarTrackDistance(area: AreaConfig, x: number, y: number): number {
  let distance = Infinity;
  for (const trail of area.trails) for (let i = 1; i < trail.points.length; i++) {
    const a = trail.points[i - 1], b = trail.points[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    distance = Math.min(distance, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
  }
  return distance * PROPERTY_PX_TO_M;
}

/** A coarse lookup of ground the routes keep open: cells within reach of a trail. */
class TrackMask {
  private readonly cells = new Set<number>();
  constructor(area: AreaConfig, private readonly cell: number, reachYards: number) {
    for (const trail of area.trails) for (let i = 1; i < trail.points.length; i++) {
      const a = trail.points[i - 1], b = trail.points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
      for (let d = 0; d <= length; d += cell * .5) {
        const x = a.x + (b.x - a.x) * d / (length || 1), y = a.y + (b.y - a.y) * d / (length || 1);
        for (let j = Math.floor((y - reachYards) / cell); j <= Math.floor((y + reachYards) / cell); j++)
          for (let k = Math.floor((x - reachYards) / cell); k <= Math.floor((x + reachYards) / cell); k++) this.cells.add(j * 65536 + k);
      }
    }
  }
  near(x: number, y: number): boolean { return this.cells.has(Math.floor(y / this.cell) * 65536 + Math.floor(x / this.cell)); }
}

/** Angular basalt blocks: a jittered box, every face flat, opaque and instanced. */
export function chukarStoneGeometry(variant = 0, gravel = false): THREE.BufferGeometry {
  const rng = mulberry32(4401 + variant * 97), corner = (sx: number, sy: number, sz: number) =>
    new THREE.Vector3(sx * (.5 + (rng() - .5) * .22), sy > 0 ? .55 + rng() * .45 : 0, sz * (.5 + (rng() - .5) * .22));
  const v = [corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1), corner(-1, 1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(-1, 1, 1)];
  // Pull the top in a little so blocks read as broken stone, not crates.
  for (let i = 4; i < 8; i++) { v[i].x *= .82 + rng() * .12; v[i].z *= .8 + rng() * .14; }
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const positions: number[] = [], colors: number[] = [];
  faces.forEach((f, i) => {
    if (gravel && i === 0) return;
    const shade = [.7, 1.08, .92, .86, .95, .82][i] * (.94 + rng() * .1);
    // Faces are listed clockwise from outside; emit them counter-clockwise.
    for (const tri of [[f[0], f[2], f[1]], [f[0], f[3], f[2]]]) for (const k of tri) { positions.push(v[k].x, v[k].y, v[k].z); colors.push(shade, shade * .98, shade * .95); }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  geometry.userData = { kind: gravel ? 'chukar-talus' : 'chukar-fractured-stone', triangles: positions.length / 9 };
  return geometry;
}

/** Full-property Great Basin environment: rimrock, talus, plants from the
 * land's habitat, cattle trails and the remembered places. Plants and talus
 * stream in tiles around the hunter so a ground three times the size costs
 * the same to draw. */
export class ChukarEnvironmentSystem implements Subsystem {
  readonly id = 'chukar-environment';
  private root = new THREE.Group();
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private tiles = new Map<number, Tile>();
  private wind = { value: 0 };
  private huntWind = new VegetationWind();
  private leafFill = { value: .22 };
  private viewPosition = { value: new THREE.Vector3() };
  private groundDetail: { near: number; far: number; range: number } = CHUKAR_GROUND_DETAIL.high;
  private plantDepth?: THREE.MeshDepthMaterial;
  private sample = { ...SAMPLE };
  private ground: ChukarGround = { cover: 'cheat', sage: 0, cheat: 0, bunchgrass: 0, talus: 0, rimrock: 0, seep: 0, s: 0, band: '', draw: 0, crest: 0, southness: 0 };
  private world = { x: 0, z: 0 };
  private obstacles: { x: number; z: number; radius: number }[] = [];
  private shotSolids = new SolidShotGeometry();
  private landmarkClearance: { x: number; y: number; radius: number }[];
  private rimrock?: ChukarRimrock;
  private track?: TrackMask;
  private kit?: { stones: THREE.BufferGeometry[]; gravel: THREE.BufferGeometry; grass: THREE.BufferGeometry; sage: THREE.BufferGeometry; farGrass: THREE.BufferGeometry; farSage: THREE.BufferGeometry;
    rockMat: THREE.Material; leafMat: THREE.Material; sageMat: THREE.Material };
  private quality: 'high' | 'lite' = 'high';
  private modulesByTile = new Map<number, ChukarRimModule[]>();
  private lastStream = new THREE.Vector2(Infinity, Infinity);
  constructor(private readonly landscape: LandscapeModel) {
    this.landmarkClearance = chukarLandmarkClearance(landscape.area);
    // The rimrock is solid for the hunter as it is for the dog (hunt3d reads
    // the same blockers from the landscape).
    for (const b of chukarRimBlockers()) {
      const p = landscape.propertyToWorld(b.x, b.y, { x: 0, z: 0 });
      this.obstacles.push({ x: p.x, z: p.z, radius: b.radius * PROPERTY_PX_TO_M });
    }
    for (const m of chukarRimModules()) {
      const key = this.tileKey(m.x, m.y);
      (this.modulesByTile.get(key) ?? this.modulesByTile.set(key, []).get(key)!).push(m);
    }
  }

  collisionCircles(): readonly { x: number; z: number; radius: number }[] { return this.obstacles; }

  blocksShot(origin: THREE.Vector3Like, target: THREE.Vector3Like): boolean { return this.shotSolids.blocks(origin, target); }

  private tileKey(x: number, y: number): number { return (Math.floor(y / TILE) + 64) * 1024 + Math.floor(x / TILE) + 64; }

  private clear(x: number, y: number, radius: number): boolean {
    const area = this.landscape.area, margin = radius / PROPERTY_PX_TO_M;
    if (x < area.world.x + margin || y < area.world.y + margin || x > area.world.x + area.world.w - margin || y > area.world.y + area.world.h - margin) return false;
    if (this.track!.near(x, y) && chukarTrackDistance(area, x, y) < TRACK_HALF_WIDTH_M + .35 + radius) return false;
    if (area.dropPoints.some(d => Math.hypot(x - d.position.x, y - d.position.y) * PROPERTY_PX_TO_M < 10 + radius)) return false;
    if (this.landmarkClearance.some(l => Math.hypot(x - l.x, y - l.y) * PROPERTY_PX_TO_M < l.radius + radius)) return false;
    return !chukarHistoryOccupies(x, y, radius);
  }

  private batch(tile: Tile, geometry: THREE.BufferGeometry, material: THREE.Material, plants: Plant[], range: number, shadow: boolean, rock = false, farGeometry?: THREE.BufferGeometry, detailRange = 65, shadowRange = 110): void {
    if (!plants.length) return;
    // The far share first, so drawing a prefix of the instances thins them.
    const farCount = plants.some(p => p.far !== undefined) ? plants.filter(p => p.far).length : plants.length;
    if (farCount < plants.length) plants = [...plants.filter(p => p.far), ...plants.filter(p => !p.far)];
    const owned: THREE.BufferGeometry[] = [];
    const grounds = rock ? null : new Float32Array(plants.length * 3);
    if (grounds) {
      geometry = createQuailGrassGroundGeometry(geometry, grounds); owned.push(geometry);
      if (farGeometry) { farGeometry = createQuailGrassGroundGeometry(farGeometry, grounds); owned.push(farGeometry); }
    }
    const mesh = new THREE.InstancedMesh(geometry, material, plants.length), matrix = new THREE.Matrix4(), position = new THREE.Vector3();
    let maxGroundShift = 0;
    const rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), color = new THREE.Color(), normal = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), yaw = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
    for (const [i, p] of plants.entries()) {
      this.landscape.propertyToWorld(p.x, p.y, this.world); this.landscape.surfaceAtProperty(p.x, p.y, this.sample);
      let ground = this.sample.height;
      if (grounds) {
        const fitted = sampleQuailGroundHeights(this.landscape, p.x, p.y, undefined, this.groundDetail);
        ground = fitted.nearY;
        grounds.set([fitted.farY - fitted.nearY, fitted.tileCenterX, fitted.tileCenterZ], i * 3);
        maxGroundShift = Math.max(maxGroundShift, Math.abs(fitted.farY - fitted.nearY));
        normal.set(-this.sample.gradeX, 1, -this.sample.gradeZ).normalize(); rotation.setFromUnitVectors(up, normal);
        yaw.setFromAxisAngle(axis, p.yaw); rotation.multiply(yaw);
      } else {
        // Bury the foot below its lowest corner on a sidehill.
        const radius = Math.max(p.sx, p.sz) * .42;
        for (const [dx, dz] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius]])
          ground = Math.min(ground, this.landscape.heightAtWorld(this.world.x + dx, this.world.z + dz));
        rotation.setFromAxisAngle(axis, p.yaw);
      }
      position.set(this.world.x, ground - (rock ? Math.min(.1, p.sy * .12) : .018), this.world.z); scale.set(p.sx, p.sy, p.sz);
      mesh.setMatrixAt(i, matrix.compose(position, rotation, scale)); mesh.setColorAt(i, color.setHex(p.color));
    }
    mesh.name = `Chukar ${geometry.userData.kind ?? 'scenery'}`; mesh.receiveShadow = true; mesh.computeBoundingSphere();
    mesh.boundingSphere!.radius += maxGroundShift + (grounds ? .15 : 0);
    if (grounds) mesh.customDepthMaterial = this.plantDepth;
    this.root.add(mesh);
    tile.batches.push({ mesh, range, radius: mesh.boundingSphere!.radius, center: mesh.boundingSphere!.center.clone(), shadow, nearGeometry: geometry, farGeometry, detailRange, shadowRange, owned, farCount, total: plants.length });
  }

  private plantVertexShader(shader: THREE.WebGLProgramParametersWithUniforms): void {
    shader.uniforms.uChukarWind = this.wind;
    shader.uniforms.uChukarWindDirection = this.huntWind.direction;
    shader.uniforms.uChukarWindStrength = this.huntWind.strength;
    shader.uniforms.uChukarViewPosition = this.viewPosition;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uChukarWind;\nuniform vec2 uChukarWindDirection;\nuniform float uChukarWindStrength;\nuniform vec3 uChukarViewPosition;' + VEGETATION_GUST_GLSL + VEGETATION_INSTANCE_WIND_GLSL)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float gust=vegetationGust(uChukarWind,instanceMatrix[3].xz,uChukarWindDirection);
        transformed+=vegetationInstanceWind(uChukarWindDirection)*gust*uChukarWindStrength*position.y*position.y*.035;
        #endif`);
    applyQuailGrassGroundLod(shader, this.groundDetail.range);
    // Shadow depth uses the player's terrain tier, not the light camera's
    // position. Both passes also share exactly the same wind displacement.
    shader.vertexShader = shader.vertexShader.replace('quailInstanceGround.yz - cameraPosition.xz', 'quailInstanceGround.yz - uChukarViewPosition.xz');
  }

  async init(ctx: Ctx): Promise<void> {
    const lite = ctx.quality === 'lite';
    this.quality = ctx.quality;
    this.huntWind.connect(ctx);
    this.groundDetail = CHUKAR_GROUND_DETAIL[ctx.quality];
    this.root.name = 'Chukar Ridge — basalt rims, talus, cheat and sage'; ctx.scene.add(this.root);
    this.track = new TrackMask(this.landscape.area, 4, 3);
    const stones = [0, 1, 2].map(i => chukarStoneGeometry(i)), gravel = chukarStoneGeometry(3, true), grass = chukarGrassGeometry(lite), sage = chukarSageGeometry(lite);
    const farGrass = lite ? grass : chukarGrassGeometry(true), farSage = lite ? sage : chukarSageGeometry(true);
    for (const geometry of [...stones, gravel, grass, sage, farGrass, farSage]) this.geometries.add(geometry);
    const rockMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, emissive: 0x4a4c48, emissiveIntensity: .06 });
    applyChukarRockWeathering(rockMat);
    const rimMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, emissive: 0x4f5560, emissiveIntensity: .07 });
    this.plantDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    this.plantDepth.onBeforeCompile = shader => this.plantVertexShader(shader);
    this.plantDepth.customProgramCacheKey = () => 'chukar-hunt-wind-ground-depth-v2';
    this.materials.add(this.plantDepth);
    const plantMaterial = (tilt: number) => {
      const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
      material.onBeforeCompile = shader => {
        shader.uniforms.uChukarLeafFill = this.leafFill;
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uChukarLeafFill;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uChukarLeafFill;');
        shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
            objectNormal=normalize(mix(objectNormal,vec3(0.,1.,0.),${tilt.toFixed(2)}));`);
        this.plantVertexShader(shader);
      };
      material.customProgramCacheKey = () => `chukar-hunt-wind-plant-ground-v5-${tilt}`;
      this.materials.add(material); return material;
    };
    const leafMat = plantMaterial(.55), sageMat = plantMaterial(.5);
    this.materials.add(rockMat); this.materials.add(rimMat);
    this.kit = { stones, gravel, grass, sage, farGrass, farSage, rockMat, leafMat, sageMat };

    this.rimrock = new ChukarRimrock(this.landscape, ctx.quality, rimMat);
    this.root.add(this.rimrock.root);
    this.shotSolids.add(this.rimrock.far);
    this.buildTrack(ctx);
    const cattle = chukarCattleTrails(this.landscape, CHUKAR_GROUND_DETAIL[ctx.quality], ctx.quality);
    if (cattle) { this.geometries.add(cattle.geometry); this.materials.add(cattle.material as THREE.Material); this.root.add(cattle); }
    buildChukarHistory({ landscape: this.landscape, quality: ctx.quality, castShadow: ctx.quality === 'high', obstacles: this.obstacles,
      addSolid: mesh => this.shotSolids.add(mesh), keep: object => this.root.add(object),
      own: resource => { if (resource instanceof THREE.BufferGeometry) this.geometries.add(resource); else this.materials.add(resource); } });
    this.update(ctx, 0);
  }

  /** One tile's plants, chips and talus aprons, from the land's habitat. */
  private buildTile(tx: number, ty: number): Tile {
    const tile: Tile = { key: this.tileKey(tx, ty), x: tx, y: ty, batches: [] };
    const lite = this.quality === 'lite', kit = this.kit!, range = RANGE[this.quality], area = this.landscape.area;
    const bunches: Plant[] = [], bushes: Plant[] = [], chips: Plant[] = [], blocks: Plant[] = [];
    const g = this.ground;
    for (let row = 0; row < Math.ceil(TILE / SPACING); row++) for (let column = 0; column < Math.ceil(TILE / SPACING); column++) {
      const cellX = tx + column * SPACING, cellY = ty + row * SPACING, rng = mulberry32(seed(Math.round(cellX * 10), Math.round(cellY * 10), 19));
      const x = cellX + rng() * SPACING, y = cellY + rng() * SPACING;
      if (x > area.world.x + area.world.w || y > area.world.y + area.world.h) continue;
      // Generate every candidate's draws in both tiers; thinning never
      // shifts the remaining stands across the field.
      const qualityKeep = rng(), choice = rng(), sizeRoll = rng(), yaw = rng() * Math.PI * 2, colorRoll = rng(), chipRoll = rng(), chipSize = rng();
      if (!this.clear(x, y, .5)) continue;
      chukarGroundAt(x, y, g);
      if (g.rimrock > .3) continue;
      this.landscape.surfaceAtProperty(x, y, this.sample);
      const slope = this.sample.slope, group = chukarPlantGroupAt(x, y), tone = group * .72 + colorRoll * .28;
      const pick = (palette: readonly number[]) => palette[Math.min(palette.length - 1, Math.floor(tone * palette.length))];
      const sageChance = Math.min(.72, Math.pow(g.sage, 1.15) * .8) * (1 - g.seep * .9);
      const grassChance = (g.cheat * .6 + g.bunchgrass * .65) * (1 - g.talus * .85) + g.seep * .75;
      let planted = false;
      if (choice < sageChance && slope < .95) {
        const size = .5 + sizeRoll * .55 + g.draw * .22;
        if (qualityKeep < KEEP[this.quality].sage && this.clear(x, y, size * .8)) { bushes.push({ x, y, sx: size * 1.05, sy: size * .92, sz: size, yaw, color: pick(SAGE), far: Math.floor(chipRoll * 97) % THIN_SAGE === 0 }); planted = true; }
      } else if (choice < sageChance + grassChance && slope < 1.05) {
        // Cheat is short and fine; bluebunch stands taller in bunches.
        const bunch = g.bunchgrass > g.cheat, size = (bunch ? .8 + sizeRoll * .45 : .55 + sizeRoll * .3) + g.seep * .3;
        if (qualityKeep < KEEP[this.quality].grass) {
          const color = g.seep > .25 ? pick(SEEP_GREEN) : bunch ? pick(BUNCH) : pick(CHEAT);
          bunches.push({ x, y, sx: size * 1.1, sy: size * (bunch ? 1 : .72), sz: size * 1.1, yaw: -.65 + (yaw - Math.PI) * .22, color, far: Math.floor(chipRoll * 97) % THIN_GRASS === 0 }); planted = true;
        }
      }
      // Scree on the talus and steep broken ground.
      if (!planted && chipRoll < g.talus * .6 + Math.max(0, slope - .55) * .3 && (!lite || qualityKeep > .4)) {
        const size = .16 + chipSize * .36;
        chips.push({ x, y, sx: size * 1.5, sy: size * .45, sz: size, yaw, color: STONE[Math.floor(colorRoll * STONE.length)] });
      }
    }
    // Talus aprons: blocks spilling from the foot of each rim module here.
    for (const m of this.modulesByTile.get(tile.key) ?? []) {
      const rng = mulberry32(seed(Math.round(m.x * 4), Math.round(m.y * 4), 31)), count = lite ? 4 : 8;
      const tx2 = -m.ny, ty2 = m.nx;
      for (let i = 0; i < count; i++) {
        const reach = 1.8 + Math.pow(rng(), 1.5) * 15, along = (rng() - .5) * 4.6;
        const px = m.x + m.nx * reach + tx2 * along, py = m.y + m.ny * reach + ty2 * along;
        const size = (.35 + rng() * .9) * (reach < 4 ? 1.3 : 1) * (1 + m.decay * .4);
        if (!this.clear(px, py, size * .5) || chukarGroundAt(px, py, g).rimrock > .3) continue;
        blocks.push({ x: px, y: py, sx: size * 1.25, sy: size * .95, sz: size, yaw: rng() * Math.PI * 2, color: STONE[Math.floor(rng() * STONE.length)] });
      }
    }
    // The detailed plant geometry only on the tile underfoot; every other
    // tile draws the lighter form (and past DENSE_RANGE only its far share).
    this.batch(tile, kit.grass, kit.leafMat, bunches, range.grass, false, false, kit.farGrass, 0);
    this.batch(tile, kit.sage, kit.sageMat, bushes, range.sage, !lite, false, kit.farSage, 10, 30);
    this.batch(tile, kit.gravel, kit.rockMat, chips, range.chips, false, true);
    this.batch(tile, kit.stones[(tile.key >>> 0) % 3], kit.rockMat, blocks, range.talus, !lite, true, undefined, 65, 90);
    return tile;
  }

  private disposeTile(tile: Tile): void {
    for (const batch of tile.batches) { batch.mesh.removeFromParent(); batch.mesh.dispose(); for (const g of batch.owned) g.dispose(); }
    tile.batches.length = 0;
  }

  /** Build tiles within reach of the camera (all at once after a jump), drop far ones. */
  private stream(camera: THREE.Vector3, all: boolean): void {
    const build = RANGE[this.quality].build, area = this.landscape.area;
    const centre = this.landscape.worldToProperty(camera.x, camera.z, { x: 0, y: 0 }), reach = build / PROPERTY_PX_TO_M;
    const wanted: { x: number; y: number; d: number }[] = [];
    for (let ty = Math.floor(Math.max(area.world.y, centre.y - reach) / TILE) * TILE; ty < Math.min(area.world.y + area.world.h, centre.y + reach); ty += TILE)
      for (let tx = Math.floor(Math.max(area.world.x, centre.x - reach) / TILE) * TILE; tx < Math.min(area.world.x + area.world.w, centre.x + reach); tx += TILE) {
        const nx = Math.max(tx, Math.min(centre.x, tx + TILE)), ny = Math.max(ty, Math.min(centre.y, ty + TILE));
        const d = Math.hypot(nx - centre.x, ny - centre.y);
        if (d <= reach && !this.tiles.has(this.tileKey(tx, ty))) wanted.push({ x: tx, y: ty, d });
      }
    wanted.sort((a, b) => a.d - b.d);
    for (const w of all ? wanted : wanted.slice(0, TILES_PER_FRAME)) {
      const tile = this.buildTile(w.x, w.y);
      this.tiles.set(tile.key, tile);
    }
    for (const [key, tile] of this.tiles) {
      const nx = Math.max(tile.x, Math.min(centre.x, tile.x + TILE)), ny = Math.max(tile.y, Math.min(centre.y, tile.y + TILE));
      if (Math.hypot(nx - centre.x, ny - centre.y) > reach * 1.5) { this.disposeTile(tile); this.tiles.delete(key); }
    }
  }

  private buildTrack(ctx: Ctx): void {
    const positions: number[] = [], colors: number[] = [], dust = new THREE.Color(0xbfb08f), edge = new THREE.Color(0x92846a);
    const section = { left: 0, right: 0, center: 0, wear: 0 };
    for (const trail of this.landscape.area.trails) for (let n = 1; n < trail.points.length; n++) {
      const a = trail.points[n - 1], b = trail.points[n], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      if (length < .01) continue;
      const count = Math.ceil(length / 2.5), rx = -dy / length, ry = dx / length;
      const row = (t: number) => {
        const cx = a.x + dx * t, cy = a.y + dy * t; chukarTrackSectionAt(cx, cy, section);
        return [-1, -.48, .48, 1].map((across, i) => {
          const offset = (section.center + across * (across < 0 ? section.left : section.right)) / PROPERTY_PX_TO_M;
          const x = cx + rx * offset, y = cy + ry * offset;
          this.landscape.propertyToWorld(x, y, this.world);
          return { p: [this.world.x, this.landscape.heightAtProperty(x, y) + .035, this.world.z], c: i === 0 || i === 3 ? edge : dust, alpha: i === 0 || i === 3 ? 0 : section.wear };
        });
      };
      for (let i = 0; i < count; i++) {
        const near = row(i / count), far = row((i + 1) / count);
        for (let across = 0; across < 3; across++) for (const v of [near[across], far[across], near[across + 1], near[across + 1], far[across], far[across + 1]]) {
          positions.push(...v.p); colors.push(v.c.r, v.c.g, v.c.b, v.alpha);
        }
      }
    }
    const source = new THREE.BufferGeometry(); source.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    source.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    source.setIndex(Array.from({ length: positions.length / 3 }, (_, i) => i));
    const detail = CHUKAR_GROUND_DETAIL[ctx.quality];
    // Clip at tile seams and follow the rendered triangles in both terrain tiers.
    const geometry = groundQuailTrackGeometry(this.landscape, source, detail); source.dispose();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide });
    material.customProgramCacheKey = () => 'chukar-footpath-worn-contour-v3';
    const origin = this.landscape.worldToProperty(0, 0, { x: 0, y: 0 });
    material.onBeforeCompile = shader => {
      shader.uniforms.uChukarPathOrigin = { value: new THREE.Vector2(origin.x * PROPERTY_PX_TO_M, origin.y * PROPERTY_PX_TO_M) };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPathGround; uniform vec2 uChukarPathOrigin;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPathGround=position.xz+uChukarPathOrigin;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vPathGround;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float wear=.5+.5*sin(vPathGround.x*1.3+sin(vPathGround.y*.83)*2.)*sin(vPathGround.y*2.1);
          float worn=.5+.5*sin(vPathGround.x*.49-vPathGround.y*.37+sin(vPathGround.y*.16)*1.4);
          float detail=1.-smoothstep(.25,.75,max(fwidth(vPathGround.x),fwidth(vPathGround.y)));
          diffuseColor.a *= mix(.73,.46+wear*.42+worn*.22,detail);
          diffuseColor.rgb *= .90+worn*.14;`);
    };
    applyQuailTrackGroundLod(material, ctx.quality, detail.range);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Chukar dusty contour access tracks'; mesh.receiveShadow = true;
    this.geometries.add(geometry); this.materials.add(material); this.root.add(mesh);
  }

  update(ctx: Ctx, dt = 1 / 60): void {
    this.wind.value = ctx.time;
    this.huntWind.update();
    this.viewPosition.value.copy(ctx.camera.position);
    this.leafFill.value = ctx.timeOfDay === 'morning' || ctx.timeOfDay === 'noon' ? .16 : .035;
    const camera = ctx.camera.position;
    const jumped = Math.hypot(camera.x - this.lastStream.x, camera.z - this.lastStream.y) > 60;
    if (this.kit) this.stream(camera, jumped || dt === 0);
    this.lastStream.set(camera.x, camera.z);
    this.rimrock?.update(camera);
    for (const tile of this.tiles.values()) for (const batch of tile.batches) {
      const distance = Math.hypot(camera.x - batch.center.x, camera.z - batch.center.z);
      batch.mesh.visible = distance < batch.range + batch.radius;
      batch.mesh.count = distance - batch.radius > DENSE_RANGE[this.quality] ? batch.farCount : batch.total;
      batch.mesh.castShadow = batch.shadow && distance < batch.shadowRange + batch.radius;
      if (batch.farGeometry) batch.mesh.geometry = distance > batch.detailRange + batch.radius * .5 ? batch.farGeometry : batch.nearGeometry;
    }
  }

  /** Telemetry for reviews: streamed tiles and rim triangles. */
  stats(): { tiles: number; batches: number; rim: ReturnType<ChukarRimrock['stats']> | null } {
    let batches = 0; for (const tile of this.tiles.values()) batches += tile.batches.length;
    return { tiles: this.tiles.size, batches, rim: this.rimrock?.stats() ?? null };
  }

  dispose(ctx: Ctx): void {
    this.shotSolids.dispose();
    ctx.scene.remove(this.root);
    for (const tile of this.tiles.values()) this.disposeTile(tile);
    this.rimrock?.dispose();
    for (const geometry of this.geometries) geometry.dispose(); for (const material of this.materials) material.dispose();
    this.root.clear(); this.tiles.clear(); this.obstacles.length = 0; this.geometries.clear(); this.materials.clear();
  }
}
