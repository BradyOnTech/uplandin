import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { spawnBirds } from '../src/game/birds';
import { createThreeHuntSetup } from '../src/game/gameplayMode';
import { mulberry32 } from '../src/game/math';

const memoryStorage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), removeItem: (key: string) => void values.delete(key) };
};
const setup = (area: string, drop: string, seed: number) =>
  createThreeHuntSetup(`?area=${area}&drop=${drop}&seed=${seed}`, Math.random, memoryStorage() as never);
const coveys = (birds: ReturnType<typeof setup>['hunt']['birds']) => {
  const byId = new Map<number, typeof birds>();
  for (const bird of birds) byId.set(bird.coveyId, [...(byId.get(bird.coveyId) ?? []), bird]);
  return byId;
};

describe('bird placement varies between hunts', () => {
  it.each(['pheasant-coverts', 'sharptail-prairie', 'hun-benches', 'quail-fields'])('%s opening coveys spread across the walk-in', area => {
    const cells = new Set<string>();
    const openings: { x: number; y: number }[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const opening = coveys(setup(area, 'south-gate', seed * 7919).hunt.birds).get(0)!;
      const x = opening.reduce((sum, bird) => sum + bird.pos.x, 0) / opening.length;
      const y = opening.reduce((sum, bird) => sum + bird.pos.y, 0) / opening.length;
      openings.push({ x, y }); cells.add(`${Math.floor(x / 25)},${Math.floor(y / 25)}`);
    }
    const mx = openings.reduce((sum, p) => sum + p.x, 0) / openings.length, my = openings.reduce((sum, p) => sum + p.y, 0) / openings.length;
    const spread = openings.reduce((sum, p) => sum + Math.hypot(p.x - mx, p.y - my), 0) / openings.length;
    expect(cells.size).toBeGreaterThanOrEqual(10);
    expect(spread).toBeGreaterThan(28);
  });
});

describe('mixed properties show their mix', () => {
  it.each(['pheasant-coverts', 'sharptail-prairie', 'chukar-ridge'])('%s puts a secondary species in the first coveys of almost every hunt', area => {
    const primary = getArea(area).speciesMix[0].speciesId;
    let early = 0, openingSecondary = 0;
    const N = 60;
    for (let seed = 1; seed <= N; seed++) {
      const byId = coveys(setup(area, 'south-gate', seed * 104729).hunt.birds);
      if ([0, 1, 2, 3].some(id => byId.get(id) && byId.get(id)![0].speciesId !== primary)) early++;
      if (byId.get(0)![0].speciesId !== primary) openingSecondary++;
    }
    expect(early / N).toBeGreaterThan(.8);
    // The primary species still opens most days.
    expect(openingSecondary / N).toBeGreaterThan(.1);
    expect(openingSecondary / N).toBeLessThan(.5);
  });

  it('keeps a big secondary covey from eating a small stocking', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const birds = spawnBirds({ patches: [{ x: 0, y: 0, w: 400, h: 400 }], birdCount: 10, mixedCoveys: true,
        speciesMix: [{ speciesId: 'ringneck', weight: .8 }, { speciesId: 'hun', weight: .2 }] }, mulberry32(seed));
      const huns = birds.filter(bird => bird.speciesId === 'hun').length;
      expect(huns).toBeGreaterThan(0);
      expect(huns).toBeLessThanOrEqual(4);
    }
  });

  it('leaves single-species and legacy spawns alone', () => {
    const cfg = { patches: [{ x: 0, y: 0, w: 400, h: 400 }], birdCount: 20, speciesMix: [{ speciesId: 'bobwhite', weight: 1 }] };
    expect(spawnBirds({ ...cfg, mixedCoveys: true }, mulberry32(4)).map(b => b.pos))
      .toEqual(spawnBirds(cfg, mulberry32(4)).map(b => b.pos));
  });
});
