import type { AreaConfig } from './areas';
import type { Condition } from './conditions';
import { clamp } from './math';
import type { SpeciesShare } from './species';

/**
 * Seasons & time: the career's scarce resource. A season is ~22 week-ticks,
 * September through January. Home hunts cost a week (a weekend); trips cost
 * two (travel). The dog ages on the calendar, not on a grind — a
 * first-season pup can only ever see ~20 hunts. Quick Hunt stays timeless.
 */

export const SEASON_WEEKS = 22;
export const HOME_HUNT_WEEKS = 1;
export const TRIP_HUNT_WEEKS = 2;

export interface SeasonDate {
  /** 1-based season number — "your third season". */
  season: number;
  /** 0-based week within the season; >= SEASON_WEEKS means the season is over. */
  week: number;
}

export function startingDate(): SeasonDate {
  return { season: 1, week: 0 };
}

export type Month = 'September' | 'October' | 'November' | 'December' | 'January';

const MONTH_STARTS: [number, Month][] = [
  [0, 'September'],
  [4, 'October'],
  [9, 'November'],
  [13, 'December'],
  [18, 'January'],
];

export function monthOf(week: number): Month {
  let month: Month = 'September';
  for (const [start, m] of MONTH_STARTS) {
    if (week >= start) month = m;
  }
  return month;
}

/** "early October", "late December" — for HUDs and the map header. */
export function weekLabel(week: number): string {
  const month = monthOf(week);
  const start = MONTH_STARTS.filter(([s]) => s <= week).pop()![0];
  const next = MONTH_STARTS.find(([s]) => s > week)?.[0] ?? SEASON_WEEKS;
  const t = (week - start) / Math.max(1, next - start - 1);
  const part = t < 0.34 ? 'early' : t < 0.67 ? 'mid' : 'late';
  return `${part} ${month}`;
}

export function dateLabel(date: SeasonDate): string {
  return seasonOver(date) ? `season ${date.season} — over` : `season ${date.season} · ${weekLabel(date.week)}`;
}

export function seasonOver(date: SeasonDate): boolean {
  return date.week >= SEASON_WEEKS;
}

export function advanceWeeks(date: SeasonDate, weeks: number): SeasonDate {
  return { season: date.season, week: date.week + weeks };
}

/** Summer passes; everyone is a season older come September. */
export function nextSeason(date: SeasonDate): SeasonDate {
  return { season: date.season + 1, week: 0 };
}

// — Species openers (week the season opens; everything closes with January) —

const OPENERS: Record<string, number> = {
  'ruffed-grouse': 0, // Sept 1
  woodcock: 0,
  'blue-grouse': 0,
  sharptail: 2, // mid-September
  hun: 2,
  'prairie-chicken': 2,
  chukar: 4, // October
  'mountain-quail': 4,
  ringneck: 6, // the mid-October opener
  bobwhite: 9, // November
  'california-quail': 9,
  'gambels-quail': 9,
  'scaled-quail': 9,
  'mearns-quail': 13, // December — true to the Arizona season
};

export function openerWeek(speciesId: string): number {
  return OPENERS[speciesId] ?? 0;
}

export function speciesOpen(speciesId: string, week: number): boolean {
  return week >= openerWeek(speciesId);
}

/** The share of an area's mix that's legal this week. Empty = area closed. */
export function openMix(area: AreaConfig, week: number): SpeciesShare[] {
  return area.speciesMix.filter((s) => speciesOpen(s.speciesId, week));
}

/** First week an area has anything open — for "opens mid-October" labels. */
export function areaOpenerWeek(area: AreaConfig): number {
  return Math.min(...area.speciesMix.map((s) => openerWeek(s.speciesId)));
}

// — The season's arc in the birds —

/**
 * Young-of-year share: nearly half the September birds are naive juveniles;
 * by December every survivor has been to school.
 */
export function youngShare(week: number): number {
  return Math.max(0, 0.45 * (1 - week / 13));
}

/** Late-season survivors are educated: shorter nerve, wilder flushes. */
export function educatedNerveMult(week: number): number {
  return 1 - 0.2 * clamp((week - 9) / 12, 0, 1);
}

/**
 * Conditions follow the month, crossed with the area's climate lean:
 * September runs hot, October frost, November rain, the back half snow —
 * but the desert stays mild all winter and the high country whitens early.
 */
export function seasonalBias(week: number, climate?: Condition): Condition {
  const month = monthOf(week);
  if (climate === 'hot') {
    // Desert: hot early, then the mild winter that makes it huntable.
    return month === 'September' || month === 'October' ? 'hot' : 'mild';
  }
  if (climate === 'snow') {
    // High country: winter comes early.
    return month === 'September' ? 'frost' : month === 'October' ? 'snow' : 'snow';
  }
  const base: Record<Month, Condition> = {
    September: 'hot',
    October: 'frost',
    November: climate === 'rain' ? 'rain' : 'frost',
    December: 'snow',
    January: 'snow',
  };
  if (climate === 'rain' && (month === 'September' || month === 'October')) return 'rain';
  return base[month];
}

// — The dog's arc —

/**
 * Age in seasons → multiplier on speed and stamina. Season 1 is a growing
 * pup; ~2-7 are prime; from 8 the body slows a few percent a season while
 * the nose holds. Soft decline only — the game never takes your dog away.
 */
export function ageMult(ageSeasons: number): number {
  if (ageSeasons <= 1) return 0.95;
  if (ageSeasons <= 7) return 1;
  return Math.max(0.55, 1 - 0.07 * (ageSeasons - 7));
}

export function ageLabel(ageSeasons: number): string {
  if (ageSeasons <= 1) return 'first season';
  if (ageSeasons <= 4) return `${ageSeasons}${ordinal(ageSeasons)} season`;
  if (ageSeasons <= 7) return `prime · ${ageSeasons}${ordinal(ageSeasons)} season`;
  if (ageSeasons <= 9) return `slowing down · ${ageSeasons}${ordinal(ageSeasons)} season`;
  return `old campaigner · ${ageSeasons}${ordinal(ageSeasons)} season`;
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
}
