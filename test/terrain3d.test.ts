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
    expect(alpine.heightAtWorld(100, 0) - alpineWithoutGrade.heightAtWorld(100, 0))
      .toBeCloseTo(alpineArea.terrain.gradeX, 8);
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
});
