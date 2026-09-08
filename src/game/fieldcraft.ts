import type { Vec2 } from './types';

/**
 * Fieldcraft: situational hunting knowledge as mechanics. Slope is the
 * chukar rule — they run uphill and fly downhill, so the tactic is to get
 * above them: a covey approached from uphill holds (its escape route is
 * cut off) and the flush drops away below you for an open shot. From
 * below, nerve drains fast and the flush rockets overhead.
 */

export type SlopeApproach = 'above' | 'below' | 'level';

/** Where the hunter stands relative to a bird on a sloped covert. */
export function slopeApproach(
  slopeAngle: number | undefined,
  hunterPos: Vec2,
  birdPos: Vec2,
): SlopeApproach | null {
  if (slopeAngle === undefined) return null;
  const dx = hunterPos.x - birdPos.x;
  const dy = hunterPos.y - birdPos.y;
  const d = Math.hypot(dx, dy);
  if (d === 0) return 'level';
  const uphillness = (dx * Math.cos(slopeAngle) + dy * Math.sin(slopeAngle)) / d;
  return uphillness > 0.35 ? 'above' : uphillness < -0.35 ? 'below' : 'level';
}

/**
 * Resolve the slope tactic only for a species that owns it. A mountain
 * property can contain several birds, but Chukar's above/below advantage must
 * not become a map-wide modifier for blue grouse or other bycatch.
 */
export function speciesSlopeApproach(
  species: { flightDirection?: 'none' | 'downhill' } | undefined,
  slopeAngle: number | undefined,
  hunterPos: Vec2,
  birdPos: Vec2,
): SlopeApproach | null {
  return species?.flightDirection === 'downhill'
    ? slopeApproach(slopeAngle, hunterPos, birdPos)
    : null;
}

/** Nerve drain while pointed: cut off from above, jumpy from below. */
export function slopeNerveMult(approach: SlopeApproach | null): number {
  return approach === 'above' ? 0.6 : approach === 'below' ? 1.4 : 1;
}

/** Escape flight: shooting down the hill is slower and more open; from below they rocket. */
export function slopeFlightMult(approach: SlopeApproach | null): number {
  return approach === 'above' ? 0.82 : approach === 'below' ? 1.15 : 1;
}

export const FLANK_NERVE_MULT = 0.75;

/**
 * Walk-in craft: flanking the point — coming in from the far side of the
 * bird instead of over the dog's back — presents a cleaner flush. True
 * when the bird sits between hunter and dog (the pincer).
 */
export function isFlanking(hunterPos: Vec2, dogPos: Vec2, birdPos: Vec2): boolean {
  const hx = hunterPos.x - birdPos.x;
  const hy = hunterPos.y - birdPos.y;
  const dx = dogPos.x - birdPos.x;
  const dy = dogPos.y - birdPos.y;
  const hd = Math.hypot(hx, hy);
  const dd = Math.hypot(dx, dy);
  if (hd === 0 || dd === 0) return false;
  return (hx * dx + hy * dy) / (hd * dd) < -0.2;
}
