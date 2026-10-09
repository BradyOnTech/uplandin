import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { fieldTimeOfDay, quailTimeOfDay, type TimeOfDay } from '../src/three/palette';
import { SkySystem } from '../src/three/subsystems/sky';
import type { Ctx } from '../src/three/engine';

const regions = ['quail-fields', 'sharptail-prairie'] as const;

describe('Southern Plains and northern prairie atmosphere', () => {
  it.each(regions)('keeps %s to one small backdrop band beyond its far country', area => {
    const scene = new THREE.Scene();
    const ctx = { scene, camera: new THREE.PerspectiveCamera(), quality: 'lite', timeOfDay: 'noon', events: new EventTarget(), renderer: {toneMappingExposure: 1} } as unknown as Ctx;
    const sky = new SkySystem(new LandscapeModel(getArea(area)));
    try {
      sky.init(ctx);
      const rings = scene.children.filter((node): node is THREE.Mesh => node instanceof THREE.Mesh && node.geometry.hasAttribute('aHaze'));
      expect(rings).toHaveLength(1);
      const triangles = rings.reduce((sum, node) => sum + node.geometry.getIndex()!.count / 3, 0);
      expect(triangles).toBeLessThanOrEqual(1100);
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
