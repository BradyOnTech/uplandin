import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import type { Bird } from '../src/game/birds';
import { getBreed } from '../src/game/breeds';
import { Dog } from '../src/game/dog';
import { HuntSimulation, type HuntSimulationEvent } from '../src/game/huntSimulation';
import type { HuntChallenge } from '../src/game/huntChallenge';
import { mulberry32 } from '../src/game/math';
import { createHunt, emptyDogWork } from '../src/game/state';
import { PROPERTY_PX_TO_M } from '../src/game/worldUnits';

// Controlled held-point fixtures exercise actual simulation outcomes. They
// are not claimed as naturally discovered coveys; public-route evidence lives
// separately in output/encounter-distance-review/.
function fixture(species: string, rangeM = 50, challenge: HuntChallenge = 'balanced', continuous = true, brace = false) {
  const area = getArea(species === 'sharptail' ? 'sharptail-prairie' : species === 'chukar' ? 'chukar-ridge' : species === 'ringneck' ? 'pheasant-coverts' : 'quail-fields');
  const hunt = createHunt(area, mulberry32(11), { wind: 'calm', condition: 'mild' });
  const bird: Bird = { id: 9001, coveyId: 77, speciesId: species, pos: { x: 300, y: 300 }, state: 'hidden', runs: false, runEnergy: 2500, restingMs: 0, nerveMs: 2400, approachRoll: .5 };
  hunt.birds = [bird]; hunt.hunterPos = { x: 300 - rangeM / PROPERTY_PX_TO_M, y: 300 };
  const dog = new Dog({ x: 287, y: 300 }, { breed: getBreed('gsp'), level: 5 }, () => .999, area.world);
  dog.state = 'pointing'; dog.gait = 'still'; dog.pointedBirdId = bird.id;
  const dogs = [dog];
  if (brace) {
    const second = new Dog({ x: 287, y: 301 }, { breed: getBreed('gsp'), level: 5 }, () => .999, area.world);
    second.state = 'pointing'; second.gait = 'still'; second.pointedBirdId = bird.id;
    dogs.push(second); hunt.dogWork.push(emptyDogWork());
  }
  const sim = new HuntSimulation({ hunt, dogs, area, continuousEncounter: continuous, challenge, rng: () => .999 });
  let ms = 0;
  const step = (moving = false, running = false, dt = 1000 / 30) => {
    ms += dt;
    const pos = { ...hunt.hunterPos };
    if (moving) pos.x += (running ? 4.18 : 2.2) * dt / 1000 / PROPERTY_PX_TO_M;
    return sim.update(dt, { hunterPos: pos, hunterRunning: running });
  };
  const untilRise = (moving = false, running = false, limitMs = 40000) => {
    for (let i = 0; i < limitMs / (1000 / 30); i++) {
      const event = step(moving, running).find((e): e is Extract<HuntSimulationEvent, {type:'covey-flushed'}> => e.type === 'covey-flushed');
      if (event) return { ...event, ms, rangeM: event.hunterDistance * PROPERTY_PX_TO_M };
    }
    throw Error('Expected a finite point outcome');
  };
  return { bird, dog, dogs, hunt, sim, step, untilRise };
}

describe('world-scale held-point walk-in', () => {
  it.each(['sharptail', 'chukar'])('lets a quiet handler earn a closer %s opportunity from a real-world cast gap', species => {
    const f = fixture(species, species === 'sharptail' ? 60 : 40);
    const rise = f.untilRise(true);
    expect(rise.pointCredit).toBe(true);
    expect(rise.ms).toBeGreaterThan(8000);
    expect(rise.rangeM).toBeLessThan(species === 'sharptail' ? 23 : 18);
  });

  it('actually applies the selected difficulty to the open-country proximity radius', () => {
    const radii: number[] = [];
    for (const challenge of ['relaxed', 'balanced', 'wild'] as const) {
      const f = fixture('sharptail', 30, challenge); f.bird.nerveMs = 100000;
      const rise = f.untilRise(true);
      expect(rise.cause).toBe('proximity'); radii.push(rise.rangeM);
    }
    expect(radii[0]).toBeLessThan(18);
    expect(radii[1]).toBeGreaterThan(radii[0] + 2);
    expect(radii[2]).toBeGreaterThan(radii[1] + 3);
  });

  it('still expires for a stationary handler, and running or Wild makes a far point less forgiving', () => {
    const quiet = fixture('sharptail', 60).untilRise();
    const running = fixture('sharptail', 60).untilRise(true, true);
    const wild = fixture('sharptail', 60, 'wild').untilRise();
    expect(quiet.cause).toBe('nerve'); expect(quiet.ms).toBeGreaterThan(12000); expect(quiet.ms).toBeLessThan(23000);
    expect(running.ms).toBeLessThan(3000); expect(running.rangeM).toBeGreaterThan(45);
    expect(wild.ms).toBeLessThan(quiet.ms / 2);
  });

  it('does not replenish protection by changing the pointed member or briefly returning to heel', () => {
    const f = fixture('sharptail', 50);
    for (let i = 0; i < 11 * 30; i++) expect(f.step().some(e => e.type === 'covey-flushed')).toBe(false);
    f.dog.state = 'heel'; f.dog.pointedBirdId = null; f.step();
    const other = { ...f.bird, id: 9002 }; f.hunt.birds.push(other);
    f.dog.state = 'pointing'; f.dog.gait = 'still'; f.dog.pointedBirdId = other.id;
    const rise = f.untilRise(false, false, 6000);
    expect(rise.cause).toBe('nerve'); expect(rise.ms).toBeLessThan(17000);
  });

  it('spends the shared covey allowance once per tick when both brace dogs point', () => {
    const single = fixture('sharptail', 50), brace = fixture('sharptail', 50, 'balanced', true, true);
    for (let i = 0; i < 12 * 30; i++) {
      expect(single.step().some(e => e.type === 'covey-flushed')).toBe(false);
      expect(brace.step().some(e => e.type === 'covey-flushed')).toBe(false);
    }
    expect(brace.dogs.every(d => d.state === 'pointing')).toBe(true);
    expect(single.bird.nerveMs).toBe(2400);
    expect(brace.bird.nerveMs).toBe(2400);
    // After that same allowance is spent, the two actual pointing dogs still
    // exert the existing extra pressure; they do not earn another walk-in.
    const singleRise = single.untilRise(), braceRise = brace.untilRise();
    expect(braceRise.ms).toBeGreaterThan(12000);
    expect(braceRise.ms).toBeLessThan(singleRise.ms);
  });

  it('leaves legacy scene-cut nerve and non-target species unchanged', () => {
    for (const species of ['sharptail', 'chukar']) {
      const f = fixture(species, 60, 'balanced', false);
      expect(f.untilRise().ms).toBeLessThan(4500);
    }
    for (const species of ['bobwhite', 'ringneck', 'hun']) {
      const f = fixture(species, 60);
      const before = f.bird.nerveMs; f.step();
      expect(f.bird.nerveMs).toBeLessThan(before);
    }
  });

  it('does not grant new protection to an already exhausted point or alter an unpointed scent flush', () => {
    const exhausted = fixture('sharptail'); exhausted.bird.nerveMs = 0;
    expect(exhausted.step()).toContainEqual(expect.objectContaining({ type: 'covey-flushed', cause: 'nerve' }));
    const scented = fixture('sharptail', 60);
    scented.dog.state = 'quartering'; scented.dog.pointedBirdId = null;
    scented.dog.pos = { x: 288, y: 300 }; scented.hunt.wind = 0;
    expect(scented.step()).toContainEqual(expect.objectContaining({ type: 'covey-flushed', cause: 'scent' }));
  });
});
