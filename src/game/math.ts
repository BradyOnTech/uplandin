import type { RNG, Vec2 } from './types';

/** Small seeded RNG (mulberry32) — stable cover layouts and landmarks per area. */
export function mulberry32(seed: number): RNG {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Rotate `from` toward `to` by at most `maxStep` radians, the short way around. */
export function turnToward(from: number, to: number, maxStep: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + clamp(diff, -maxStep, maxStep);
}

/** Move from `pos` toward `target`, stopping after `maxDist` (and on arrival). */
export function moveToward(pos: Vec2, target: Vec2, maxDist: number): Vec2 {
  const d = dist(pos, target);
  if (d <= maxDist || d === 0) return { x: target.x, y: target.y };
  const t = maxDist / d;
  return {
    x: pos.x + (target.x - pos.x) * t,
    y: pos.y + (target.y - pos.y) * t,
  };
}

const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗']; // screen coords: y points down

/** Compass arrow glyph for an angle in screen coordinates. */
export function windArrow(angle: number): string {
  const i = (((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8);
  return ARROWS[i];
}
