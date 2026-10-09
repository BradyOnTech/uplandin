import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { buildHorizon, horizonLand, type Horizon, type HorizonLand } from '../src/three/horizon';

const PLAINS = ['quail-fields', 'sharptail-prairie', 'pheasant-coverts'];
const GROUNDS = [...PLAINS, 'chukar-ridge'];
const horizonOf = (area: string) => {
  const land = horizonLand(new LandscapeModel(getArea(area)));
  return { land, horizon: buildHorizon(area, land)! };
};
const degrees = (h: Horizon, layer: number, step = 1) => Array.from({ length: 360 / step }, (_, i) =>
  h.sample(layer, (i * step - 180) * Math.PI / 180));
const angle = (height: number, radius: number) => Math.atan2(height, radius) * 180 / Math.PI;
/** The highest point of a layer's built silhouettes, as an elevation angle. */
const propAngle = (h: Horizon, layer: number) => {
  const p = h.props(layer);
  let best = -90;
  for (let i = 0; i < p.length; i += 3) best = Math.max(best, angle(p[i + 1], Math.hypot(p[i], p[i + 2])));
  return best;
};

describe('region-true horizons', () => {
  it.each(GROUNDS)('reads %s\'s horizon from its own landform', area => {
    const { land, horizon } = horizonOf(area);
    expect(land.seed).toBe(getArea(area).terrain.seed);
    expect(land.relief).toBeGreaterThan(0);
    for (const az of land.lowAzimuths) { expect(az).toBeGreaterThanOrEqual(-180); expect(az).toBeLessThanOrEqual(180); }
    expect(horizon.layers.length).toBe(3);
    // Near to far.
    for (let l = 1; l < horizon.layers.length; l++) expect(horizon.layers[l].radius).toBeGreaterThan(horizon.layers[l - 1].radius);
  });

  it.each(GROUNDS)('joins %s\'s horizon behind the hunter and repeats through full turns', area => {
    const { horizon } = horizonOf(area);
    for (let l = 0; l < 3; l++) {
      for (const theta of [-Math.PI, -.7, 0, 1.4]) {
        const a = horizon.sample(l, theta), b = horizon.sample(l, theta + Math.PI * 2);
        expect(b.crest).toBeCloseTo(a.crest, 6);
      }
      expect(horizon.sample(l, Math.PI - 1e-6).crest).toBeCloseTo(horizon.sample(l, -Math.PI + 1e-6).crest, 3);
      for (const s of degrees(horizon, l)) { expect(s.crown).toBeGreaterThanOrEqual(0); expect(s.crest).toBeCloseTo(s.ground + s.crown, 9); }
    }
  });

  it.each(PLAINS)('puts no mountains on %s\'s horizon in any direction', area => {
    const { horizon } = horizonOf(area);
    horizon.layers.forEach((layer, l) => {
      for (const s of degrees(horizon, l, .5)) expect(angle(s.crest, layer.radius)).toBeLessThan(2.5);
      expect(propAngle(horizon, l)).toBeLessThan(3);
    });
  });

  it('keeps Sharptail an open sky over swells, with a windmill and one far shelterbelt at most', () => {
    const { horizon } = horizonOf('sharptail-prairie');
    const wooded = degrees(horizon, 0).map((_, i) => [0, 1, 2].some(l => degrees(horizon, l)[i].crown > .5)).filter(Boolean).length;
    expect(wooded / 360).toBeLessThan(.1);
    expect(wooded).toBeGreaterThan(0);
    expect(horizon.props(0).length + horizon.props(2).length).toBe(0);
    expect(horizon.props(1).length).toBeGreaterThan(0);
    // The swells layer: each band's crests stand higher than the one before.
    const mean = (l: number) => degrees(horizon, l).reduce((sum, s) => sum + s.ground, 0) / 360;
    expect(mean(1)).toBeGreaterThan(mean(0)); expect(mean(2)).toBeGreaterThan(mean(1));
  });

  it('lines Quail\'s drainages with creek timber where the land runs off, and keeps open breaks elsewhere', () => {
    const { land, horizon } = horizonOf('quail-fields');
    expect(land.lowAzimuths.length).toBeGreaterThan(0);
    const exit = land.lowAzimuths[0] * Math.PI / 180;
    expect(horizon.sample(1, exit).crown).toBeGreaterThan(5);
    const wooded = degrees(horizon, 1).filter(s => s.crown > 1).length / 360;
    expect(wooded).toBeGreaterThan(.12); expect(wooded).toBeLessThan(.6);
    // Turn the land and the timber turns with it.
    const turned: HorizonLand = { ...land, lowAzimuths: land.lowAzimuths.map(az => ((az + 90 + 180) % 360) - 180) };
    expect(buildHorizon('quail-fields', turned)!.sample(1, exit + Math.PI / 2).crown).toBeGreaterThan(5);
  });

  it('gives Cattail separated shelterbelts, a pole line and a far grain elevator on flat section country', () => {
    const { horizon } = horizonOf('pheasant-coverts');
    for (let l = 0; l < 3; l++) {
      const wooded = degrees(horizon, l).filter(s => s.crown > .5).length / 360;
      expect(wooded).toBeGreaterThan(.01); expect(wooded).toBeLessThan(.45);
      // Flat ground between the belts.
      for (const s of degrees(horizon, l)) expect(Math.abs(s.ground)).toBeLessThan(4);
    }
    expect(horizon.props(0).length / 9).toBeGreaterThan(40); // poles and crossarms
    expect(horizon.props(1).length).toBe(0);
    // The elevator stands well above the far belts.
    const farBelts = Math.max(...degrees(horizon, 2).map(s => angle(s.crest, horizon.layers[2].radius)));
    expect(propAngle(horizon, 2)).toBeGreaterThan(farBelts * 1.5);
  });

  it('frames Chukar in canyon rims that open toward the river below the property', () => {
    const { land, horizon } = horizonOf('chukar-ridge');
    const near = degrees(horizon, 0).map(s => s.crest).sort((a, b) => a - b);
    const median = near[180];
    expect(horizon.sample(0, land.lowAzimuths[0] * Math.PI / 180).crest).toBeLessThan(median);
    // Canyon walls, not plains swells: the far rims stand several degrees up.
    expect(Math.max(...degrees(horizon, 2).map(s => angle(s.crest, horizon.layers[2].radius)))).toBeGreaterThan(3);
    // Flat-topped rims: much of each wall sits on a level step.
    const level = degrees(horizon, 1, .5).filter((s, i, all) => i > 0 && Math.abs(s.crest - all[i - 1].crest) < .3).length;
    expect(level / 720).toBeGreaterThan(.3);
  });
});
