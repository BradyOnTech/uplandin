import { describe, expect, it } from 'vitest';
import { addDogToKennel, emptyCareer, saveCareer, type StorageLike } from '../src/game/career';
import {
  build3DHuntHref,
  createThreeHuntSetup,
  GAMEPLAY_MODE_KEY,
  loadGameplayMode,
  parseHuntLaunch,
  parseDropPointId,
  resolveThreeHuntArea,
  resolveThreeHuntProfile,
  saveGameplayMode,
} from '../src/game/gameplayMode';
import { mulberry32 } from '../src/game/math';
import { saveQuickConfig } from '../src/game/quick';

function memoryStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => { data[key] = value; },
  };
}

describe('gameplay mode and shared hunt launch', () => {
  it('replays explicit Pheasant seeds without using Quail stocking or changing the property', () => {
    const setup = (seed?: number, rngSeed = 1) => createThreeHuntSetup(
      `?area=pheasant-coverts&drop=south-gate${seed === undefined ? '' : `&seed=${seed}`}`,
      mulberry32(rngSeed), memoryStorage());
    const snapshot = (result: ReturnType<typeof setup>) => result.hunt.birds.map(bird => ({
      species: bird.speciesId, sex: bird.sex, pos: bird.pos, runs: bird.runs,
    }));
    const first = setup(1), replay = setup(1, 900), different = setup(2), original = setup();
    expect(first.seed).toBe(1);
    expect(snapshot(first)).toEqual(snapshot(replay));
    expect(snapshot(first)).not.toEqual(snapshot(different));
    expect(first.hunt.birds).toHaveLength(original.hunt.birds.length);
    expect(first.hunt.birds.every(bird => bird.speciesId === 'ringneck')).toBe(true);
    expect(first.area).toEqual(original.area);
    expect(snapshot(original)).toEqual(snapshot(setup(undefined, 999)));
  });

  it('defaults to 2D and persists either renderer without touching career', () => {
    const storage = memoryStorage();
    const { career } = addDogToKennel(emptyCareer(), 'Millie', 'gsp');
    saveCareer(career, storage);

    expect(loadGameplayMode(storage)).toBe('2d');
    saveGameplayMode('3d', storage);
    expect(storage.data[GAMEPLAY_MODE_KEY]).toBe('3d');
    expect(loadGameplayMode(storage)).toBe('3d');
    expect(resolveThreeHuntProfile('?play=career&area=quail-fields', storage).kennelDog?.name).toBe('Millie');
  });

  it('round-trips career and quick launch URLs', () => {
    expect(build3DHuntHref({ kind: 'career', areaId: 'grouse-woods' }))
      .toBe('./index3d.html?play=career&area=grouse-woods');
    expect(parseHuntLaunch('?play=career&area=grouse-woods')).toEqual({ kind: 'career', areaId: 'grouse-woods' });
    expect(parseHuntLaunch('?play=quick')).toEqual({ kind: 'quick' });
    expect(parseHuntLaunch('?breed=gsp')).toBeNull();
    expect(build3DHuntHref({ kind: 'quick' }, 'west-track'))
      .toBe('./index3d.html?play=quick&drop=west-track');
    expect(parseDropPointId('?play=quick&drop=west-track')).toBe('west-track');
  });

  it('starts a 3D launch at the selected drop point', () => {
    const setup = createThreeHuntSetup(
      '?play=career&area=quail-fields&drop=west-track',
      mulberry32(22),
      memoryStorage(),
    );
    expect(setup.hunt.dropPointId).toBe('west-track');
    expect(setup.hunt.hunterPos).toEqual(setup.area.dropPoints[1].position);
  });

  it('boots 3D career hunts with the active dog, area, level, and career gun', () => {
    const storage = memoryStorage();
    const added = addDogToKennel(emptyCareer(), 'Sage', 'english-setter');
    added.career.kennel[0].level = 6;
    added.career.hunter.shotgunId = 'over-under';
    saveCareer(added.career, storage);

    const setup = createThreeHuntSetup('?play=career&area=grouse-woods', mulberry32(4), storage);
    expect(setup.area.id).toBe('grouse-woods');
    expect(setup.breed.id).toBe('english-setter');
    expect(setup.level).toBe(6);
    expect(setup.kennelDog?.name).toBe('Sage');
    expect(setup.hunt.gunId).toBe('over-under');
    expect(setup.gearTier).toBe(0);
  });

  it('boots 3D quick hunts from the same persisted setup', () => {
    const storage = memoryStorage();
    saveQuickConfig({
      breedId: 'gsp', level: 3, areaId: 'quail-fields', wind: 'strong',
      gunId: 'over-under', gearTier: 2, breed2Id: 'none', weather: 'frost',
    }, storage);
    const setup = createThreeHuntSetup('?play=quick', mulberry32(7), storage);
    expect(setup.breed.id).toBe('gsp');
    expect(setup.level).toBe(3);
    expect(setup.hunt.windStrength).toBe('strong');
    expect(setup.hunt.condition).toBe('frost');
    expect(setup.hunt.quick?.gearTier).toBe(2);
    expect(setup.gearTier).toBe(2);
    expect(setup.brace).toBeNull();
    expect(resolveThreeHuntArea('?play=quick', storage).id).toBe('quail-fields');
  });

  it('resolves location identity without rolling a hunt', () => {
    expect(resolveThreeHuntArea('?play=career&area=chukar-ridge', memoryStorage()).id)
      .toBe('chukar-ridge');
    expect(resolveThreeHuntArea('?area=timberline-parks', null).terrain.kind)
      .toBe('alpine');
  });

  it('resolves the configured Quick Hunt bracemate for the 3D adapter', () => {
    const storage = memoryStorage();
    saveQuickConfig({
      breedId: 'gsp', level: 5, areaId: 'quail-fields', wind: 'calm',
      gunId: 'remington-870', gearTier: 1, breed2Id: 'english-setter', weather: 'mild',
    }, storage);
    const profile = resolveThreeHuntProfile('?play=quick', storage);
    expect(profile.brace).toMatchObject({ breedId: 'english-setter', level: 5 });
  });

  it('keeps the standalone 3D review fallback on the English Setter', () => {
    expect(resolveThreeHuntProfile('?breed=unknown', null).breedId).toBe('english-setter');
    expect(resolveThreeHuntProfile('', null).breedId).toBe('gsp');
    expect(createThreeHuntSetup('', () => 0.5, null).breed.id).toBe('gsp');
    expect(resolveThreeHuntProfile('?breed=english-setter', null).breedId).toBe('english-setter');
  });
});
