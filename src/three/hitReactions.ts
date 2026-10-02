import type { BirdFamily } from './subsystems/birds';
import { TOO_CLOSE_M } from './shotFx';

/**
 * How a hit bird comes down (October 2026). The shot decides it, so each
 * reaction tells the hunter something:
 *
 * - `fold`: centred in the pattern. Wings collapse and the bird tumbles out
 *   of the sky along its line of flight.
 * - `tower`: hit in the body. The bird climbs nearly straight up, wings
 *   still beating, then folds at the top and drops. Mostly roosters.
 * - `sail`: hit in the body. Legs drop, the wings set, and the bird glides
 *   on and down before it collapses, often well beyond where it was hit.
 *   Mark it.
 * - `spiral`: taken on the fringe of the pattern, wing-tipped. One wing
 *   folds, the other still beats, and the bird corkscrews down to land
 *   alive and run.
 *
 * All of it is presentation. The simulation counted the bird down (and
 * wounded or not) at the shot, and learns where it lands at touchdown.
 */
export type HitReactionKind = 'fold' | 'tower' | 'sail' | 'spiral';

/** What the shot knew about the hit (shotPattern.ts). */
export interface HitShot {
  /** How far from the pattern's core the bird was: 0 at the core, 1 at its edge. */
  offset: number;
  /** Taken on the fringe or at the limit of range: the bird lands alive. */
  wounded: boolean;
  /** Metres from the muzzle. */
  rangeM: number;
}

/** The bird's flight at the moment of the hit. */
export interface HitFlight {
  /** Metres above the ground. */
  heightM: number;
  /** Horizontal speed, m/s. */
  speedMps: number;
}

export interface HitReaction {
  kind: HitReactionKind;
  /** Bird clock (airMs) at the hit. */
  startMs: number;
  /** tower: seconds of climb; sail: seconds before the bird collapses. */
  holdS: number;
  /** tower: upward speed at the hit, m/s. */
  climbMps: number;
  /** sail: steady sink, m/s. */
  sinkMps: number;
  /** spiral: signed turn, rad/s; the broken wing is on the inside. */
  spin: number;
  /** Heading (rad) at the hit; the spiral turns from it. */
  yaw: number;
  /** A tower or sail has ended: the bird has folded and drops. */
  collapsed: boolean;
}

/** A falling bird's kinematics, world metres and m/s. */
export interface FallBody { x: number; y: number; z: number; vxW: number; vyW: number; vzW: number }

/**
 * Odds of a towering or sailing bird among clean body hits, before the
 * shot's own weighting. Roosters are famous for towering; grouse and
 * partridge more often sail; a quail almost always folds.
 */
export const REACTION_ODDS: Record<BirdFamily, { tower: number; sail: number }> = {
  pheasant: { tower: .22, sail: .2 },
  grouse: { tower: .06, sail: .22 },
  partridge: { tower: 0, sail: .16 },
  chukar: { tower: 0, sail: .16 },
  quail: { tower: 0, sail: .06 },
  woodcock: { tower: .04, sail: .06 },
};

/** Below this height there is no room for anything but a fold. */
export const MIN_REACTION_HEIGHT_M = 1.2;
/** A bird slower than this cannot carry a sail. */
const MIN_SAIL_SPEED_MPS = 6;

const smoothstep = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Which reaction a hit produces. Deterministic for a given rng draw. */
export function chooseHitReaction(family: BirdFamily, shot: HitShot | undefined, flight: HitFlight, rng: () => number): HitReactionKind {
  const roll = rng();
  if (!shot || flight.heightM < MIN_REACTION_HEIGHT_M) return 'fold';
  if (shot.wounded) {
    // The fringe of the pattern breaks a wing; a long-range wound more often
    // leaves the bird gliding down on its legs-down body hit.
    const spiral = shot.offset > .78 ? .7 : .45;
    if (roll < spiral) return 'spiral';
    return flight.speedMps >= MIN_SAIL_SPEED_MPS ? 'sail' : 'spiral';
  }
  // A full pattern at close range folds the bird, every time.
  if (shot.rangeM < TOO_CLOSE_M) return 'fold';
  const odds = REACTION_ODDS[family];
  // The core of the pattern kills clean; nearer its edge the body hits.
  const body = smoothstep(shot.offset, .25, .7);
  const tower = odds.tower * (.35 + .9 * body);
  const sail = flight.speedMps >= MIN_SAIL_SPEED_MPS ? odds.sail * (.3 + body) * (shot.rangeM > 30 ? 1.3 : 1) : 0;
  if (roll < tower) return 'tower';
  if (roll < tower + sail) return 'sail';
  return 'fold';
}

/** The reaction's own numbers, drawn once at the hit. */
export function createHitReaction(kind: HitReactionKind, startMs: number, yaw: number, climbMps: number, rng: () => number): HitReaction {
  const a = rng(), b = rng(), side = rng() < .5 ? -1 : 1;
  return {
    kind, startMs, yaw, collapsed: false,
    holdS: kind === 'tower' ? 1.1 + a * .5 : kind === 'sail' ? 1.3 + a * 1.5 : 0,
    climbMps: kind === 'tower' ? Math.max(climbMps, 6 + b * 1.5) : 0,
    sinkMps: kind === 'sail' ? 1.8 + b * .8 : 0,
    spin: kind === 'spiral' ? side * (5 + b * 2.5) : 0,
  };
}

/** Horizontal drag on a folded bird: small birds shed their speed fastest. */
export function foldDrag(family: BirdFamily): number {
  return family === 'pheasant' ? .65 : family === 'grouse' ? .8 : family === 'quail' ? 1.5 : family === 'woodcock' ? 1 : .95;
}

/** Tumble rate of a folded bird, rad/s about its wing axis. */
export function tumbleRate(family: BirdFamily): number {
  return family === 'pheasant' ? 4.2 : family === 'grouse' ? 5.5 : 7;
}

const dragHorizontal = (body: FallBody, dt: number, drag: number) => {
  const decay = Math.exp(-drag * dt);
  body.x += body.vxW * (1 - decay) / drag;
  body.z += body.vzW * (1 - decay) / drag;
  body.vxW *= decay; body.vzW *= decay;
};

/** Dead weight: the flight's momentum, bled by drag, bent down by gravity. */
export function foldStep(body: FallBody, dt: number, drag: number): void {
  dragHorizontal(body, dt, drag);
  body.y += body.vyW * dt - .5 * 9.81 * dt * dt;
  body.vyW -= 9.81 * dt;
}

/**
 * Advance a hit bird by one tick. `elapsedS` is the time since the hit at
 * the start of the tick. A tower or sail that runs out collapses into a fold.
 */
export function stepHitReaction(body: FallBody, reaction: HitReaction, elapsedS: number, dt: number, family: BirdFamily): void {
  if (reaction.kind === 'fold' || reaction.collapsed) { foldStep(body, dt, foldDrag(family)); return; }
  const end = elapsedS + dt;
  if (reaction.kind === 'tower') {
    // Forward speed dies as the bird stands on its tail and climbs; the
    // climb slows to nothing at the top of the tower.
    dragHorizontal(body, dt, 2.6);
    const t = Math.min(end, reaction.holdS) / reaction.holdS;
    body.vyW = reaction.climbMps * (1 - t);
    body.y += body.vyW * dt;
    if (end >= reaction.holdS) { reaction.collapsed = true; body.vyW = 0; }
    return;
  }
  if (reaction.kind === 'sail') {
    // Wings set: the glide keeps most of its speed and sinks steadily.
    dragHorizontal(body, dt, .28);
    body.vyW += (-reaction.sinkMps - body.vyW) * (1 - Math.exp(-2.2 * dt));
    body.y += body.vyW * dt;
    if (end >= reaction.holdS) reaction.collapsed = true;
    return;
  }
  // Spiral: the beating wing holds the bird up against one that can't; it
  // corkscrews down at a steady rate, drifting off its line.
  dragHorizontal(body, dt, 1.5);
  body.vyW += (-5.5 - body.vyW) * (1 - Math.exp(-3 * dt));
  body.y += body.vyW * dt;
}

/** Feathers a hit knocks loose: a centred hit throws the most. */
export function featherCount(kind: HitReactionKind, offset: number): number {
  if (kind === 'fold') return 8 + Math.round(6 * (1 - Math.min(1, Math.max(0, offset))));
  return kind === 'tower' ? 6 : kind === 'spiral' ? 5 : 4;
}
