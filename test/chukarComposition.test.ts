import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { CHUKAR_ROUTE_STANDS, CHUKAR_WESTERN_ROUTE_STANDS, chukarCompositionAt, chukarWashAt } from '../src/game/chukarComposition';
import { chukarBrows, chukarGroundZones, chukarPlantStandAt } from '../src/game/chukarLandscape';
import { LandscapeModel } from '../src/game/landscape';

const area = getArea('chukar-ridge');
const composition = (x: number, y: number) => chukarCompositionAt(x, y, { sage: 0, grass: 0, open: 0, wash: 0 });
const planting = (x: number, y: number) => {
  const zones = chukarGroundZones(x, y, { talus: 0, shelter: 0 });
  return chukarPlantStandAt(x, y, zones.talus, zones.shelter, { grass: 0, sage: 0 });
};

describe('Chukar western route composition', () => {
  it('puts sage on the shelter side and exposed aprons below the existing named formations', () => {
    for (const [browId, shelterId, apronId] of [
      ['west-sentinel', 'sentinel-sheltered-sage', 'sentinel-talus-opening'],
      ['western-mesa', 'mesa-high-shelter', 'mesa-talus-opening'],
    ]) {
      const brow = chukarBrows(area).find(b => b.id === browId)!;
      const shelter = CHUKAR_WESTERN_ROUTE_STANDS.find(s => s.id === shelterId)!;
      const apron = CHUKAR_WESTERN_ROUTE_STANDS.find(s => s.id === apronId)!;
      expect(shelter.y).toBeLessThan(brow.y);
      expect(apron.y).toBeGreaterThan(brow.y);
      expect(Math.abs(shelter.x - brow.x)).toBeLessThan(brow.length / 2);
      expect(planting(shelter.x, shelter.y).sage).toBeGreaterThan(planting(apron.x, apron.y).sage + .4);
      expect(composition(apron.x, apron.y).open).toBeGreaterThan(.9);
    }
  });

  it('frames the actual west switchback and return with grouped cover instead of filling the whole slope', () => {
    const route = area.trails.find(t => t.id === 'west-switchback')!;
    for (const id of ['west-arrival-grass', 'sentinel-contour-sage', 'west-contour-grass', 'mesa-lower-grass', 'mesa-bench-sage', 'mesa-east-pocket', 'west-saddle-grass']) {
      const stand = CHUKAR_WESTERN_ROUTE_STANDS.find(s => s.id === id)!;
      const distance = Math.min(...route.points.slice(1).map((b, i) => {
        const a = route.points[i], dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((stand.x - a.x) * dx + (stand.y - a.y) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(stand.x - a.x - t * dx, stand.y - a.y - t * dy);
      }));
      expect(distance, id).toBeLessThan(30);
      expect(Math.max(stand.grass, stand.sage), id).toBeGreaterThanOrEqual(.9);
    }
    expect(planting(281, 393).grass).toBeGreaterThan(.8);
    expect(planting(395, 343).sage).toBeGreaterThan(.7);
    // The gaps are deliberate exposed country, not a continuous planted belt.
    for (const [x, y] of [[230, 280], [290, 460], [515, 390]]) {
      const sample = composition(x, y);
      expect(sample.sage + sample.grass + sample.open).toBe(0);
    }
  });

  it('uses identical scenery coordinates from either truck drop', () => {
    const south = new LandscapeModel(area, 'south-gate'), west = new LandscapeModel(area, 'west-track');
    for (const stand of CHUKAR_WESTERN_ROUTE_STANDS) {
      const expected = composition(stand.x, stand.y);
      for (const landscape of [south, west]) {
        const world = landscape.propertyToWorld(stand.x, stand.y, { x: 0, z: 0 });
        const property = landscape.worldToProperty(world.x, world.z, { x: 0, y: 0 });
        const actual = composition(property.x, property.y);
        expect(actual.sage).toBeCloseTo(expected.sage, 10);
        expect(actual.grass).toBeCloseTo(expected.grass, 10);
        expect(actual.open).toBeCloseTo(expected.open, 10);
      }
    }
    expect(new Set(CHUKAR_ROUTE_STANDS.map(s => s.id)).size).toBe(CHUKAR_ROUTE_STANDS.length);
  });

  it('preserves the accepted southern planting and leaves western heights without invented drainage', () => {
    for (const [x, y, sage, grass, open] of [
      [615, 735, .12, 1, 0], [658, 556, 1, .35, 0], [762, 617, 0, .1, 1],
      [959, 385, 1, .4, 0], [1024, 267, 0, .15, .9],
    ]) {
      const actual = composition(x, y);
      expect(actual.sage).toBe(sage); expect(actual.grass).toBe(grass); expect(actual.open).toBe(open);
    }
    for (const [x, y] of [[638, 662], [861, 517], [1104, 281]]) expect(chukarWashAt(x, y)).toBe(1);
    for (let y = 220; y <= 490; y += 9) for (let x = 20; x < 650; x += 9) expect(chukarWashAt(x, y)).toBe(0);
  });
});
