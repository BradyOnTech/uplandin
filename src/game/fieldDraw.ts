/**
 * Pure helpers for organic field cover drawing.
 * Sim patch rects stay axis-aligned; the renderer uses these to stamp
 * ragged cores and mid-tone fringes so the field reads like a mockup, not
 * Minecraft grass boxes.
 */
import type { Rect } from './field';

/** Deterministic 0..1 hash for a tile cell (no allocation). */
export function cellNoise(tx: number, ty: number, salt = 0): number {
  let n = (tx * 374761393 + ty * 668265263 + salt * 1274126177) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967296;
}

/**
 * True if tile center (or any world point) sits in the dark cover *core*.
 * Shrinks the patch by `inset` then carves the rim with noise so the
 * silhouette is ragged while the interior stays solid hide-here.
 */
export function inRaggedCoverCore(
  wx: number,
  wy: number,
  patch: Rect,
  inset = 14,
  carve = 0.38,
): boolean {
  // Outside the sim rect: never cover (sim truth for dog AI uses patches
  // separately; this is visual-only but must stay inside the rect bounds).
  if (wx < patch.x || wy < patch.y || wx >= patch.x + patch.w || wy >= patch.y + patch.h) {
    return false;
  }
  const x0 = patch.x + inset;
  const y0 = patch.y + inset;
  const x1 = patch.x + patch.w - inset;
  const y1 = patch.y + patch.h - inset;
  const tx = Math.floor(wx / 16);
  const ty = Math.floor(wy / 16);
  // Outer band of the rect: sparse islands only — breaks the AABB silhouette.
  if (wx < x0 || wy < y0 || wx >= x1 || wy >= y1) {
    return cellNoise(tx, ty, 11) > 0.62;
  }
  // Deep interior: solid cover with occasional light gaps (paths through).
  const distEdge = Math.min(wx - x0, x1 - wx, wy - y0, y1 - wy);
  if (distEdge < 16) {
    // Wide ragged rim — more carve near the outer edge of the inset.
    const t = distEdge / 16;
    const thresh = carve + (1 - t) * 0.22;
    return cellNoise(tx, ty, 3) > thresh;
  }
  // Interior gaps so cover reads as clumps, not a painted rectangle.
  return cellNoise(tx, ty, 19) > 0.12;
}

/**
 * Mid-tone fringe: outside the ragged core but within an expanded pad of
 * the sim rect — soft olive "transition grass" like the mockup.
 */
export function inCoverFringe(
  wx: number,
  wy: number,
  patch: Rect,
  pad = 18,
  inset = 14,
): boolean {
  if (
    wx < patch.x - pad ||
    wy < patch.y - pad ||
    wx >= patch.x + patch.w + pad ||
    wy >= patch.y + patch.h + pad
  ) {
    return false;
  }
  if (inRaggedCoverCore(wx, wy, patch, inset)) return false;
  const tx = Math.floor(wx / 16);
  const ty = Math.floor(wy / 16);
  // Soften fringe density — irregular transition grass, not a solid ring.
  return cellNoise(tx, ty, 7) > 0.32;
}
