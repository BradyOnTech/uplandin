import { describe, expect, it } from 'vitest';
import { AREAS, getArea } from '../src/game/areas';
import { SPECIES } from '../src/game/species';
import {
  advanceWeeks,
  ageLabel,
  ageMult,
  areaOpenerWeek,
  dateLabel,
  educatedNerveMult,
  monthOf,
  nextSeason,
  openMix,
  openerWeek,
  SEASON_WEEKS,
  seasonalBias,
  seasonOver,
  speciesOpen,
  startingDate,
  weekLabel,
  youngShare,
} from '../src/game/season';

describe('the calendar', () => {
  it('runs September through January', () => {
    expect(monthOf(0)).toBe('September');
    expect(monthOf(4)).toBe('October');
    expect(monthOf(9)).toBe('November');
    expect(monthOf(13)).toBe('December');
    expect(monthOf(18)).toBe('January');
    expect(monthOf(SEASON_WEEKS - 1)).toBe('January');
  });

  it('labels weeks like a hunter talks', () => {
    expect(weekLabel(0)).toBe('early September');
    expect(weekLabel(6)).toContain('October');
    expect(dateLabel({ season: 3, week: 6 })).toBe('season 3 · mid October');
    expect(dateLabel({ season: 1, week: 22 })).toBe('season 1 — over');
  });

  it('weeks advance, seasons end, summer rolls over', () => {
    let d = startingDate();
    expect(d).toEqual({ season: 1, week: 0 });
    d = advanceWeeks(d, 21);
    expect(seasonOver(d)).toBe(false);
    d = advanceWeeks(d, 1);
    expect(seasonOver(d)).toBe(true);
    d = nextSeason(d);
    expect(d).toEqual({ season: 2, week: 0 });
  });
});

describe('species openers', () => {
  it('every species has an opener inside the season', () => {
    for (const s of SPECIES) {
      expect(openerWeek(s.id)).toBeGreaterThanOrEqual(0);
      expect(openerWeek(s.id)).toBeLessThan(SEASON_WEEKS);
    }
  });

  it('September is grouse camp; the pheasant opener is mid-October; Mearns waits for December', () => {
    expect(speciesOpen('ruffed-grouse', 0)).toBe(true);
    expect(speciesOpen('ringneck', 5)).toBe(false);
    expect(speciesOpen('ringneck', 6)).toBe(true);
    expect(speciesOpen('mearns-quail', 12)).toBe(false);
    expect(speciesOpen('mearns-quail', 13)).toBe(true);
  });

  it('an area hunts only its open species, and closes entirely before its first opener', () => {
    const cattails = getArea('pheasant-coverts'); // ringneck (wk 6) + hun (wk 2)
    expect(openMix(cattails, 0)).toEqual([]);
    expect(openMix(cattails, 3).map((s) => s.speciesId)).toEqual(['hun']);
    expect(openMix(cattails, 8).map((s) => s.speciesId)).toEqual(['ringneck', 'hun']);
    expect(areaOpenerWeek(cattails)).toBe(2);
    expect(areaOpenerWeek(getArea('grouse-woods'))).toBe(0);
    // Every area opens at some point in the season.
    for (const a of AREAS) expect(areaOpenerWeek(a)).toBeLessThan(SEASON_WEEKS);
  });
});

describe("the season's arc in the birds", () => {
  it('September coveys are nearly half young-of-year; by December they are gone', () => {
    expect(youngShare(0)).toBeCloseTo(0.45, 5);
    expect(youngShare(6)).toBeGreaterThan(0);
    expect(youngShare(6)).toBeLessThan(0.45);
    expect(youngShare(13)).toBe(0);
    expect(youngShare(21)).toBe(0);
  });

  it('late-season survivors are educated', () => {
    expect(educatedNerveMult(0)).toBe(1);
    expect(educatedNerveMult(9)).toBe(1);
    expect(educatedNerveMult(21)).toBe(0.8);
    expect(educatedNerveMult(15)).toBeLessThan(1);
  });

  it('conditions follow the month, but the desert winters mild and the high country whitens early', () => {
    expect(seasonalBias(0)).toBe('hot'); // September
    expect(seasonalBias(6)).toBe('frost'); // October
    expect(seasonalBias(20)).toBe('snow'); // January
    expect(seasonalBias(20, 'hot')).toBe('mild'); // Sonoran December
    expect(seasonalBias(0, 'hot')).toBe('hot');
    expect(seasonalBias(6, 'snow')).toBe('snow'); // Timberline October
    expect(seasonalBias(10, 'rain')).toBe('rain'); // North Woods November
  });
});

describe("the dog's arc", () => {
  it('grows, holds prime, then softly declines — never taken away', () => {
    expect(ageMult(1)).toBeLessThan(1); // growing pup
    for (let a = 2; a <= 7; a++) expect(ageMult(a)).toBe(1); // prime
    expect(ageMult(8)).toBeLessThan(1);
    expect(ageMult(10)).toBeLessThan(ageMult(8));
    expect(ageMult(30)).toBeGreaterThanOrEqual(0.55); // floor, no forced goodbye
  });

  it('labels the arc', () => {
    expect(ageLabel(1)).toBe('first season');
    expect(ageLabel(3)).toBe('3rd season');
    expect(ageLabel(6)).toContain('prime');
    expect(ageLabel(9)).toContain('slowing down');
    expect(ageLabel(11)).toContain('old campaigner');
  });
});
