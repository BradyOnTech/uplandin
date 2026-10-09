import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { buildHorizon, FAR_COUNTRY_M, horizonLand, TERRAIN_APRON_M, type Horizon } from '../src/three/horizon';

const PLAINS = ['quail-fields', 'sharptail-prairie', 'pheasant-coverts'];
const GROUNDS = [...PLAINS, 'chukar-ridge'];
const horizonOf = (area: string) => {
  const landscape = new LandscapeModel(getArea(area)), land = horizonLand(landscape);
  return { landscape, land, horizon: buildHorizon(area, land)! };
};
const around = (h: Horizon, step = 1) => Array.from({ length: 360 / step }, (_, i) => h.sample(0, (i * step - 180) * Math.PI / 180));
const angle = (height: number, radius: number) => Math.atan2(height, radius) * 180 / Math.PI;

describe('the farthest horizon band', () => {
  it.each(GROUNDS)('reads %s\'s band from its own landform and reach', area => {
    const { landscape, land, horizon } = horizonOf(area);
    expect(land.seed).toBe(getArea(area).terrain.seed);
    expect(land.relief).toBeGreaterThan(0);
    for (const az of land.lowAzimuths) { expect(az).toBeGreaterThanOrEqual(-180); expect(az).toBeLessThanOrEqual(180); }
    // It stands beyond the far terrain, which runs out from the apron's edge.
    const b = landscape.worldBounds();
    expect(land.reach).toBeCloseTo(Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + TERRAIN_APRON_M + FAR_COUNTRY_M, 6);
    expect(horizon.layers).toHaveLength(1);
  });

  it.each(GROUNDS)('joins %s\'s band behind the hunter and repeats through full turns', area => {
    const { horizon } = horizonOf(area);
    for (const theta of [-Math.PI, -.7, 0, 1.4]) expect(horizon.sample(0, theta + Math.PI * 2).crest).toBeCloseTo(horizon.sample(0, theta).crest, 6);
    expect(horizon.sample(0, Math.PI - 1e-6).crest).toBeCloseTo(horizon.sample(0, -Math.PI + 1e-6).crest, 3);
  });

  it.each(PLAINS)('puts no mountains and no mesa-like blocks on %s\'s band', area => {
    const { horizon } = horizonOf(area);
    for (const s of around(horizon, .5)) {
      expect(angle(s.crest, horizon.layers[0].radius)).toBeLessThan(2.5);
      expect(s.crown).toBe(0);
    }
  });

  it('lays Cattail\'s band flat to the edge of the world', () => {
    const { horizon } = horizonOf('pheasant-coverts');
    const heights = around(horizon).map(s => s.crest);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(6);
  });

  it('breaks Quail\'s caprock where the creeks run out', () => {
    const { land, horizon } = horizonOf('quail-fields');
    const at = (deg: number) => horizon.sample(0, deg * Math.PI / 180).crest, exit = land.lowAzimuths[0];
    // The creek's notch sits below the breaks on either side of it.
    expect(at(exit)).toBeLessThan(Math.max(at(exit - 15), at(exit + 15)) - 4);
  });

  it('frames Chukar in flat-topped canyon rims that open toward the river', () => {
    const { land, horizon } = horizonOf('chukar-ridge');
    const crests = around(horizon).map(s => s.crest);
    expect(horizon.sample(0, land.lowAzimuths[0] * Math.PI / 180).crest).toBeLessThan([...crests].sort((a, b) => a - b)[180]);
    expect(Math.max(...crests.map(c => angle(c, horizon.layers[0].radius)))).toBeGreaterThan(3);
    const fine = around(horizon, .5).map(s => s.crest);
    expect(fine.filter((c, i) => i > 0 && Math.abs(c - fine[i - 1]) < .3).length / fine.length).toBeGreaterThan(.3);
  });
});
