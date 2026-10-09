import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ATMOSPHERE, FOG_UNIFORM, installAtmosphere, pooledFog, poolFloor, regionAtmosphere, writeAtmosphere } from '../src/three/atmosphere';
import { fieldTimeOfDay, type TimeOfDay } from '../src/three/palette';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';

const HOURS: TimeOfDay[] = ['dawn', 'morning', 'noon', 'evening', 'lastlight'];
const GROUNDS = ['quail-fields', 'sharptail-prairie', 'pheasant-coverts', 'chukar-ridge'];
const FOG_CHUNKS = ['fog_pars_vertex', 'fog_vertex', 'fog_pars_fragment', 'fog_fragment'] as const;
const stock = () => Object.fromEntries(FOG_CHUNKS.map(name => [name, THREE.ShaderChunk[name]])) as Record<string, string>;
const sunOf = (tod: TimeOfDay, ground: string) => {
  const spec = fieldTimeOfDay(ground, tod), el = spec.sunElevation * Math.PI / 180, az = spec.sunAzimuth * Math.PI / 180;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
};

describe('fog driven from the sky', () => {
  it('patches three\'s fog chunks once, however often it is installed, keeping the stock fog for linear fog', () => {
    const chunks = stock();
    // If an upgrade changes three's fog, the field silently loses its air.
    expect(chunks.fog_fragment).toContain('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );');
    const lib = { lambert: { uniforms: {} as Record<string, THREE.IUniform> } };
    expect(installAtmosphere(chunks, lib)).toBe(true);
    expect(installAtmosphere(chunks, lib)).toBe(true);
    expect(chunks.fog_vertex).toContain('vFogRay');
    expect(chunks.fog_fragment.match(/uplandPooledFog/g)).toHaveLength(1);
    expect(chunks.fog_fragment).toContain('smoothstep( fogNear, fogFar, vFogDepth )');
    expect(THREE.UniformsUtils.clone(lib.lambert.uniforms)[FOG_UNIFORM].value).toBe(ATMOSPHERE);
  });

  it('leaves three\'s fog alone when it no longer reads as expected', () => {
    const chunks = { fog_fragment: 'gl_FragColor.rgb = fogColor;' };
    expect(installAtmosphere(chunks, {})).toBe(false);
    expect(chunks).toEqual({ fog_fragment: 'gl_FragColor.rgb = fogColor;' });
  });

  it.each(GROUNDS)('pools %s\'s fog in its own low ground, taken from the landform', ground => {
    const landscape = new LandscapeModel(getArea(ground)), bounds = landscape.worldBounds();
    const height = (x: number, z: number) => landscape.heightAtWorld(x, z);
    const floor = poolFloor(height, bounds, regionAtmosphere(ground).floor);
    const lowest = poolFloor(height, bounds, 0), median = poolFloor(height, bounds, .5);
    expect(floor).toBeGreaterThanOrEqual(lowest);
    expect(floor).toBeLessThanOrEqual(median);
    // Reshape the land and the fog follows it; nothing is pinned to today's heights.
    expect(poolFloor((x, z) => height(x, z) - 12, bounds, regionAtmosphere(ground).floor)).toBeCloseTo(floor - 12, 6);
  });

  it.each(GROUNDS)('keeps %s readable at every hour: the dog at 30 yd is clear, and the low ground is never whited out', ground => {
    const landscape = new LandscapeModel(getArea(ground)), bounds = landscape.worldBounds();
    const floor = poolFloor((x, z) => landscape.heightAtWorld(x, z), bounds, regionAtmosphere(ground).floor);
    for (const tod of HOURS) {
      const spec = fieldTimeOfDay(ground, tod), values = new Float32Array(ATMOSPHERE.length);
      writeAtmosphere(spec, regionAtmosphere(ground).byTime[tod], sunOf(tod, ground), floor, values);
      // A hunter standing on the pool floor, eyes 1.6 m up, and the dog 27 m out.
      const eye = floor + 1.6, dog = { x: 27, y: -1.2, z: 0 };
      expect(pooledFog(eye, dog, values)).toBeLessThan(.12);
      expect(1 - Math.exp(-((spec.fogDensity * 27) ** 2))).toBeLessThan(.01);
      // However long the view, the pool alone never hides the land.
      expect(pooledFog(eye, { x: 5000, y: 0, z: 0 }, values)).toBeLessThanOrEqual(.75);
      // A crest or overview view, 80 m up, sees less of it on the same
      // ground 400 m away than a hunter standing in it.
      const below = pooledFog(floor + 80, { x: 392, y: -80, z: 0 }, values), within = pooledFog(eye, { x: 400, y: -1.6, z: 0 }, values);
      expect(below).toBeLessThanOrEqual(within);
    }
  });

  it.each(GROUNDS)('warms %s\'s air toward the sun at the golden hours, from the sky\'s own horizon', ground => {
    for (const tod of ['dawn', 'evening'] as TimeOfDay[]) {
      const spec = fieldTimeOfDay(ground, tod), values = new Float32Array(ATMOSPHERE.length);
      writeAtmosphere(spec, regionAtmosphere(ground).byTime[tod], sunOf(tod, ground), 0, values);
      const away = new THREE.Color(spec.fogColor);
      expect(values[0] / values[2]).toBeGreaterThan(away.r / away.b);
      expect(values[3]).toBeGreaterThan(.4);
      expect(Math.hypot(values[4], values[5])).toBeCloseTo(1, 6);
    }
    // A high sun barely tints the air.
    expect(regionAtmosphere(ground).byTime.noon.sunward).toBeLessThan(regionAtmosphere(ground).byTime.evening.sunward / 2);
  });
});
