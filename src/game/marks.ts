/**
 * The hunter's marks: where he watched a missed bird go down.
 *
 * A real hunter marks a bird down by eye. He watches it set its wings and
 * drop in, notes the spot against the land (the plum thicket, the cairn, the
 * bend of the draw) and walks there with the dog for the single. On a phone
 * a bird setting down 150 m off is a pixel or two, so the game keeps what his
 * eyes would have kept: the spot where he saw it go in, or, if cover hid the
 * last of it, where its glide was taking it, and which way it was flying. A
 * mark fades from
 * memory after a few minutes; it is settled when its birds rise again (the
 * follow-up) or turn out not to be there.
 *
 * Pure: the birds subsystem reports what the hunter saw, the HUD shows the
 * latest mark, and a cast the way he faces sends the dog to the mark it means.
 */
import type { Rect } from './field';
import type { Vec2 } from './types';
import { OPEN_COUNTRY_SINGLES } from './birds';

export interface HunterMark {
  id: number;
  /** World metres: where he saw it go down, or where its glide was taking it when he lost it. */
  x: number; z: number;
  /** World bearing (atan2(z, x)) it was flying as it went in. */
  heading: number;
  /** The birds down there. */
  birdIds: number[];
  speciesId: string;
  /** Watched all the way to the ground (else lost behind cover going in). */
  toGround: boolean;
  /** A covey that came back round and set down together (a Hun circle-back). */
  covey: boolean;
  /** Hunt clock (ms) when he marked it, or last added a bird to it. */
  setMs: number;
}

/** He marks birds going down this far off (metres): about as far as an eye
 * follows a quail or a chukar to the ground. */
export const MARK_RANGE_M = 250;
/** A bird down this near a mark joins it ("three went in by the cairn"). */
export const MARK_JOIN_M = 30;
/** A mark he has not walked to fades from memory after this long. */
export const MARK_MEMORY_MS = 240_000;
/** He marked it if he saw it going in within this long of it touching down:
 * a bobwhite seen to set its wings and drop behind a plum thicket is marked
 * by its line and its glide, though the thicket hid the last of it. */
export const MARK_SIGHT_MS = 2500;
/** The farthest he carries a lost bird's glide on to where it went down (m). */
export const MARK_GLIDE_M = 30;
/** A cast this near the bearing of a mark (radians, about 25 degrees) goes to it. */
export const MARK_CAST_CONE = 25 * Math.PI / 180;

/**
 * Would a bird that set down here still be there to hunt? The simulation's
 * own rules: a single (birds.ts relightSurvivors) is kept inside the
 * property and in cover, except for birds of open country, whose whole
 * slope or prairie is cover; a covey that circled back (birds.ts circleBack)
 * anywhere inside the property. A mark is never made on a bird the field
 * will not keep.
 */
export function landingHolds(speciesId: string, at: Vec2, bounds: Rect, patches: readonly Rect[], covey = false): boolean {
  if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) return false;
  if (at.x < bounds.x || at.x > bounds.x + bounds.w || at.y < bounds.y || at.y > bounds.y + bounds.h) return false;
  return covey || OPEN_COUNTRY_SINGLES.has(speciesId) || patches.some(p => at.x >= p.x && at.x <= p.x + p.w && at.y >= p.y && at.y <= p.y + p.h);
}

/**
 * Where a gliding bird he loses sight of is going down: carried on along its
 * line by its height over the ground at the rate it was sinking, as an eye
 * reads a glide, at most MARK_GLIDE_M; where it was if it was not sinking.
 * `at` is its position (world metres), `ground` the ground under it.
 */
export function glideMark(at: { x: number; y: number; z: number }, vx: number, vy: number, vz: number, ground: number): { x: number; z: number } {
  const across = Math.hypot(vx, vz), height = Math.max(0, at.y - ground);
  if (vy >= -.2 || across < .5) return { x: at.x, z: at.z };
  const carry = Math.min(MARK_GLIDE_M, height / -vy * across);
  return { x: at.x + vx / across * carry, z: at.z + vz / across * carry };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class MarkBook {
  private list: HunterMark[] = [];
  private nextId = 1;

  constructor(private readonly memoryMs = MARK_MEMORY_MS) {}

  get marks(): readonly HunterMark[] { return this.list; }

  /** He saw a bird go down here. It joins a mark close by, or makes a new one. */
  add(birdId: number, at: { x: number; z: number }, heading: number, speciesId: string, toGround: boolean, nowMs: number,
    covey = false): HunterMark {
    this.release(birdId);
    const near = this.list.find(mark => mark.speciesId === speciesId && Math.hypot(mark.x - at.x, mark.z - at.z) <= MARK_JOIN_M);
    if (near) {
      // The mark sits between the birds he saw go in there.
      const n = near.birdIds.length;
      near.x = (near.x * n + at.x) / (n + 1); near.z = (near.z * n + at.z) / (n + 1);
      near.birdIds.push(birdId); near.toGround ||= toGround; near.covey ||= covey; near.setMs = nowMs; near.heading = heading;
      return near;
    }
    const mark: HunterMark = { id: this.nextId++, x: at.x, z: at.z, heading, birdIds: [birdId], speciesId, toGround, covey, setMs: nowMs };
    this.list.push(mark);
    return mark;
  }

  /** A bird rose again (the follow-up), or turned out not to be there: it
   * leaves its mark, and a mark with no birds left is settled. */
  release(birdId: number): void {
    for (const mark of this.list) mark.birdIds = mark.birdIds.filter(id => id !== birdId);
    this.list = this.list.filter(mark => mark.birdIds.length > 0);
  }

  /** Keep only the birds `holds` says are still down where he marked them. */
  prune(holds: (birdId: number) => boolean): void {
    for (const mark of this.list) mark.birdIds = mark.birdIds.filter(holds);
    this.list = this.list.filter(mark => mark.birdIds.length > 0);
  }

  /** Marks older than his memory are forgotten. */
  forget(nowMs: number): void {
    this.list = this.list.filter(mark => nowMs - mark.setMs < this.memoryMs);
  }

  /** The mark he made last: the one the HUD keeps in view. */
  latest(): HunterMark | null {
    let best: HunterMark | null = null;
    for (const mark of this.list) if (!best || mark.setMs > best.setMs || (mark.setMs === best.setMs && mark.id > best.id)) best = mark;
    return best;
  }

  /** How sure he still is of a mark: 1 when fresh, easing to 0 as it fades. */
  freshness(mark: HunterMark, nowMs: number): number {
    const age = Math.max(0, nowMs - mark.setMs) / this.memoryMs;
    return age >= 1 ? 0 : age < .5 ? 1 : 1 - (age - .5) * 2;
  }

  /**
   * The mark a cast the way he faces means: within MARK_CAST_CONE of his
   * facing (a world bearing) and within `reach` metres, the nearest such.
   */
  aimedAt(from: { x: number; z: number }, facing: number, reach: number): HunterMark | null {
    let best: HunterMark | null = null, bestRange = Infinity;
    for (const mark of this.list) {
      const dx = mark.x - from.x, dz = mark.z - from.z, range = Math.hypot(dx, dz);
      if (range > reach || range >= bestRange) continue;
      // Standing on it, any facing means it.
      if (range > 4 && Math.abs(wrap(Math.atan2(dz, dx) - facing)) > MARK_CAST_CONE) continue;
      best = mark; bestRange = range;
    }
    return best;
  }

  clear(): void { this.list = []; }
}
