import type { DogGait, DogScentStage, DogState } from '../game/dog';

export type DogCollarCue = 'bell' | 'beeper';
const INTERVAL: Record<DogCollarCue, number> = { bell: .62, beeper: 1.4 };
const MOVING_STATES: readonly DogState[] = ['quartering', 'tracking', 'breaking', 'retrieving', 'recalled', 'seeking'];

/**
 * The bell tells you what the dog is doing before you see it: a busy ring
 * while it runs, a slower, broken ring as it works scent, a rare tinkle as
 * it creeps in — and silence when it stops.
 */
export function dogBellInterval(state: DogState, gait: DogGait, stage: DogScentStage = 'none'): number {
  if (state === 'tracking' && (stage === 'stalking' || stage === 'locking')) return 1.7;
  if (state === 'tracking') return .9;
  return gait === 'run' ? .42 : INTERVAL.bell;
}

/** The same gear contract as the 2D field: every collar has a movement
 * bell; tier 1 and above add a locate beeper when the dog is on point. */
export function dogCollarMode(state: DogState, gait: DogGait, gearTier: number, moving: boolean): DogCollarCue | null {
  if (state === 'pointing') return gearTier >= 1 ? 'beeper' : null;
  return moving && gait !== 'still' && MOVING_STATES.includes(state) ? 'bell' : null;
}

/** Presentation only: no bird positions, scent strength, random draws or
 * deferred timers. A slow frame emits at most one cue, never a catch-up burst. */
export class DogCollarCadence {
  private mode: DogCollarCue | null = null;
  private remaining = 0;

  advance(dt: number, mode: DogCollarCue | null, pointEvent = false, bellInterval = INTERVAL.bell): DogCollarCue | null {
    if (!(dt > 0) || !Number.isFinite(dt)) return null;
    if (mode !== this.mode) {
      this.mode = mode;
      this.remaining = mode === 'bell' ? INTERVAL.bell : 0;
    }
    if (pointEvent) {
      this.remaining = mode ? INTERVAL[mode] : 0;
      return 'beeper';
    }
    if (!mode) return null;
    this.remaining -= Math.min(dt, .25);
    if (this.remaining > 0) return null;
    this.remaining = mode === 'bell' ? bellInterval : INTERVAL[mode];
    return mode;
  }

  /** Preserve the current state across pause so an existing point does not
   * sound like a newly acquired one when the player resumes. */
  suspend(): void { this.remaining = this.mode ? INTERVAL[this.mode] : 0; }
}

/** Mix distances are presentation choices, not bird-detection radii. The
 * locate tone carries farther than the small bell, with no hard audible edge. */
export function dogCollarGain(kind: DogCollarCue, distanceM: number): number {
  if (!Number.isFinite(distanceM)) return 0;
  const distance = Math.max(0, distanceM);
  const range = kind === 'bell' ? 100 : 160;
  const fade = Math.max(0, Math.min(1, (range - distance) / (range * .25)));
  const smooth = fade * fade * (3 - 2 * fade);
  return (kind === 'bell' ? .16 : 1) * smooth / (1 + distance / (kind === 'bell' ? 18 : 28)) ** 1.5;
}
