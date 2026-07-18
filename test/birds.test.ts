import { describe, expect, it } from 'vitest';
import { flushCovey, spawnBirds, type Bird } from '../src/game/birds';
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

describe('flushCovey', () => {
  it('flushes the whole covey and nothing else', () => {
    const birds: Bird[] = [
      { id: 1, coveyId: 0, pos: { x: 0, y: 0 }, state: 'hidden' },
      { id: 2, coveyId: 0, pos: { x: 5, y: 5 }, state: 'hidden' },
      { id: 3, coveyId: 1, pos: { x: 50, y: 50 }, state: 'hidden' },
    ];
    const flushed = flushCovey(birds, 1);
    expect(flushed.map((b) => b.id).sort()).toEqual([1, 2]);
    expect(birds[2].state).toBe('hidden');
  });

  it('does not re-flush resolved birds', () => {
    const birds: Bird[] = [
      { id: 1, coveyId: 0, pos: { x: 0, y: 0 }, state: 'downed' },
      { id: 2, coveyId: 0, pos: { x: 5, y: 5 }, state: 'hidden' },
    ];
    const flushed = flushCovey(birds, 2);
    expect(flushed.map((b) => b.id)).toEqual([2]);
    expect(birds[0].state).toBe('downed');
  });

  it('returns empty for an unknown id', () => {
    expect(flushCovey([], 99)).toEqual([]);
  });
});
