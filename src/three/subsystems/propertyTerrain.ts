import { wetPondLayout, wetPondRadius } from '../../game/wetPonds';
import * as THREE from 'three';
import type { TerrainKind } from '../../game/areas';
import { PROPERTY_PX_TO_M, type GroundSample, type LandscapeModel } from '../../game/landscape';
import type { Ctx, Quality } from '../engine';
import { buildQuailTerrainGeometry } from './quailTerrain';
import { quailGroundNearDistance, quailGroundTiles, quailGroundUsesNear } from './quailGroundGeometry';
import { fieldTimeOfDay, type TimeOfDay } from '../palette';
import { pheasantFields, pheasantPonds, samplePheasantHarvest } from './pheasantLandscape';

type Paint = (landscape: LandscapeModel, x: number, y: number, out: THREE.Color) => THREE.Color;

const PALETTE = {
  prairie: { dark: new THREE.Color(0x6e5d3b), mid: new THREE.Color(0xa78e5d), light: new THREE.Color(0xcdbb83), wet: new THREE.Color(0x697052) },
  wetland: { dark: new THREE.Color(0x5d5637), mid: new THREE.Color(0x9f8752), light: new THREE.Color(0xcab278), wet: new THREE.Color(0x596b58) },
  woods: { dark: new THREE.Color(0x39442d), mid: new THREE.Color(0x68704a), light: new THREE.Color(0x9b9662), wet: new THREE.Color(0x425b4d) },
  rimrock: { dark: new THREE.Color(0x5e5144), mid: new THREE.Color(0x95816b), light: new THREE.Color(0xb9a887), wet: new THREE.Color(0x697261) },
  desert: { dark: new THREE.Color(0x71543b), mid: new THREE.Color(0xa57d51), light: new THREE.Color(0xd0a873), wet: new THREE.Color(0x6d7050) },
  canyon: { dark: new THREE.Color(0x5d3f34), mid: new THREE.Color(0x95624a), light: new THREE.Color(0xc28a61), wet: new THREE.Color(0x62584b) },
  alpine: { dark: new THREE.Color(0x4c514d), mid: new THREE.Color(0x7d8578), light: new THREE.Color(0xb5ae93), wet: new THREE.Color(0x61746a) },
  'oak-savanna': { dark: new THREE.Color(0x5f5030), mid: new THREE.Color(0x9d834a), light: new THREE.Color(0xc3a66a), wet: new THREE.Color(0x5b6945) },
} as const;

/**
 * Terrain kind is the broad geological family; the property still gets the
 * final art direction.  Keeping these small overrides here prevents two
 * maps with the same landform (Hun/Chukar rimrock and pheasant/woodcock
 * wetland) from opening on the same ground color before their bespoke cover
 * systems have had a chance to establish the scene.
 */
const AREA_PALETTE_OVERRIDES: Record<string, Partial<Record<'dark' | 'mid' | 'light' | 'wet', number>>> = {
  'pheasant-coverts': { dark: 0x575642, mid: 0xa58c60, light: 0xcbb483, wet: 0x4f6658 },
  'woodcock-bottoms': { dark: 0x494a38, mid: 0x77755a, light: 0x9c9772, wet: 0x48594b },
  'grouse-woods': { dark: 0x625540, mid: 0x8c815d, light: 0xb5a376, wet: 0x56684b },
  'sharptail-prairie': { dark: 0x756444, mid: 0xa68f59, light: 0xc8b77e, wet: 0x6c7154 },
  'hun-benches': { dark: 0x625640, mid: 0x9e8b66, light: 0xc8b98f, wet: 0x72745d },
  'chukar-ridge': { dark: 0x514b43, mid: 0x81786b, light: 0xa99c83, wet: 0x626b61 },
  'mearns-canyons': { dark: 0x5c3a2e, mid: 0x8e5943, light: 0xc1875e, wet: 0x5a5545 },
};

/** The generic property ground has its own restrained surface response. It
 * shares the Firewatch-style sun drench with the tuned fields, but does not
 * inherit Quail's litter, stone, and sward assumptions. */
const PROPERTY_SURFACE_DECLS = /* glsl */ `
uniform vec2 uSunXZ;
uniform vec3 uSunTint;
uniform float uSunK;
uniform float uSunEmit;
uniform vec2 uSunRange;
uniform vec3 uCoolTint;
uniform float uCoolK;
uniform float uCloudShK;
uniform float uCloudT;
varying vec3 vPropertyWorld;

float propertyHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float propertyNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(propertyHash(i), propertyHash(i + vec2(1.0, 0.0)), f.x),
             mix(propertyHash(i + vec2(0.0, 1.0)), propertyHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

const PROPERTY_SURFACE_FRAG = /* glsl */ `
float pFine = propertyNoise(vPropertyWorld.xz * 0.62);
float pMeso = propertyNoise(vPropertyWorld.xz * 0.095 + vec2(19.0, 47.0));
float pMacro = propertyNoise(vPropertyWorld.xz * 0.021 + vec2(71.0, 11.0));
float pDetail = pFine * 0.42 + pMeso * 0.38 + pMacro * 0.20;
diffuseColor.rgb *= 0.93 + pDetail * 0.14;
diffuseColor.rgb *= 1.0 + (pMeso - 0.5) * 0.08;

vec2 pToSun = vPropertyWorld.xz - cameraPosition.xz;
float pDistance = length(pToSun);
float pAzimuth = clamp(dot(pToSun / max(pDistance, 1e-3), uSunXZ), 0.0, 1.0);
float pLobe = pAzimuth * pAzimuth * smoothstep(uSunRange.x, uSunRange.y, pDistance) * uSunK;
float pBloom = pAzimuth * pAzimuth * pAzimuth * pAzimuth * pLobe;
diffuseColor.rgb = mix(diffuseColor.rgb, uSunTint, min(pLobe * 0.52, 0.46));
float pCool = uCoolK * (1.0 - min(pLobe * 2.2, 1.0));
diffuseColor.rgb = mix(diffuseColor.rgb, uCoolTint, pCool * 0.72);

float pCloud = sin(vPropertyWorld.x * 0.081 + uCloudT)
  * sin(vPropertyWorld.z * 0.057 + 1.4 + uCloudT * 0.71);
diffuseColor.rgb *= 1.0 - 0.16 * smoothstep(0.28, 0.78, pCloud) * uCloudShK;
`;

function hash(x: number, y: number, seed: number): number {
  let h = seed ^ Math.imul(Math.floor(x), 374761393) ^ Math.imul(Math.floor(y), 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Continuous in property coordinates, including tile edges and drop changes.
 * Broad color masses should survive a change in terrain tessellation. */
function groundNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

interface GroundFinish {
  soil: number;
  stone: number;
  litter: number;
  soilStrength: number;
  stoneStrength: number;
  litterStrength: number;
  wetStrength: number;
}

/** Material identities stay restrained within the existing art palette.
 * These are baked colors, with no extra render passes or texture downloads. */
const GROUND_FINISH: Record<TerrainKind, GroundFinish> = {
  prairie: { soil: 0x95805c, stone: 0xaca18a, litter: 0xa28b57, soilStrength: .23, stoneStrength: .2, litterStrength: .22, wetStrength: .4 },
  wetland: { soil: 0x62513d, stone: 0x858778, litter: 0x978454, soilStrength: .2, stoneStrength: .15, litterStrength: .33, wetStrength: .65 },
  woods: { soil: 0x55483a, stone: 0x81857a, litter: 0x8a704d, soilStrength: .3, stoneStrength: .32, litterStrength: .42, wetStrength: .42 },
  rimrock: { soil: 0xa39172, stone: 0xb0a28c, litter: 0x958453, soilStrength: .4, stoneStrength: .65, litterStrength: .18, wetStrength: .25 },
  desert: { soil: 0xc49e71, stone: 0xa28a70, litter: 0x847044, soilStrength: .55, stoneStrength: .46, litterStrength: .2, wetStrength: .3 },
  canyon: { soil: 0xa66f50, stone: 0xb58e6e, litter: 0x78613c, soilStrength: .4, stoneStrength: .55, litterStrength: .4, wetStrength: .28 },
  alpine: { soil: 0x7b7462, stone: 0xb0b2a5, litter: 0x665a43, soilStrength: .25, stoneStrength: .66, litterStrength: .33, wetStrength: .4 },
  'oak-savanna': { soil: 0xb39662, stone: 0x9f947b, litter: 0x79623b, soilStrength: .4, stoneStrength: .3, litterStrength: .42, wetStrength: .28 },
};

function paintFor(property: LandscapeModel): Paint {
  const { kind, seed } = property.area.terrain;
  const areaId = property.area.id;
  const base = PALETTE[kind];
  const overrides = AREA_PALETTE_OVERRIDES[areaId];
  const palette = {
    dark: overrides?.dark === undefined ? base.dark : new THREE.Color(overrides.dark),
    mid: overrides?.mid === undefined ? base.mid : new THREE.Color(overrides.mid),
    light: overrides?.light === undefined ? base.light : new THREE.Color(overrides.light),
    wet: overrides?.wet === undefined ? base.wet : new THREE.Color(overrides.wet),
  };
  const finish = GROUND_FINISH[kind];
  const soil = new THREE.Color(finish.soil);
  const stone = new THREE.Color(finish.stone);
  const litter = new THREE.Color(areaId === 'woodcock-bottoms' ? 0x65583f : finish.litter);
  const fields = areaId === 'pheasant-coverts' ? pheasantFields(property.area) : [];
  const wetPools = areaId === 'woodcock-bottoms' ? wetPondLayout(property.area) : [];
  const ponds = areaId === 'pheasant-coverts' ? pheasantPonds(property) : [];
  const harvestSample = { amount: 0, row: 0, angle: 0 };
  const cutStraw = new THREE.Color(0xcab384);
  const cutSoil = new THREE.Color(0x866b50);
  const bankMud = new THREE.Color(0x514936);
  const reedLitter = new THREE.Color(0x8d8055);
  const standingGrass = new THREE.Color(0x65734f);
  // Geometry construction is synchronous; reuse one sampler per painter.
  const surface: GroundSample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
  return (landscape, x, y, out) => {
    landscape.surfaceAtProperty(x, y, surface);
    const broad = groundNoise(x * .012 + 12, y * .012 + 41, seed);
    const meso = groundNoise(x * .052 + 73, y * .052 + 19, seed ^ 0x2e15);
    const slope = THREE.MathUtils.clamp(surface.slope * 1.15, 0, 1);
    const rock = THREE.MathUtils.clamp(surface.rockiness * 0.88 + slope * 0.16, 0, 1);
    const moisture = THREE.MathUtils.clamp(surface.moisture, 0, 1);
    const fertility = THREE.MathUtils.clamp(surface.vegetation, 0, 1);
    out.copy(palette.dark).lerp(palette.mid, 0.32 + broad * 0.46);
    out.lerp(palette.light, fertility * (0.12 + meso * 0.18));
    // Bare openings, accumulated litter, and exposed shoulders respond to
    // the same ground sample that places habitat. Keep fine grain in the
    // fragment shader, where it is independent of the near/far vertex grid.
    const dry = 1 - moisture;
    const exposure = THREE.MathUtils.smoothstep(rock, .2, .8);
    out.lerp(soil, dry * (1 - fertility) * finish.soilStrength);
    out.lerp(litter, fertility * dry * (1 - slope) * (.35 + meso * .65) * finish.litterStrength);
    out.lerp(palette.wet, moisture * (.45 + (1 - broad) * .55) * finish.wetStrength);
    out.lerp(stone, exposure * finish.stoneStrength);
    if (fields.length > 0) {
      // Standing habitat retains a cooler grass-and-litter base even where
      // individual blades disappear at distance. Feather the rectangle edge
      // over a broad verge rather than outlining the encounter volume.
      let coverDistance = Infinity;
      for (const patch of landscape.area.patches) {
        const dx = Math.max(patch.x - x, 0, x - patch.x - patch.w);
        const dy = Math.max(patch.y - y, 0, y - patch.y - patch.h);
        coverDistance = Math.min(coverDistance, Math.hypot(dx, dy) * PROPERTY_PX_TO_M);
      }
      const standing = 1 - THREE.MathUtils.smoothstep(coverDistance, 0, 9);
      out.lerp(standingGrass, standing * (.72 + meso * .16));
      samplePheasantHarvest(landscape.area, x, y, fields, harvestSample);
      // Match the dry-ground cutoff used by stubble placement, feathered
      // into the wet fringe so harvested rectangles do not paint over mud.
      const harvest = harvestSample.amount * (1 - THREE.MathUtils.smoothstep(moisture, .25, .36));
      const swath = .5 + .5 * Math.sin(harvestSample.row * Math.PI / 24);
      out.lerp(cutSoil, harvest * .5);
      out.lerp(cutStraw, harvest * (.42 + swath * .24));
    }
    for (const pond of ponds) {
      const radius = Math.hypot((x - pond.x) * PROPERTY_PX_TO_M / pond.rx,
        (y - pond.y) * PROPERTY_PX_TO_M / pond.ry);
      const footprint = 1 - THREE.MathUtils.smoothstep(radius, 1.08, 1.48);
      if (footprint <= 0) continue;
      const aboveWater = surface.height - pond.waterY;
      const mud = 1 - THREE.MathUtils.smoothstep(aboveWater, -.15, 1.05);
      // Follow the elevation of the real bank. Water remains level while
      // its mud and reed-litter fringe follows the sloping basin shoulders.
      out.lerp(bankMud, footprint * mud * .7);
      const fringe = THREE.MathUtils.smoothstep(aboveWater, .1, .7)
        * (1 - THREE.MathUtils.smoothstep(aboveWater, 1.2, 2.4));
      out.lerp(reedLitter, footprint * fringe * .35);
    }
    for (const pond of wetPools) {
      const radius = wetPondRadius(pond, x, y);
      const edge = 1 - THREE.MathUtils.smoothstep(radius, 1.0, 1.65);
      out.lerp(bankMud, edge * .8);
    }
    out.multiplyScalar(.96 + meso * .08);
    return out;
  };
}

/** Full-property terrain for every non-specialized map. It replaces the old
 * drop-centered 480 m plate with the same tiled heightfield used by the tuned
 * fields, so the authored world remains continuous while the camera travels. */
export class PropertyTerrain {
  private tiles: { near: THREE.Mesh; far: THREE.Mesh; x: number; z: number }[] = [];
  private horizon: THREE.Mesh[] = [];
  private material: THREE.MeshLambertMaterial;
  private paint: Paint;
  private nearDistance: number;
  private abort = new AbortController();
  private soil = { value: null as THREE.Texture | null };
  private soilStrength = { value: 0 };
  private light = {
    uSunXZ: { value: new THREE.Vector2(1, 0) },
    uSunTint: { value: new THREE.Color() },
    uSunK: { value: 0 },
    uSunEmit: { value: 0 },
    uSunRange: { value: new THREE.Vector2(20, 80) },
    uCoolTint: { value: new THREE.Color() },
    uCoolK: { value: 0 },
    uCloudShK: { value: 0 },
    uCloudT: { value: 0 },
  };

  constructor(private readonly landscape: LandscapeModel) {
    this.paint = paintFor(landscape);
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const uniforms = this.light;
    const wetSoil = landscape.area.id === 'woodcock-bottoms';
    const painted = landscape.area.id === 'pheasant-coverts' || wetSoil;
    const woodland = landscape.area.id === 'grouse-woods';
    const origin = landscape.propertyToWorld(0, 0, { x: 0, z: 0 });
    this.material.customProgramCacheKey = () => `property-surface-v4-${landscape.area.terrain.kind}-${painted}-${woodland}-${wetSoil}`;
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.uniforms.uPropertyFloorOrigin = { value: new THREE.Vector2(origin.x, origin.z) };
      if (painted) {
        shader.uniforms.uPropertySoil = this.soil;
        shader.uniforms.uPropertySoilStrength = this.soilStrength;
        shader.uniforms.uPropertySoilOrigin = { value: new THREE.Vector2(origin.x, origin.z) };
      }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPropertyWorld;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n\tvPropertyWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec2 uPropertyFloorOrigin;\n' + PROPERTY_SURFACE_DECLS + (painted ? '\nuniform sampler2D uPropertySoil; uniform float uPropertySoilStrength; uniform vec2 uPropertySoilOrigin;' : ''))
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + PROPERTY_SURFACE_FRAG + (painted ? `
          vec2 soilUV = (vPropertyWorld.xz - uPropertySoilOrigin) / 4.8;
          vec3 soilA = texture2D(uPropertySoil, soilUV).rgb;
          vec3 soilB = texture2D(uPropertySoil, mat2(.8,-.6,.6,.8) * soilUV * .57 + vec2(.31,.67)).rgb;
          // Keep the property's wet/dry palette authoritative. Luminance
          // adds painted grit and litter without imposing Quail's hue.
          float soilValue = dot(mix(soilA, soilB, .24), vec3(.2126,.7152,.0722));
          float soilDetail = clamp(soilValue / ${wetSoil ? ".052" : ".33"}, ${wetSoil ? ".78, 1.25" : ".55, 1.55"});
          float soilFade = 1.0 - smoothstep(24.0, 90.0, distance(vPropertyWorld.xz, cameraPosition.xz));
          diffuseColor.rgb *= mix(1.0, soilDetail, soilFade * uPropertySoilStrength);
        ` : '') + (woodland ? `
          vec2 duffPosition = vPropertyWorld.xz - uPropertyFloorOrigin;
          float duff = propertyNoise(duffPosition * 9.0);
          float duffMass = propertyNoise(duffPosition * .43);
          float duffFade = 1.0 - smoothstep(12.0, 48.0, pDistance);
          float duffDetail = mix(.9, 1.08, smoothstep(.22, .76, duff));
          diffuseColor.rgb *= mix(1.0, duffDetail, duffFade * .6);
          diffuseColor.rgb *= .96 + .08 * duffMass;
        ` : ''))
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += uSunTint * ( pLobe * 0.34 + pBloom * 0.62 ) * uSunEmit;');
    };
    this.nearDistance = quailGroundNearDistance('high');
  }

  async init(ctx: Ctx): Promise<void> {
    const wetSoil = this.landscape.area.id === 'woodcock-bottoms';
    if (this.landscape.area.id === 'pheasant-coverts' || wetSoil) {
      try {
        const texture = await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}textures/terrain/${wetSoil ? "wet-alder-painted" : "prairie-painted"}.webp`);
        if (this.abort.signal.aborted) { texture.dispose(); return; }
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = ctx.quality === 'high' ? 4 : 2;
        texture.needsUpdate = true;
        this.soil.value = texture;
        this.soilStrength.value = wetSoil ? .32 : .60;
      } catch (error) {
        // The baked habitat paint remains usable if an optional art asset
        // cannot load; a missing texture must not prevent entering a hunt.
        console.warn(`${this.landscape.area.name} soil detail unavailable; using habitat paint.`, error);
      }
    }
    if (this.abort.signal.aborted) return;
    this.nearDistance = quailGroundNearDistance(ctx.quality as Quality);
    this.applyTod(ctx.timeOfDay);
    ctx.events.addEventListener('tod', (event) => {
      const tod = (event as CustomEvent<TimeOfDay>).detail;
      this.applyTod(tod);
    }, { signal: this.abort.signal });
    const wetPools = this.landscape.area.id === 'woodcock-bottoms' ? wetPondLayout(this.landscape.area) : [];
    for (const tile of quailGroundTiles(this.landscape)) {
      // Spend terrain vertices around small basins, where a coarse grid
      // otherwise cuts across the shore. Open ground keeps its usual budget.
      const basinTile = wetPools.some(pond => {
        const margin = Math.max(pond.rx, pond.rz) * 1.6;
        return pond.px + margin > tile.x && pond.px - margin < tile.x + tile.width
          && pond.py + margin > tile.y && pond.py - margin < tile.y + tile.depth;
      });
      const nearDivisions = basinTile ? (ctx.quality === 'high' ? 96 : 64) : (ctx.quality === 'high' ? 48 : 24);
      const near = new THREE.Mesh(buildQuailTerrainGeometry(this.landscape, tile.x, tile.y, tile.width, tile.depth, nearDivisions, this.paint), this.material);
      const far = new THREE.Mesh(buildQuailTerrainGeometry(this.landscape, tile.x, tile.y, tile.width, tile.depth, basinTile ? 32 : 14, this.paint), this.material);
      near.name = `${this.landscape.area.name} near terrain`;
      far.name = `${this.landscape.area.name} distant terrain`;
      near.receiveShadow = far.receiveShadow = true;
      this.tiles.push({ near, far, x: tile.centerX, z: tile.centerZ });
      ctx.scene.add(near, far);
    }
    const bounds = this.landscape.area.world;
    const margin = 1000;
    const strips: [number, number, number, number][] = [
      [bounds.x - margin, bounds.y - margin, bounds.w + margin * 2, margin],
      [bounds.x - margin, bounds.y + bounds.h, bounds.w + margin * 2, margin],
      [bounds.x - margin, bounds.y, margin, bounds.h],
      [bounds.x + bounds.w, bounds.y, margin, bounds.h],
    ];
    for (const [x, y, width, depth] of strips) {
      const mesh = new THREE.Mesh(buildQuailTerrainGeometry(this.landscape, x, y, width, depth, 42, this.paint), this.material);
      mesh.name = `${this.landscape.area.name} horizon ground`;
      mesh.receiveShadow = true;
      this.horizon.push(mesh);
      ctx.scene.add(mesh);
    }
    this.update(ctx);
  }

  private applyTod(tod: TimeOfDay): void {
    const spec = fieldTimeOfDay(this.landscape.area.id, tod);
    const azimuth = THREE.MathUtils.degToRad(spec.sunAzimuth);
    this.light.uSunXZ.value.set(Math.sin(azimuth), Math.cos(azimuth));
    this.light.uSunTint.value.setHex(spec.groundSunTint);
    this.light.uSunK.value = spec.groundSunK;
    this.light.uSunEmit.value = spec.groundSunEmit;
    this.light.uSunRange.value.set(spec.groundSunNear, spec.groundSunFar);
    this.light.uCoolTint.value.setHex(spec.groundCoolTint);
    this.light.uCoolK.value = spec.groundCoolK;
    this.light.uCloudShK.value = spec.cloudAmount
      * THREE.MathUtils.clamp((spec.sunElevation - 15) / 20, 0, 1);
  }

  update(ctx: Ctx): void {
    this.light.uCloudT.value = ctx.time;
    for (const tile of this.tiles) {
      const near = quailGroundUsesNear(tile.x, tile.z, ctx.camera.position.x, ctx.camera.position.z, this.nearDistance);
      tile.near.visible = near;
      tile.far.visible = !near;
    }
  }

  dispose(ctx: Ctx): void {
    this.abort.abort();
    for (const tile of this.tiles) {
      ctx.scene.remove(tile.near, tile.far);
      tile.near.geometry.dispose();
      tile.far.geometry.dispose();
    }
    for (const mesh of this.horizon) {
      ctx.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.material.dispose();
    this.soil.value?.dispose();
    this.soil.value = null;
    this.tiles.length = 0;
    this.horizon.length = 0;
  }
}
