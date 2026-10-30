import type { ImpactSurface } from './coverEruption';

/**
 * How a shot bird reads coming down, at 20–40 m on both tiers (October 2026):
 * the wings collapse in from where the shot found them and it tumbles as a
 * ball; a puff of its own feathers, sized for the range the way the bird is;
 * dead weight bounces once off hard ground, swishes into cattails or splashes
 * into water; and a wing-tipped bird that comes down alive runs with its legs
 * striding in turn, not sliding. Pure numbers; birds.ts draws them.
 */

/** The fold eases in over this long from the wings' pose at the shot. */
export const COLLAPSE_MS = 140;
/** A dead bird striking hard ground faster than this bounces once... */
export const BOUNCE_MIN_MPS = 2.5;
/** ...keeping this share of its downward speed, at most this much. */
export const BOUNCE_SHARE = .3;
export const BOUNCE_MAX_MPS = 2.4;

/** A tumbling bird balls up: shorter nose to tail, a little deeper. */
export function fallBall(collapse: number): { x: number; y: number; z: number } {
  const k = Math.max(0, Math.min(1, collapse));
  return { x: 1 - .06 * k, y: 1 + .1 * k, z: 1 - .24 * k };
}

/** A bird's heft for its thump: a quail barely taps, a rooster lands like a sack. */
export function fallWeight(speciesId: string): number {
  if (speciesId === 'ringneck') return 1;
  if (speciesId === 'sharptail' || speciesId === 'prairie-chicken' || speciesId.endsWith('grouse')) return .75;
  if (speciesId === 'chukar' || speciesId === 'hun') return .4;
  if (speciesId === 'woodcock') return .25;
  return .15;
}

/** Feathers in a puff smaller than this many pixels vanish on a phone. */
export const FEATHER_MIN_PX = 3;
/** A feather's world size up close, metres. */
export const FEATHER_SIZE_M = .085;

/**
 * The hit's feather puff for a bird `distanceM` off: each feather at least
 * FEATHER_MIN_PX across on a `viewHeight`-pixel screen, and the puff spread
 * by the bird's own readability enlargement, so it reads as far off as the
 * bird does. `size` is a PointsMaterial size with attenuation: three draws a
 * point `size * viewHeight / 2 / depth` pixels across, whatever the lens.
 */
export function featherPuffSize(distanceM: number, enlarge: number, viewHeight: number): { size: number; spread: number } {
  const depth = Math.max(1, Number.isFinite(distanceM) ? distanceM : 1), grow = Math.max(1, enlarge);
  const minSize = FEATHER_MIN_PX * depth / (Math.max(1, viewHeight) / 2);
  return { size: Math.max(FEATHER_SIZE_M * grow, minSize), spread: Math.sqrt(grow) };
}

/** What a falling bird strikes: water, cattails and heavy reeds, or ground. */
export function impactSurface(waterDepth: number, ground?: { moisture: number; vegetation: number }): ImpactSurface {
  if (waterDepth > .05) return 'water';
  if (ground && ground.moisture >= .6 && ground.vegetation >= .7) return 'reeds';
  return 'ground';
}

/** A runner's stride, world metres: each leg comes through once per stride. */
export function strideLength(speciesId: string): number {
  if (speciesId === 'ringneck') return .3;
  if (speciesId === 'sharptail' || speciesId === 'prairie-chicken' || speciesId.endsWith('grouse')) return .24;
  if (speciesId === 'chukar' || speciesId === 'hun') return .18;
  return .13;
}
