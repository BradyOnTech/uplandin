import { describe, expect, it } from 'vitest';
import { createThreeHuntSetup, parseDropPointId } from '../src/game/gameplayMode';
import { isFalconryPractice, FALCONRY_PRACTICE } from '../src/game/falconryPractice';
import { LandscapeModel } from '../src/game/landscape';

const drill = '?play=quick&method=goshawk&practice=slip';
describe('nearby falconry drill', () => {
  it('stages one hidden rooster and a finished solo dog without changing storage', () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error('Practice wrote a save'); } };
    const a = createThreeHuntSetup(drill, () => .1, storage);
    const b = createThreeHuntSetup(drill+'&seed=999&drop=west-track', () => .9, storage);
    expect(a.hunt.birds).toEqual(b.hunt.birds);
    expect(a.seed).toBe(FALCONRY_PRACTICE.seed);
    expect(a.hunt.birds).toHaveLength(1);
    expect(a.hunt.birds[0]).toMatchObject({speciesId:'ringneck',sex:'rooster',state:'hidden',runs:false});
    expect(a.level).toBe(10);expect(a.breedId).toBe('gsp');expect(a.brace).toBeNull();
    const landscape = new LandscapeModel(a.area, a.hunt.dropPointId);
    const bird = landscape.propertyToWorld(a.hunt.birds[0].pos.x,a.hunt.birds[0].pos.y,{x:0,z:0});
    expect(bird.x).toBeCloseTo(FALCONRY_PRACTICE.quarry.x);
    expect(bird.z).toBeCloseTo(FALCONRY_PRACTICE.quarry.z);
    expect(parseDropPointId(drill+'&drop=west-track')).toBe('south-gate');
  });
  it('cannot stage ordinary or career hunts', () => {
    for(const search of ['?play=career&area=pheasant-coverts&method=goshawk&practice=slip','?play=quick&practice=slip','?play=quick&method=goshawk']) {
      expect(isFalconryPractice(search)).toBe(false);
      expect(createThreeHuntSetup(search,()=>.5,null).hunt.birds.length).toBeGreaterThan(1);
    }
  });
});
