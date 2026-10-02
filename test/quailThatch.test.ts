import { describe, expect, it } from 'vitest';
import { getArea, getDropPoint } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { quailBurnAt, quailFeatureBare } from '../src/game/quailFeatures';
import { quailOpeningAt } from '../src/game/quailComposition';
import { buildQuailTerrainGeometry, paintQuailGround, quailThatchAt } from '../src/three/subsystems/quailTerrain';
import { quailTrackDistanceAt } from '../src/three/subsystems/quailTracks';
import { quailGrassClearingAt, quailGrassMassAt } from '../src/three/subsystems/quailVegetation';

describe('Quail Fields thatch', () => {
  const area = getArea('quail-fields');
  const landscape = new LandscapeModel(area, getDropPoint(area).id);
  const samples: { x: number; y: number; thatch: number }[] = [];
  for (let y = area.world.y + 4; y < area.world.y + area.world.h; y += 9) {
    for (let x = area.world.x + 4; x < area.world.x + area.world.w; x += 9) samples.push({ x, y, thatch: quailThatchAt(landscape, x, y) });
  }

  it('mats the floor of the grass drifts and leaves the worked ground as soil', () => {
    for (const { x, y, thatch } of samples) {
      expect(thatch).toBeGreaterThanOrEqual(0); expect(thatch).toBeLessThanOrEqual(1);
      // The tracks, the creek and the firebreak carry no mat.
      if (quailTrackDistanceAt(area, x, y, 16) * .9144 < 1.6 || quailFeatureBare(x, y) >= 1 || quailBurnAt(x, y) >= 1) expect(thatch).toBe(0);
    }
    const drift = samples.filter(s => quailGrassMassAt(area, s.x, s.y) > .6 && s.thatch > 0);
    const open = samples.filter(s => quailOpeningAt(s.x, s.y) > .8 && s.thatch > 0);
    const mean = (list: typeof samples) => list.reduce((sum, s) => sum + s.thatch, 0) / list.length;
    expect(drift.length).toBeGreaterThan(20); expect(open.length).toBeGreaterThan(5);
    expect(mean(drift)).toBeGreaterThan(.75);
    expect(mean(open)).toBeLessThan(mean(drift) * .5);
  });

  it('clears the parking yard by the truck', () => {
    const drop = getDropPoint(area).position;
    expect(quailGrassClearingAt(area, drop.x, drop.y)).toBe(true);
    expect(quailThatchAt(landscape, drop.x, drop.y)).toBeLessThan(.2);
  });

  it('rides on the ground mesh without changing its paint', () => {
    const plain = buildQuailTerrainGeometry(landscape, 200, 200, 32, 32, 8);
    const matted = buildQuailTerrainGeometry(landscape, 200, 200, 32, 32, 8, paintQuailGround, quailThatchAt);
    expect(plain.getAttribute('quailThatch')).toBeUndefined();
    const mats = matted.getAttribute('quailThatch');
    expect(mats.count).toBe(matted.getAttribute('position').count);
    expect(Array.from(matted.getAttribute('color').array)).toEqual(Array.from(plain.getAttribute('color').array));
    plain.dispose(); matted.dispose();
  });
});
