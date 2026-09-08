import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { HUNT_WORLD_ANCHOR, LandscapeModel } from '../src/game/landscape';

describe('shared property landscape', () => {
  it('rebuilds the same named location identically', () => {
    const area = getArea('pheasant-coverts');
    const first = new LandscapeModel(area);
    const second = new LandscapeModel(area);
    expect(first.heightAtProperty(42, 73)).toBe(second.heightAtProperty(42, 73));
    expect(first.heightAtWorld(-110, 18)).toBe(second.heightAtWorld(-110, 18));
  });

  it('gives different locations different landforms', () => {
    const prairie = new LandscapeModel(getArea('quail-fields'));
    const alpineArea = getArea('timberline-parks');
    const alpine = new LandscapeModel(alpineArea);
    const alpineWithoutGrade = new LandscapeModel({
      ...alpineArea,
      terrain: { ...alpineArea.terrain, gradeX: 0, gradeZ: 0 },
    });
    expect(prairie.heightAtWorld(80, -55)).not.toBe(alpine.heightAtWorld(80, -55));
    // The authored alpine climb adds a sustained eastward grade. Compare
    // two positions to cancel the north/south contribution and base offset.
    const gradeAt = (x: number) => alpine.heightAtWorld(x, 0) - alpineWithoutGrade.heightAtWorld(x, 0);
    expect(gradeAt(100) - gradeAt(0)).toBeGreaterThan(20);
    expect(gradeAt(100) - gradeAt(0)).toBeLessThan(35);
  });

  it('round-trips property positions through either drop-point transform', () => {
    const area = getArea('quail-fields');
    for (const drop of area.dropPoints) {
      const landscape = new LandscapeModel(area, drop.id);
      const world = landscape.propertyToWorld(617, 284, { x: 0, z: 0 });
      const property = landscape.worldToProperty(world.x, world.z, { x: 0, y: 0 });
      expect(property.x).toBeCloseTo(617, 10);
      expect(property.y).toBeCloseTo(284, 10);
    }
  });

  it('anchors the selected truck while preserving one property heightfield', () => {
    const area = getArea('quail-fields');
    const south = new LandscapeModel(area, 'south-gate');
    const west = new LandscapeModel(area, 'west-track');

    for (const landscape of [south, west]) {
      expect(landscape.propertyToWorld(
        landscape.dropPoint.position.x,
        landscape.dropPoint.position.y,
        { x: 0, z: 0 },
      )).toEqual(HUNT_WORLD_ANCHOR);
    }

    const property = { x: 540, y: 330 };
    const southWorld = south.propertyToWorld(property.x, property.y, { x: 0, z: 0 });
    const westWorld = west.propertyToWorld(property.x, property.y, { x: 0, z: 0 });
    expect(south.heightAtWorld(southWorld.x, southWorld.z))
      .toBe(west.heightAtWorld(westWorld.x, westWorld.z));
    expect(south.heightAtWorld(HUNT_WORLD_ANCHOR.x, HUNT_WORLD_ANCHOR.z))
      .not.toBe(west.heightAtWorld(HUNT_WORLD_ANCHOR.x, HUNT_WORLD_ANCHOR.z));
  });

  it('gives Great Basin properties deterministic steep, classified ground', () => {
    const chukar = new LandscapeModel(getArea('chukar-ridge'));
    const rebuilt = new LandscapeModel(getArea('chukar-ridge'));
    const prairie = new LandscapeModel(getArea('quail-fields'));
    const points = [[0, 40], [40, 0], [-60, -20], [100, -60]] as const;
    let chukarSlope = 0;
    let prairieSlope = 0;

    for (const [x, z] of points) {
      const sample = chukar.surfaceAtWorld(x, z, { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 });
      const repeat = rebuilt.surfaceAtWorld(x, z, { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 });
      const flat = prairie.surfaceAtWorld(x, z, { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 });
      expect(sample).toEqual(repeat);
      expect(sample.rockiness).toBeGreaterThanOrEqual(0);
      expect(sample.rockiness).toBeLessThanOrEqual(1);
      expect(sample.vegetation).toBeGreaterThanOrEqual(0);
      expect(sample.vegetation).toBeLessThanOrEqual(1);
      chukarSlope += sample.slope;
      prairieSlope += flat.slope;
    }

    expect(chukarSlope / points.length).toBeGreaterThan((prairieSlope / points.length) * 2);
  });

  it('classifies the same physical surface from either Chukar drop', () => {
    const area = getArea('chukar-ridge');
    const south = new LandscapeModel(area, 'south-gate');
    const west = new LandscapeModel(area, 'west-track');
    const property = { x: 610, y: 355 };
    const southWorld = south.propertyToWorld(property.x, property.y, { x: 0, z: 0 });
    const westWorld = west.propertyToWorld(property.x, property.y, { x: 0, z: 0 });
    const a = south.surfaceAtWorld(southWorld.x, southWorld.z, { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 });
    const b = west.surfaceAtWorld(westWorld.x, westWorld.z, { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 });
    expect(a).toEqual(b);
  });

  it('authors prairie potholes as shared wet basins at mapped landmarks', () => {
    const area = getArea('pheasant-coverts');
    const south = new LandscapeModel(area, 'south-gate');
    const west = new LandscapeModel(area, 'west-track');
    const slough = area.landmarks.find((landmark) => landmark.id === 'south-slough');
    expect(slough).toBeDefined();
    if (!slough) return;

    const atCenter = south.surfaceAtProperty(slough.position.x, slough.position.y, {
      height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0,
    });
    const shoulder = south.surfaceAtProperty(slough.position.x + 70, slough.position.y, {
      height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0,
    });
    const westWorld = west.propertyToWorld(slough.position.x, slough.position.y, { x: 0, z: 0 });
    const throughWestDrop = west.surfaceAtWorld(westWorld.x, westWorld.z, {
      height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0,
    });

    expect(atCenter.moisture).toBeGreaterThan(0.9);
    expect(atCenter.height).toBeLessThan(shoulder.height - 1.5);
    expect(throughWestDrop).toEqual(atCenter);
  });
});
