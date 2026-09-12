import { describe, expect, it } from 'vitest';
import type { Bird } from '../src/game/birds';
import { getBreed } from '../src/game/breeds';
import { Dog, type DogEnv } from '../src/game/dog';
import { mulberry32 } from '../src/game/math';
import { PROPERTY_PX_TO_M } from '../src/game/worldUnits';
import { liveMovementScaleForDog } from '../src/three/subsystems/hunt3d';

const DT_MS = 1000 / 30;

/** Ordinary Setter profile and 3D working distances, without bird/terrain side effects. */
function searchFixture() {
  const hunter = { x: 200, y: 200 };
  const anchor = { x: hunter.x + 14 / PROPERTY_PX_TO_M, y: hunter.y };
  const dog = new Dog(
    { x: hunter.x + 5 / PROPERTY_PX_TO_M, y: hunter.y - 2 / PROPERTY_PX_TO_M },
    { breed: getBreed('english-setter'), level: 8 },
    mulberry32(0xd0663d),
    { x: 0, y: 0, w: 1400, h: 800 },
  );
  const env: DogEnv = {
    hunterPos: hunter,
    workAnchor: anchor,
    rangeRadius: 22 / PROPERTY_PX_TO_M,
    recallArriveRange: 1.5 / PROPERTY_PX_TO_M,
    heelFollowRange: 2 / PROPERTY_PX_TO_M,
    pickupRange: .65 / PROPERTY_PX_TO_M,
    deliveryRange: 1 / PROPERTY_PX_TO_M,
    deliveryHoldMs: 900,
    whistleRange: Infinity,
    huntAreaId: 'pheasant-coverts',
    huntStyle: 'pheasant',
    patches: [{ x: 175, y: 160, w: 480, h: 100 }],
  };
  let time = 0;
  function tick(birds: Bird[] = [], advanceM = 0, recall = false): void {
    hunter.x += advanceM / PROPERTY_PX_TO_M;
    anchor.x = hunter.x + 14 / PROPERTY_PX_TO_M;
    time += DT_MS / 1000;
    env.movementScale = liveMovementScaleForDog(
      dog.gait, dog.state, dog.profile.breed.motion,
      time * Math.PI * 2 * dog.profile.breed.motion.surgeHz,
    );
    dog.update(DT_MS, birds, { ...env, recall });
  }
  function until(condition: () => boolean, birds: Bird[] = [], seconds = 300): void {
    for (let frame = 0; frame < seconds * 30 && !condition(); frame++) tick(birds);
    expect(condition(), 'Expected state was not reached within the bounded search').toBe(true);
  }
  return { dog, hunter, env, tick, until };
}

function ringneckAt(x: number, y: number, state: Bird['state'] = 'hidden'): Bird {
  return {
    id: 42, coveyId: 42, speciesId: 'ringneck', pos: { x, y }, state,
    runs: false, runEnergy: 0, restingMs: 0, nerveMs: 9000,
  };
}

describe('independent Setter search lifecycle review', () => {
  it.each([.1, .3])('keeps working during continuous slow handler progress at %s m/s', (speed) => {
    const field = searchFixture();
    for (let frame = 0; frame < 240 * 30; frame++) {
      field.tick([], speed / 30);
      expect(field.dog.state).toBe('quartering');
    }
  });

  it('lets a normal scent interrupt automatic waiting without moving the handler', () => {
    const field = searchFixture();
    field.until(() => field.dog.state === 'heel');
    // Outside hunter exclusion but within the Setter's ordinary calm scent reach.
    const bird = ringneckAt(field.hunter.x + 40, field.hunter.y);
    field.tick([bird]);
    expect(field.dog.state).toBe('tracking');
    expect(field.dog.scentStage).toBe('checking');
    field.until(() => field.dog.state === 'pointing', [bird], 45);
    expect(field.dog.pointedBirdId).toBe(bird.id);
  });

  it('waits for an airborne fall to land, then recovers it from automatic heel', () => {
    const field = searchFixture();
    field.until(() => field.dog.state === 'heel');
    const fall = ringneckAt(field.hunter.x + 7, field.hunter.y, 'downed');
    fall.fallPending = true;
    for (let frame = 0; frame < 3 * 30; frame++) field.tick([fall]);
    expect(field.dog.state).toBe('heel');
    expect(field.dog.reservedRetrieveId()).toBeNull();
    fall.fallPending = false;
    field.tick([fall]);
    expect(field.dog.state).toBe('retrieving');
    expect(field.dog.reservedRetrieveId()).toBe(fall.id);
    field.until(() => fall.state === 'retrieved', [fall], 45);
    expect(field.dog.carryingBirdId).toBeNull();
  });

  it('respects a deliberate whistle during automatic return after the handler moves on', () => {
    const field = searchFixture();
    field.until(() => field.dog.state === 'recalled');
    field.tick([], 0, true);
    field.until(() => field.dog.state === 'heel');
    for (let frame = 0; frame < 30 * 30; frame++) {
      field.tick([], 1 / 30);
      expect(field.dog.state).toBe('heel');
    }
  });

  it('marks a natural rise from automatic heel and resumes recovery after the fall lands', () => {
    const field = searchFixture();
    field.until(() => field.dog.state === 'heel');
    const bird = ringneckAt(field.hunter.x + 40, field.hunter.y, 'flushed');
    expect(field.dog.onFlush(() => .999, bird.pos, [bird.id])).toBe(false);
    expect(field.dog.state).toBe('marking');
    expect(field.dog.watchedBirdIds()).toContain(bird.id);
    bird.state = 'downed';
    bird.fallPending = true;
    field.tick([bird]);
    expect(field.dog.state).toBe('marking');
    expect(field.dog.reservedRetrieveId()).toBeNull();
    bird.fallPending = false;
    field.tick([bird]);
    expect(field.dog.state).toBe('retrieving');
    expect(field.dog.reservedRetrieveId()).toBe(bird.id);
  });

  it('chooses the same search and return path with concealed birds outside scent range', () => {
    const empty = searchFixture();
    const distant = searchFixture();
    const hidden = ringneckAt(1100, 600);
    for (let frame = 0; frame < 180 * 30; frame++) {
      empty.tick();
      distant.tick([hidden]);
      expect(distant.dog.pos).toEqual(empty.dog.pos);
      expect(distant.dog.state).toBe(empty.dog.state);
      expect(distant.dog.scentStage).toBe('none');
    }
    expect(hidden.state).toBe('hidden');
  });
});
