import * as THREE from 'three';
import type { GroundSample, LandscapeModel } from '../../game/landscape';
import { PROPERTY_PX_TO_M } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import type { Hunt3DSystem } from './hunt3d';

import { pheasantCoverAt, pheasantCoverFringeAt, pheasantFields, samplePheasantHarvest, pheasantPlantClear, pheasantPonds } from './pheasantLandscape';

function cellSeed(x: number, z: number, seed: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function habitatGeometry(kind: 'prairie' | 'cattail' | 'stubble' | 'litter', lite: boolean, distant = false, medium = false): THREE.BufferGeometry {
  const rng = mulberry32(kind === 'prairie' ? 0x51a7 : kind === 'cattail' ? 0xca77 : 0x57bb1e);
  const positions: number[] = [];
  const colors: number[] = [];
  const roots: number[] = [];
  let rootX = 0, rootZ = 0;
  const push = (vertices: number[], color: THREE.Color): void => {
    positions.push(...vertices);
    for (let i = 0; i < vertices.length; i += 3) {
      // A restrained root-to-tip gradient gives overlapping blades depth
      // without textures, alpha overdraw or another rendering pass.
      const light = kind === 'prairie' || kind === 'cattail'
        ? .68 + Math.min(1, vertices[i + 1] / (kind === 'cattail' ? 1.7 : .9)) * .45 : 1;
      colors.push(color.r * light, color.g * light, color.b * light);
      roots.push(rootX, 0, rootZ);
    }
  };
  // Instance tinting multiplies these vertex colors, so keep the blades light.
  // The variation belongs in the instance palette, not in nearly-black stems.
  const straw = new THREE.Color(0xfff0c2);
  const olive = new THREE.Color(0xcdd09f);
  const reed = new THREE.Color(0xe8d7a2);
  const head = new THREE.Color(0x7a5231);

  if (kind === 'litter') {
    // Fallen stems form small, broken mats, rather than upright miniature
    // grass. Broad enough to read at walking height, with no alpha texture.
    for (let i = 0; i < 10; i++) {
      const angle = rng() * Math.PI * 2, length = .18 + rng() * .50;
      const x = (rng() - .5) * 1.8, z = (rng() - .5) * 1.8;
      const dx = Math.cos(angle), dz = Math.sin(angle), width = .015 + rng() * .025;
      const y = .035 + rng() * .018;
      push([
        x - dz * width, y, z + dx * width,
        x + dz * width, y, z - dx * width,
        x + dx * length + dz * width * .25, y + .01, z + dz * length - dx * width * .25,
        x - dz * width, y, z + dx * width,
        x + dx * length + dz * width * .25, y + .01, z + dz * length - dx * width * .25,
        x + dx * length - dz * width * .25, y + .01, z + dz * length + dx * width * .25,
      ], straw.clone().lerp(olive, rng() * .45).multiplyScalar(.68 + rng() * .18));
    }
  }

  const count = kind === 'litter' ? 0 : kind === 'prairie' ? (distant ? 4 : medium ? 7 : lite ? 10 : 18) : kind === 'cattail' ? (distant ? 3 : medium ? 4 : lite ? 5 : 8) : (lite ? 7 : 12);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.42;
    const sx = Math.sin(angle);
    const sz = Math.cos(angle);
    const px = Math.cos(angle);
    const pz = -Math.sin(angle);
    const root = rng() * (kind === 'stubble' ? 0.67 : kind === 'cattail' ? 0.55 : 0.66);
    const x = sx * root;
    const z = sz * root;
    rootX = x; rootZ = z;
    // Lite renders without multisampling. Fewer broader blades preserve a
    // tuft's body better than thin geometry that alternates between pixels.
    const width = (kind === 'cattail' ? 0.018 : kind === 'prairie' ? 0.045 + rng() * 0.040 : 0.014 + rng() * 0.018) * (distant ? 3 : medium ? 2 : lite ? 1.65 : 1);
    const height = kind === 'prairie'
      ? 0.46 + rng() * 0.65
      : kind === 'cattail'
        ? 1.55 + rng() * 0.64
        : 0.11 + rng() * 0.22;
    const lean = kind === 'stubble' ? 0.015 : 0.12 + rng() * (kind === 'cattail' ? 0.24 : 0.58);
    const curve = (rng() - 0.5) * (kind === 'cattail' ? 0.08 : 0.28);
    const tone = kind === 'cattail'
      ? reed.clone().lerp(straw, rng() * 0.22)
      : straw.clone().lerp(olive, rng() * (kind === 'stubble' ? 0.2 : 0.42));
    const midX = x + sx * lean * 0.34 + px * curve * 0.35;
    const midZ = z + sz * lean * 0.34 + pz * curve * 0.35;
    const tipX = x + sx * lean + px * curve;
    const tipZ = z + sz * lean + pz * curve;
    const midY = height * 0.54;
    const nearPrairie = kind === 'prairie' && !distant && !medium;
    const rootWidth = kind === 'prairie' ? width * (nearPrairie ? .16 : .38) : width;
    if (kind === 'prairie' && !distant) {
      // Standing grass carries its seed on a culm above arching leaves.
      // Separate that fine upper structure from the broad lower foliage.
      // These points consume no new RNG, preserving the authored roots.
      const stalkWidth = medium ? .012 : .007;
      const stalkTipWidth = stalkWidth * (medium ? 1 : .22);
      push([
        x-px*stalkWidth,0,z-pz*stalkWidth, x+px*stalkWidth,0,z+pz*stalkWidth,
        tipX+px*stalkTipWidth,height,tipZ+pz*stalkTipWidth,
        x-px*stalkWidth,0,z-pz*stalkWidth, tipX+px*stalkTipWidth,height,tipZ+pz*stalkTipWidth,
        tipX-px*stalkTipWidth,height,tipZ-pz*stalkTipWidth,
      ],tone);
      const shoulderX=x+sx*lean*.42+px*curve*.2;
      const shoulderZ=z+sz*lean*.42+pz*curve*.2;
      const shoulderY=height*.58;
      const endX=x+sx*lean*1.34+px*curve;
      const endZ=z+sz*lean*1.34+pz*curve;
      const endY=height*(.58+(i%3)*.065);
      const bendX=x+sx*lean*.87+px*curve*.65;
      const bendZ=z+sz*lean*.87+pz*curve*.65;
      const bendY=height*.77;
      // Close leaves need a slender, tapering silhouette. Keep the wider
      // distant representation where thin leaves would disappear between pixels.
      const w=width*(medium ? .72 : .45);
      if (medium) {
        push([
          x-px*rootWidth,0,z-pz*rootWidth, x+px*rootWidth,0,z+pz*rootWidth,
          shoulderX+px*w,shoulderY,shoulderZ+pz*w,
          x-px*rootWidth,0,z-pz*rootWidth, shoulderX+px*w,shoulderY,shoulderZ+pz*w,
          shoulderX-px*w,shoulderY,shoulderZ-pz*w,
          shoulderX-px*w,shoulderY,shoulderZ-pz*w, shoulderX+px*w,shoulderY,shoulderZ+pz*w,
          bendX+px*w*.45,bendY,bendZ+pz*w*.45,
          shoulderX-px*w,shoulderY,shoulderZ-pz*w, bendX+px*w*.45,bendY,bendZ+pz*w*.45,
          bendX-px*w*.45,bendY,bendZ-pz*w*.45,
          bendX-px*w*.45,bendY,bendZ-pz*w*.45, bendX+px*w*.45,bendY,bendZ+pz*w*.45,
          endX,endY,endZ,
        ],tone);
      } else {
      // A shallow center fold gives the two faces different normals as
      // light crosses the leaf, without adding another material pass.
      const fold = w * .4;
      const row = (cx:number,cy:number,cz:number,halfWidth:number,ridge:number) => ({
        left: [cx-px*halfWidth,cy,cz-pz*halfWidth],
        center: [cx+sx*ridge,cy,cz+sz*ridge],
        right: [cx+px*halfWidth,cy,cz+pz*halfWidth],
      });
      const rows = [row(x,0,z,rootWidth,0),
        row(shoulderX,shoulderY,shoulderZ,w,fold),
        row(bendX,bendY,bendZ,w*.30,fold*.30)];
      for (let segment=0;segment<2;segment++) {
        const a=rows[segment],b=rows[segment+1];
        push([
          ...a.left,...a.center,...b.center, ...a.left,...b.center,...b.left,
          ...a.center,...a.right,...b.right, ...a.center,...b.right,...b.center,
        ],tone);
      }
      const end=rows[2];
      push([...end.left,...end.center,endX,endY,endZ,
        ...end.center,...end.right,endX,endY,endZ],tone);
      }
    } else {
      // Three tapered facets give the blade a visible lower body and a bent
      // silhouette. One root-to-tip triangle reduced prairie to toothpicks.
      push([
        x - px * rootWidth, 0, z - pz * rootWidth,
        x + px * rootWidth, 0, z + pz * rootWidth,
        midX + px * width * 0.82, midY, midZ + pz * width * 0.82,
        x - px * rootWidth, 0, z - pz * rootWidth,
        midX + px * width * 0.82, midY, midZ + pz * width * 0.82,
        midX - px * width * 0.82, midY, midZ - pz * width * 0.82,
        midX - px * width * 0.82, midY, midZ - pz * width * 0.82,
        midX + px * width * 0.82, midY, midZ + pz * width * 0.82,
        tipX, height, tipZ,
      ], tone);
    }

    if (kind === 'cattail') {
      // The seed stalk is thin; broad leaves supply most of the plant's
      // silhouette. Keep them rooted and bending outward below the head.
      for (const side of [-1, 1]) {
        const leafHeight = height * (.58 + rng() * .18);
        const reach = .32 + rng() * .22;
        const lw = (.045 + rng() * .025) * (lite ? 1.35 : 1);
        const mx = x + sx * reach * side * .35, mz = z + sz * reach * side * .35;
        const tx = x + sx * reach * side, tz = z + sz * reach * side;
        push([
          x, .02, z, mx - px * lw, leafHeight * .65, mz - pz * lw,
          mx + px * lw, leafHeight * .65, mz + pz * lw,
          mx - px * lw, leafHeight * .65, mz - pz * lw,
          tx, leafHeight, tz, mx + px * lw, leafHeight * .65, mz + pz * lw,
        ], tone);
      }
    }

    const seeded = kind === 'cattail' || (kind === 'prairie' && i % 5 === 0);
    if (!seeded) continue;
    if (kind === 'prairie') {
      const seedTone=tone.clone().multiplyScalar(.85);
      if (!distant) {
        // An open seed panicle rather than a solid spear at eye level.
        for (let branch=0;branch<3;branch++) for (const side of [-1,1]) {
          const t=.86+branch*.065;
          const cx=x+(tipX-x)*t,cz=z+(tipZ-z)*t;
          const reach=(.055-branch*.013)*side;
          const y=height*t;
          push([
            cx,y,cz,
            cx+px*reach,height*(t+.07),cz+pz*reach,
            cx+px*reach*.72,height*(t+.025),cz+pz*reach*.72,
          ],seedTone);
        }
      } else {
        const hw=.037,hh=.13;
        push([
          tipX,height-hh*.7,tipZ, tipX+px*hw,height-hh*.2,tipZ+pz*hw,
          tipX,height+hh*.35,tipZ,
          tipX,height-hh*.7,tipZ, tipX,height+hh*.35,tipZ,
          tipX-px*hw,height-hh*.2,tipZ-pz*hw,
        ],seedTone);
      }
      continue;
    }
    // Solid slender seed heads retain volume as the player walks past.
    // Only nearby tiers need radial faces; distant heads keep a cheap card.
    const hw = 0.023;
    const hh = 0.18 * (.92 + (i % 3) * .08);
    const cy = height - hh * .35;
    if (!distant && !medium) {
      const sides = 6;
      const slopeX = (tipX - midX) / (height - midY);
      const slopeZ = (tipZ - midZ) / (height - midY);
      const center = (y: number): number[] => [tipX + (y - height) * slopeX, y, tipZ + (y - height) * slopeZ];
      const ring = (a: number, y: number): number[] => {
        const c = center(y);
        return [c[0] + Math.cos(a) * hw, y, c[2] + Math.sin(a) * hw];
      };
      const bottom = center(cy - hh * .5), top = center(cy + hh * .5);
      for (let face = 0; face < sides; face++) {
        const a = face * Math.PI * 2 / sides, b = (face + 1) * Math.PI * 2 / sides;
        const loA = ring(a, cy - hh * .36), loB = ring(b, cy - hh * .36);
        const hiA = ring(a, cy + hh * .36), hiB = ring(b, cy + hh * .36);
        push([...loA, ...hiA, ...hiB, ...loA, ...hiB, ...loB,
          ...bottom, ...loA, ...loB, ...top, ...hiB, ...hiA], head);
      }
    } else if (medium) {
      // Crossed tapered silhouettes are enough once individual facets are small.
      for (const angle of [0, Math.PI / 2]) {
        const vx = Math.cos(angle) * hw, vz = Math.sin(angle) * hw;
        const outline = [
          [tipX, cy - hh * .5, tipZ],
          [tipX - vx, cy - hh * .36, tipZ - vz],
          [tipX - vx, cy + hh * .36, tipZ - vz],
          [tipX, cy + hh * .5, tipZ],
          [tipX + vx, cy + hh * .36, tipZ + vz],
          [tipX + vx, cy - hh * .36, tipZ + vz],
        ];
        for (let j = 1; j < outline.length - 1; j++) push([...outline[0], ...outline[j], ...outline[j + 1]], head);
      }
    } else {
      push([
        tipX - px * hw, cy - hh * .35, tipZ - pz * hw,
        tipX + px * hw, cy - hh * .35, tipZ + pz * hw,
        tipX, cy + hh * .5, tipZ,
        tipX - px * hw, cy - hh * .35, tipZ - pz * hw,
        tipX, cy - hh * .5, tipZ,
        tipX + px * hw, cy - hh * .35, tipZ + pz * hw,
      ], head);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('bladeRoot', new THREE.Float32BufferAttribute(roots, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData = { kind: `pheasant-${kind}`, triangles: positions.length / 9 };
  return geometry;
}

/** Full-property grain stubble, protective grass and dense rooted wet margins. */
export class PheasantCoverSystem implements Subsystem {
  readonly id = 'grass';
  private objects: THREE.InstancedMesh[] = [];
  private batches: { mesh: THREE.InstancedMesh; bounds: THREE.Box3; range: number; near?: THREE.BufferGeometry; middle?: THREE.BufferGeometry; far?: THREE.BufferGeometry; detailRange: number; middleRange: number }[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private surface: GroundSample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
  private world = { x: 0, z: 0 };
  private wind = { value: 0 };
  private hunterPosition = { value: new THREE.Vector2() };
  private abort = new AbortController();
  private disturbanceCursor = 0;
  private disturbances = { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, -100, 0)) };
  private windDirection = { value: new THREE.Vector2(1, 0) };
  private windStrength = { value: 1 };
  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    const lite = ctx.quality === 'lite', area = this.landscape.area;
    ctx.events.addEventListener('bird-cover-disturbance', ((event: CustomEvent<{ x: number; z: number }>) => {
      const { x, z } = event.detail;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      this.disturbances.value[this.disturbanceCursor].set(x, z, ctx.time, 2.6);
      this.disturbanceCursor = (this.disturbanceCursor + 1) % this.disturbances.value.length;
    }) as EventListener, { signal: this.abort.signal });
    const hunt = ctx.get<Hunt3DSystem>('hunt3d').huntState();
    this.windDirection.value.set(Math.cos(hunt.wind), Math.sin(hunt.wind));
    this.windStrength.value = hunt.windStrength === 'calm' ? .35 : hunt.windStrength === 'strong' ? 1.7 : 1;
    const geometries = { prairie: habitatGeometry('prairie', lite), cattail: habitatGeometry('cattail', lite), stubble: habitatGeometry('stubble', lite), litter: habitatGeometry('litter', lite) };
    const distant = { prairie: habitatGeometry('prairie', true, true), cattail: habitatGeometry('cattail', true, true) };
    const middle = { prairie: habitatGeometry('prairie', lite, false, true), cattail: habitatGeometry('cattail', lite, false, true) };
    this.geometries.push(...Object.values(geometries), ...Object.values(middle), ...Object.values(distant));
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x81714b, emissiveIntensity: .12, vertexColors: true, side: THREE.DoubleSide });
    material.onBeforeCompile = shader => {
      shader.uniforms.uPheasantWind = this.wind;
      shader.uniforms.uCoverDisturbance = this.disturbances;
      shader.uniforms.uCoverHunter = this.hunterPosition;
      shader.uniforms.uPheasantWindDirection = this.windDirection;
      shader.uniforms.uPheasantWindStrength = this.windStrength;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uPheasantWind;\nuniform vec2 uPheasantWindDirection;\nuniform float uPheasantWindStrength;\nuniform vec4 uCoverDisturbance[4];\nuniform vec2 uCoverHunter;\nattribute vec3 bladeRoot;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
          float phase = instanceMatrix[3].x * .15 + instanceMatrix[3].z * .11;
          vec2 localWind = vec2(dot(normalize(instanceMatrix[0].xz), uPheasantWindDirection),
            dot(normalize(instanceMatrix[2].xz), uPheasantWindDirection));
          float gust = .045 + sin(uPheasantWind * 1.35 + phase) * .024
            + sin(uPheasantWind * .60 + phase * .32) * .016;
          transformed.xz += localWind * gust * uPheasantWindStrength * position.y * position.y;
          // Only vegetation touching the hunter bends aside. Roots stay
          // planted; no fade, shrinking or corridor toward the target.
          vec2 bodyAway = (instanceMatrix * vec4(bladeRoot, 1.0)).xz - uCoverHunter;
          float bodyDistance = length(bodyAway);
          float bodyPart = 1.0 - smoothstep(.35, 1.4, bodyDistance);
          vec2 bodyDirection = bodyAway / max(bodyDistance, .10);
          vec2 bodyLocal = vec2(dot(normalize(instanceMatrix[0].xz), bodyDirection),
            dot(normalize(instanceMatrix[2].xz), bodyDirection));
          float bodyBend = bodyPart * 1.2;
          transformed.xz += bodyLocal * position.y * sin(bodyBend);
          transformed.y -= position.y * (1.0 - cos(bodyBend));
          for (int i = 0; i < 4; i++) {
            vec4 disturbance = uCoverDisturbance[i];
            float age = uPheasantWind - disturbance.z;
            if (age < 0.0 || age >= 2.5) continue;
            vec2 away = instanceMatrix[3].xz - disturbance.xy;
            float radius = max(disturbance.w, .001);
            float influence = 1.0 - smoothstep(0.0, radius, length(away));
            float kick = sin(age * 9.0) * exp(-age * 2.8);
            vec2 direction = away / max(length(away), .15);
            vec2 localDirection = vec2(dot(normalize(instanceMatrix[0].xz), direction),
              dot(normalize(instanceMatrix[2].xz), direction));
            transformed.xz += localDirection * influence * kick * .40 * position.y * position.y;
          }
          #endif`);
    };
    material.customProgramCacheKey = () => 'pheasant-rooted-cover-wind-v5'; this.materials.push(material);
    // Keep the same habitat footprint in both tiers. Distance changes blade
    // complexity, not the height or presence of protective cover.
    const fields = pheasantFields(area), ponds = pheasantPonds(this.landscape);
    const harvestSample = { amount: 0, row: 0, angle: 0 };
    const fringeHarvestSample = { amount: 0, row: 0, angle: 0 };
    const TILE = 168, spacing = 2.8;
    const straw = new THREE.Color(0xb8a477), amber = new THREE.Color(0xb18e59), olive = new THREE.Color(0x919872), reed = new THREE.Color(0xa99b76), color = new THREE.Color();
    type Plant = { x: number; y: number; scale: number; angle: number; color: number; low?: boolean; spread?: number; height?: number };
    for (let ty = area.world.y; ty < area.world.y + area.world.h; ty += TILE) for (let tx = area.world.x; tx < area.world.x + area.world.w; tx += TILE) {
      const groups: Record<keyof typeof geometries, Plant[]> = { prairie: [], cattail: [], stubble: [], litter: [] };
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
        if (pond && depth > -1.4 && depth < .95 && moisture > .10 && rng() < .68 + moisture * .25) {
          for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
            const cx = cellX + (dx + .15 + rng() * .7) * spacing / 3;
            const cy = cellY + (dy + .15 + rng() * .7) * spacing / 3;
            const reedDepth = pond.waterY - this.landscape.heightAtProperty(cx, cy);
            if (!pheasantPlantClear(area, cx, cy) || reedDepth < -1.4 || reedDepth > .95) continue;
            groups.cattail.push({ x: cx, y: cy, scale: .95 + rng() * .25,
              angle: rng() * Math.PI * 2, color: color.copy(reed).lerp(amber, rng() * .25).getHex() });
          }
          continue;
        }
        if (pond && depth > .12) continue;
        // Separate seed avoids shifting the established standing vegetation.
        // Keep mats patchy and on dry ground; they share the cover material.
        const litterRng = mulberry32(cellSeed(Math.round(x * 10), Math.round(y * 10), area.terrain.seed ^ 0x1177e));
        if (moisture < .48 && litterRng() < (cover ? .28 : harvest > .3 ? .42 : .55)) {
          groups.litter.push({ x, y, scale: .9 + litterRng() * .8,
            angle: harvest > .3 ? harvestSample.angle : litterRng() * Math.PI * 2,
            color: color.copy(straw).lerp(olive, moisture * .45).getHex() });
        }
        if (harvest > .3 && moisture < .36) {
          // Parallel machinery rows supply agricultural scale. Gaps and a
          // few taller grasses interrupt them along the habitat boundary.
          const stripe = .5 + .5 * Math.cos(harvestSample.row * Math.PI * .88);
          if (rng() < (.25 + stripe * .50) * harvest) {
            // Consume the same variation in both tiers before fringe roots:
            // lighter stubble must not move neighboring standing habitat.
            const plant = { x, y, scale: .80 + rng() * .55, angle: harvestSample.angle + (rng() - .5) * .12,
              color: color.copy(straw).lerp(amber, rng() * .35).getHex() };
            if (!lite || keep > .35) groups.stubble.push(plant);
          }
        }
        if (cover || pheasantCoverFringeAt(area, x, y) > .02) {
          // Overlapping rooted clumps make a stand, rather than a scatter of
          // ornamental tufts. Preserve the same density on the lite tier.
          for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
            const cx = cellX + (dx + .15 + rng() * .7) * spacing / 3;
            const cy = cellY + (dy + .15 + rng() * .7) * spacing / 3;
            if (!pheasantPlantClear(area, cx, cy)) continue;
            const core = pheasantCoverAt(area, cx, cy);
            const fringe = core ? 1 : pheasantCoverFringeAt(area, cx, cy);
            // A separate seed keeps core plant placement independent of fringe sampling.
            const fringeRng = mulberry32(cellSeed(Math.round(cx * 100), Math.round(cy * 100), area.terrain.seed ^ 0xf219));
            if (!core) {
              // The ground painter blends cut fields continuously. Do the same
              // at each fringe root instead of cutting off an entire grid cell.
              samplePheasantHarvest(area, cx, cy, fields, fringeHarvestSample);
              this.landscape.surfaceAtProperty(cx, cy, this.surface);
              const cut = fringeHarvestSample.amount * (1 - THREE.MathUtils.smoothstep(this.surface.moisture, .25, .36));
              if (fringeRng() > fringe * .85 * (1 - cut)) continue;
            }
            if (pond && pond.waterY - this.landscape.heightAtProperty(cx, cy) > .12) continue;
            const wave = .5 + .5 * Math.sin(cx * .038 + Math.sin(cy * .051));
            groups.prairie.push({ x: cx, y: cy, scale: .94 + rng() * .22,
              height: core ? 1.45 + wave * .35 : .50 + fringe * .75, spread: 1.2, angle: rng() * Math.PI * 2,
              color: color.copy(straw).lerp(olive, moisture * .6 + wave * .18).lerp(amber, rng() * .16).getHex() });
          }
          continue;
        }
        if (harvest > .3 && moisture < .36) continue;
        const drift = .50 + Math.sin(x * .065 + Math.sin(y * .038) * 2.4) * .27 + Math.cos(y * .07) * .20;
        // Low, weathered grass fills the spaces between standing bunches.
        // Reuse the prairie mesh so the extra ground layer needs no new draw.
        if (!cover && keep < (lite ? .18 : .28) && drift < .64) {
          groups.prairie.push({ x, y, scale: .65 + rng() * .5, low: true,
            angle: rng() * Math.PI * 2,
            color: color.copy(amber).lerp(olive, .35 + moisture * .3).getHex() });
          continue;
        }
        const chance = (.23 + vegetation * .28) * (.34 + drift * .72);
        if (rng() < chance && (!lite || keep > .30)) {
          const scale = .60 + rng() * .42;
          groups.prairie.push({ x, y, scale, spread: 1, angle: rng() * Math.PI * 2, color: color.copy(straw).lerp(olive, moisture * .60 + rng() * .16).lerp(amber, rng() * .12).getHex() });
        }
      }
      const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
      const normal = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), yaw = new THREE.Quaternion();
      for (const kind of ['prairie', 'cattail', 'stubble', 'litter'] as const) {
        // Fallen stems are only useful close to the player. Small spatial
        // groups avoid drawing an entire field for a few nearby pieces.
        const partitions = new Map<string, Plant[]>();
        for (const plant of groups[kind]) {
          // Smaller standing-cover groups let distant plants simplify without
          // keeping a whole field corner at the player's close-up detail.
          const cellSize = kind === 'litter' ? 52 : 28;
          const key = kind === 'stubble' ? 'parcel' : `${Math.floor(plant.x / cellSize)},${Math.floor(plant.y / cellSize)}`;
          let partition = partitions.get(key);
          if (!partition) { partition = []; partitions.set(key, partition); }
          partition.push(plant);
        }
        for (const plants of partitions.values()) {
        const mesh = new THREE.InstancedMesh(geometries[kind], material, plants.length);
        for (const [i, plant] of plants.entries()) {
          this.landscape.propertyToWorld(plant.x, plant.y, this.world); this.landscape.surfaceAtProperty(plant.x, plant.y, this.surface);
          normal.set(-this.surface.gradeX, 1, -this.surface.gradeZ).normalize(); rotation.setFromUnitVectors(up, normal);
          yaw.setFromAxisAngle(up, plant.angle); rotation.multiply(yaw);
          const spread = plant.low ? 1.15 : plant.spread ?? 1;
          scale.set(plant.scale * spread, plant.scale * (plant.low ? .30 : plant.height ?? 1), plant.scale * spread);
          position.set(this.world.x, this.surface.height - .022, this.world.z);
          mesh.setMatrixAt(i, matrix.compose(position, rotation, scale)); mesh.setColorAt(i, color.setHex(plant.color));
        }
        mesh.name = `Pheasant ${kind} parcel`; mesh.receiveShadow = true; mesh.computeBoundingSphere(); mesh.computeBoundingBox();
        const range = kind === 'litter' ? (lite ? 18 : 28) : kind === 'cattail' ? (lite ? 230 : 330) : kind === 'stubble' ? (lite ? 95 : 145) : (lite ? 130 : 195);
        const far = kind === 'prairie' || kind === 'cattail' ? distant[kind] : undefined;
        this.batches.push({ mesh, bounds: mesh.boundingBox!.clone().expandByScalar(1), range,
          near: far ? geometries[kind] : undefined, middle: kind === 'prairie' || kind === 'cattail' ? middle[kind] : undefined, far,
          detailRange: lite ? 14 : 22, middleRange: lite ? 40 : 65 });
        this.objects.push(mesh); ctx.scene.add(mesh);
        }
      }
    }
    this.update(ctx);
  }

  update(ctx: Ctx): void {
    this.wind.value = ctx.time;
    this.hunterPosition.value.set(ctx.camera.position.x, ctx.camera.position.z);
    for (const batch of this.batches) {
      // Distance to the actual parcel footprint avoids keeping an entire
      // diagonal sphere in the most expensive detail tier.
      const distance = Math.hypot(
        Math.max(batch.bounds.min.x - ctx.camera.position.x, 0, ctx.camera.position.x - batch.bounds.max.x),
        Math.max(batch.bounds.min.z - ctx.camera.position.z, 0, ctx.camera.position.z - batch.bounds.max.z),
      );
      batch.mesh.visible = distance < batch.range;
      if (batch.near && batch.middle && batch.far) {
        const current = batch.mesh.geometry;
        // Separate enter/leave thresholds prevent oscillation at parcel edges.
        if (distance < batch.detailRange - 3) batch.mesh.geometry = batch.near;
        else if (distance > batch.middleRange + 3) batch.mesh.geometry = batch.far;
        else if (distance > batch.detailRange + 3 && distance < batch.middleRange - 3) batch.mesh.geometry = batch.middle;
        else if (current === batch.near && distance > batch.detailRange + 3) batch.mesh.geometry = batch.middle;
        else if (current === batch.far && distance < batch.middleRange - 3) batch.mesh.geometry = batch.middle;
      }
    }
  }

  dispose(ctx: Ctx): void {
    this.abort.abort();
    for (const object of this.objects) { ctx.scene.remove(object); object.dispose(); }
    for (const geometry of this.geometries) geometry.dispose(); for (const material of this.materials) material.dispose();
    this.objects.length = 0; this.batches.length = 0; this.geometries.length = 0; this.materials.length = 0;
  }
}
