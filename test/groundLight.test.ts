import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bakeSkyOcclusion, GROUND, GROUND_UNIFORM, groundLightAt, installGroundLight, setSkyMap, SKY_MAP_UNIFORM, skyOcclusionTexture, writeGroundLight, type GroundLightSettings } from '../src/three/groundLight';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { TERRAIN_APRON_M } from '../src/three/horizon';
import { SkySystem } from '../src/three/subsystems/sky';
import type { Ctx } from '../src/three/engine';

const LIGHT_CHUNKS = ['lights_pars_begin', 'lights_fragment_begin', 'lights_fragment_end'] as const;
const stock = () => Object.fromEntries(LIGHT_CHUNKS.map(name => [name, THREE.ShaderChunk[name]])) as Record<string, string>;
const lib = () => Object.fromEntries(Object.entries(THREE.ShaderLib).map(([id, shader]) => [id, { uniforms: { ...shader.uniforms } }]));
const settings: GroundLightSettings = { occlusion: 1, crest: .14, floor: .4, cloudCover: .4, cloudStrength: .5, cloudSize: 400 };
const square = { minX: -400, maxX: 400, minZ: -400, maxZ: 400 };
/** A ridge running north-south beside a draw. */
const ridgeAndDraw = (x: number) => 25 * Math.exp(-(((x - 150) / 80) ** 2)) - 20 * Math.exp(-(((x + 150) / 60) ** 2));
const sample = (bake: ReturnType<typeof bakeSkyOcclusion>, x: number, z: number) => {
  const i = Math.round((x - bake.origin.x) / bake.size.x * (bake.width - 1)), j = Math.round((z - bake.origin.z) / bake.size.z * (bake.height - 1));
  const k = (j * bake.width + i) * 4;
  return { open: bake.data[k], crest: bake.data[k + 1] };
};

describe('the ground\'s own light', () => {
  it('scales indirect light by the sky map and direct light by cloud shade, in every lit material, once', () => {
    const chunks = stock();
    // If three renames these, phones and desktop silently lose the ground light.
    expect(chunks.lights_fragment_begin).toContain('vec3 geometryPosition');
    expect(chunks.lights_fragment_end).toContain('reflectedLight');
    const shaders = lib();
    expect(installGroundLight(chunks, shaders)).toBe(true);
    expect(installGroundLight(chunks, shaders)).toBe(true);
    expect(chunks.lights_fragment_end.match(/uplandGroundLight\(/g)).toHaveLength(1);
    expect(chunks.lights_fragment_end).toContain('reflectedLight.indirectDiffuse *= uplandLight.x');
    expect(chunks.lights_fragment_end).toContain('reflectedLight.directDiffuse *= uplandLight.y');
    expect(chunks.lights_pars_begin.match(/vec2 uplandGroundLight/g)).toHaveLength(1);
    for (const name of ['lambert', 'phong', 'standard', 'physical', 'toon']) {
      const clone = THREE.UniformsUtils.clone(shaders[name].uniforms);
      expect(clone[GROUND_UNIFORM].value).toBe(GROUND);
    }
  });

  it('leaves three alone when its lights chunks no longer read as expected', () => {
    const chunks = { lights_pars_begin: '', lights_fragment_begin: 'vec3 p;', lights_fragment_end: 'nothing' };
    expect(installGroundLight(chunks, {})).toBe(false);
    expect(chunks.lights_fragment_end).toBe('nothing');
  });

  it('hands every material compiled after the bake one shared map, uploaded once', () => {
    const shaders = lib();
    installGroundLight(stock(), shaders);
    const map = skyOcclusionTexture(bakeSkyOcclusion(() => 0, square));
    setSkyMap(map, shaders);
    const a = THREE.UniformsUtils.clone(shaders.lambert.uniforms)[SKY_MAP_UNIFORM].value as THREE.Texture;
    const b = THREE.UniformsUtils.clone(shaders.standard.uniforms)[SKY_MAP_UNIFORM].value as THREE.Texture;
    expect(a.source).toBe(map.source);
    expect(b.source).toBe(map.source);
    map.dispose();
  });

  it('sees less sky in a draw and stands crests proud, and leaves flat ground alone', () => {
    const bake = bakeSkyOcclusion(x => ridgeAndDraw(x), square);
    const draw = sample(bake, -150, 0), ridge = sample(bake, 150, 0), flat = bakeSkyOcclusion(() => 7, square);
    expect(draw.open).toBeLessThan(ridge.open - 30);
    expect(ridge.crest).toBeGreaterThan(160);
    expect(draw.crest).toBeLessThan(100);
    for (let k = 0; k < flat.data.length; k += 4) { expect(flat.data[k]).toBe(255); expect(Math.abs(flat.data[k + 1] - 128)).toBeLessThanOrEqual(1); }
    // In light: the draw's sky light falls, never below the floor; a crest lifts a little.
    const values = new Float32Array(GROUND.length);
    writeGroundLight(bake, settings, { x: 0, z: 0 }, values);
    expect(groundLightAt(draw.open, draw.crest, values)).toBeLessThan(groundLightAt(ridge.open, ridge.crest, values) - .1);
    expect(groundLightAt(0, 0, values)).toBeGreaterThan(settings.floor * (1 - settings.crest) - 1e-6);
    expect(groundLightAt(255, 255, values)).toBeLessThanOrEqual(1 + settings.crest + 1e-6);
  });

  it('is neutral with no bake, and casts no cloud shadow with no cover', () => {
    const values = new Float32Array(GROUND.length);
    writeGroundLight(null, { ...settings, cloudCover: 0 }, { x: 5, z: 9 }, values);
    expect(groundLightAt(0, 0, values)).toBe(1);
    expect(values[11]).toBe(0);
    // More cover lowers the noise threshold, so more ground lies in shadow.
    const thin = new Float32Array(GROUND.length), thick = new Float32Array(GROUND.length);
    writeGroundLight(null, { ...settings, cloudCover: .2 }, { x: 0, z: 0 }, thin);
    writeGroundLight(null, { ...settings, cloudCover: .5 }, { x: 0, z: 0 }, thick);
    expect(thick[7]).toBeLessThan(thin[7]);
  });

  it('bakes the canyon darker than the plains, from each ground\'s own landform', () => {
    const mean = (area: string) => {
      const landscape = new LandscapeModel(getArea(area)), b = landscape.worldBounds(), m = TERRAIN_APRON_M;
      const bake = bakeSkyOcclusion((x, z) => landscape.heightAtWorld(x, z), { minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m });
      expect(bake.width).toBeLessThanOrEqual(321);
      let sum = 0;
      for (let k = 0; k < bake.data.length; k += 4) sum += bake.data[k];
      return sum / (bake.data.length / 4);
    };
    expect(mean('chukar-ridge')).toBeLessThan(mean('quail-fields') - 20);
    expect(mean('sharptail-prairie')).toBeLessThan(mean('pheasant-coverts'));
  });

  it('drifts the cloud shadows downwind at the hunt wind\'s speed', () => {
    const scene = new THREE.Scene();
    const hunt = { huntState: () => ({ wind: 0, windStrength: 'strong' }) };
    const ctx = { scene, camera: new THREE.PerspectiveCamera(), quality: 'lite', timeOfDay: 'noon', time: 0, events: new EventTarget(),
      renderer: { toneMappingExposure: 1 }, get: (id: string) => { if (id === 'hunt3d') return hunt; throw new Error(id); } } as unknown as Ctx;
    const sky = new SkySystem(new LandscapeModel(getArea('sharptail-prairie')));
    try {
      sky.init(ctx);
      sky.update(ctx);
      const start = [GROUND[8], GROUND[9]];
      ctx.time = 10; sky.update(ctx);
      // The wind blows toward +x (angle 0): the pattern moves that way, so
      // its offset runs the other way; a strong wind moves it 13 m/s.
      expect(GROUND[8] - start[0]).toBeCloseTo(-130, 3);
      expect(GROUND[9] - start[1]).toBeCloseTo(0, 6);
      expect(GROUND[11]).toBeGreaterThan(0);
    } finally { sky.dispose(ctx); }
  });
});
