import { describe, expect, it } from 'vitest';
import {
  flushCovey,
  RUNNER_MAX_ENERGY,
  spawnBirds,
  updateBirds,
  type Bird,
} from '../src/game/birds';
import { dist } from '../src/game/math';

/** Deterministic LCG so spawn patterns are reproducible. */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function byCovey(birds: Bird[]): Map<number, Bird[]> {
  const map = new Map<number, Bird[]>();
  for (const b of birds) {
    map.set(b.coveyId, [...(map.get(b.coveyId) ?? []), b]);
  }
  return map;
}

describe('spawnBirds', () => {
  it('spawns exactly the requested number of birds', () => {
    expect(spawnBirds(6, lcg(1))).toHaveLength(6);
    expect(spawnBirds(7, lcg(2))).toHaveLength(7);
    expect(spawnBirds(1, lcg(3))).toHaveLength(1);
  });

  it('groups birds into coveys of at most 3, clustered together', () => {
    const birds = spawnBirds(9, lcg(4));
    const coveys = byCovey(birds);
    expect(coveys.size).toBeGreaterThan(1); // 9 birds can't fit in one covey of 3
    for (const members of coveys.values()) {
      expect(members.length).toBeLessThanOrEqual(3);
      for (let i = 1; i < members.length; i++) {
        // jitter is ±10px per axis, so covey mates stay within ~29px
        expect(dist(members[0].pos, members[i].pos)).toBeLessThanOrEqual(30);
      }
    }
  });
});

function bird(over: Partial<Bird>): Bird {
  return {
    id: 1,
    coveyId: 0,
    pos: { x: 0, y: 0 },
    state: 'hidden',
    runs: false,
    runEnergy: 0,
    restingMs: 0,
    ...over,
  };
}

describe('flushCovey', () => {
  it('flushes the whole covey and nothing else', () => {
    const birds: Bird[] = [
      bird({ id: 1, coveyId: 0, pos: { x: 0, y: 0 } }),
      bird({ id: 2, coveyId: 0, pos: { x: 5, y: 5 } }),
      bird({ id: 3, coveyId: 1, pos: { x: 50, y: 50 } }),
    ];
    const flushed = flushCovey(birds, 1);
    expect(flushed.map((b) => b.id).sort()).toEqual([1, 2]);
    expect(birds[2].state).toBe('hidden');
  });

  it('does not re-flush resolved birds', () => {
    const birds: Bird[] = [
      bird({ id: 1, coveyId: 0, pos: { x: 0, y: 0 }, state: 'downed' }),
      bird({ id: 2, coveyId: 0, pos: { x: 5, y: 5 } }),
    ];
    const flushed = flushCovey(birds, 2);
    expect(flushed.map((b) => b.id)).toEqual([2]);
    expect(birds[0].state).toBe('downed');
  });

  it('returns empty for an unknown id', () => {
    expect(flushCovey([], 99)).toEqual([]);
  });
});

describe('updateBirds (runners)', () => {
  it('flees the dog when it gets close', () => {
    const b = bird({ pos: { x: 100, y: 100 }, runs: true, runEnergy: RUNNER_MAX_ENERGY });
    for (let i = 0; i < 20; i++) updateBirds(50, [b], { x: 130, y: 100 });
    expect(b.pos.x).toBeLessThan(100); // ran away from the dog
    expect(b.pos.y).toBeCloseTo(100, 5);
  });

  it('holds its ground while the dog is far off', () => {
    const b = bird({ pos: { x: 100, y: 100 }, runs: true, runEnergy: RUNNER_MAX_ENERGY });
    updateBirds(50, [b], { x: 400, y: 100 });
    expect(b.pos).toEqual({ x: 100, y: 100 });
  });

  it('never moves a non-runner', () => {
    const b = bird({ pos: { x: 100, y: 100 }, runs: false });
    for (let i = 0; i < 20; i++) updateBirds(50, [b], { x: 105, y: 100 });
    expect(b.pos).toEqual({ x: 100, y: 100 });
  });

  it('stops to rest when winded, then holds still', () => {
    const b = bird({ pos: { x: 100, y: 100 }, runs: true, runEnergy: 40 });
    updateBirds(50, [b], { x: 110, y: 100 }); // burns the last of its energy
    updateBirds(50, [b], { x: 110, y: 100 }); // winded → starts resting
    expect(b.restingMs).toBeGreaterThan(0);
    const at = { ...b.pos };
    for (let i = 0; i < 10; i++) updateBirds(50, [b], { x: 105, y: 100 });
    expect(b.pos).toEqual(at); // frozen while resting
  });

  it('stays inside the field while fleeing', () => {
    const b = bird({ pos: { x: 8, y: 135 }, runs: true, runEnergy: RUNNER_MAX_ENERGY });
    for (let i = 0; i < 40; i++) updateBirds(50, [b], { x: 30, y: 135 });
    expect(b.pos.x).toBeGreaterThanOrEqual(4);
  });
});
