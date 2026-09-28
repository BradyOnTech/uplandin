import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import { SHARPTAIL_COVER_PATCHES, sharptailGroundZones } from '../src/game/sharptailLandscape';
import {
  SHARPTAIL_ERRATICS, SHARPTAIL_LANDFORM_DETAILS,
  sharptailDetailGrowth, sharptailDetailHeight, sharptailStoneClearance,
} from '../src/game/sharptailFeatures';
import { sampleQuailGroundHeights } from '../src/three/subsystems/quailGroundGeometry';
import { sharptailGrassOpening, sharptailMeadowAt } from '../src/three/subsystems/sharptailMeadow';

const area = getArea('sharptail-prairie');
const surface = () => ({ height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 });
const featureSamples = () => {
  const points: { x: number; y: number }[] = [];
  for (const feature of SHARPTAIL_LANDFORM_DETAILS) {
    const reach = feature.rx + feature.ry;
    for (let x = feature.x - reach; x <= feature.x + reach; x += 9) {
      for (let y = feature.y - reach; y <= feature.y + reach; y += 9) {
        if (sharptailDetailHeight(x, y) !== 0) points.push({ x, y });
      }
    }
  }
  return points;
};
const segmentDistance = (x: number, y: number, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a.x - dx * t, y - a.y - dy * t);
};

describe('Sharptail remembered ground features', () => {
  it('keeps the same physical relief and accessible slopes from either actual entry', () => {
    const south = new LandscapeModel(area, 'south-gate'), west = new LandscapeModel(area, 'west-track');
    const sample = surface(); let maxSlope = 0, maxEntryError = 0;
    const points = featureSamples();
    expect(points.length).toBeGreaterThan(0);
    for (const point of points) {
      const a = south.propertyToWorld(point.x, point.y, { x: 0, z: 0 });
      const b = west.propertyToWorld(point.x, point.y, { x: 0, z: 0 });
      south.surfaceAtProperty(point.x, point.y, sample);
      expect(Object.values(sample).every(Number.isFinite)).toBe(true);
      maxSlope = Math.max(maxSlope, sample.slope);
      maxEntryError = Math.max(maxEntryError, Math.abs(south.heightAtWorld(a.x, a.z) - west.heightAtWorld(b.x, b.z)));
    }
    expect(maxEntryError).toBeLessThan(1e-8);
    // Retain the established open-country walkability envelope.
    expect(maxSlope).toBeLessThan(.4);
  });

  it('retains grounded near terrain and bounded far interpolation over the actual new relief', () => {
    const landscape = new LandscapeModel(area); const points = featureSamples();
    let highError = 0, liteError = 0, farError = 0;
    for (const point of points) {
      const exact = landscape.heightAtProperty(point.x, point.y);
      // These are the actual PropertyTerrain divisions. The helper samples
      // its float32 triangles, rather than resampling an analytic formula.
      const high = sampleQuailGroundHeights(landscape, point.x, point.y, undefined, { near: 48, far: 14 });
      const lite = sampleQuailGroundHeights(landscape, point.x, point.y, undefined, { near: 24, far: 14 });
      highError = Math.max(highError, Math.abs(high.nearY - exact));
      liteError = Math.max(liteError, Math.abs(lite.nearY - exact));
      farError = Math.max(farError, Math.abs(high.farY - exact), Math.abs(lite.farY - exact));
    }
    // Close contact stays within a boot sole/grass-root allowance. The far
    // mesh is beyond the105m Lite ring and remains inside its .85m skirt.
    expect(highError).toBeLessThan(.06);
    expect(liteError).toBeLessThan(.15);
    expect(farError).toBeLessThan(.5);
  });

  it('leaves walking lanes and entry clearances outside complete solid footprints', () => {
    for (const stone of SHARPTAIL_ERRATICS) {
      const radiusM = Math.hypot(stone.width, stone.depth) / 2;
      expect(stone.width > 0 && stone.height > 0 && stone.depth > 0).toBe(true);
      let routeDistanceM = Infinity;
      for (const trail of area.trails) for (let i = 1; i < trail.points.length; i++) {
        routeDistanceM = Math.min(routeDistanceM,
          segmentDistance(stone.x, stone.y, trail.points[i - 1], trail.points[i]) * PROPERTY_PX_TO_M);
      }
      expect(routeDistanceM - radiusM).toBeGreaterThan(3);
      for (const drop of area.dropPoints) {
        expect(Math.hypot(stone.x - drop.position.x, stone.y - drop.position.y) * PROPERTY_PX_TO_M - radiusM).toBeGreaterThan(8);
      }
      // Concealed birds are stocked inside these rectangles and do not
      // know about renderer landmarks. Keep the whole solid outside cover,
      // using a conservative yaw-independent footprint rather than its center.
      for (const patch of area.patches) {
        const dx = Math.max(patch.x - stone.x, 0, stone.x - patch.x - patch.w);
        const dy = Math.max(patch.y - stone.y, 0, stone.y - patch.y - patch.h);
        expect(Math.hypot(dx, dy) * PROPERTY_PX_TO_M).toBeGreaterThan(radiusM);
      }
      expect(sharptailStoneClearance(stone.x, stone.y)).toBe(0);
    }
  });

  it('limits the relief and vegetation treatment to local places rather than repainting the prairie', () => {
    let total = 0, changed = 0, deepest = 0, highest = 0;
    const growth = { crown: 0, hollow: 0, exposed: 0 };
    for (let x = 0; x <= 1400; x += 20) for (let y = 0; y <= 800; y += 20) {
      total++; const height = sharptailDetailHeight(x, y);
      sharptailDetailGrowth(x, y, growth);
      if (height !== 0) changed++;
      deepest = Math.min(deepest, height); highest = Math.max(highest, height);
      expect(Object.values(growth).every(v => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
      expect(sharptailStoneClearance(x, y)).toBeGreaterThanOrEqual(0);
      expect(sharptailStoneClearance(x, y)).toBeLessThanOrEqual(1);
    }
    expect(changed / total).toBeGreaterThan(.03);
    expect(changed / total).toBeLessThan(.25);
    expect(deepest).toBeLessThan(-1); expect(deepest).toBeGreaterThan(-4);
    expect(highest).toBeGreaterThan(1.5); expect(highest).toBeLessThan(4);
    for (const point of [...area.dropPoints.map(drop => drop.position), { x: -50, y: 400 }, { x: 1450, y: 400 }]) {
      expect(sharptailDetailHeight(point.x, point.y)).toBe(0);
      sharptailDetailGrowth(point.x, point.y, growth);
      expect(growth).toEqual({ crown: 0, hollow: 0, exposed: 0 });
    }
  });

  it('preserves authored bird-cover cores beneath the added visual meadow treatment', () => {
    const patchesBefore = JSON.stringify(area.patches);
    const zones = { stand: 0, swale: 0 }, meadow = { crown: 0, hollow: 0, cured: 0, exposed: 0 };
    let affectedCover = 0;
    for (const patch of SHARPTAIL_COVER_PATCHES) {
      expect(area.patches).toContain(patch);
      for (let x = patch.x + 3; x < patch.x + patch.w - 3; x += 11) {
        for (let y = patch.y + 3; y < patch.y + patch.h - 3; y += 11) {
          if (sharptailDetailHeight(x, y) === 0) continue;
          affectedCover++;
          sharptailGroundZones(x, y, zones); sharptailMeadowAt(x, y, zones.swale, meadow);
          expect(zones.stand).toBe(1);
          expect(sharptailGrassOpening(meadow.exposed, zones.stand)).toBeLessThanOrEqual(.051);
        }
      }
    }
    expect(affectedCover).toBeGreaterThan(0);
    expect(JSON.stringify(area.patches)).toBe(patchesBefore);
  });
});
