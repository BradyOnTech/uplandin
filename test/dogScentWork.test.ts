import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { createHunt } from '../src/game/state';
import { Dog } from '../src/game/dog';
import { getBreed } from '../src/game/breeds';
import { HuntSimulation } from '../src/game/huntSimulation';
import { mulberry32 } from '../src/game/math';
import { liveMovementScaleForDog } from '../src/three/subsystems/hunt3d';
import { PROPERTY_PX_TO_M as M } from '../src/game/landscape';

const DT = 1000 / 30;
const properties = [
  ['quail-fields', 'bobwhite'], ['chukar-ridge', 'chukar'],
  ['sharptail-prairie', 'sharptail'], ['pheasant-coverts', 'ringneck'],
] as const;

/** Controlled scent diagnosis, not a natural encounter. The actual shared
 * simulation supplies wind, weather, handler constraints and field rules;
 * the movement adapter uses the same gait-dependent scale as live Three. */
function fixture(areaId = 'quail-fields', speciesId = 'bobwhite', breedId = 'gsp', level = 5, birdX = 380) {
  const area = getArea(areaId), breed = getBreed(breedId);
  const hunt = createHunt(area, mulberry32(1), { wind: 'breezy', condition: 'mild' });
  const bird = { ...hunt.birds[0], id: 9001, coveyId: 9001, speciesId,
    pos: { x: birdX, y: 300 }, runs: false, nerveMs: 30000, state: 'hidden' as const };
  hunt.birds = [bird]; hunt.wind = Math.PI; hunt.hunterPos = { x: 288, y: 300 };
  const dog = new Dog({ x: 300, y: 300 }, { breed, level }, mulberry32(2), area.world);
  dog.heading = 0;
  const sim = new HuntSimulation({ area, hunt, dogs: [dog], rng: mulberry32(3), continuousEncounter: true });
  const rows: { stage: string; state: string; gait: string; x: number; y: number; speed: number; distance: number }[] = [];
  const tick = (follow = true) => {
    const hunter = { ...hunt.hunterPos }, dx = dog.pos.x - hunter.x, dy = dog.pos.y - hunter.y, d = Math.hypot(dx, dy);
    if (follow && d > 12) { hunter.x += dx / d * 2.2 / M / 30; hunter.y += dy / d * 2.2 / M / 30; }
    const before = { ...dog.pos };
    const events = sim.update(DT, { hunterPos: hunter, dogMotion: [{
      movementScale: liveMovementScaleForDog(dog.gait, dog.state, breed.motion, 0),
      effortScale: .05, rangeRadius: 22 / M,
    }] });
    rows.push({ state: dog.state, stage: dog.scentStage, gait: dog.gait, x: dog.pos.x, y: dog.pos.y,
      speed: Math.hypot(dog.pos.x - before.x, dog.pos.y - before.y) * M * 30,
      distance: Math.hypot(dog.pos.x - bird.pos.x, dog.pos.y - bird.pos.y) * M });
    return events;
  };
  return { dog, bird, hunt, tick, rows };
}

describe('continuous-field scent work', () => {
  it.each(properties.flatMap(([area, species]) => ['gsp', 'english-setter'].map(breed => [area, species, breed] as const)))(
    'actively locates distant %s scent with a %s/%s before a brief close stalk', (area, species, breed) => {
      const f = fixture(area, species, breed);
      let pointEvents = 0;
      for (let i = 0; i < 30 * 40 && f.dog.state !== 'pointing'; i++) pointEvents += f.tick().filter(e => e.type === 'dog-pointed').length;
      expect(f.dog.state).toBe('pointing');
      expect(pointEvents).toBe(1);
      const far = f.rows.filter(r => r.stage === 'locating' && r.distance > 30);
      expect(far.length).toBeGreaterThan(60);
      expect(far.reduce((sum, r) => sum + r.speed, 0) / far.length).toBeGreaterThan(3.2);
      expect((Math.max(...far.map(r => r.y)) - Math.min(...far.map(r => r.y))) * M).toBeGreaterThan(1.5);
      const stalk = f.rows.filter(r => r.stage === 'stalking');
      expect(stalk.length).toBeGreaterThan(0);
      expect(stalk.length / 30).toBeLessThan(4);
      expect(stalk[0].distance).toBeLessThan(18);
      expect(f.rows.at(-1)!.distance).toBeCloseTo(13.5 * M, 4);
      expect(f.rows.slice(-4).every(r => r.speed === 0)).toBe(true);
    },
  );

  it('reopens locating when a runner leaves the close stalk, then establishes the relocated point', () => {
    const f = fixture('pheasant-coverts', 'ringneck', 'gsp', 5, 330);
    for (let i = 0; i < 600 && f.dog.scentStage !== 'stalking'; i++) f.tick();
    expect(f.dog.scentStage).toBe('stalking');
    f.bird.pos.x += 15; f.bird.pos.y += 5;
    f.tick();
    expect(f.dog.scentStage).toBe('locating');
    expect(f.dog.pointedBirdId).toBeNull();
    for (let i = 0; i < 600 && f.dog.state !== 'pointing'; i++) f.tick();
    expect(f.dog.state).toBe('pointing');
    expect(Math.hypot(f.dog.pos.x - f.bird.pos.x, f.dog.pos.y - f.bird.pos.y)).toBeCloseTo(13.5, 4);
  });

  it('checks the last actual scent briefly without steering from an out-of-cone hidden target', () => {
    const a = fixture(), b = fixture();
    for (let i = 0; i < 40; i++) { a.tick(false); b.tick(false); }
    // Both birds leave live scent reach but remain within the old 1.35×
    // memory envelope. Their unseen divergence must not direct the dog.
    a.bird.pos = { x: 430, y: 300 }; b.bird.pos = { x: 430, y: 312 };
    for (let i = 0; i < 20; i++) {
      a.tick(false); b.tick(false);
      expect(a.dog.pos.x).toBeCloseTo(b.dog.pos.x, 10);
      expect(a.dog.pos.y).toBeCloseTo(b.dog.pos.y, 10);
      expect(a.dog.heading).toBeCloseTo(b.dog.heading, 10);
      expect(a.dog.state).toBe('tracking');
      expect(a.dog.pointedBirdId).toBeNull();
    }
    for (let i = 0; i < 60; i++) { a.tick(false); b.tick(false); }
    expect(a.dog.state).toBe('quartering'); expect(b.dog.state).toBe('quartering');
    expect(a.dog.scentStage).toBe('none');
  });

  it('reacquires scent during its short check and cancels a stale locking pose after relocation', () => {
    const f = fixture();
    for (let i = 0; i < 40; i++) f.tick();
    f.bird.pos.x = 480;
    for (let i = 0; i < 15; i++) f.tick();
    expect(f.dog.scentStage).toBe('locating');
    f.bird.pos = { x: f.dog.pos.x + 24, y: f.dog.pos.y + 2 };
    for (let i = 0; i < 300 && f.dog.scentStage !== 'locking'; i++) f.tick();
    expect(f.dog.scentStage).toBe('locking');
    f.bird.pos.x += 12;
    f.tick();
    expect(f.dog.scentStage).toBe('locating');
    expect(f.dog.pointedBirdId).toBeNull();
    for (let i = 0; i < 300 && f.dog.state !== 'pointing'; i++) f.tick();
    expect(f.dog.state).toBe('pointing');
  });

  it('visibly holds off close pressure for a bounded handler window, without promising an indefinite point', () => {
    const f = fixture('quail-fields', 'bobwhite', 'gsp', 5, 318.4);
    f.hunt.hunterPos = { x: 268, y: 300 };
    let waitingFrames = 0;
    for (let i = 0; i < 15 * 30 && f.dog.state !== 'pointing'; i++) {
      const previous = { ...f.dog.pos };
      f.tick(false);
      if (f.dog.waitingForHandler) {
        waitingFrames++;
        expect(f.dog.gait).toBe('still');
        expect(f.dog.pos).toEqual(previous);
        expect(f.dog.pointedBirdId).toBeNull();
      }
    }
    expect(waitingFrames / 30).toBeGreaterThan(1);
    expect(waitingFrames / 30).toBeLessThanOrEqual(8 + 1 / 30);
    expect(f.dog.state).toBe('pointing');
  });

  it('respects the explicit handler leash even while checking lost scent and exits on recall', () => {
    const f = fixture('pheasant-coverts', 'ringneck');
    for (let i = 0; i < 40; i++) f.tick(false);
    // Put the handler behind the actual existing 48m road-in limit;
    // a scent-loss check must not bypass this property rule.
    f.hunt.hunterPos = { x: f.dog.pos.x - 60 / M, y: f.dog.pos.y };
    f.bird.pos = { x: 440, y: 300 };
    const stopped = { ...f.dog.pos };
    f.tick(false);
    expect(f.dog.waitingForHandler).toBe(true);
    expect(f.dog.pos).toEqual(stopped);
    f.dog.update(DT, f.hunt.birds, { hunterPos: f.hunt.hunterPos, recall: true });
    expect(f.dog.state).toBe('recalled');
    expect(f.dog.scentStage).toBe('none');
  });
});
