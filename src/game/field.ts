import type { RNG, Vec2 } from './types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Logical field size — matches the game's internal resolution for now. */
export const FIELD_BOUNDS: Rect = { x: 0, y: 0, w: 480, h: 270 };

export function randomPointIn(rect: Rect, rng: RNG): Vec2 {
  return { x: rect.x + rng() * rect.w, y: rect.y + rng() * rect.h };
}
