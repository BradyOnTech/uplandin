import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { sharptailGroundZones } from '../src/game/sharptailLandscape';
import { sharptailMeadowAt } from '../src/three/subsystems/sharptailMeadow';
import { SharptailSwardField } from '../src/three/subsystems/sharptailSward';

describe('Sharptail landform-led meadow', () => {
  it('keeps grass and baked terrain masses aligned across entry changes and tile boundaries', () => {
    const south = new LandscapeModel(getArea('sharptail-prairie'), 'south-gate');
    const west = new LandscapeModel(getArea('sharptail-prairie'), 'west-track');
    const southField = new SharptailSwardField(south), westField = new SharptailSwardField(west);
    for (let x = 0; x <= 1400; x += 37) for (let y = 0; y <= 800; y += 29) {
      const a = south.propertyToWorld(x, y, { x: 0, z: 0 });
      const b = west.propertyToWorld(x, y, { x: 0, z: 0 });
      const sa = southField.sampleMeadow(a.x, a.z, { crown: 0, hollow: 0, cured: 0 });
      const sb = westField.sampleMeadow(b.x, b.z, { crown: 0, hollow: 0, cured: 0 });
      const zones = sharptailGroundZones(x, y, { swale: 0, stand: 0 });
      const exact = sharptailMeadowAt(x, y, zones.swale, { crown: 0, hollow: 0, cured: 0 });
      const adjacent = southField.sampleMeadow(a.x + .001, a.z + .001, { crown: 0, hollow: 0, cured: 0 });
      for (const key of ['crown', 'hollow', 'cured'] as const) {
        expect(sa[key]).toBeCloseTo(sb[key], 7);
        expect(Math.abs(sa[key] - exact[key])).toBeLessThan(.08);
        expect(Math.abs(sa[key] - adjacent[key])).toBeLessThan(.0001);
        expect(sa[key]).toBeGreaterThanOrEqual(0);
        expect(sa[key]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('distinguishes an exposed shoulder from its sheltered swale', () => {
    const landscape = new LandscapeModel(getArea('sharptail-prairie'));
    const field = new SharptailSwardField(landscape);
    const sample = (x: number, y: number) => {
      const p = landscape.propertyToWorld(x, y, { x: 0, z: 0 });
      return field.sampleMeadow(p.x, p.z, { crown: 0, hollow: 0, cured: 0 });
    };
    const shoulder = sample(700, 568), swale = sample(664, 463);
    expect(shoulder.crown).toBeGreaterThan(.8);
    expect(swale.hollow).toBeGreaterThan(.9);
    expect(shoulder.crown - swale.crown).toBeGreaterThan(.7);
    expect(swale.hollow - shoulder.hollow).toBeGreaterThan(.8);
  });
});
