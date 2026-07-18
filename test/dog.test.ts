import { describe, expect, it } from 'vitest';
import type { Bird } from '../src/game/birds';
import { Dog, SCENT_RADIUS, scentRange, type DogEnv } from '../src/game/dog';
import { FIELD_BOUNDS } from '../src/game/field';

const rng = () => 0.5;

function birdAt(x: number, y: number): Bird {
  return { id: 1, coveyId: 1, pos: { x, y }, state: 'hidden' };
}

function run(dog: Dog, birds: Bird[], steps: number, env: DogEnv = {}, dtMs = 50): void {
  for (let i = 0; i < steps; i++) dog.update(dtMs, birds, env);
}

describe('Dog', () => {
  it('starts quartering', () => {
    const dog = new Dog({ x: 240, y: 135 }, rng);
    expect(dog.state).toBe('quartering');
  });

  it('stays inside the field while quartering', () => {
    const dog = new Dog({ x: 240, y: 135 }, rng);
    run(dog, [], 600); // 30 simulated seconds
    expect(dog.pos.x).toBeGreaterThanOrEqual(0);
    expect(dog.pos.x).toBeLessThanOrEqual(FIELD_BOUNDS.w);
    expect(dog.pos.y).toBeGreaterThanOrEqual(0);
    expect(dog.pos.y).toBeLessThanOrEqual(FIELD_BOUNDS.h);
  });

  it('tracks and points a bird it can smell', () => {
    const dog = new Dog({ x: 100, y: 100 }, rng);
    const bird = birdAt(100 + SCENT_RADIUS - 10, 100);
    run(dog, [bird], 400);
    expect(dog.state).toBe('pointing');
    expect(dog.pointedBirdId).toBe(bird.id);
  });

  it('holds the point until the bird is gone, then casts off', () => {
    const dog = new Dog({ x: 100, y: 100 }, rng);
    const bird = birdAt(120, 100);
    run(dog, [bird], 400);
    expect(dog.state).toBe('pointing');
    bird.state = 'flushed';
    run(dog, [bird], 10);
    expect(dog.state).toBe('quartering');
  });

  it('ignores birds beyond scent range', () => {
    const dog = new Dog({ x: 40, y: 40 }, rng);
    const bird = birdAt(400, 220);
    run(dog, [bird], 100);
    expect(dog.state).toBe('quartering');
  });

  it('retrieves a downed bird, then casts off', () => {
    const dog = new Dog({ x: 100, y: 100 }, rng);
    const bird: Bird = { id: 7, coveyId: 0, pos: { x: 160, y: 100 }, state: 'downed' };
    run(dog, [bird], 400);
    expect(bird.state).toBe('retrieved');
    expect(dog.state).toBe('quartering');
  });

  it('fetches a downed bird before working fresh scent', () => {
    const dog = new Dog({ x: 100, y: 100 }, rng);
    const downedBird: Bird = { id: 7, coveyId: 0, pos: { x: 160, y: 100 }, state: 'downed' };
    const hiddenBird: Bird = { id: 8, coveyId: 1, pos: { x: 120, y: 100 }, state: 'hidden' };
    run(dog, [downedBird, hiddenBird], 40); // reach + fetch the downed bird
    expect(downedBird.state).toBe('retrieved');
    expect(hiddenBird.state).toBe('hidden'); // untouched while retrieving
  });

  it('won’t point a bird sitting right on the hunter', () => {
    const dog = new Dog({ x: 100, y: 100 }, rng);
    const bird = birdAt(120, 100); // within the dog’s scent range
    const hunter = { x: 118, y: 100 }; // but right next to the hunter
    run(dog, [bird], 100, { hunterPos: hunter });
    expect(dog.state).toBe('quartering');
    // and points it once the hunter moves away
    for (let i = 0; i < 400 && dog.state !== 'pointing'; i++) dog.update(50, [bird]);
    expect(dog.state).toBe('pointing');
  });

  describe('wind and scent', () => {
    it('reaches much farther upwind than downwind', () => {
      // bird 60px to the east of the dog; wind blowing east (+x)
      expect(scentRange(Math.PI, 60, 0)).toBeGreaterThan(60); // wind carries scent to the dog
      expect(scentRange(0, 60, 0)).toBeLessThan(20); // wind blows scent away
      expect(scentRange(0, 0, 50)).toBeCloseTo(SCENT_RADIUS * 1.125, 3); // crosswind
      expect(scentRange(undefined, 60, 0)).toBe(SCENT_RADIUS); // calm day: plain circle
    });

    it('points an upwind bird it could never smell on a calm day', () => {
      const dog = new Dog({ x: 100, y: 100 }, rng);
      const bird = birdAt(160, 100); // 60px — beyond base scent range
      run(dog, [bird], 400, { windAngle: Math.PI });
      expect(dog.state).toBe('pointing');
    });
  });
});
