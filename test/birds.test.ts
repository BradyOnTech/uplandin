import { describe, expect, it } from 'vitest';
import {
  birdsScentingDog,
  birdsSpookedBy,
  circleBack,
  flushCovey,
  relightSurvivors,
  RUNNER_MAX_ENERGY,
  RUNNER_NERVE_FACTOR,
  SINGLE_NERVE_MULT,
  spawnBirds,
  updateBirdNerve,
  updateBirds,
  type Bird,
  type SpawnConfig,
} from '../src/game/birds';
import { dist } from '../src/game/math';
import { getSpecies } from '../src/game/species';

const CFG: SpawnConfig = {
  patches: [{ x: 20, y: 20, w: 200, h: 150 }],
  birdCount: 12,
  speciesMix: [{ speciesId: 'bobwhite', weight: 1 }],
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

  it('groups birds into coveys sized by species, clustered together', () => {
    const bobwhite = getSpecies('bobwhite');
    const birds = spawnBirds({ ...CFG, birdCount: 24 }, lcg(4));
    const coveys = byCovey(birds);
    expect(coveys.size).toBeGreaterThan(1);
    for (const members of coveys.values()) {
      expect(members.length).toBeLessThanOrEqual(bobwhite.coveyMax);
      for (let i = 1; i < members.length; i++) {
        // jitter is ±10px per axis, so covey mates stay within ~29px
        expect(dist(members[0].pos, members[i].pos)).toBeLessThanOrEqual(30);
      }
    }
  });

  it('draws species from the weighted mix and tags every bird', () => {
    const birds = spawnBirds(
      {
        ...CFG,
        birdCount: 40,
        speciesMix: [
          { speciesId: 'sharptail', weight: 0.5 },
          { speciesId: 'hun', weight: 0.5 },
        ],
      },
      lcg(5),
    );
    const ids = new Set(birds.map((b) => b.speciesId));
    expect(ids.has('sharptail')).toBe(true);
    expect(ids.has('hun')).toBe(true);
    expect([...ids].every((id) => id === 'sharptail' || id === 'hun')).toBe(true);
    // covey members share a species
    for (const members of byCovey(birds).values()) {
      expect(new Set(members.map((b) => b.speciesId)).size).toBe(1);
    }
  });

  it('mix weights approximate bird share despite covey-size differences', () => {
    // 80% ringneck (pairs) / 20% hun (big coveys): without covey-size
    // normalization one hun covey eats half the stocking.
    const birds = spawnBirds(
      {
        ...CFG,
        birdCount: 200,
        speciesMix: [
          { speciesId: 'ringneck', weight: 0.8 },
          { speciesId: 'hun', weight: 0.2 },
        ],
      },
      lcg(11),
    );
    const ringnecks = birds.filter((b) => b.speciesId === 'ringneck').length / birds.length;
    expect(ringnecks).toBeGreaterThan(0.6);
    expect(ringnecks).toBeLessThan(0.95);
  });

  it('sexes henRule species roughly evenly and leaves others unsexed', () => {
    const ringnecks = spawnBirds(
      { ...CFG, birdCount: 60, speciesMix: [{ speciesId: 'ringneck', weight: 1 }] },
      lcg(6),
    );
    const hens = ringnecks.filter((b) => b.sex === 'hen').length;
    expect(hens).toBeGreaterThan(12);
    expect(hens).toBeLessThan(48);
    expect(ringnecks.every((b) => b.sex === 'hen' || b.sex === 'rooster')).toBe(true);

    const quail = spawnBirds({ ...CFG, birdCount: 10 }, lcg(7));
    expect(quail.every((b) => b.sex === undefined)).toBe(true);
  });

  it('young-of-year birds sit longer and mostly refuse to run', () => {
    const veterans = spawnBirds({ ...CFG, birdCount: 30, youngShare: 0 }, lcg(21));
    const juveniles = spawnBirds({ ...CFG, birdCount: 30, youngShare: 1 }, lcg(21));
    expect(veterans.every((b) => !b.young)).toBe(true);
    expect(juveniles.every((b) => b.young)).toBe(true);
    // Same rolls, so every juvenile holds exactly 1.3x its veteran twin.
    for (let i = 0; i < 30; i++) {
      if (veterans[i].runs === juveniles[i].runs) {
        expect(juveniles[i].nerveMs).toBeCloseTo(veterans[i].nerveMs * 1.3, 5);
      }
    }
  });

  it('wind strength shortens nerve via nerveMult', () => {
    const calm = spawnBirds({ ...CFG, birdCount: 10 }, lcg(8));
    const strong = spawnBirds({ ...CFG, birdCount: 10, nerveMult: 0.8 }, lcg(8));
    for (let i = 0; i < 10; i++) {
      expect(strong[i].nerveMs).toBeCloseTo(calm[i].nerveMs * 0.8, 5);
    }
  });

  it('runnerChance comes from the species', () => {
    const roosters = spawnBirds(
      { ...CFG, birdCount: 30, speciesMix: [{ speciesId: 'ringneck', weight: 1 }] },
      lcg(9),
    );
    const woodcock = spawnBirds(
      { ...CFG, birdCount: 10, speciesMix: [{ speciesId: 'woodcock', weight: 1 }] },
      lcg(10),
    );
    expect(roosters.some((b) => b.runs)).toBe(true); // 75% runners
    expect(woodcock.every((b) => !b.runs)).toBe(true); // 0% runners
  });

  it('keeps every covey outside configured safety zones', () => {
    const birds = spawnBirds({
      ...CFG,
      birdCount: 40,
      exclusionZones: [{ center: { x: 120, y: 95 }, radius: 80 }],
    }, lcg(14));
    expect(birds.every((bird) => dist(bird.pos, { x: 120, y: 95 }) >= 80)).toBe(true);
  });
});

function bird(over: Partial<Bird>): Bird {
  return {
    id: 1,
    coveyId: 0,
    speciesId: 'bobwhite',
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

describe('relightSurvivors (hunt the singles)', () => {
  const bounds = { x: 0, y: 0, w: 1200, h: 700 };

  it('keeps observed landings in their exact cover without a second disappearance roll', () => {
    const b = bird({ id: 1, state: 'escaped' });
    const flyingAway = bird({ id: 2, state: 'escaped' });
    const landing = { x: 774, y: 321 };
    const relit = relightSurvivors([b, flyingAway], [1, 2], bounds, () => .99, 1,
      [{ x: 750, y: 300, w: 80, h: 60 }], new Map([[1, landing]]));
    expect(relit).toEqual([b]);
    expect(b.pos).toEqual(landing);
    expect(b.pos).not.toBe(landing);
    expect(b.single).toBe(true);
    expect(flyingAway.state).toBe('escaped');
  });

  it('never invents a replacement landing for missing, invalid, open-ground or out-of-property contacts', () => {
    const birds = Array.from({ length: 5 }, (_, i) => bird({ id: i + 1, state: 'escaped' }));
    const landings = new Map([
      [1, { x: NaN, y: 320 }], [2, { x: 600, y: 350 }],
      [3, { x: 1201, y: 350 }], [4, { x: 760, y: Infinity }],
    ]);
    expect(relightSurvivors(birds, [1, 2, 3, 4, 5], bounds, () => 0, 1,
      [{ x: 750, y: 300, w: 80, h: 60 }], landings)).toEqual([]);
    expect(birds.every(b => b.state === 'escaped')).toBe(true);
  });

  it('relights survivors as tight-holding singles with real ground behind them', () => {
    const b = bird({ id: 1, pos: { x: 600, y: 350 }, state: 'escaped', runs: true });
    const mate = bird({ id: 2, pos: { x: 620, y: 350 }, state: 'escaped' });
    const relit = relightSurvivors([b, mate], [1, 2], bounds, () => 0.5);
    expect(relit).toEqual([b, mate]);
    expect(b.state).toBe('hidden');
    expect(b.single).toBe(true);
    expect(b.runs).toBe(false); // singles sit
    // The covey bond is broken: one single flushing must not lift the other.
    expect(b.coveyId).not.toBe(mate.coveyId);
    const species = getSpecies('bobwhite');
    expect(b.nerveMs).toBeGreaterThanOrEqual(species.nerveMinMs * SINGLE_NERVE_MULT);
    // Open country, no patches given: a long random put-down.
    const moved = dist(b.pos, { x: 600, y: 350 });
    expect(moved).toBeGreaterThanOrEqual(140);
    expect(moved).toBeLessThanOrEqual(420);
  });

  it('some survivors are simply gone — relighting is a chance, not a rule', () => {
    const b = bird({ id: 1, pos: { x: 600, y: 350 }, state: 'escaped' });
    expect(relightSurvivors([b], [1], bounds, () => 0.9)).toEqual([]); // 0.9 > RELIGHT_CHANCE
    expect(b.state).toBe('escaped');
    expect(b.single).toBeUndefined();
  });

  it('survivors make for the next cover patch when there is one in range', () => {
    const b = bird({ id: 1, pos: { x: 600, y: 350 }, state: 'escaped' });
    const patch = { x: 750, y: 300, w: 80, h: 60 }; // ~190px away — single-hunting distance
    const tooFar = { x: 60, y: 60, w: 80, h: 60 }; // way out of range
    const relit = relightSurvivors([b], [1], bounds, () => 0.5, 1, [patch, tooFar]);
    expect(relit).toHaveLength(1);
    // Landed inside the reachable patch — "they went to the next cover".
    expect(b.pos.x).toBeGreaterThanOrEqual(patch.x);
    expect(b.pos.x).toBeLessThanOrEqual(patch.x + patch.w);
    expect(b.pos.y).toBeGreaterThanOrEqual(patch.y);
    expect(b.pos.y).toBeLessThanOrEqual(patch.y + patch.h);
  });

  it('a single only relights once — the second escape is for good', () => {
    const b = bird({ id: 1, pos: { x: 600, y: 350 }, state: 'escaped', single: true });
    expect(relightSurvivors([b], [1], bounds, () => 0.5)).toEqual([]);
    expect(b.state).toBe('escaped');
  });

  it('ignores birds that are not escaped and stays in bounds', () => {
    const downed = bird({ id: 1, state: 'downed' });
    expect(relightSurvivors([downed], [1], bounds, () => 0.5)).toEqual([]);
    const corner = bird({ id: 2, pos: { x: 4, y: 4 }, state: 'escaped' });
    relightSurvivors([corner], [2], bounds, () => 0.001);
    expect(corner.pos.x).toBeGreaterThanOrEqual(bounds.x + 8);
    expect(corner.pos.y).toBeGreaterThanOrEqual(bounds.y + 8);
  });
});

describe('circleBack (the hun move)', () => {
  const bounds = { x: 0, y: 0, w: 1400, h: 800 };

  function hunCovey(): Bird[] {
    return [1, 2, 3].map((id) =>
      bird({ id, coveyId: 5, speciesId: 'hun', state: 'flushed', pos: { x: 700 + id * 5, y: 400 } }),
    );
  }

  it('a wild-flushed hun covey relands together, once', () => {
    const covey = hunCovey();
    const relanded = circleBack(covey, [1, 2, 3], bounds, () => 0.5);
    expect(relanded).toHaveLength(3);
    for (const b of covey) {
      expect(b.state).toBe('hidden');
      expect(b.circled).toBe(true);
      expect(b.coveyId).toBe(5); // still a covey — they land together
    }
    // They moved as a group, well away from the old spot.
    expect(dist(covey[0].pos, { x: 705, y: 400 })).toBeGreaterThan(100);
    expect(dist(covey[0].pos, covey[2].pos)).toBeLessThanOrEqual(35);
    // Second wild flush: gone for good.
    covey.forEach((b) => (b.state = 'flushed'));
    expect(circleBack(covey, [1, 2, 3], bounds, () => 0.5)).toEqual([]);
  });

  it('only huns do it', () => {
    const sharpies = hunCovey().map((b) => ({ ...b, speciesId: 'sharptail' }));
    expect(circleBack(sharpies, [1, 2, 3], bounds, () => 0.5)).toEqual([]);
    expect(sharpies[0].state).toBe('flushed');
  });

  it('a relit single does not drag the covey back', () => {
    const covey = hunCovey();
    covey[1].single = true;
    expect(circleBack(covey, [1, 2, 3], bounds, () => 0.5)).toEqual([]);
  });
});

describe('updateBirds (runners)', () => {
  it('uses world pace only for continuous ringnecks without slowing their energy clock', () => {
    const legacy = bird({ speciesId: 'ringneck', pos: { x: 100, y: 100 }, runs: true, runEnergy: RUNNER_MAX_ENERGY });
    const world = { ...legacy, pos: { ...legacy.pos } };
    updateBirds(1000, [legacy], { x: 99, y: 100 });
    updateBirds(1000, [world], { x: 99, y: 100 }, { worldScale: true });
    expect(legacy.pos.x - 100).toBeCloseTo(42);
    expect((world.pos.x - 100) * .9144).toBeCloseTo(4.8);
    expect(world.runEnergy).toBe(legacy.runEnergy);
    const bobwhite = bird({ speciesId: 'bobwhite', pos: { x: 100, y: 100 }, runs: true, runEnergy: RUNNER_MAX_ENERGY });
    updateBirds(1000, [bobwhite], { x: 99, y: 100 }, { worldScale: true });
    expect(bobwhite.pos.x - 100).toBeCloseTo(42);
  });

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

  it('fast-running species cover more ground (runSpeedMult)', () => {
    const bob = bird({ pos: { x: 300, y: 100 }, runs: true, runEnergy: RUNNER_MAX_ENERGY, speciesId: 'bobwhite' });
    const chukar = bird({ pos: { x: 300, y: 200 }, runs: true, runEnergy: RUNNER_MAX_ENERGY, speciesId: 'chukar' });
    // The dog stays on their tails so both run the whole second.
    for (let i = 0; i < 20; i++) {
      updateBirds(50, [bob], { x: bob.pos.x + 20, y: 100 });
      updateBirds(50, [chukar], { x: chukar.pos.x + 20, y: 200 });
    }
    const bobRan = 300 - bob.pos.x;
    const chukarRan = 300 - chukar.pos.x;
    expect(bobRan).toBeGreaterThan(30); // actually ran
    expect(chukarRan).toBeCloseTo(bobRan * 1.3, 3);
  });

  it('respects custom world bounds while fleeing', () => {
    const bounds = { x: 0, y: 0, w: 1400, h: 800 };
    const b = bird({ pos: { x: 1390, y: 400 }, runs: true, runEnergy: RUNNER_MAX_ENERGY });
    for (let i = 0; i < 40; i++) updateBirds(50, [b], { x: 1370, y: 400 }, { bounds });
    expect(b.pos.x).toBeLessThanOrEqual(1396); // clamped by the bigger world, not FIELD_BOUNDS
    expect(b.pos.x).toBeGreaterThan(480); // and definitely not the old field edge
  });

  it('slope bias: chukar runners on a hillside angle uphill', () => {
    // Uphill is north (-y). Dog approaches from the west; an unbiased bird
    // would run due east — a hillside bird angles north as it goes.
    const b = bird({ speciesId: 'chukar', pos: { x: 300, y: 200 }, runs: true, runEnergy: RUNNER_MAX_ENERGY });
    for (let i = 0; i < 20; i++) {
      updateBirds(50, [b], { x: b.pos.x - 20, y: 200 }, { slopeAngle: -Math.PI / 2 });
    }
    expect(b.pos.x).toBeGreaterThan(300); // still fleeing east
    expect(b.pos.y).toBeLessThan(180); // but climbing hard
  });

  it('blocking: a runner holds at the end of its cover instead of crossing open ground', () => {
    const patches = [{ x: 280, y: 180, w: 60, h: 40 }];
    const b = bird({ pos: { x: 330, y: 200 }, runs: true, runEnergy: RUNNER_MAX_ENERGY });
    for (let i = 0; i < 30; i++) {
      updateBirds(50, [b], { x: b.pos.x - 20, y: 200 }, { patches });
    }
    expect(b.pos.x).toBeLessThanOrEqual(340); // pinned at the patch edge
    expect(b.restingMs).toBeGreaterThan(0); // holding — the hunter's window
  });

  it.each([false, true])('a ringneck roads along a blocked cover edge while a bobwhite holds (world pace: %s)', worldScale => {
    const patches = [{ x: 280, y: 140, w: 60, h: 120 }];
    const rooster = bird({ speciesId: 'ringneck', pos: { x: 340, y: 200 }, runs: true, runEnergy: RUNNER_MAX_ENERGY });
    const bobwhite = bird({ speciesId: 'bobwhite', pos: { x: 340, y: 200 }, runs: true, runEnergy: RUNNER_MAX_ENERGY });
    const dog = { x: 320, y: 198 };
    updateBirds(100, [rooster, bobwhite], dog, { patches, worldScale });
    expect(rooster.pos.x).toBeLessThanOrEqual(340);
    expect(rooster.pos.y).toBeGreaterThan(200);
    expect(rooster.restingMs).toBe(0);
    expect(bobwhite.pos).toEqual({ x: 340, y: 200 });
    expect(bobwhite.restingMs).toBeGreaterThan(0);
  });

  it('does not jump an open gap just because the end of a long step lands in cover', () => {
    const patches = [{ x: 280, y: 190, w: 21, h: 20 }, { x: 310, y: 190, w: 40, h: 20 }];
    const b = bird({ speciesId: 'bobwhite', pos: { x: 300, y: 200 }, runs: true, runEnergy: RUNNER_MAX_ENERGY });
    updateBirds(400, [b], { x: 280, y: 200 }, { patches });
    expect(b.pos).toEqual({ x: 300, y: 200 });
    expect(b.restingMs).toBeGreaterThan(0);
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
  it('assigns nerve from the species range, runners discounted', () => {
    const species = getSpecies('ringneck');
    const birds = spawnBirds(
      { ...CFG, birdCount: 20, speciesMix: [{ speciesId: 'ringneck', weight: 1 }] },
      lcg(7),
    );
    expect(birds.some((b) => b.runs)).toBe(true); // sample actually has runners
    for (const b of birds) {
      if (b.runs) {
        expect(b.nerveMs).toBeLessThanOrEqual(species.nerveMaxMs * RUNNER_NERVE_FACTOR + 1e-9);
      } else {
        expect(b.nerveMs).toBeGreaterThanOrEqual(species.nerveMinMs);
        expect(b.nerveMs).toBeLessThanOrEqual(species.nerveMaxMs);
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
