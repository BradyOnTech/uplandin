import type { RNG, Vec2 } from './types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Logical field size — matches the game's internal resolution for now. */
export const FIELD_BOUNDS: Rect = { x: 0, y: 0, w: 480, h: 270 };

/** Patches of cover where birds like to sit. */
export const COVER_PATCHES: Rect[] = [
  { x: 30, y: 30, w: 70, h: 45 },
  { x: 150, y: 20, w: 60, h: 40 },
  { x: 300, y: 35, w: 80, h: 50 },
  { x: 410, y: 60, w: 50, h: 60 },
  { x: 60, y: 130, w: 65, h: 50 },
  { x: 200, y: 120, w: 75, h: 55 },
  { x: 350, y: 150, w: 70, h: 45 },
  { x: 120, y: 210, w: 60, h: 40 },
  { x: 260, y: 205, w: 80, h: 45 },
];

export function randomPointIn(rect: Rect, rng: RNG): Vec2 {
  return { x: rect.x + rng() * rect.w, y: rect.y + rng() * rect.h };
}
