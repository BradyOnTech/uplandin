import type { RNG, Vec2 } from './types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the player sees at once — the game's internal resolution. */
export const VIEWPORT = { w: 480, h: 270 };

/**
 * Default world bounds. Real hunts use the area's (larger) world; this keeps
 * bounds-taking sim code runnable standalone and in tests.
 */
export const FIELD_BOUNDS: Rect = { x: 0, y: 0, w: 480, h: 270 };

export function randomPointIn(rect: Rect, rng: RNG): Vec2 {
  return { x: rect.x + rng() * rect.w, y: rect.y + rng() * rect.h };
}

export interface ScatterSpec {
  count: number;
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
}

const SCATTER_MARGIN = 10; // keep cover off the very edge of the world

/** Scatter cover patches (or any rects) across a world. Overlap is fine — it reads as thicker cover. */
export function scatterRects(bounds: Rect, spec: ScatterSpec, rng: RNG): Rect[] {
  const rects: Rect[] = [];
  for (let i = 0; i < spec.count; i++) {
    const w = spec.minW + rng() * (spec.maxW - spec.minW);
    const h = spec.minH + rng() * (spec.maxH - spec.minH);
    rects.push({
      x: bounds.x + SCATTER_MARGIN + rng() * (bounds.w - w - SCATTER_MARGIN * 2),
      y: bounds.y + SCATTER_MARGIN + rng() * (bounds.h - h - SCATTER_MARGIN * 2),
      w,
      h,
    });
  }
  return rects;
}
