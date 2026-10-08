import { describe, expect, it } from 'vitest';
import { HUNT_TIMES, parseHuntTime, timeNerveMult } from '../src/game/timeOfDay';
import { createHunt } from '../src/game/state';
import { getArea } from '../src/game/areas';
import { mulberry32 } from '../src/game/math';
import { handlerNotes } from '../src/game/dogReport';
import { createThreeHuntSetup } from '../src/game/gameplayMode';
import { HuntSimulation } from '../src/game/huntSimulation';
import { Dog } from '../src/game/dog';
import { getBreed } from '../src/game/breeds';

describe('time of day', () => {
  it('reads the light from the launch and falls back to the renderer default', () => {
    for (const time of HUNT_TIMES) expect(parseHuntTime(time, 'chukar-ridge')).toBe(time);
    expect(parseHuntTime(null, 'quail-fields')).toBe('morning');
    expect(parseHuntTime(null, 'pheasant-coverts')).toBe('dawn');
    expect(parseHuntTime('midnight', 'pheasant-coverts')).toBe('dawn');
  });

  it('birds near the roost sit tighter early; the rest of the day is ordinary', () => {
    expect(timeNerveMult('dawn')).toBeGreaterThan(timeNerveMult('morning'));
    expect(timeNerveMult('morning')).toBeGreaterThan(1);
    expect(timeNerveMult('noon')).toBe(1);
    expect(timeNerveMult('evening')).toBe(1);
    expect(timeNerveMult('lastlight')).toBe(1);
  });

  it('a dawn hunt spawns the same birds with more nerve than a midday one', () => {
    const area = getArea('pheasant-coverts');
    const hunt = (timeOfDay: 'dawn' | 'noon') => createHunt(area, mulberry32(7), { wind: 'calm', condition: 'mild', timeOfDay });
    const dawn = hunt('dawn'), noon = hunt('noon');
    expect(dawn.timeOfDay).toBe('dawn');
    expect(dawn.birds.map(bird => [bird.speciesId, bird.pos])).toEqual(noon.birds.map(bird => [bird.speciesId, bird.pos]));
    dawn.birds.forEach((bird, i) => expect(bird.nerveMs).toBeCloseTo(noon.birds[i].nerveMs * timeNerveMult('dawn'), 6));
  });

  it('the 3D launch carries its light into the hunt', () => {
    const setup = createThreeHuntSetup('?area=sharptail-prairie&tod=evening&seed=11', mulberry32(3), null);
    expect(setup.hunt.timeOfDay).toBe('evening');
  });

  it('missing birds into a low sun earns a handler note about the walk-in', () => {
    const hunt = createHunt(getArea('quail-fields'), mulberry32(1), { timeOfDay: 'evening' });
    expect(handlerNotes(hunt).join(' ')).not.toContain('sun');
    hunt.sunMisses = 2;
    expect(handlerNotes(hunt).join(' ')).toContain('Missed 2 birds flying into the low sun');
  });

  it('changing the light before walking out re-times the waiting birds', () => {
    const area = getArea('pheasant-coverts');
    const hunt = createHunt(area, mulberry32(7), { wind: 'calm', condition: 'mild', timeOfDay: 'noon' });
    const before = hunt.birds.map(bird => bird.nerveMs);
    hunt.birds[0].state = 'escaped';
    const dog = new Dog({ x: 100, y: 100 }, { breed: getBreed('gsp'), level: 6 }, mulberry32(5), area.world);
    const sim = new HuntSimulation({ hunt, dogs: [dog], area, rng: mulberry32(6), continuousEncounter: true });
    sim.retime('dawn');
    expect(hunt.timeOfDay).toBe('dawn');
    expect(hunt.birds[0].nerveMs).toBe(before[0]);
    hunt.birds.slice(1).forEach((bird, i) => expect(bird.nerveMs).toBeCloseTo(before[i + 1] * timeNerveMult('dawn'), 6));
    sim.retime('noon');
    hunt.birds.slice(1).forEach((bird, i) => expect(bird.nerveMs).toBeCloseTo(before[i + 1], 6));
  });
});
