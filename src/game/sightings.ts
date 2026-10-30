/**
 * Birds before the flush: the real hidden birds, drawn only where a hunter
 * would see them, and rarely enough to feel found, not staged.
 *
 * - **A rooster on the move crossing a two-track**, or running down it ahead
 *   of you: a runner rooster on a trail, off the cover.
 * - **Chukar running uphill above you**: a covey's runners, on open slope
 *   (cheat, bunchgrass, bare ground, talus), above the hunter and climbing.
 * - **Sharptails on a dawn skyline**: a covey sitting on a crest at first
 *   light, against the sky from where he stands.
 *
 * Never inside cover: a bird is drawn only where the standing cover is low
 * and he can see it, and it is gone the moment it walks into cover. Pure:
 * the birds subsystem reads the land, the cover and the view, and draws.
 */

export type SightingKind = 'crossing' | 'uphill' | 'skyline';

/** What the birds subsystem knows of a hidden bird at a check. */
export interface SightingCandidate {
  id: number;
  coveyId: number;
  speciesId: string;
  sex?: 'hen' | 'rooster';
  /** World metres, on the ground. */
  x: number; z: number; ground: number;
  /** How far it moved since the last check (m), and how much it climbed (m). */
  moved: number; climbed: number;
  /** Distance from the hunter's eye, flat (m), and his height under it. */
  range: number; hunterGround: number;
  /** Standing cover's crown here (m) and whether the ground is open for its kind of bird. */
  crown: number; open: boolean;
  /** Distance to the nearest trail or two-track (m). */
  trackM: number;
  /** In his view with nothing between, and (for a bird on a crest) the sky behind it. */
  inSight: boolean; skyBehind: boolean;
  /** The ground falls away on every side within 20 m: a crest or knoll. */
  onCrest: boolean;
}

/** Cover this tall (m) hides a bird on the ground. */
export const SIGHT_COVER_M = .6;
/** A runner has to be moving at least this much between checks (m). */
const MOVING_M = .25;
/** The ranges (m) each kind of sighting is seen at. */
const RANGE: Record<SightingKind, readonly [number, number]> = { crossing: [12, 110], uphill: [20, 160], skyline: [45, 170] };
/** At most this many sightings a hunt, at least this long apart (ms), and none longer than this. */
export const SIGHTINGS_PER_HUNT = 5;
export const SIGHTING_GAP_MS = 45_000;
export const SIGHTING_MAX_MS: Record<SightingKind, number> = { crossing: 14_000, uphill: 14_000, skyline: 40_000 };

/** The kind of sighting this bird is, now, if any. */
export function sightingKind(bird: SightingCandidate, dawn: boolean): SightingKind | null {
  if (!bird.inSight || bird.crown >= SIGHT_COVER_M) return null;
  const within = (kind: SightingKind) => bird.range >= RANGE[kind][0] && bird.range <= RANGE[kind][1];
  if (bird.speciesId === 'ringneck' && bird.sex === 'rooster' && bird.moved >= MOVING_M && bird.trackM <= 3 && within('crossing')) return 'crossing';
  if (bird.speciesId === 'chukar' && bird.open && bird.moved >= MOVING_M && bird.climbed > 0
    && bird.ground > bird.hunterGround + 3 && within('uphill')) return 'uphill';
  if (bird.speciesId === 'sharptail' && dawn && bird.open && bird.moved < MOVING_M && bird.onCrest && bird.skyBehind && within('skyline')) return 'skyline';
  return null;
}

/** Whether a shown bird stays shown: still in sight, out of cover, and its kind still holds loosely. */
export function sightingHolds(bird: SightingCandidate, kind: SightingKind): boolean {
  if (bird.crown >= SIGHT_COVER_M || !bird.inSight) return false;
  if (kind === 'skyline') return bird.range <= RANGE.skyline[1] + 20;
  return bird.range <= RANGE[kind][1] + 20;
}

/** Keeps sightings rare: one group at a time, a gap after each, a few a hunt. */
export class SightingClock {
  private shown = 0;
  private endedMs = -Infinity;
  private active: { kind: SightingKind; coveyId: number; sinceMs: number } | null = null;

  get current(): { kind: SightingKind; coveyId: number; sinceMs: number } | null { return this.active; }
  get count(): number { return this.shown; }

  /** May a new sighting begin now? */
  mayBegin(nowMs: number): boolean {
    return !this.active && this.shown < SIGHTINGS_PER_HUNT && nowMs - this.endedMs >= SIGHTING_GAP_MS;
  }

  begin(kind: SightingKind, coveyId: number, nowMs: number): void {
    this.active = { kind, coveyId, sinceMs: nowMs };
    this.shown++;
  }

  /** Has the active sighting run its time? */
  expired(nowMs: number): boolean {
    return !!this.active && nowMs - this.active.sinceMs >= SIGHTING_MAX_MS[this.active.kind];
  }

  end(nowMs: number): void {
    if (!this.active) return;
    this.active = null;
    this.endedMs = nowMs;
  }
}
