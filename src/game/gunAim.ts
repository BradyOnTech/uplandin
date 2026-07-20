/**
 * First-person shotgun presentation for the flush view — the v3 "FPS
 * natural" model. The sprite is authored in PERSPECTIVE (from behind,
 * barrels receding to a tiny muzzle, DOOM-style), so the pose math must
 * SWAY, not swing: a held gun translates with your aim and leans only a
 * few degrees — rotation is what a stick does. Anchored bottom-center-
 * right (the BF1 hip-fire composition); the muzzle tops out around the
 * horizon so the upper sky — where every bird flies — stays untouched.
 *
 * Pure math, no Phaser. FlushScene owns the sprite; docs/TUNING.md and
 * ART.md carry the knobs and the painted-sprite spec.
 */

export type GunPose = {
  /** Screen position of the sprite anchor (bottom-center of the gun). */
  x: number;
  y: number;
  /** Degrees of lean; a held gun never exceeds a slight tilt. */
  angleDeg: number;
  /** 0 = lowered rest, 1 = fully mounted into the aim. */
  mount: number;
};

/** Rest: hip carry — most of the gun below the frame, a touch right of center. */
export const GUN_REST: GunPose = { x: 300, y: 346, angleDeg: 0, mount: 0 };

/** Mounted: the gun rises into frame; the muzzle reaches toward the horizon. */
export const GUN_MOUNT_Y = 306;

/** How far the anchor slides horizontally with the aim (fraction of aim offset). */
export const GUN_SWAY_X = 0.22;
/** The anchor never strays further than this from its base x. */
export const GUN_SWAY_MAX = 46;
/** Max lean, degrees — beyond this the illusion of holding breaks. */
export const GUN_LEAN_MAX = 6;

/** Muzzle tip in sprite-local px, measured from the anchor (bottom-center). */
export const GUN_MUZZLE_OFFSET = { x: -5, y: -126 };

/** Recoil: a sharp kick that settles fast. */
export const RECOIL_MS = 150;
export const RECOIL_KICK_PX = 7;
export const RECOIL_KICK_DEG = 2.5;

/** Slight lean toward the aim — sway, never swing. */
export function leanDeg(anchorX: number, aimX: number, mount: number): number {
  const raw = (aimX - anchorX) * 0.035 * Math.max(0, Math.min(1, mount));
  return Math.max(-GUN_LEAN_MAX, Math.min(GUN_LEAN_MAX, raw));
}

/** Linear blend of rest → mounted pose for a given mount factor [0,1]. */
export function blendGunPose(mount: number, aimX: number, _aimY: number): GunPose {
  const m = Math.max(0, Math.min(1, mount));
  const sway = Math.max(-GUN_SWAY_MAX, Math.min(GUN_SWAY_MAX, (aimX - 240) * GUN_SWAY_X));
  const x = GUN_REST.x + sway * m;
  const y = GUN_REST.y + (GUN_MOUNT_Y - GUN_REST.y) * m;
  return { x, y, angleDeg: leanDeg(x, aimX, m), mount: m };
}

/**
 * Exponential lag toward a target mount/aim. `dtSec` is frame delta;
 * `rate` ~ how fast mount catches (higher = snappier).
 */
export function stepGunPose(
  current: GunPose,
  aimX: number,
  aimY: number,
  wantMounted: boolean,
  dtSec: number,
  rate = 9,
): GunPose {
  const targetMount = wantMounted ? 1 : 0;
  const alpha = 1 - Math.exp(-rate * Math.max(0, dtSec));
  const mount = current.mount + (targetMount - current.mount) * alpha;
  const target = blendGunPose(mount, aimX, aimY);
  const angleDeg = current.angleDeg + (target.angleDeg - current.angleDeg) * Math.min(1, alpha * 1.25);
  const x = current.x + (target.x - current.x) * alpha;
  const y = current.y + (target.y - current.y) * alpha;
  return { x, y, angleDeg, mount };
}

/**
 * Recoil offset for a shot fired `msAgo` ms in the past: an instant kick
 * down-and-tilted that eases back to zero. Add to the posed sprite.
 */
export function recoilOffset(msAgo: number): { dy: number; dAngleDeg: number } {
  if (msAgo < 0 || msAgo >= RECOIL_MS) return { dy: 0, dAngleDeg: 0 };
  const t = 1 - msAgo / RECOIL_MS; // 1 at impact → 0 settled
  const ease = t * t;
  return { dy: RECOIL_KICK_PX * ease, dAngleDeg: RECOIL_KICK_DEG * ease };
}

/**
 * Pick a flush backdrop index from a pool using a stable seed
 * (hunt wind bits + flush bird id sum) so the same rise is repeatable.
 */
export function pickBackdropIndex(poolSize: number, seed: number): number {
  if (poolSize <= 0) return 0;
  const s = Math.abs(Math.floor(seed)) >>> 0;
  return s % poolSize;
}

/** Whether this flush should draw shot-blocking mid-ground brush (deterministic). */
export function flushHasVegBlock(seed: number): boolean {
  return (Math.abs(Math.floor(seed)) >>> 0) % 5 < 2; // ~40% of rises
}
