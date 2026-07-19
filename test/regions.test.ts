import { describe, expect, it } from 'vitest';
import { AREAS } from '../src/game/areas';
import { STARTER_REGION } from '../src/game/career';
import { getRegion, REGIONS, regionAreas, regionOfArea } from '../src/game/regions';

describe('regions', () => {
  it('have unique ids and the starter region exists and is built', () => {
    expect(new Set(REGIONS.map((r) => r.id)).size).toBe(REGIONS.length);
    const home = REGIONS.find((r) => r.id === STARTER_REGION);
    expect(home?.built).toBe(true);
    expect(home?.areaIds.length).toBeGreaterThan(0);
  });

  it('every area belongs to exactly one region, and every region areaId exists', () => {
    for (const area of AREAS) {
      const owners = REGIONS.filter((r) => r.areaIds.includes(area.id));
      expect(owners).toHaveLength(1);
      expect(regionOfArea(area.id).id).toBe(owners[0].id);
    }
    for (const region of REGIONS) {
      expect(regionAreas(region)).toHaveLength(region.areaIds.length);
      if (region.built) expect(region.areaIds.length).toBeGreaterThan(0);
      else expect(region.areaIds).toHaveLength(0);
    }
  });

  it('map pins sit on the 480x270 map', () => {
    for (const r of REGIONS) {
      expect(r.map.x).toBeGreaterThan(0);
      expect(r.map.x).toBeLessThan(480);
      expect(r.map.y).toBeGreaterThan(0);
      expect(r.map.y).toBeLessThan(270);
    }
  });

  it('getRegion falls back to the first region', () => {
    expect(getRegion('nope')).toBe(REGIONS[0]);
  });
});
