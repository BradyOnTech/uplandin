import type { TimeOfDay } from '../palette';
import type { Month } from '../../game/season';
import type { BirdCallId, FlockId } from './birdCalls';
import type { BirdSpace } from './birdVoice';

/**
 * Which birds each ground has, and when they call. The land's own birds are
 * never the quarry: they set the place and the hour. The quarry is heard
 * only from real birds: a covey going up, chukar calling off the rimrock
 * before they are found, a scattered covey calling itself back together.
 * Presentation only; it never draws on the hunt's randomness.
 */

export type GroundCall = { readonly call: BirdCallId } | { readonly flock: FlockId };
export type GroundBird = GroundCall & {
  /** How often it is this bird, against the ground's others. */
  readonly weight: number;
  /** How far off it calls from, m. */
  readonly distance: readonly [number, number];
  /** Loudness before the distance falloff. */
  readonly gain: number;
  /** Crossing the sky while it calls, rather than calling from the ground. */
  readonly overhead?: boolean;
  /** How much it calls at each hour; 1 where unnamed. */
  readonly hours?: Partial<Record<TimeOfDay, number>>;
  /** How much it is about in each month; 1 where unnamed, 0 when it has gone south. */
  readonly months?: Partial<Record<Month, number>>;
};
export interface GroundBirds {
  readonly space: BirdSpace;
  /** Mean seconds between the land's birds calling, at an ordinary hour. */
  readonly interval: number;
  readonly birds: readonly GroundBird[];
}

/** The land's birds sit under the dog's bell at working range (around -30 dBFS
 * at their usual distances); the quarry's own calls carry a little more. */
export const AMBIENT_BIRD_GAIN = .18;
export const QUARRY_CALL_GAIN = .2;

/** Birds sing most at first light and least at midday. */
export const BIRD_ACTIVITY: Readonly<Record<TimeOfDay, number>> = { dawn: 1.6, morning: 1.15, noon: .55, evening: .9, lastlight: .7 };

/** The season's comings and goings, shared by the grounds that have them. */
const CRANE_PASSAGE: Partial<Record<Month, number>> = { September: .5, October: 1.8, November: .6, December: 0, January: 0 };
const GOOSE_PASSAGE: Partial<Record<Month, number>> = { September: .4, October: 1.6, November: 1.4, December: .6, January: .3 };
/** Red-winged blackbirds crowd the cattails early, then go. */
const BLACKBIRD_SEASON: Partial<Record<Month, number>> = { September: 1.8, October: 1, November: .25, December: .03, January: 0 };
/** Northern meadowlarks leave the Dakotas by November; larks stay all winter. */
const MEADOWLARK_NORTH: Partial<Record<Month, number>> = { September: 1.3, October: .8, November: .15, December: 0, January: 0 };
const LARK_WINTER: Partial<Record<Month, number>> = { November: 1.3, December: 1.8, January: 2 };
/** Ducks leave a slough once it freezes. */
const OPEN_WATER: Partial<Record<Month, number>> = { November: .7, December: .15, January: .05 };

export const GROUND_BIRDS: Readonly<Record<string, GroundBirds>> = {
  // A prairie-pothole farm: blackbirds in the cattails, ducks on the slough,
  // chickadees in the shelterbelt, geese going over, a rooster off the place.
  'pheasant-coverts': { space: 'marsh', interval: 17, birds: [
    { flock: 'blackbirds', weight: 3, distance: [45, 150], gain: .55, months: BLACKBIRD_SEASON },
    { call: 'mallard', weight: 1.5, distance: [90, 260], gain: .7, months: OPEN_WATER },
    { call: 'chickadee', weight: 1.5, distance: [30, 90], gain: .4, hours: { noon: .6, lastlight: .3 } },
    { flock: 'geese', weight: 1.1, distance: [140, 320], gain: 1.3, overhead: true, hours: { dawn: 1.6, noon: .4, evening: 1.3, lastlight: 1.6 },
      months: GOOSE_PASSAGE },
    { flock: 'cranes', weight: .45, distance: [300, 650], gain: 1.6, overhead: true, hours: { noon: .7 }, months: CRANE_PASSAGE },
    { call: 'rooster-crow', weight: .5, distance: [500, 800], gain: .9, hours: { dawn: 2.2, morning: .8, noon: .1, evening: .9, lastlight: 1.6 } },
  ] },
  // Open northern grassland: meadowlarks and larks, cranes high overhead.
  'sharptail-prairie': { space: 'open', interval: 21, birds: [
    { call: 'meadowlark', weight: 3, distance: [60, 230], gain: .6, hours: { dawn: 1.5, noon: .5, lastlight: .5 }, months: MEADOWLARK_NORTH },
    { call: 'horned-lark', weight: 2, distance: [20, 80], gain: .35, months: LARK_WINTER },
    { flock: 'cranes', weight: 1, distance: [280, 620], gain: 1.6, overhead: true, hours: { noon: .7 }, months: CRANE_PASSAGE },
    { flock: 'geese', weight: .6, distance: [200, 420], gain: 1.3, overhead: true, hours: { dawn: 1.5, noon: .4, lastlight: 1.4 }, months: GOOSE_PASSAGE },
    { call: 'redtail', weight: .6, distance: [150, 420], gain: 1, overhead: true, hours: { dawn: .2, noon: 1.4 } },
  ] },
  // Southern plains: cardinals and doves in the plum and creek timber.
  'quail-fields': { space: 'timber', interval: 15, birds: [
    { call: 'cardinal', weight: 2.5, distance: [40, 160], gain: .55, hours: { dawn: 1.5, noon: .5 } },
    { call: 'mourning-dove', weight: 1.5, distance: [60, 210], gain: .55 },
    { call: 'meadowlark', weight: 1.5, distance: [80, 260], gain: .55, hours: { noon: .6 } },
    { call: 'redtail', weight: .5, distance: [150, 420], gain: 1, overhead: true, hours: { dawn: .2, noon: 1.3 } },
  ] },
  // A Great Basin canyon: a canyon wren's falling song, ravens along the rim.
  'chukar-ridge': { space: 'canyon', interval: 23, birds: [
    { call: 'canyon-wren', weight: 2.5, distance: [60, 230], gain: .65, hours: { noon: .7 } },
    { call: 'raven', weight: 2, distance: [90, 360], gain: .7, overhead: true },
    { call: 'redtail', weight: .5, distance: [200, 500], gain: 1, overhead: true, hours: { dawn: .2, noon: 1.3 } },
  ] },
};

/** The country a ground's birds are heard in. */
export function groundSpace(areaId?: string): BirdSpace {
  return (areaId && GROUND_BIRDS[areaId]?.space) || 'open';
}

export interface GroundBirdCall {
  readonly bird: GroundBird;
  readonly distance: number;
  /** Bearing from the hunter, radians clockwise from north (-Z). */
  readonly bearing: number;
  readonly seed: number;
}

/** The next of the land's birds to call, chosen for the hour and the month. */
export function nextGroundBird(areaId: string | undefined, hour: TimeOfDay, random: () => number, month: Month = 'October'): GroundBirdCall | null {
  const ground = areaId ? GROUND_BIRDS[areaId] : undefined;
  if (!ground) return null;
  const weights = ground.birds.map(bird => bird.weight * (bird.hours?.[hour] ?? 1) * (bird.months?.[month] ?? 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0)) return null;
  let pick = random() * total;
  const index = Math.max(0, weights.findIndex(weight => (pick -= weight) < 0));
  const bird = ground.birds[index];
  return { bird, distance: bird.distance[0] + (bird.distance[1] - bird.distance[0]) * random(),
    bearing: random() * Math.PI * 2, seed: 1 + Math.floor(random() * 1e6) };
}

/** How busy a ground's birds are in a month against October: a September
 * slough loud with blackbirds, a January prairie with only the larks. */
export function seasonActivity(areaId: string | undefined, month: Month): number {
  const birds = (areaId && GROUND_BIRDS[areaId]?.birds) || [];
  const total = (m: Month) => birds.reduce((sum, bird) => sum + bird.weight * (bird.months?.[m] ?? 1), 0);
  const october = total('October');
  return october > 0 ? Math.max(.4, Math.min(1.6, total(month) / october)) : 1;
}

/** Seconds until the land's next bird calls: quick at first light, long at midday, longer in the dead of winter. */
export function groundBirdWait(areaId: string | undefined, hour: TimeOfDay, random: () => number, month: Month = 'October'): number {
  const ground = areaId ? GROUND_BIRDS[areaId] : undefined;
  return ground ? ground.interval / ((BIRD_ACTIVITY[hour] ?? 1) * seasonActivity(areaId, month)) * (.45 + random() * 1.1) : Infinity;
}

/** What the quarry says, and when. */
export interface QuarryVoice {
  /** Calls as it goes up, some of the time. */
  readonly flush?: { readonly call: BirdCallId; readonly chance: number };
  /** A scattered covey calling itself back together, from where its singles went down. */
  readonly gather?: BirdCallId;
  /** A covey not yet found, calling on its own at these hours, heard this far, m. */
  readonly covey?: { readonly call: BirdCallId; readonly hours: Partial<Record<TimeOfDay, number>>; readonly range: number };
}
export const QUARRY_VOICES: Readonly<Record<string, QuarryVoice>> = {
  // Bobwhite coveys call at first light; scattered singles call "hoy-poo".
  bobwhite: { gather: 'bobwhite-assembly', covey: { call: 'bobwhite-covey', hours: { dawn: 1, morning: .3 }, range: 380 } },
  // Chukar talk all day off the rocks, squeal going up and rally after.
  chukar: { flush: { call: 'chukar-flush', chance: .7 }, gather: 'chukar-rally',
    covey: { call: 'chukar-rally', hours: { dawn: 1, morning: .8, noon: .25, evening: .7, lastlight: .5 }, range: 520 } },
  // Huns go up squealing like a rusty gate, and call the same way after.
  hun: { flush: { call: 'hun-flush', chance: .85 }, gather: 'hun-call' },
  sharptail: { flush: { call: 'sharptail-flush', chance: .75 } },
  'prairie-chicken': { flush: { call: 'prairie-chicken-flush', chance: .5 } },
};

/** Whether this bird calls going up: the same answer for the same voice seed. */
export function callsOnFlush(speciesId: string, seed: number): boolean {
  const flush = QUARRY_VOICES[speciesId]?.flush;
  if (!flush) return false;
  const roll = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return roll / 0x100000000 < flush.chance;
}

/** Every call a ground can make, to prepare ahead: its own birds and its quarry's voices. */
export function groundCalls(areaId: string | undefined, speciesIds: readonly string[]): { calls: BirdCallId[]; flocks: FlockId[] } {
  const calls = new Set<BirdCallId>(), flocks = new Set<FlockId>();
  for (const bird of (areaId && GROUND_BIRDS[areaId]?.birds) || []) 'flock' in bird ? flocks.add(bird.flock) : calls.add(bird.call);
  for (const id of speciesIds) {
    const voice = QUARRY_VOICES[id];
    if (voice?.flush) calls.add(voice.flush.call);
    if (voice?.gather) calls.add(voice.gather);
    if (voice?.covey) calls.add(voice.covey.call);
  }
  return { calls: [...calls], flocks: [...flocks] };
}

export interface HeardBird { id: number; coveyId: number; speciesId: string; x: number; z: number; distance: number }

/**
 * A scattered covey calling itself back together. From a little while after
 * the flush, now one single and now another calls from where it went down,
 * for a few minutes, as the real birds do; the hunter can walk to the sound.
 */
export class CoveyGathering {
  private readonly coveys = new Map<number, { since: number; next: number }>();
  static readonly START_S: readonly [number, number] = [30, 75];
  static readonly EVERY_S: readonly [number, number] = [14, 32];
  static readonly FOR_S = 240;
  static readonly RANGE_M = 360;

  constructor(private readonly random: () => number) {}

  /** Singles still hidden, with their distance from the hunter; returns the one that calls now, if any. */
  update(time: number, singles: readonly HeardBird[]): (HeardBird & { call: BirdCallId }) | null {
    const between = ([low, high]: readonly [number, number]) => low + (high - low) * this.random();
    const present = new Set<number>();
    let heard: (HeardBird & { call: BirdCallId }) | null = null;
    for (const single of singles) {
      const gather = QUARRY_VOICES[single.speciesId]?.gather;
      if (!gather) continue;
      present.add(single.coveyId);
      let covey = this.coveys.get(single.coveyId);
      if (!covey) { covey = { since: time, next: time + between(CoveyGathering.START_S) }; this.coveys.set(single.coveyId, covey); }
      if (heard || time < covey.next || time > covey.since + CoveyGathering.FOR_S) continue;
      const callers = singles.filter(bird => bird.coveyId === single.coveyId && bird.distance < CoveyGathering.RANGE_M);
      covey.next = time + between(CoveyGathering.EVERY_S);
      if (!callers.length) continue;
      const caller = callers[Math.floor(this.random() * callers.length)];
      heard = { ...caller, call: gather };
    }
    // A covey whose singles are all found is done gathering.
    for (const id of [...this.coveys.keys()]) if (!present.has(id)) this.coveys.delete(id);
    return heard;
  }
}

/**
 * Coveys not yet found, calling on their own: bobwhite at first light,
 * chukar off the rocks through the day. Rare, and only from real coveys.
 */
export class CoveyCalls {
  private next: number;
  static readonly EVERY_S: readonly [number, number] = [45, 110];

  constructor(private readonly random: () => number, start = 0) {
    this.next = start + 12 + random() * 25;
  }

  update(time: number, hour: TimeOfDay, coveys: readonly HeardBird[]): (HeardBird & { call: BirdCallId }) | null {
    if (time < this.next) return null;
    const [low, high] = CoveyCalls.EVERY_S;
    this.next = time + low + (high - low) * this.random();
    const callers = coveys.filter(bird => {
      const covey = QUARRY_VOICES[bird.speciesId]?.covey;
      return covey && bird.distance < covey.range && this.random() < (covey.hours[hour] ?? 0);
    });
    if (!callers.length) return null;
    const caller = callers[Math.floor(this.random() * callers.length)];
    return { ...caller, call: QUARRY_VOICES[caller.speciesId].covey!.call };
  }
}
