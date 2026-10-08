import { describe, expect, it } from 'vitest';
import type { Bird } from '../src/game/birds';
import { getBreed } from '../src/game/breeds';
import { Dog } from '../src/game/dog';
import { dist } from '../src/game/math';
import type { RNG } from '../src/game/types';

/** Deterministic value queue (constructor heading roll consumes the first). */
function seq(values: number[]): RNG {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function birdAt(x: number, y: number): Bird {
  return { id: 1, coveyId: 1, speciesId: 'bobwhite', pos: { x, y }, state: 'hidden', runs: false, runEnergy: 0, restingMs: 0, nerveMs: 60000 };
}

/** A soft first-season setter that will creep three steps on point. */
function creepingPup(): Dog {
  // heading roll, then creep roll (0.1 < chance), then steps roll (0.9 → 3 steps)
  return new Dog({ x: 100, y: 100 }, { breed: getBreed('irish-setter'), level: 1 }, seq([0.5, 0.1, 0.9]));
}

/** Run until the dog first stands on point. */
function untilPoint(dog: Dog, birds: Bird[]): void {
  for (let i = 0; i < 400 && dog.state !== 'pointing'; i++) dog.update(50, birds, {});
  expect(dog.state).toBe('pointing');
}

describe('a pup creeping on point', () => {
  it('walks each creep step slowly instead of jumping', () => {
    const dog = creepingPup();
    const bird = birdAt(120, 100);
    untilPoint(dog, [bird]);
    let creptTicks = 0, largest = 0;
    for (let i = 0; i < 300 && dog.bumpedBirdId === null; i++) {
      const before = { ...dog.pos };
      dog.update(50, [bird], {});
      largest = Math.max(largest, dist(before, dog.pos));
      if (dog.creeping) creptTicks++;
    }
    // A creep step is a deliberate walk the handler can see coming, never a
    // one-tick hop of the whole step.
    expect(largest).toBeLessThan(0.15);
    expect(creptTicks).toBeGreaterThan(20);
    expect(dog.state).toBe('pointing');
  });

  it('still bumps a bird it creeps too close to', () => {
    const dog = creepingPup();
    const bird = birdAt(108, 100);
    for (let i = 0; i < 400 && dog.bumpedBirdId === null; i++) dog.update(50, [bird], {});
    expect(dog.bumpedBirdId).toBe(bird.id);
    expect(dog.creeping).toBe(false);
  });

  it('stops dead mid-step when whoa’d', () => {
    const dog = creepingPup();
    const bird = birdAt(120, 100);
    untilPoint(dog, [bird]);
    for (let i = 0; i < 300 && !dog.creeping; i++) dog.update(50, [bird], {});
    expect(dog.creeping).toBe(true);
    expect(dog.command({ kind: 'whoa' }, [bird])).toBe('steadied');
    expect(dog.creeping).toBe(false);
    const held = { ...dog.pos };
    for (let i = 0; i < 100; i++) dog.update(50, [bird], {});
    expect(dog.pos).toEqual(held);
    expect(dog.bumpedBirdId).toBeNull();
  });
});
