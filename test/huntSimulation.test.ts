import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import type { Bird } from '../src/game/birds';
import { getBreed } from '../src/game/breeds';
import { Dog } from '../src/game/dog';
import { HuntSimulation } from '../src/game/huntSimulation';
import { mulberry32 } from '../src/game/math';
import { createHunt } from '../src/game/state';

function pointedSimulation(hunterDistance: number) {
  const area = getArea('quail-fields');
  const hunt = createHunt(area, mulberry32(11), { wind: 'calm', condition: 'mild' });
  const bird: Bird = {
    id: 9001,
    coveyId: 77,
    speciesId: 'bobwhite',
    pos: { x: 300, y: 300 },
    state: 'hidden',
    runs: false,
    runEnergy: 2500,
    restingMs: 0,
    nerveMs: 10000,
  };
  hunt.birds = [bird];
  hunt.hunterPos = { x: bird.pos.x - hunterDistance, y: bird.pos.y };
  const dog = new Dog(
    { x: bird.pos.x - 12, y: bird.pos.y },
    { breed: getBreed('english-setter'), level: 8 },
    mulberry32(12),
    area.world,
  );
  dog.state = 'pointing';
  dog.gait = 'still';
  dog.pointedBirdId = bird.id;
  const simulation = new HuntSimulation({ hunt, dogs: [dog], area, rng: mulberry32(13) });
  return { bird, dog, hunt, simulation };
}

describe('HuntSimulation shared orchestration', () => {
  it('owns proximity flush, point credit, and dog steadiness for both adapters', () => {
    const { bird, hunt, simulation } = pointedSimulation(10);
    const events = simulation.update(1000 / 30, { hunterPos: { ...hunt.hunterPos } });
    const flush = events.find((event) => event.type === 'covey-flushed');

    expect(flush).toMatchObject({
      type: 'covey-flushed',
      cause: 'proximity',
      birdId: bird.id,
      pointCredit: true,
      pointingSlot: 0,
    });
    expect(bird.state).toBe('flushed');
    expect(hunt.dogWork[0].pointFlushes).toBe(1);
  });

  it('keeps a distant pointed covey hidden and resolves shot outcomes centrally', () => {
    const { bird, hunt, simulation } = pointedSimulation(30);
    expect(simulation.update(1000 / 30, { hunterPos: { ...hunt.hunterPos } })).not.toContainEqual(
      expect.objectContaining({ type: 'covey-flushed' }),
    );
    expect(bird.state).toBe('hidden');

    const flush = simulation.flushBird(bird.id, 'nerve', 0);
    expect(flush).not.toBeNull();
    expect(simulation.resolveBird(bird.id, 'downed')).toBe(true);
    expect(bird.state).toBe('downed');
    expect(hunt.downed).toBe(1);
  });

  it('finalizes doubles and downed-over-point credit once per rise', () => {
    const { bird, hunt, simulation } = pointedSimulation(10);
    hunt.birds.push(
      { ...bird, id: 9002, pos: { x: 302, y: 300 } },
      { ...bird, id: 9003, pos: { x: 298, y: 301 } },
    );
    const events = simulation.update(1000 / 30, { hunterPos: { ...hunt.hunterPos } });
    const flush = events.find((event) => event.type === 'covey-flushed');
    expect(flush?.type === 'covey-flushed' ? flush.birdIds : []).toHaveLength(3);

    expect(simulation.resolveBird(9001, 'downed')).toBe(true);
    expect(simulation.resolveBird(9002, 'downed')).toBe(true);
    expect(simulation.resolveBird(9003, 'escaped')).toBe(true);
    const resolution = simulation.finishRise({ relight: false });

    expect(resolution).toMatchObject({
      downedIds: [9001, 9002],
      escapedIds: [9003],
      double: true,
      pointingSlot: 0,
    });
    expect(hunt.doubles).toBe(1);
    expect(hunt.dogWork[0].downedOverPoint).toBe(2);
    expect(simulation.finishRise()).toBeNull();
  });
});
