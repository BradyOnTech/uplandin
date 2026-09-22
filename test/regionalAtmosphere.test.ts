import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { fieldTimeOfDay, quailTimeOfDay, type TimeOfDay } from '../src/three/palette';
import { sampleRegionalSkyline, SkySystem } from '../src/three/subsystems/sky';
import type { Ctx } from '../src/three/engine';

const regions = ['quail-fields', 'sharptail-prairie'] as const;
const samples = (area: typeof regions[number]) => Array.from({ length: 720 }, (_, i) =>
  [0, 1, 2].map(layer => sampleRegionalSkyline(area, layer, i / 720 * Math.PI * 2)));

describe('Southern Plains and northern prairie atmosphere', () => {
  it('keeps Quail wooded and broken while more than ninety percent of Sharptail directions stay treeless', () => {
    const wooded = regions.map(area => samples(area).filter(layers => layers.some(sample => sample.crown > 1)).length / 720);
    expect(wooded[0]).toBeGreaterThan(.30);
    expect(wooded[1]).toBeLessThan(.10);
    for (const layers of samples('sharptail-prairie')) {
      expect(layers[0].crown).toBe(0);
      expect(layers[2].crown).toBe(0);
      expect(Math.max(...layers.map(sample => sample.crest))).toBeLessThan(25);
    }
  });

  it('wraps all horizon layers without a seam or a shared flat minimum-height strip', () => {
    for (const area of regions) for (const layer of [0, 1, 2]) {
      expect(sampleRegionalSkyline(area, layer, 0)).toEqual(sampleRegionalSkyline(area, layer, Math.PI * 2));
      expect(sampleRegionalSkyline(area, layer, -Math.PI).crest).toBeCloseTo(sampleRegionalSkyline(area, layer, Math.PI).crest, 8);
    }
    for (const area of regions) expect(Math.min(...samples(area).map(layers => layers[0].ground))).toBeLessThan(0);
  });

  it.each(regions)('keeps %s within a small fixed three-ring geometry budget', area => {
    const scene = new THREE.Scene();
    const ctx = { scene, camera: new THREE.PerspectiveCamera(), quality: 'lite', timeOfDay: 'noon', events: new EventTarget(), renderer: {toneMappingExposure: 1} } as unknown as Ctx;
    const sky = new SkySystem(new LandscapeModel(getArea(area)));
    try {
      sky.init(ctx);
      const rings = scene.children.filter((node): node is THREE.Mesh => node instanceof THREE.Mesh && node.geometry.hasAttribute('aHaze'));
      expect(rings).toHaveLength(3);
      const triangles = rings.reduce((sum, node) => sum + node.geometry.getIndex()!.count / 3, 0);
      expect(triangles).toBeLessThanOrEqual(3600);
    } finally { sky.dispose(ctx); }
  });

  it('keeps daylight readable and warmer in Quail, with a separate dim lastlight rather than a global tint', () => {
    for (const tod of ['morning', 'noon'] as TimeOfDay[]) {
      const quail = fieldTimeOfDay('quail-fields', tod), sharp = fieldTimeOfDay('sharptail-prairie', tod);
      expect(quailTimeOfDay(tod)).toBe(quail);
      expect(quail.sunColor & 255).toBeLessThan(sharp.sunColor & 255);
      expect(quail.cloudAmount).toBeGreaterThan(sharp.cloudAmount);
      for (const area of regions) {
        const day = fieldTimeOfDay(area, tod), dusk = fieldTimeOfDay(area, 'lastlight');
        expect(day.sunIntensity).toBeGreaterThan(2.5);
        expect(day.ambientIntensity).toBeGreaterThan(.6);
        expect(dusk.sunIntensity).toBeLessThan(day.sunIntensity / 2);
        expect(dusk.skyTop).not.toBe(day.skyTop);
      }
    }
  });
});
