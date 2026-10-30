import { describe, expect, it } from 'vitest';
import { addDogToKennel, emptyCareer, saveCareer, type StorageLike } from '../src/game/career';
import { createThreeHuntSetup, parseMonthOverride, parseWeatherOverride } from '../src/game/gameplayMode';
import { mulberry32 } from '../src/game/math';
import { monthOf } from '../src/game/season';
import { CONDITIONS } from '../src/game/conditions';

function memoryStorage(): StorageLike {
  const data: Record<string, string> = {};
  return { getItem: key => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
}

describe('the day a hunt is dressed for', () => {
  it('reads any condition and any season month from a link', () => {
    for (const condition of CONDITIONS) expect(parseWeatherOverride(`?weather=${condition}`)).toBe(condition);
    expect(parseWeatherOverride('?weather=Snow')).toBe('snow');
    expect(parseWeatherOverride('?weather=hail')).toBeNull();
    expect(parseWeatherOverride('')).toBeNull();
    expect(parseMonthOverride('?month=september')).toBe('September');
    expect(parseMonthOverride('?month=Dec')).toBe('December');
    expect(parseMonthOverride('?month=1')).toBe('January');
    expect(parseMonthOverride('?month=11')).toBe('November');
    expect(parseMonthOverride('?month=june')).toBeNull();
    expect(parseMonthOverride('?month=6')).toBeNull();
  });

  it('rolls real days on staged and capture visits instead of forcing frost, and replays them by seed', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const search = `?area=sharptail-prairie&capture=1&seed=${seed}`;
      const day = createThreeHuntSetup(search, mulberry32(7), memoryStorage()).hunt.condition;
      expect(createThreeHuntSetup(search, mulberry32(99), memoryStorage()).hunt.condition).toBe(day);
      seen.add(day);
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it('lets a link ask for any day on every kind of launch', () => {
    const storage = memoryStorage();
    saveCareer(addDogToKennel(emptyCareer(), 'Millie', 'gsp').career, storage);
    for (const search of ['?area=pheasant-coverts&seed=5', '?play=quick&area=chukar-ridge', '?play=career&area=quail-fields']) {
      for (const condition of CONDITIONS) {
        expect(createThreeHuntSetup(`${search}&weather=${condition}`, mulberry32(3), storage).hunt.condition).toBe(condition);
      }
    }
  });

  it('dresses a career hunt for its calendar month, and others for October unless asked', () => {
    const storage = memoryStorage();
    saveCareer(addDogToKennel(emptyCareer(), 'Millie', 'gsp').career, storage);
    expect(createThreeHuntSetup('?play=career&area=quail-fields', mulberry32(3), storage).month).toBe(monthOf(0));
    expect(createThreeHuntSetup('?area=sharptail-prairie&seed=4', mulberry32(3), storage).month).toBe('October');
    expect(createThreeHuntSetup('?area=sharptail-prairie&seed=4&month=dec', mulberry32(3), storage).month).toBe('December');
    expect(createThreeHuntSetup('?play=career&area=quail-fields&month=11', mulberry32(3), storage).month).toBe('November');
  });
});
