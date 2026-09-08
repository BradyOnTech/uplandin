import { expect, it } from 'vitest';
import { ObstacleIndex } from '../src/game/obstacleIndex';

it('includes intersecting circles across negative cells and large pond boundaries without duplicates', () => {
  const obstacles = [
    { x: -8, y: -8, radius: .4 }, { x: 32, y: 12, radius: 29 },
    ...Array.from({ length: 7000 }, (_, i) => ({ x: i % 100 * 8, y: Math.floor(i / 100) * 8, radius: .35 })),
  ];
  const index = new ObstacleIndex(obstacles);
  for (let y = -15; y < 50; y += 1.9) for (let x = -15; x < 65; x += 2.1) {
    const found = index.nearby(x, y, 1.2);
    expect(new Set(found).size).toBe(found.length);
    expect(found.length).toBeLessThan(20);
    for (const obstacle of obstacles) {
      if (Math.hypot(x - obstacle.x, y - obstacle.y) <= obstacle.radius + 1.2) expect(found).toContain(obstacle);
    }
  }
});
