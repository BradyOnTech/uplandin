import { expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { irregularPuddleGeometry, type Pond } from '../src/three/subsystems/wetBottoms';

it('keeps every water vertex level across rotated pools', () => {
  const landscape = new LandscapeModel(getArea('woodcock-bottoms'));
  const ponds: Pond[] = [
    { px: 430, py: 350, rx: 12, rz: 6, angle: 1.1, waterY: 3, seed: 31 },
    { px: 600, py: 280, rx: 23, rz: 14, angle: 2.7, waterY: 5, seed: 87 },
  ];
  const water = irregularPuddleGeometry(ponds, landscape);
  const position = water.getAttribute('position');
  const verticesPerPond = position.count / ponds.length;
  for (let i = 0; i < position.count; i++) {
    expect(position.getY(i)).toBe(ponds[Math.floor(i / verticesPerPond)].waterY);
    expect(Number.isFinite(position.getX(i)) && Number.isFinite(position.getZ(i))).toBe(true);
  }
  water.dispose();
});
