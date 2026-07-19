import { describe, expect, it } from 'vitest';
import {
  birdsScentingDog,
  birdsSpookedBy,
  flushCovey,
  RUNNER_MAX_ENERGY,
  RUNNER_NERVE_FACTOR,
  spawnBirds,
  updateBirdNerve,
  updateBirds,
  type Bird,
  type SpawnConfig,
} from '../src/game/birds';
import { dist } from '../src/game/math';

const CFG: SpawnConfig = {
  patches: [{ x: 20, y: 20, w: 200, h: 150 }],
  birdCount: 6,
  coveyMaxSize: 3,
  runnerChance: 0.4,
  nerveMinMs: 5000,
  nerveMaxMs: 9000,
};

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
  it('spawns exactly the configured number of birds', () => {
    expect(spawnBirds({ ...CFG, birdCount: 6 }, lcg(1))).toHaveLength(6);
    expect(spawnBirds({ ...CFG, birdCount: 7 }, lcg(2))).toHaveLength(7);
    expect(spawnBirds({ ...CFG, birdCount: 1 }, lcg(3))).toHaveLength(1);
  });

  it('groups birds into coveys bounded by config, clustered together', () => {
    const birds = spawnBirds({ ...CFG, birdCount: 9 }, lcg(4));
    const coveys = byCovey(birds);
    expect(coveys.size).toBeGreaterThan(1); // 9 birds can't fit in one covey of 3
    for (const members of coveys.values()) {
      expect(members.length).toBeLessThanOrEqual(CFG.coveyMaxSize);
      for (let i = 1; i < members.length; i++) {
        // jitter is ±10px per axis, so covey mates stay within ~29px
        expect(dist(members[0].pos, members[i].pos)).toBeLessThanOrEqual(30);
      }
    }
  });

  it('runnerChance 0 spawns no runners, 1 spawns all runners', () => {
    expect(spawnBirds({ ...CFG, birdCount: 10, runnerChance: 0 }, lcg(5)).every((b) => !b.runs)).toBe(true);
    expect(spawnBirds({ ...CFG, birdCount: 10, runnerChance: 1 }, lcg(5)).every((b) => b.runs)).toBe(true);
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
    nerveMs: 5000,
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

  it('respects custom world bounds while fleeing', () => {
    const bounds = { x: 0, y: 0, w: 1400, h: 800 };
    const b = bird({ pos: { x: 1390, y: 400 }, runs: true, runEnergy: RUNNER_MAX_ENERGY });
    for (let i = 0; i < 40; i++) updateBirds(50, [b], { x: 1370, y: 400 }, bounds);
    expect(b.pos.x).toBeLessThanOrEqual(1396); // clamped by the bigger world, not FIELD_BOUNDS
    expect(b.pos.x).toBeGreaterThan(480); // and definitely not the old field edge
  });
});

describe('birdsSpookedBy (sprinting hunter)', () => {
  it('flushes only hidden birds inside the radius', () => {
    const near = bird({ id: 1, pos: { x: 100, y: 100 } });
    const far = bird({ id: 2, pos: { x: 200, y: 100 } });
    const resolved = bird({ id: 3, pos: { x: 105, y: 100 }, state: 'downed' });
    const spooked = birdsSpookedBy([near, far, resolved], { x: 110, y: 100 }, 30);
    expect(spooked.map((b) => b.id)).toEqual([1]);
  });
});

describe('bird nerve', () => {
  it('assigns nerve from the configured range, runners discounted', () => {
    const birds = spawnBirds({ ...CFG, birdCount: 20 }, lcg(7));
    expect(birds.some((b) => b.runs)).toBe(true); // sample actually has runners
    for (const b of birds) {
      if (b.runs) {
        expect(b.nerveMs).toBeLessThanOrEqual(CFG.nerveMaxMs * RUNNER_NERVE_FACTOR + 1e-9);
      } else {
        expect(b.nerveMs).toBeGreaterThanOrEqual(CFG.nerveMinMs);
        expect(b.nerveMs).toBeLessThanOrEqual(CFG.nerveMaxMs);
      }
    }
  });

  it('drains only the pointed bird and reports it when nerve runs out', () => {
    const a = bird({ id: 1, nerveMs: 300 });
    const b = bird({ id: 2, nerveMs: 300 });
    expect(updateBirdNerve(100, [a, b], 1)).toBeNull();
    expect(a.nerveMs).toBe(200);
    expect(b.nerveMs).toBe(300); // unpointed bird is unbothered
    expect(updateBirdNerve(250, [a, b], 1)).toBe(a);
  });

  it('does nothing when nothing is pointed', () => {
    const a = bird({ id: 1, nerveMs: 100 });
    expect(updateBirdNerve(200, [a], null)).toBeNull();
    expect(a.nerveMs).toBe(100);
  });

  it('ignores a pointed bird that is no longer hidden', () => {
    const a = bird({ id: 1, nerveMs: 100, state: 'flushed' });
    expect(updateBirdNerve(200, [a], 1)).toBeNull();
  });

  it('drains faster under pressure and slower under a steady dog', () => {
    const pressured = bird({ id: 1, nerveMs: 1000 });
    const relaxed = bird({ id: 1, nerveMs: 1000 });
    updateBirdNerve(100, [pressured], 1, 1.4);
    updateBirdNerve(100, [relaxed], 1, 0.6);
    expect(pressured.nerveMs).toBeCloseTo(860);
    expect(relaxed.nerveMs).toBeCloseTo(940);
  });
});

describe('birds scenting the dog', () => {
  const windEast = 0; // wind blows toward +x

  it('flushes hidden birds downwind of the dog', () => {
    const dog = { x: 100, y: 100 };
    const downwindBird = bird({ id: 1, pos: { x: 125, y: 100 } }); // dog's scent blows right to it
    const upwindBird = bird({ id: 2, pos: { x: 75, y: 100 } });
    const scented = birdsScentingDog([downwindBird, upwindBird], dog, windEast, 30);
    expect(scented.map((b) => b.id)).toEqual([1]);
  });

  it('respects the detection radius', () => {
    const dog = { x: 100, y: 100 };
    const b = bird({ id: 1, pos: { x: 125, y: 100 } });
    expect(birdsScentingDog([b], dog, windEast, 20)).toEqual([]);
    expect(birdsScentingDog([b], dog, windEast, 30)).toEqual([b]);
  });

  it('does nothing when calm or disabled', () => {
    const dog = { x: 100, y: 100 };
    const b = bird({ id: 1, pos: { x: 110, y: 100 } });
    expect(birdsScentingDog([b], dog, undefined, 30)).toEqual([]);
    expect(birdsScentingDog([b], dog, windEast, 0)).toEqual([]);
  });

  it('ignores resolved birds', () => {
    const dog = { x: 100, y: 100 };
    const b = bird({ id: 1, pos: { x: 110, y: 100 }, state: 'escaped' });
    expect(birdsScentingDog([b], dog, windEast, 30)).toEqual([]);
  });
});
