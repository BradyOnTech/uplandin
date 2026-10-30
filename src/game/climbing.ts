/**
 * What a climb costs the hunter: slope slows the walk and spends breath, and
 * a trail or a rim break is the easy way up. It costs something without
 * being punishing: a 20% grade halves nothing, a winded hunter still walks,
 * and breath comes back on the level or standing still.
 */

/**
 * Whether a ground charges for the climb. Only grounds built for it do:
 * Chukar Ridge's canyon wall, with its benches, rim breaks and switchback
 * trails. An uphill alone (Timberline Parks' runners) is not a climb.
 */
export function climbCosts(area: { climbing?: boolean }): boolean {
  return area.climbing === true;
}

/** Uphill: speed falls with grade; a trail takes some of the sting out. */
const UPHILL_LINEAR = 1.6;
const UPHILL_SQUARE = 2.5;
const TRAIL_EASE = .35;
/** Downhill: easy at first, then careful footing on the steep. */
const DOWNHILL_EASY = .15;
const DOWNHILL_LINEAR = 1.2;
const DOWNHILL_SQUARE = 2;

/**
 * Walking speed multiplier for a grade along the direction of travel (rise
 * over run, positive uphill) and how much of the step is on a trail (0..1).
 */
export function climbSpeedFactor(gradeAlong: number, onTrail: number): number {
  if (gradeAlong >= 0) {
    const g = gradeAlong * (1 - TRAIL_EASE * Math.max(0, Math.min(1, onTrail)));
    return 1 / (1 + UPHILL_LINEAR * g + UPHILL_SQUARE * g * g);
  }
  const g = -gradeAlong, steep = Math.max(0, g - DOWNHILL_EASY);
  return (1 + .05 * Math.min(g, DOWNHILL_EASY) / DOWNHILL_EASY) / (1 + DOWNHILL_LINEAR * steep + DOWNHILL_SQUARE * steep * steep);
}

/** Metres of steady climbing a rested hunter has in him before he's winded. */
const BREATH_CLIMB_M = 48;
/** Breath spent per second of sprinting, and recovered per second. */
const SPRINT_DRAIN = .035;
const RECOVER_WALKING = .045;
const RECOVER_STANDING = .11;
/** Below this the hunter is winded: slower, and can't run. */
export const WINDED = .3;

export class HunterBreath {
  /** 1 rested, 0 spent. */
  value = 1;
  /** Advance by dt seconds given metres climbed this step and how he moved. */
  step(dt: number, climbedM: number, moving: boolean, running: boolean): void {
    const spent = Math.max(0, climbedM) / BREATH_CLIMB_M + (running ? SPRINT_DRAIN * dt : 0);
    const level = climbedM <= dt * .02;
    const recover = !moving ? RECOVER_STANDING : level && !running ? RECOVER_WALKING : 0;
    this.value = Math.max(0, Math.min(1, this.value - spent + recover * dt));
  }
  /** Speed multiplier from breath: full until winded, then easing to 60%. */
  speedFactor(): number { return this.value >= WINDED ? 1 : .6 + .4 * this.value / WINDED; }
  canRun(): boolean { return this.value > WINDED * .5; }
  winded(): boolean { return this.value < WINDED; }
}
