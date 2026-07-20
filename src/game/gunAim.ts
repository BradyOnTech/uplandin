/**
 * First-person shotgun presentation for the flush view.
 * You see the barrel from behind (rib + muzzle bead), bottom of the screen —
 * "looking down the barrel" without covering the whole sky.
 *
 * Sprite is drawn with origin at the near end (bottom); barrel extends
 * toward the top of the image (into the playfield). Angle 0 = upright.
 */

export type GunPose = {
  /** Screen position of the near pivot (bottom of barrel / forend). */
  x: number;
  y: number;
  /** Degrees; 0 = barrel straight up into the sky; ± tilts toward aim. */
  angleDeg: number;
  /** 0 = lowered rest, 1 = fully mounted into the aim. */
  mount: number;
};

/**
 * The hunter's-eye gun: anchored off the BOTTOM-RIGHT corner, barrels
 * running diagonally up-left across the frame — stock and hand tucked into
 * the corner, muzzle reaching toward the aim. (The reference look: a real
 * over-the-shoulder POV, not a dead-center Doom column.)
 */
export const GUN_REST: GunPose = { x: 506, y: 318, angleDeg: -27, mount: 0 };

/** Mounted: the gun slides up-left out of the corner; more of it in frame. */
export const GUN_MOUNT_Y = 290;
export const GUN_MOUNT_X = 478;
/** Base lean of the barrels out of the corner (degrees; negative = up-left). */
export const GUN_BASE_ANGLE = -35;

/**
 * Extra lean toward the crosshair, around the base diagonal.
 * Clamped so the gun never stands upright or lays flat.
 */
export function barrelTiltDeg(pivotX: number, aimX: number, mount: number): number {
  // At full mount, ~±18° swing around the base lean; at rest almost none.
  const raw = (aimX - pivotX) * 0.065;
  const max = 4 + 14 * Math.max(0, Math.min(1, mount));
  return Math.max(-max, Math.min(max, raw));
}

/** Linear blend of rest → mounted pose for a given mount factor [0,1]. */
export function blendGunPose(mount: number, aimX: number, _aimY: number): GunPose {
  const m = Math.max(0, Math.min(1, mount));
  // The pivot stays in the corner: mounting slides it up-left a touch and
  // the swing toward the aim comes almost entirely from the angle.
  const mountedX = GUN_MOUNT_X + (aimX - 240) * 0.05;
  const x = GUN_REST.x + (mountedX - GUN_REST.x) * m;
  const y = GUN_REST.y + (GUN_MOUNT_Y - GUN_REST.y) * m;
  const base = GUN_REST.angleDeg * (1 - m) + GUN_BASE_ANGLE * m;
  const angleDeg = Math.max(-50, Math.min(-14, base + barrelTiltDeg(x, aimX, m)));
  return { x, y, angleDeg, mount: m };
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

/** @deprecated use barrelTiltDeg — kept for any external callers/tests. */
export function barrelAngleDeg(pivotX: number, pivotY: number, aimX: number, aimY: number): number {
  const dx = aimX - pivotX;
  const dy = aimY - pivotY;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
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
