import * as THREE from 'three';
import type { GroundSample, LandscapeModel } from '../../game/landscape';
import { PROPERTY_PX_TO_M } from '../../game/landscape';
import type { PheasantCrop } from '../../game/pheasantFarm';
import { pheasantCoverAt, pheasantFields, pheasantPonds, samplePheasantHarvest, type PheasantHarvestSample } from './pheasantLandscape';
import { pheasantHomesteadYard } from '../../game/pheasantHabitat';

/** Texel size of the farm map, in property yards. */
export const PHEASANT_FARM_TEXEL = 3;
/** Moisture varies slowly; sample it on a coarser lattice and interpolate. */
const MOISTURE_STEP = 9;

const CROP_CODE: Record<PheasantCrop, number> = { corn: 1, beans: 2, wheat: 3, hay: 4 };
const CROP_BY_CODE: (PheasantCrop | undefined)[] = [undefined, 'corn', 'beans', 'wheat', 'hay'];

/** Harvest reaches the ground only on dry soil; wet swales keep their mud. */
export function pheasantHarvestOnSoil(amount: number, moisture: number): number {
  return amount * (1 - THREE.MathUtils.smoothstep(moisture, .25, .36));
}

export interface PheasantFarmMap {
  texture: THREE.DataTexture;
  /** Property size in yards covered by the texture. */
  size: THREE.Vector2;
  data: Uint8Array;
  width: number;
  height: number;
}

export interface PheasantFarmSample { crop?: PheasantCrop; rowsAlongX: boolean; harvest: number; verge: number }

const maps = new WeakMap<LandscapeModel, PheasantFarmMap>();

/**
 * A small property-space map of the farm for the terrain shader: which crop
 * each yard carries, which way its rows run, how fully harvested it is and
 * whether it is a grassy verge. The shader draws planter rows, residue and
 * tramlines from it, in world metres, so the ground carries a field's
 * texture right to the hunter's boots without any tiled art. Crop residue
 * reads the same data on the CPU, so stalks and painted rows always agree.
 *   R crop code / 4, G row axis (0 rows along world x, 1 along world z),
 *   B harvested amount, A grass verge.
 * Built once per landscape and shared.
 */
export function createPheasantFarmMap(landscape: LandscapeModel): PheasantFarmMap {
  const cached = maps.get(landscape);
  if (cached) return cached;
  const area = landscape.area, world = area.world;
  const width = Math.ceil(world.w / PHEASANT_FARM_TEXEL), height = Math.ceil(world.h / PHEASANT_FARM_TEXEL);
  const data = new Uint8Array(width * height * 4);
  const fields = pheasantFields(area), ponds = pheasantPonds(landscape), yard = pheasantHomesteadYard(area.landmarks);
  const sample: PheasantHarvestSample = { amount: 0, row: 0, angle: 0 };
  const surface: GroundSample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
  const mw = Math.ceil(world.w / MOISTURE_STEP) + 1, mh = Math.ceil(world.h / MOISTURE_STEP) + 1;
  const moisture = new Float32Array(mw * mh);
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    moisture[j * mw + i] = landscape.surfaceAtProperty(world.x + i * MOISTURE_STEP, world.y + j * MOISTURE_STEP, surface).moisture;
  }
  const moistureAt = (x: number, y: number) => {
    const u = (x - world.x) / MOISTURE_STEP, v = (y - world.y) / MOISTURE_STEP;
    const i = Math.min(mw - 2, Math.floor(u)), j = Math.min(mh - 2, Math.floor(v)), fu = u - i, fv = v - j;
    const a = moisture[j * mw + i], b = moisture[j * mw + i + 1], c = moisture[(j + 1) * mw + i], d = moisture[(j + 1) * mw + i + 1];
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
  };
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const x = world.x + (i + .5) * PHEASANT_FARM_TEXEL, y = world.y + (j + .5) * PHEASANT_FARM_TEXEL;
    samplePheasantHarvest(area, x, y, fields, sample);
    const harvest = pheasantHarvestOnSoil(sample.amount, moistureAt(x, y));
    const inYard = !!yard && x >= yard.x && x <= yard.x + yard.w && y >= yard.y && y <= yard.y + yard.h;
    const inPond = ponds.some(p => Math.hypot((x - p.x) * PROPERTY_PX_TO_M / p.rx, (y - p.y) * PROPERTY_PX_TO_M / p.ry) < 1.3);
    const verge = inYard || inPond || pheasantCoverAt(area, x, y) ? 0 : 1 - harvest;
    const k = (j * width + i) * 4;
    data[k] = sample.crop ? Math.round(CROP_CODE[sample.crop] / 4 * 255) : 0;
    // A field's rows follow its local +u; angle 0 is property x (world x).
    data[k + 1] = Math.abs(Math.sin(sample.angle)) > .5 ? 0 : 255;
    data[k + 2] = Math.round(harvest * 255);
    data[k + 3] = Math.round(verge * 255);
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  const map = { texture, size: new THREE.Vector2(world.w, world.h), data, width, height };
  maps.set(landscape, map);
  return map;
}

/** The farm map at a property point: nearest crop and rows, smooth harvest. */
export function samplePheasantFarm(map: PheasantFarmMap, world: { x: number; y: number }, x: number, y: number, out: PheasantFarmSample): PheasantFarmSample {
  const u = (x - world.x) / PHEASANT_FARM_TEXEL - .5, v = (y - world.y) / PHEASANT_FARM_TEXEL - .5;
  const i = Math.max(0, Math.min(map.width - 2, Math.floor(u))), j = Math.max(0, Math.min(map.height - 2, Math.floor(v)));
  const fu = Math.max(0, Math.min(1, u - i)), fv = Math.max(0, Math.min(1, v - j));
  const k = (Math.round(v) >= j + 1 ? j + 1 : j) * map.width + (Math.round(u) >= i + 1 ? i + 1 : i);
  const d = map.data, at = (ii: number, jj: number, c: number) => d[((j + jj) * map.width + i + ii) * 4 + c];
  const bilinear = (c: number) => ((at(0, 0, c) * (1 - fu) + at(1, 0, c) * fu) * (1 - fv) + (at(0, 1, c) * (1 - fu) + at(1, 1, c) * fu) * fv) / 255;
  out.crop = CROP_BY_CODE[Math.round(d[k * 4] / 255 * 4)];
  out.rowsAlongX = d[k * 4 + 1] < 128;
  out.harvest = bilinear(2);
  out.verge = bilinear(3);
  return out;
}

export const PHEASANT_FARM_DECLARATIONS = /* glsl */`
uniform sampler2D uFarmMap; uniform vec2 uFarmSize; uniform vec2 uFarmOrigin; uniform float uFarmReady;
float farmHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float farmNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(farmHash(i), farmHash(i + vec2(1.0, 0.0)), f.x), mix(farmHash(i + vec2(0.0, 1.0)), farmHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// 0 on a row's centre line, 1 midway between rows.
float farmRow(float across, float spacing) { return abs(fract(across / spacing + .5) - .5) * 2.0; }
// Fades a pattern out before its spacing drops below about two pixels.
float farmResolve(float across, float spacing) { return 1.0 - smoothstep(.14, .36, fwidth(across) / spacing); }
`;

/** Planter rows, residue and tramlines drawn into the terrain colour. */
export const PHEASANT_FARM_FRAGMENT = /* glsl */`
{
  vec2 farmP = (vPropertyWorld.xz - uFarmOrigin) / ${PROPERTY_PX_TO_M.toFixed(4)};
  vec2 farmUV = farmP / uFarmSize;
  float farmInside = uFarmReady * step(0.0, farmUV.x) * step(0.0, farmUV.y) * step(farmUV.x, 1.0) * step(farmUV.y, 1.0);
  vec4 farm = texture2D(uFarmMap, clamp(farmUV, 0.0, 1.0));
  float crop = floor(farm.r * 4.0 + .5);
  float harvest = farm.b * farmInside;
  float alongZ = step(.5, farm.g);
  float across = mix(vPropertyWorld.z, vPropertyWorld.x, alongZ);
  float along = mix(vPropertyWorld.x, vPropertyWorld.z, alongZ);
  float shade = 1.0;
  if (harvest > .01) {
    if (crop == 1.0) {
      // Corn: 30-inch rows. Stalk bases and shredded residue ride the row,
      // dark loam shows between them, and residue drifts along the rows.
      float row = farmRow(across, .762), resolve = farmResolve(across, .762);
      float drift = farmNoise(vec2(along * .45, across * 1.6));
      float trash = farmNoise(vec2(along * 3.1, across * 5.3));
      float furrow = smoothstep(.18, .75, row) * (1.0 - smoothstep(.55, .85, drift) * .55);
      shade = mix(1.0, mix(1.07, .84, furrow) * mix(.9, 1.1, trash), resolve);
      shade *= mix(1.0, mix(.94, 1.05, drift), 1.0 - resolve * .5);
    } else if (crop == 2.0) {
      // Soybeans: low stubble and pale chaff on grey-brown ground.
      float row = farmRow(across, .381), resolve = farmResolve(across, .381);
      float chaff = farmNoise(vec2(along * 2.3, across * 2.3));
      shade = mix(1.0, mix(1.04, .93, smoothstep(.25, .8, row)) * mix(.92, 1.1, smoothstep(.45, .9, chaff)), resolve);
    } else if (crop == 3.0) {
      // Wheat: tight 7.5-inch drill rows and the sprayer's tramlines.
      float row = farmRow(across, .1905), resolve = farmResolve(across, .1905);
      shade = mix(1.0, mix(1.06, .88, smoothstep(.3, .85, row)), resolve);
      float tramCentre = abs(abs(fract(across / 18.3 + .5) - .5) * 18.3 - .95);
      float tram = 1.0 - smoothstep(.16, .34, tramCentre);
      shade *= mix(1.0, .80, tram * farmResolve(across, 1.9));
      shade *= mix(.95, 1.04, farmNoise(vec2(along * .6, across * .6)));
    } else if (crop == 4.0) {
      // Hay aftermath: raked windrow scars and mower swaths.
      float windrow = 1.0 - smoothstep(.10, .24, abs(fract(across / 6.1 + .5) - .5));
      float swath = farmRow(across, 2.03);
      shade = mix(1.0, mix(1.05, .95, swath) * mix(1.0, 1.09, windrow), farmResolve(across, 2.03));
      shade *= mix(.93, 1.05, farmNoise(vec2(along * .3, across * .3)));
    }
  }
  diffuseColor.rgb *= mix(1.0, shade, harvest);
  // Brome verges get a soft clumped grain instead of flat paint.
  float verge = farm.a * farmInside;
  vec2 vergeP = vPropertyWorld.xz;
  float clump = farmNoise(vergeP * 1.7) * .6 + farmNoise(vergeP * 5.3) * .4;
  diffuseColor.rgb *= mix(1.0, mix(.86, 1.1, clump), verge * farmResolve(vergeP.x, .6));
}
`;
