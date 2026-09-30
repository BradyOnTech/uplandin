import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import type { Bird } from '../src/game/birds';
import type { BreedConfig } from '../src/game/breeds';
import { Dog, MARK_SEARCH_MS, SEEK_COMMAND_MS, WHISTLE_RANGE, type DogEnv } from '../src/game/dog';
import { CRIPPLE_SPEED, HuntSimulation } from '../src/game/huntSimulation';
import { mulberry32, dist } from '../src/game/math';
import { createHunt, emptyDogWork, endFieldSession, huntComplete } from '../src/game/state';

const breed: BreedConfig = {
  id: 'test', name: 'Test', blurb: '',
  stats: { nose: 3, speed: 3, range: 3, steadiness: 1, stamina: 3 },
  motion: { runStride: 1, huntSurge: 0, surgeHz: .4, searchLooseness: .5, headFreedom: .5, tailAction: .5, verticalMotion: 1 },
  xpRate: 1,
};
const dogAt = (x: number, y: number, level = 10, rng = () => .5) => new Dog({ x, y }, { breed, level }, rng);
function bird(x: number, y: number, over: Partial<Bird> = {}): Bird {
  return { id: 1, coveyId: 1, speciesId: 'bobwhite', pos: { x, y }, state: 'hidden', runs: false, runEnergy: 0, restingMs: 0, nerveMs: 5000, ...over };
}
function run(dog: Dog, birds: Bird[], ms: number, env: DogEnv = {}, step = 50) {
  for (let t = 0; t < ms; t += step) dog.update(step, birds, env);
}

describe('whoa', () => {
  it('stops a hunting dog where it stands until it is released', () => {
    const dog = dogAt(200, 200);
    const env = { hunterPos: { x: 180, y: 200 } };
    run(dog, [], 500, env);
    expect(dog.command({ kind: 'whoa' }, [], env.hunterPos)).toBe('stopped');
    const stopped = { ...dog.pos };
    run(dog, [], 4000, env);
    expect(dog.state).toBe('whoa');
    expect(dist(dog.pos, stopped)).toBe(0);
    expect(dog.command({ kind: 'release' }, [], env.hunterPos)).toBe('released');
    run(dog, [], 1000, env);
    expect(dog.state).toBe('quartering');
    expect(dist(dog.pos, stopped)).toBeGreaterThan(5);
  });

  it('stops a breaking dog in its chase', () => {
    const dog = dogAt(200, 200, 1, () => 0);
    expect(dog.onFlush(() => 0, { x: 260, y: 200 })).toBe(true);
    expect(dog.state).toBe('breaking');
    expect(dog.command({ kind: 'whoa' }, [])).toBe('stopped');
    const at = { ...dog.pos };
    run(dog, [], 1000);
    expect(dist(dog.pos, at)).toBe(0);
  });

  it('steadies a pointing dog: no creeping, and it stands the flush far more often', () => {
    const creeping = () => 0; // every roll says creep and break
    const dog = dogAt(100, 100, 1, creeping);
    const target = bird(100 + 13, 100);
    run(dog, [target], 3000, { hunterPos: { x: 60, y: 100 } });
    expect(dog.state).toBe('pointing');
    expect(dog.command({ kind: 'whoa' }, [target], { x: 60, y: 100 })).toBe('steadied');
    const held = { ...dog.pos };
    run(dog, [target], 5000, { hunterPos: { x: 60, y: 100 } });
    expect(dist(dog.pos, held)).toBe(0);
    expect(dog.steadied).toBe(true);

    let brokeSteadied = 0, brokeLoose = 0;
    const rolls = mulberry32(7);
    for (let i = 0; i < 400; i++) {
      const a = dogAt(0, 0, 1); a.state = 'pointing'; a.steadied = true;
      const b = dogAt(0, 0, 1); b.state = 'pointing';
      if (a.onFlush(rolls, { x: 10, y: 0 })) brokeSteadied++;
      if (b.onFlush(rolls, { x: 10, y: 0 })) brokeLoose++;
    }
    expect(brokeSteadied).toBeLessThan(brokeLoose * .5);
  });

  it('carries no farther than the whistle', () => {
    const dog = dogAt(0, 0);
    expect(dog.command({ kind: 'whoa' }, [], { x: WHISTLE_RANGE + 10, y: 0 })).toBe('out-of-earshot');
    expect(dog.state).toBe('quartering');
    expect(dog.log.at(-1)).toMatchObject({ kind: 'command', response: 'out-of-earshot' });
  });

  it('never interrupts a retrieve', () => {
    const dog = dogAt(100, 100);
    const fall = bird(140, 100, { state: 'downed' });
    run(dog, [fall], 100, { hunterPos: { x: 90, y: 100 } });
    expect(dog.state).toBe('retrieving');
    expect(dog.command({ kind: 'whoa' }, [fall], { x: 90, y: 100 })).toBe('busy');
    expect(dog.state).toBe('retrieving');
  });
});

describe('release on point', () => {
  it('breaks the point and roads in on the bird to relocate it', () => {
    const dog = dogAt(100, 100);
    const target = bird(113, 100);
    const env = { hunterPos: { x: 60, y: 100 } };
    run(dog, [target], 3000, env);
    expect(dog.state).toBe('pointing');
    target.pos = { x: 150, y: 100 }; // the runner slipped ahead, still inside scent
    expect(dog.command({ kind: 'release' }, [target], env.hunterPos)).toBe('relocating');
    expect(dog.state).toBe('tracking');
    run(dog, [target], 8000, env);
    expect(dog.state).toBe('pointing');
    expect(dist(dog.pos, target.pos)).toBeLessThan(16);
    expect(dog.log.map(entry => entry.kind)).toContain('relocated');
  });
});

describe('cast this way', () => {
  it('drives the dog to the ground the handler points at and works it', () => {
    const dog = dogAt(200, 200);
    const hunter = { x: 200, y: 220 };
    const target = { x: 320, y: 120 };
    expect(dog.command({ kind: 'cast', target }, [], hunter)).toBe('cast');
    let closest = Infinity;
    for (let t = 0; t < 6000; t += 50) { dog.update(50, [], { hunterPos: hunter }); closest = Math.min(closest, dist(dog.pos, target)); }
    expect(closest).toBeLessThan(8);
    // It then hunts around the cast ground, not back at the handler.
    expect(dist(dog.pos, target)).toBeLessThan(dist(dog.pos, hunter));
    expect(dog.castTarget).not.toBeNull();
  });
  it('sends a dog at heel straight out', () => {
    const dog = dogAt(100, 100); dog.state = 'heel';
    expect(dog.command({ kind: 'cast', target: { x: 200, y: 100 } }, [], { x: 100, y: 100 })).toBe('cast');
    expect(dog.state).toBe('quartering');
  });
});

describe('falls the dog did not mark', () => {
  it('are left until the dog winds them, and dead bird sends it to find them', () => {
    const dog = dogAt(100, 100);
    const fall = bird(260, 100, { state: 'downed', marked: false, fallPos: { x: 260, y: 100 } });
    const env = { hunterPos: { x: 100, y: 110 }, rangeRadius: 20, workAnchor: { x: 100, y: 80 } };
    run(dog, [fall], 3000, env);
    expect(dog.state).not.toBe('retrieving');
    expect(dog.command({ kind: 'dead', target: { x: 255, y: 105 } }, [fall], env.hunterPos)).toBe('hunting-dead');
    run(dog, [fall], 12000, env);
    expect(['retrieving'].includes(dog.state) || fall.state === 'retrieved').toBe(true);
    expect(dog.log.map(entry => entry.kind)).toContain('dead-found');
  });

  it('give up after searching, leaving the bird lost to anything but scent', () => {
    const dog = dogAt(100, 100);
    const env = { hunterPos: { x: 100, y: 110 } };
    const far = bird(900, 900, { state: 'downed', marked: false });
    dog.command({ kind: 'dead', target: { x: 150, y: 100 } }, [far], env.hunterPos);
    run(dog, [far], SEEK_COMMAND_MS + 1000, env);
    expect(dog.state).not.toBe('seeking');
    expect(dog.log.map(entry => entry.kind)).toContain('dead-lost');
  });

  it('a marked runner: the dog goes to the mark, then follows its nose', () => {
    const dog = dogAt(100, 100);
    const runner = bird(160, 100, { state: 'downed', marked: true, fallPos: { x: 140, y: 100 } });
    run(dog, [runner], 20000, { hunterPos: { x: 90, y: 100 } });
    expect(['carried', 'retrieved']).toContain(runner.state);
  });

  it('a marked runner that is gone: the dog searches the mark, then gives up', () => {
    const dog = dogAt(100, 100);
    const gone = bird(600, 600, { state: 'downed', marked: true, fallPos: { x: 140, y: 100 } });
    run(dog, [gone], MARK_SEARCH_MS + 6000, { hunterPos: { x: 90, y: 100 } });
    expect(gone.lost).toBe(true);
    expect(dog.state).not.toBe('retrieving');
  });
});

describe('the shared simulation', () => {
  const area = getArea('quail-fields');
  it('delivers commands to every dog and records the dog report', () => {
    const hunt = createHunt(area, mulberry32(3));
    const dogs = [new Dog({ ...hunt.dogsPos[0] }, { breed, level: 6 }, mulberry32(9), area.world)];
    const sim = new HuntSimulation({ hunt, dogs, area, rng: mulberry32(1), continuousEncounter: true });
    const events = sim.update(50, { hunterPos: hunt.hunterPos, commands: [{ kind: 'whoa' }] });
    expect(events).toContainEqual({ type: 'command', kind: 'whoa', responses: ['stopped'] });
    expect(dogs[0].state).toBe('whoa');
    expect(hunt.dogWork[0].commands).toBe(1);
    sim.recordShotSafety('low'); sim.recordShotSafety('dog-in-line');
    expect(hunt.safety).toEqual({ lowShots: 1, dogInLine: 1 });
  });

  it('marks a fall a dog could see, not one that came down behind a chasing dog', () => {
    const hunt = createHunt(area, mulberry32(3));
    const dogs = [new Dog({ x: 400, y: 300 }, { breed, level: 6 }, mulberry32(9), area.world)];
    const sim = new HuntSimulation({ hunt, dogs, area, rng: mulberry32(1), continuousEncounter: true });
    const [seen, hidden] = hunt.birds;
    seen.state = 'flushed'; hidden.state = 'flushed';
    sim.resolveBird(seen.id, 'downed'); sim.recordFall(seen.id, { x: 420, y: 300 });
    expect(seen.marked).toBe(true);
    dogs[0].state = 'breaking';
    sim.resolveBird(hidden.id, 'downed'); sim.recordFall(hidden.id, { x: 410, y: 310 });
    expect(hidden.marked).toBe(false);
  });

  it('lets a wounded bird run, slower than a dog', () => {
    const hunt = createHunt(area, mulberry32(3));
    const dogs = [new Dog({ x: 400, y: 300 }, { breed, level: 6 }, mulberry32(9), area.world)];
    dogs[0].state = 'whoa';
    const sim = new HuntSimulation({ hunt, dogs, area, rng: mulberry32(1), continuousEncounter: true });
    const cripple = hunt.birds[0];
    cripple.state = 'flushed';
    sim.resolveBird(cripple.id, 'downed', undefined, { wounded: true });
    sim.recordFall(cripple.id, { x: 430, y: 300 });
    for (let i = 0; i < 20; i++) sim.update(50, { hunterPos: { x: 380, y: 300 } });
    const moved = dist(cripple.pos, cripple.fallPos!);
    expect(moved).toBeGreaterThan(CRIPPLE_SPEED * .8);
    expect(moved).toBeLessThanOrEqual(CRIPPLE_SPEED * 1.01);
    expect(cripple.pos.x).toBeGreaterThan(430); // away from the dog
  });

  it('ending the session with a bird down loses it and completes the hunt', () => {
    const hunt = createHunt(area, mulberry32(3));
    hunt.birds.forEach(b => { b.state = 'escaped'; });
    hunt.birds[0].state = 'downed';
    expect(endFieldSession(hunt)).toBe(false);
    expect(endFieldSession(hunt, { abandonDowned: true })).toBe(true);
    expect(hunt.lostBirds).toBe(1);
    expect(huntComplete(hunt)).toBe(true);
  });

  it('starts every dog with an empty report', () => {
    expect(emptyDogWork()).toMatchObject({ points: 0, breaks: 0, deadFinds: 0, unheard: 0 });
  });
});
