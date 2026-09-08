import { expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { wetPondLayout } from '../src/game/wetPonds';

it('places water below surrounding banks with the same basin at either entry', () => {
  const area = getArea('woodcock-bottoms');
  const south = new LandscapeModel(area, 'south-gate');
  const west = new LandscapeModel(area, 'west-track');
  for (const pond of wetPondLayout(area)) {
    const floor = south.heightAtProperty(pond.px, pond.py);
    expect(west.heightAtProperty(pond.px, pond.py)).toBeCloseTo(floor, 8);
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      const dx = Math.cos(angle) * pond.rx * 1.15, dy = Math.sin(angle) * pond.rz * 1.15;
      const x = pond.px + dx * Math.cos(pond.angle) - dy * Math.sin(pond.angle);
      const y = pond.py + dx * Math.sin(pond.angle) + dy * Math.cos(pond.angle);
      expect(south.heightAtProperty(x, y)).toBeGreaterThan(floor + .75);
      expect(west.heightAtProperty(x, y)).toBeCloseTo(south.heightAtProperty(x, y), 8);
    }
  }
});
