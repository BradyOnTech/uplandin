import { expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { createThreeHuntSetup } from '../src/game/gameplayMode';
import { mulberry32 } from '../src/game/math';

it.each(['chukar-ridge', 'hun-benches', 'sharptail-prairie'])('%s retains another opportunity after the opening covey escapes', areaId => {
  for (const drop of getArea(areaId).dropPoints) for (const challenge of ['relaxed', 'balanced', 'wild']) {
    const { hunt } = createThreeHuntSetup(`?area=${areaId}&drop=${drop.id}&challenge=${challenge}`, mulberry32(22), null);
    const first = hunt.birds[0].coveyId;
    const remaining = hunt.birds.filter(b => b.coveyId !== first);
    expect(remaining.length).toBeGreaterThan(0);
    const center = (birds: typeof remaining) => ({
      x: birds.reduce((sum, b) => sum + b.pos.x, 0) / birds.length,
      y: birds.reduce((sum, b) => sum + b.pos.y, 0) / birds.length,
    });
    const opening = center(hunt.birds.filter(b => b.coveyId === first));
    const groups = [...new Set(remaining.map(b => b.coveyId))];
    expect(groups.some(id => {
      const next = center(remaining.filter(b => b.coveyId === id));
      return Math.hypot(next.x - opening.x, next.y - opening.y) > 60;
    })).toBe(true);
  }
});
