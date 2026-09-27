import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import type { Bird } from '../src/game/birds';
import { getBreed } from '../src/game/breeds';
import { Dog, type DogEnv } from '../src/game/dog';
import { mulberry32 } from '../src/game/math';
import { PROPERTY_PX_TO_M } from '../src/game/worldUnits';

const area = getArea('sharptail-prairie');
const stand = area.patches[0];
const insideStand = (dog: Dog) => dog.pos.x >= stand.x && dog.pos.x <= stand.x + stand.w
  && dog.pos.y >= stand.y && dog.pos.y <= stand.y + stand.h;
function edgeSearch(seed: number, windAngle = 0) {
  const dog = new Dog({ x: 415, y: 694 }, { breed: getBreed('gsp'), level: 8 }, mulberry32(seed), area.world);
  const env: DogEnv = {
    huntAreaId: area.id,
    hunterPos: { x: 415, y: 700 },
    workAnchor: { x: 415, y: 684 },
    rangeRadius: 22 / PROPERTY_PX_TO_M,
    movementScale: .05,
    windAngle,
    patches: [stand],
  };
  return { dog, env };
}

describe('Sharptail prairie search coverage', () => {
  it('casts into a reachable stand edge even when its distant center is outside working range', () => {
    // This real prairie stand is 174 yards long. Its center is not a
    // reachable objective from this approach, although its near edge is.
    for (const seed of [1, 2, 3, 4, 42, 200]) {
      const { dog, env } = edgeSearch(seed);
      expect(Math.hypot(stand.x + stand.w / 2 - env.workAnchor!.x,
        stand.y + stand.h / 2 - env.workAnchor!.y)).toBeGreaterThan(60);
      let entryTime = Infinity;
      for (let tick = 0; tick < 180; tick++) {
        dog.update(1000 / 30, [], env);
        if (insideStand(dog)) { entryTime = tick / 30; break; }
      }
      expect(entryTime).toBeLessThan(6);
      expect(dog.state).toBe('quartering');
    }
  });

  it('uses the wind for its approach rather than entering every stand on the same line', () => {
    const downwind = edgeSearch(200, 0), opposite = edgeSearch(200, Math.PI);
    for (let tick = 0; tick < 90; tick++) {
      downwind.dog.update(1000 / 30, [], downwind.env);
      opposite.dog.update(1000 / 30, [], opposite.env);
    }
    expect(Math.hypot(downwind.dog.pos.x - opposite.dog.pos.x,
      downwind.dog.pos.y - opposite.dog.pos.y)).toBeGreaterThan(5);
    expect(downwind.dog.state).toBe('quartering');
    expect(opposite.dog.state).toBe('quartering');
  });

  it('searches the same public habitat whether distant concealed birds are present or absent', () => {
    const empty = edgeSearch(200), occupied = edgeSearch(200);
    const concealed: Bird = { id: 9001, coveyId: 1, speciesId: 'sharptail', pos: { x: 900, y: 650 },
      state: 'hidden', runs: false, runEnergy: 0, restingMs: 0, nerveMs: 10000 };
    for (let tick = 0; tick < 1200; tick++) {
      const handlerX = 415 + tick * (2.2 / PROPERTY_PX_TO_M / 30);
      for (const { env } of [empty, occupied]) {
        env.hunterPos!.x = handlerX;
        env.workAnchor!.x = handlerX;
      }
      empty.dog.update(1000 / 30, [], empty.env);
      occupied.dog.update(1000 / 30, [concealed], occupied.env);
      expect(occupied.dog.pos).toEqual(empty.dog.pos);
      expect(occupied.dog.state).toBe('quartering');
    }
    expect(concealed.pos).toEqual({ x: 900, y: 650 });
  });
});
