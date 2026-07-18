import type { Vec2 } from './types';

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
