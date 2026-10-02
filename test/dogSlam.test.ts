import { describe, expect, it } from 'vitest';
import { Dog, SLAM_SKID_MS, type DogEnv } from '../src/game/dog';
import { getBreed } from '../src/game/breeds';
import type { Bird } from '../src/game/birds';
import { PROPERTY_PX_TO_M as M } from '../src/game/worldUnits';

const DT = 1000 / 30;
const bird = (x: number, y: number): Bird => ({
  id: 7, coveyId: 7, speciesId: 'bobwhite', pos: { x, y }, state: 'hidden', runs: false, runEnergy: 0, restingMs: 0, nerveMs: 30000,
});

/** The live 3D field: wind-borne scent, the yard-mapped movement scale. */
function field(windAngle?: number, movementScale = .05) {
  const hunter = { x: 300, y: 300 };
  const env: DogEnv = { rangeRadius: 60 / M, movementScale, hunterPos: hunter, windAngle };
  const dog = new Dog({ x: 300, y: 300 }, { breed: getBreed('gsp'), level: 6 }, () => .5, { x: 0, y: 0, w: 2000, h: 2000 });
  let speed = 0, heading = 0;
  // Let the dog get out and running on its own search.
  for (let i = 0; i < 400 && (i < 45 || speed < 3.4); i++) {
    const before = { ...dog.pos };
    dog.update(DT, [], env);
    speed = Math.hypot(dog.pos.x - before.x, dog.pos.y - before.y) * M * 30;
    heading = Math.atan2(dog.pos.y - before.y, dog.pos.x - before.x);
  }
  return { dog, env, speed, heading };
}

describe('slamming into point', () => {
  it('stops a running dog dead on close scent: a short skid, no casting, then the point', () => {
    const { dog, env, speed, heading } = field();
    expect(speed).toBeGreaterThan(3.4);
    // Strong scent right in its path, inside even a lull's reach.
    const target = bird(dog.pos.x + Math.cos(heading) * 13, dog.pos.y + Math.sin(heading) * 13);
    const stages: string[] = [], track: { x: number; y: number }[] = [];
    const start = { ...dog.pos };
    for (let i = 0; i < 60 && dog.state !== 'pointing'; i++) {
      dog.update(DT, [target], env);
      if (stages.at(-1) !== dog.scentStage) stages.push(dog.scentStage);
      track.push({ ...dog.pos });
      if (i === 0) expect(dog.slamProgress()).toBeLessThan(.15);
    }
    // Straight from the run into the lock: no first-scent check or cone work.
    expect(stages).toEqual(['locking', 'none']);
    expect(dog.state).toBe('pointing');
    // Momentum carries it on along its line of travel, decelerating.
    const skid = Math.hypot(track.at(-1)!.x - start.x, track.at(-1)!.y - start.y) * M;
    expect(skid).toBeGreaterThan(.35);
    expect(skid).toBeLessThan(speed * SLAM_SKID_MS / 1000 / 2 + .05);
    const along = (p: { x: number; y: number }) => ((p.x - start.x) * Math.cos(heading) + (p.y - start.y) * Math.sin(heading)) * M;
    const steps = track.slice(0, 12).map((p, i) => along(p) - (i ? along(track[i - 1]) : 0));
    expect(steps[0]).toBeGreaterThan(steps[6]);
    // Stopped once the skid has run its course.
    expect(steps[11]).toBeCloseTo(0, 6);
    // Never onto the bird.
    for (const p of track) expect(Math.hypot(p.x - target.pos.x, p.y - target.pos.y)).toBeGreaterThan(11.5);
  });

  it('still works the cone when the scent first comes from further out', () => {
    const { dog, env, heading } = field();
    // The bird well up the wind: the dog winds it from far off.
    env.windAngle = heading + Math.PI;
    const target = bird(dog.pos.x + Math.cos(heading) * 24, dog.pos.y + Math.sin(heading) * 24);
    dog.update(DT, [target], env);
    expect(dog.scentStage).toBe('checking');
    expect(dog.slamProgress()).toBeNull();
  });

  it('lets a dog that is only trotting stop without a slam', () => {
    const { dog, env, heading } = field(undefined, .02);
    const target = bird(dog.pos.x + Math.cos(heading) * 13, dog.pos.y + Math.sin(heading) * 13);
    dog.update(DT, [target], env);
    expect(dog.scentStage).toBe('checking');
  });
});
