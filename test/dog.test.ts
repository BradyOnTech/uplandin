import { describe, expect, it } from 'vitest';
import type { Bird } from '../src/game/birds';
import { getBreed, type BreedConfig } from '../src/game/breeds';
import { Dog, SCENT_RADIUS, scentRange, type DogEnv } from '../src/game/dog';
import { FIELD_BOUNDS } from '../src/game/field';
import { dist } from '../src/game/math';
import type { RNG } from '../src/game/types';

/** Average-everything breed at high level: reproduces the pre-breed base behavior. */
const testBreed: BreedConfig = {
  id: 'test',
  name: 'Test',
  blurb: '',
  stats: { nose: 2, speed: 2, range: 2, steadiness: 2, stamina: 2 },
  xpRate: 1,
};

function makeDog(x: number, y: number, level = 10, rng: RNG = () => 0.5, breed = testBreed): Dog {
  return new Dog({ x, y }, { breed, level }, rng);
}

/** Deterministic value queue (constructor heading roll consumes the first). */
function seq(values: number[]): RNG {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const rng = () => 0.5;

function birdAt(x: number, y: number, over: Partial<Bird> = {}): Bird {
  return {
    id: 1,
    coveyId: 1,
    pos: { x, y },
    state: 'hidden',
    runs: false,
    runEnergy: 0,
    restingMs: 0,
    nerveMs: 5000,
    ...over,
  };
}

function run(dog: Dog, birds: Bird[], steps: number, env: DogEnv = {}, dtMs = 50): void {
  for (let i = 0; i < steps; i++) dog.update(dtMs, birds, env);
}

describe('Dog', () => {
  it('starts quartering', () => {
    expect(makeDog(240, 135).state).toBe('quartering');
  });

  it('stays inside the field while quartering', () => {
    const dog = makeDog(240, 135);
    run(dog, [], 600); // 30 simulated seconds
    expect(dog.pos.x).toBeGreaterThanOrEqual(0);
    expect(dog.pos.x).toBeLessThanOrEqual(FIELD_BOUNDS.w);
    expect(dog.pos.y).toBeGreaterThanOrEqual(0);
    expect(dog.pos.y).toBeLessThanOrEqual(FIELD_BOUNDS.h);
  });

  it('tracks and points a bird it can smell', () => {
    const dog = makeDog(100, 100);
    const bird = birdAt(100 + SCENT_RADIUS - 10, 100);
    run(dog, [bird], 400);
    expect(dog.state).toBe('pointing');
    expect(dog.pointedBirdId).toBe(bird.id);
  });

  it('holds the point until the bird is gone, then casts off', () => {
    const dog = makeDog(100, 100);
    const bird = birdAt(120, 100);
    run(dog, [bird], 400);
    expect(dog.state).toBe('pointing');
    bird.state = 'flushed';
    run(dog, [bird], 10);
    expect(dog.state).toBe('quartering');
  });

  it('ignores birds beyond scent range', () => {
    const dog = makeDog(40, 40);
    const bird = birdAt(400, 220);
    run(dog, [bird], 100);
    expect(dog.state).toBe('quartering');
  });

  it('retrieves a downed bird, then casts off', () => {
    const dog = makeDog(100, 100);
    const bird = birdAt(160, 100, { id: 7, coveyId: 0, state: 'downed' });
    run(dog, [bird], 400);
    expect(bird.state).toBe('retrieved');
    expect(dog.state).toBe('quartering');
  });

  it('fetches a downed bird before working fresh scent', () => {
    const dog = makeDog(100, 100);
    const downedBird = birdAt(160, 100, { id: 7, coveyId: 0, state: 'downed' });
    const hiddenBird = birdAt(120, 100, { id: 8, coveyId: 1 });
    run(dog, [downedBird, hiddenBird], 40); // reach + fetch the downed bird
    expect(downedBird.state).toBe('retrieved');
    expect(hiddenBird.state).toBe('hidden'); // untouched while retrieving
  });

  it('roads a pointed bird that bolts: breaks back to tracking', () => {
    const dog = makeDog(100, 100);
    const bird = birdAt(108, 100);
    run(dog, [bird], 400);
    expect(dog.state).toBe('pointing');
    bird.pos = { x: 140, y: 100 }; // bird makes a run for it
    run(dog, [bird], 1);
    expect(dog.state).toBe('tracking');
  });

  it('won’t point a bird sitting right on the hunter', () => {
    const dog = makeDog(100, 100);
    const bird = birdAt(120, 100); // within the dog’s scent range
    const hunter = { x: 118, y: 100 }; // but right next to the hunter
    run(dog, [bird], 100, { hunterPos: hunter });
    expect(dog.state).toBe('quartering');
    // and points it once the hunter moves away
    for (let i = 0; i < 400 && dog.state !== 'pointing'; i++) dog.update(50, [bird]);
    expect(dog.state).toBe('pointing');
  });

  describe('whistle recall', () => {
    it('comes back to the hunter and waits at heel until cast off', () => {
      const dog = makeDog(60, 60);
      const hunter = { x: 300, y: 60 };
      dog.update(50, [], { hunterPos: hunter, recall: true });
      expect(dog.state).toBe('recalled');
      for (let i = 0; i < 300 && dog.state === 'recalled'; i++) dog.update(50, [], { hunterPos: hunter });
      expect(dog.state).toBe('heel');
      expect(dist(dog.pos, hunter)).toBeLessThanOrEqual(12);
      dog.castOff();
      expect(dog.state).toBe('quartering');
    });

    it('ignores birds on the way back', () => {
      const dog = makeDog(60, 60);
      const hunter = { x: 300, y: 60 };
      const bird = birdAt(150, 60); // right on the path home
      dog.update(50, [bird], { hunterPos: hunter, recall: true });
      const seen = new Set<string>();
      for (let i = 0; i < 300 && dog.state === 'recalled'; i++) {
        dog.update(50, [bird], { hunterPos: hunter });
        seen.add(dog.state);
      }
      expect(seen.has('tracking')).toBe(false);
      expect(seen.has('pointing')).toBe(false);
    });

    it('never breaks a point', () => {
      const dog = makeDog(100, 100);
      const bird = birdAt(108, 100);
      run(dog, [bird], 400);
      expect(dog.state).toBe('pointing');
      dog.update(50, [bird], { hunterPos: { x: 300, y: 300 }, recall: true });
      expect(dog.state).toBe('pointing');
    });

    it('never interrupts a retrieve', () => {
      const dog = makeDog(100, 100);
      const bird = birdAt(160, 100, { id: 7, coveyId: 0, state: 'downed' });
      run(dog, [bird], 5);
      expect(dog.state).toBe('retrieving');
      dog.update(50, [bird], { hunterPos: { x: 300, y: 300 }, recall: true });
      expect(dog.state).toBe('retrieving');
    });
  });

  describe('wind and scent', () => {
    it('reaches much farther upwind than downwind', () => {
      // bird 60px to the east of the dog; wind blowing east (+x)
      expect(scentRange(Math.PI, 60, 0)).toBeGreaterThan(60); // wind carries scent to the dog
      expect(scentRange(0, 60, 0)).toBeLessThan(20); // wind blows scent away
      expect(scentRange(0, 0, 50)).toBeCloseTo(SCENT_RADIUS * 1.125, 3); // crosswind
      expect(scentRange(undefined, 60, 0)).toBe(SCENT_RADIUS); // calm day: plain circle
    });

    it('points an upwind bird a veteran could never smell on a calm day', () => {
      const dog = makeDog(100, 100);
      const bird = birdAt(160, 100); // 60px — beyond base scent range
      run(dog, [bird], 400, { windAngle: Math.PI });
      expect(dog.state).toBe('pointing');
    });
  });

  describe('puppy creep and bump', () => {
    it('a soft young dog creeps on point and can bump the bird', () => {
      const irish = getBreed('irish-setter');
      // heading roll, then creep roll (0.1 < chance), then steps roll (0.9 → 3 steps)
      const dog = makeDog(100, 100, 1, seq([0.5, 0.1, 0.9]), irish);
      const bird = birdAt(108, 100);
      run(dog, [bird], 60);
      expect(dog.bumpedBirdId).toBe(bird.id);
    });

    it('a steady veteran stands still', () => {
      const gsp = getBreed('gsp');
      const dog = makeDog(100, 100, 10, seq([0.5, 0.1, 0.9]), gsp);
      const bird = birdAt(108, 100);
      run(dog, [bird], 60);
      expect(dog.bumpedBirdId).toBeNull();
      expect(dog.state).toBe('pointing');
    });
  });

  describe('wind craft', () => {
    it('a level-1 dog gets no upwind bonus', () => {
      const dog = makeDog(100, 100, 1); // tier 0: base nose only
      const bird = birdAt(160, 100); // 60px — upwind-rangeable for a veteran, not a pup
      run(dog, [bird], 60, { windAngle: Math.PI });
      expect(dog.state).toBe('quartering');
    });
  });

  describe('fatigue', () => {
    it('drains stamina while working and goes winded', () => {
      const dog = makeDog(240, 135, 1); // 60s pool at level 1
      run(dog, [], 1300); // 65s of quartering
      expect(dog.winded).toBe(true);
    });

    it('recovers at heel', () => {
      const dog = makeDog(240, 135, 1);
      run(dog, [], 1300);
      expect(dog.winded).toBe(true);
      const hunter = { ...dog.pos };
      dog.update(50, [], { hunterPos: hunter, recall: true }); // recalled, already home
      expect(dog.state).toBe('heel');
      run(dog, [], 40, { hunterPos: hunter }); // 2s at heel = 6s of recovery
      expect(dog.staminaMs).toBeGreaterThan(0);
      expect(dog.winded).toBe(false);
    });
  });

  describe('breaking and marking', () => {
    it('breaks chase on a forced roll and bumps birds it passes', () => {
      const dog = makeDog(100, 100);
      const flushedBird = birdAt(140, 100, { id: 1, state: 'flushed' });
      const bystander = birdAt(150, 100, { id: 2, coveyId: 2 });
      const broke = dog.onFlush(() => 0, flushedBird.pos); // 0 beats any chance
      expect(broke).toBe(true);
      expect(dog.state).toBe('breaking');
      run(dog, [flushedBird, bystander], 10);
      expect(dog.bumpedBirdId).toBe(2);
      run(dog, [flushedBird, bystander], 60);
      expect(dog.state).toBe('quartering');
      expect(dog.needsSearch).toBe(true);
    });

    it('stands steady on a failed roll', () => {
      const dog = makeDog(100, 100);
      const broke = dog.onFlush(() => 0.999, { x: 140, y: 100 });
      expect(broke).toBe(false);
      expect(dog.state).toBe('quartering');
      expect(dog.needsSearch).toBe(false);
    });

    it('searches longer for a fall it did not mark', () => {
      const dog = makeDog(100, 100);
      dog.needsSearch = true;
      const bird = birdAt(120, 100, { state: 'downed' });
      run(dog, [bird], 8); // travel to the fall
      expect(dog.state).toBe('retrieving');
      run(dog, [bird], 14); // 700ms of hold — a marked bird would be done
      expect(bird.state).toBe('downed');
      run(dog, [bird], 50); // +2500ms — the search completes
      expect(bird.state).toBe('retrieved');
      expect(dog.needsSearch).toBe(false);
    });
  });

  it('exposes breed pressure for the nerve system', () => {
    const gsp = getBreed('gsp');
    const dog = makeDog(0, 0, 1, () => 0.5, gsp);
    expect(dog.pressure).toBeCloseTo(1.35, 2);
  });
});
