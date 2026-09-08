import { expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { irregularPuddleGeometry, type Pond } from '../src/three/subsystems/wetBottoms';

it('joins every rotated water edge exactly to its mud bank', () => {
  const landscape = new LandscapeModel(getArea('woodcock-bottoms'));
  const ponds: Pond[] = [
    { px: 430, py: 350, rx: 12, rz: 6, angle: 1.1, waterY: 3, seed: 31 },
    { px: 600, py: 280, rx: 23, rz: 14, angle: 2.7, waterY: 5, seed: 87 },
  ];
  const water = irregularPuddleGeometry(ponds, landscape, false);
  const bank = irregularPuddleGeometry(ponds, landscape, true);
  const w = water.getAttribute('position'), b = bank.getAttribute('position');
  const segments = w.count / ponds.length - 1;
  for (let pond = 0; pond < ponds.length; pond++) {
    for (let edge = 0; edge < segments; edge++) {
      const wi = pond * (segments + 1) + 1 + edge;
      const bi = pond * segments * 4 + edge * 4;
      expect([b.getX(bi), b.getY(bi), b.getZ(bi)])
        .toEqual([w.getX(wi), w.getY(wi), w.getZ(wi)]);
    }
  }
  water.dispose(); bank.dispose();
});
