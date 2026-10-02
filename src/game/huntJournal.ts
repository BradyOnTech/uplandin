import { AREAS } from './areas';
import { BREEDS } from './breeds';
import type { Career } from './career';
import { dateLabel, type SeasonDate } from './season';

/** A settled hunt's actual result; older totals are never expanded into entries. */
export interface CareerJournalEntry {
  huntNumber: number;
  areaId: string;
  /** The calendar at the hunt, before home/travel weeks are charged. */
  date: SeasonDate;
  retrieved: number;
  downed: number;
  escaped: number;
  pointFlushes: number;
  doubles: number;
  henDowns: number;
  hunterXp: number;
  /** Names/breeds at the time; later kennel changes do not rewrite history. */
  dogs: { name: string; breedId: string; note?: string }[];
  /** Downed birds never recovered, and unsafe shots. Absent on older entries. */
  lost?: number;
  unsafe?: number;
  /** Birds downed past the daily limit. */
  overLimit?: number;
  /** Limits filled that day, by label ("roosters"). */
  limits?: string[];
}

export const HUNT_JOURNAL_LIMIT = 30;
const COUNTS = ['retrieved', 'downed', 'escaped', 'pointFlushes', 'doubles', 'henDowns', 'hunterXp'] as const;
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 120;

function readEntry(value: unknown): CareerJournalEntry | null {
  if (!record(value) || !count(value.huntNumber) || value.huntNumber < 1 || !text(value.areaId)
    || !record(value.date) || !count(value.date.season) || value.date.season < 1 || !count(value.date.week)
    || !COUNTS.every((key) => count(value[key])) || !Array.isArray(value.dogs) || value.dogs.length > 2) return null;
  const dogs: CareerJournalEntry['dogs'] = [];
  for (const dog of value.dogs) {
    if (!record(dog) || !text(dog.name) || !text(dog.breedId)) return null;
    dogs.push({ name: dog.name, breedId: dog.breedId, ...(text(dog.note) ? { note: dog.note } : {}) });
  }
  return {
    huntNumber: value.huntNumber,
    areaId: value.areaId,
    date: { season: value.date.season, week: value.date.week },
    retrieved: value.retrieved as number,
    downed: value.downed as number,
    escaped: value.escaped as number,
    pointFlushes: value.pointFlushes as number,
    doubles: value.doubles as number,
    henDowns: value.henDowns as number,
    hunterXp: value.hunterXp as number,
    dogs,
    ...(count(value.lost) && value.lost > 0 ? { lost: value.lost } : {}),
    ...(count(value.unsafe) && value.unsafe > 0 ? { unsafe: value.unsafe } : {}),
    ...(count(value.overLimit) && value.overLimit > 0 ? { overLimit: value.overLimit } : {}),
    ...(Array.isArray(value.limits) && value.limits.length && value.limits.length <= 4 && value.limits.every(text)
      ? { limits: value.limits as string[] } : {}),
  };
}

/** Optional history corruption must never invalidate a player's saved career. */
export function sanitizeHuntJournal(value: unknown): CareerJournalEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  return value.map(readEntry).filter((entry): entry is CareerJournalEntry => entry !== null)
    .sort((a, b) => b.huntNumber - a.huntNumber)
    .filter((entry) => {
      if (seen.has(entry.huntNumber)) return false;
      seen.add(entry.huntNumber);
      return true;
    }).slice(0, HUNT_JOURNAL_LIMIT);
}

/** Newest first, detached from the save so displaying a journal cannot edit it. */
export function readHuntJournal(career: Pick<Career, 'recentHunts'>): CareerJournalEntry[] {
  return sanitizeHuntJournal(career.recentHunts);
}

/** Plain display text, never HTML. Unknown legacy IDs must not name another area. */
export function formatHuntJournalEntry(entry: CareerJournalEntry): {
  areaName: string; dateLabel: string; dogsLabel: string; resultLabel: string; bagLabel: string;
} {
  const safe = readEntry(entry);
  if (!safe) return { areaName: 'Hunt unavailable', dateLabel: 'Date unavailable', dogsLabel: '', resultLabel: 'Record unavailable', bagLabel: '' };
  return {
    areaName: AREAS.find((area) => area.id === safe.areaId)?.name ?? 'Unlisted hunting ground',
    dateLabel: dateLabel(safe.date),
    dogsLabel: safe.dogs.map((dog) => {
      const breed = BREEDS.find((candidate) => candidate.id === dog.breedId);
      const label = breed ? `${dog.name} (${breed.name})` : dog.name;
      return dog.note ? `${label}: ${dog.note}` : label;
    }).join(' · '),
    resultLabel: `${safe.retrieved} retrieved · ${safe.downed} down · ${safe.escaped} escaped`
      + (safe.lost ? ` · ${safe.lost} lost` : '') + (safe.unsafe ? ` · ${safe.unsafe} unsafe shot${safe.unsafe === 1 ? '' : 's'}` : '')
      + (safe.overLimit ? ` · ${safe.overLimit} over the limit` : ''),
    bagLabel: safe.limits?.length ? `Limit of ${safe.limits.join(' and ')}` : '',
  };
}
