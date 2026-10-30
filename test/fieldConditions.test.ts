import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { crownColor, exemptFromField, FIELD, FIELD_EXEMPT, FIELD_UNIFORM, frostBurn, installFieldConditions, seasonLook, weatherLook, weatherSpec, writeFieldConditions, type FieldState } from '../src/three/fieldConditions';
import { installGroundLight } from '../src/three/groundLight';
import { installAtmosphere } from '../src/three/atmosphere';
import { fieldTimeOfDay } from '../src/three/palette';
import { createWeatherParticles, WEATHER_PARTICLES } from '../src/three/weatherParticles';
import { CONDITIONS } from '../src/game/conditions';
import type { Month } from '../src/game/season';

const MONTHS: Month[] = ['September', 'October', 'November', 'December', 'January'];
const GROUNDS = ['quail-fields', 'sharptail-prairie', 'pheasant-coverts', 'chukar-ridge'];
const chunks = () => Object.fromEntries(Object.entries(THREE.ShaderChunk)) as Record<string, string>;
const lib = () => Object.fromEntries(Object.entries(THREE.ShaderLib).map(([id, shader]) => [id, { uniforms: { ...shader.uniforms } }]));
const state = (over: Partial<FieldState> = {}): FieldState => ({
  areaId: 'sharptail-prairie', condition: 'mild', month: 'October', tod: 'morning', sunElevation: 25, seconds: 0,
  wind: { x: 1, z: 0, strength: .65 }, ground: { minHeight: 0, maxHeight: 40, lowGround: 8 }, sky: new THREE.Color(.6, .7, .8),
  sun: { x: 0, z: 1 }, ...over,
});

describe('the day on the ground', () => {
  it('weathers every lit surface before lighting, once, after the fog and ground light', () => {
    const c = chunks(), shaders = lib();
    expect(installFieldConditions(c, shaders)).toBe(false); // needs the ground light first
    installAtmosphere(c, shaders); installGroundLight(c, shaders);
    expect(installFieldConditions(c, shaders)).toBe(true);
    expect(installFieldConditions(c, shaders)).toBe(true);
    expect(c.normal_fragment_maps.match(/uplandFieldColor\(/g)).toHaveLength(1);
    expect(c.lights_pars_begin.match(/vec3 uplandFieldColor/g)).toHaveLength(1);
    // The skinned dog is never weathered; instanced plants are told apart.
    expect(c.fog_vertex).toContain('USE_SKINNING');
    expect(c.fog_vertex).toContain('USE_INSTANCING');
    for (const name of ['lambert', 'standard', 'physical', 'phong', 'toon']) {
      expect(THREE.UniformsUtils.clone(shaders[name].uniforms)[FIELD_UNIFORM].value).toBe(FIELD);
    }
  });

  it('leaves a mild October morning nearly as it was', () => {
    const values = new Float32Array(FIELD.length);
    writeFieldConditions(state(), values);
    expect(values[8]).toBe(0); expect(values[9]).toBe(0); expect(values[7]).toBe(0); expect(values[6]).toBe(0);
    for (const v of [values[0], values[1], values[2]]) expect(Math.abs(v)).toBeLessThan(.06);
  });

  it.each(CONDITIONS)('dresses a %s day on the ground and in the sky', condition => {
    const values = new Float32Array(FIELD.length), look = weatherLook(condition);
    writeFieldConditions(state({ condition }), values);
    expect(values[8]).toBeCloseTo(look.wetness, 5);
    expect(values[9]).toBeCloseTo(look.frost, 5);
    expect(values[7]).toBeGreaterThanOrEqual(look.snow - 1e-6);
    const spec = fieldTimeOfDay('sharptail-prairie', 'morning'), day = weatherSpec(spec, condition);
    if (condition === 'rain' || condition === 'snow') {
      // A deck: the sun drops, the shade lifts, the fog thickens.
      expect(day.sunIntensity).toBeLessThan(spec.sunIntensity * .6);
      expect(day.ambientIntensity).toBeGreaterThan(spec.ambientIntensity);
      expect(day.fogDensity).toBeGreaterThan(spec.fogDensity);
      expect(day.cloudAmount).toBeGreaterThan(.7);
    } else expect(day.sunIntensity).toBeGreaterThanOrEqual(spec.sunIntensity);
  });

  it('burns frost off over the hunt where the sun reaches, faster under a high sun', () => {
    expect(frostBurn('dawn', 6, 0)).toBe(0);
    expect(frostBurn('dawn', 6, 600)).toBeGreaterThan(frostBurn('dawn', 6, 60));
    expect(frostBurn('morning', 25, 300)).toBeGreaterThan(frostBurn('dawn', 6, 300));
    expect(frostBurn('noon', 38, 0)).toBeGreaterThan(.8);
    expect(frostBurn('dawn', 6, 1e6)).toBe(1);
  });

  it.each(GROUNDS)('turns %s through its season: colour, bleach, then winter, and its trees from green to bare', area => {
    const looks = MONTHS.map(month => seasonLook(area, month));
    expect(looks[1].saturation).toBeGreaterThan(looks[2].saturation);
    expect(looks[2].bleach).toBeGreaterThan(looks[1].bleach);
    expect(looks[4].bleach).toBeGreaterThanOrEqual(looks[3].bleach);
    expect(looks[4].ice).toBeGreaterThanOrEqual(looks[3].ice);
    expect(looks[0].leafGreen).toBeGreaterThan(looks[1].leafGreen);
    expect(looks[3].leafFall).toBeGreaterThan(.8);
    expect(looks[4].leafFall).toBeGreaterThanOrEqual(looks[3].leafFall);
  });

  it('greens the plains swales in September, while the canyon\'s cheat is the driest straw of the year', () => {
    for (const area of GROUNDS.filter(id => id !== 'chukar-ridge')) {
      expect(seasonLook(area, 'September').swales).toBeGreaterThan(seasonLook(area, 'October').swales);
    }
    const canyon = (month: Month) => seasonLook('chukar-ridge', month);
    expect(canyon('September').swales).toBe(0);
    expect(canyon('September').bleach).toBeGreaterThan(canyon('October').bleach);
    // Cheatgrass greens after the November rains.
    expect(canyon('November').tint[1]).toBeGreaterThan(canyon('October').tint[1]);
  });

  it('gives a crown summer green in September and bare grey twigs in winter, and leaves evergreens alone', () => {
    const gold = () => new THREE.Color(0x9a8a3c), lum = (c: THREE.Color) => .2126 * c.r + .7152 * c.g + .0722 * c.b;
    const october = gold(), september = crownColor(gold(), .6, 0), november = crownColor(gold(), 0, .5), january = crownColor(gold(), 0, 1);
    expect(september.g / september.r).toBeGreaterThan(october.g / october.r);
    expect(november.r / november.g).toBeGreaterThan(october.r / october.g);
    const chroma = (c: THREE.Color) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
    expect(chroma(january)).toBeLessThan(chroma(october) * .5);
    expect(lum(january)).toBeLessThan(lum(october));
    for (const evergreen of [0x3f4d3c, 0x2a3220]) {
      const cedar = new THREE.Color(evergreen);
      expect(crownColor(cedar.clone(), 0, 1).equals(cedar)).toBe(true);
    }
  });

  it('keeps Southern Plains winters open and ices northern sloughs by December', () => {
    expect(seasonLook('quail-fields', 'December').snow).toBe(0);
    expect(seasonLook('pheasant-coverts', 'December').snow).toBeGreaterThan(.2);
    expect(seasonLook('pheasant-coverts', 'October').ice).toBe(0);
    expect(seasonLook('pheasant-coverts', 'November').ice).toBeGreaterThan(0);
    expect(seasonLook('pheasant-coverts', 'December').ice).toBeGreaterThan(.7);
  });

  it('rolls the grass sheen downwind faster in a stronger wind', () => {
    const calm = new Float32Array(FIELD.length), strong = new Float32Array(FIELD.length);
    writeFieldConditions(state({ seconds: 10, wind: { x: 0, z: 1, strength: .25 } }), calm);
    writeFieldConditions(state({ seconds: 10, wind: { x: 0, z: 1, strength: 1 } }), strong);
    expect(strong[14]).toBeGreaterThan(calm[14]);
    expect(strong[11]).toBeGreaterThan(calm[11]);
    expect([strong[12], strong[13]]).toEqual([0, 1]);
  });

  it('caps the near weather to one small draw on either tier', () => {
    for (const quality of ['high', 'lite'] as const) for (const condition of CONDITIONS) {
      const p = createWeatherParticles(condition, quality);
      try {
        expect(p.points).toBeInstanceOf(THREE.Points);
        expect(p.count).toBe(WEATHER_PARTICLES[quality][p.kind]);
        expect(p.count).toBeLessThanOrEqual(quality === 'high' ? 1000 : 500);
        expect(p.kind).toBe(condition === 'rain' ? 'rain' : condition === 'snow' ? 'snow' : 'chaff');
      } finally { p.dispose(); }
    }
  });

  it('keeps the birds\' own colours on any day', () => {
    const c = chunks(), shaders = lib();
    installAtmosphere(c, shaders); installGroundLight(c, shaders); installFieldConditions(c, shaders);
    // The weathering is compiled out of any material marked exempt.
    expect(c.normal_fragment_maps).toContain(`!defined( ${FIELD_EXEMPT} )`);
    const bird = exemptFromField(new THREE.MeshLambertMaterial({ vertexColors: true }), 'bird');
    expect(bird.defines?.[FIELD_EXEMPT]).toBe('');
    // Review tools find the birds by what they are, not by the exemption alone.
    expect(bird.userData.fieldExempt).toBe('bird');
    bird.dispose();
  });
});
