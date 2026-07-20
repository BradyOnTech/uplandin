/**
 * First-person double-barrel shotgun for the flush view (classic FPS weapon
 * sprite: stock large bottom-right, muzzle small upper-left).
 *
 * The gun sits in the lower portion of the screen and tracks the reticle
 * with lag — it must never become a full-height screen wedge.
 */

export type GunPose = {
  /** Screen position of the sprite origin (stock / grip pivot, bottom-right of art). */
  x: number;
  y: number;
  /** Degrees; small tilt so the muzzle leans toward the reticle. */
  angleDeg: number;
  /** 0 = low ready (mostly lower edge), 1 = mounted toward aim. */
  mount: number;
};

/** Low ready: lower-right, slightly clipped under the frame. */
export const GUN_REST: GunPose = { x: 332, y: 300, angleDeg: -6, mount: 0 };

/** Mounted: higher, more centered under the playfield, still lower half only. */
export const GUN_MOUNT = { x: 306, y: 282 };

/**
 * Small tilt so barrels lean toward aim X. Clamped so the gun never lays flat.
 */
export function barrelTiltDeg(pivotX: number, aimX: number, mount: number): number {
  const raw = (aimX - pivotX) * 0.04;
  const max = 6 + 10 * Math.max(0, Math.min(1, mount));
  // Base art already points up-left; tilt is additive.
  return Math.max(-max, Math.min(max, raw));
}

/** Linear blend of rest → mounted pose for a given mount factor [0,1]. */
export function blendGunPose(mount: number, aimX: number, _aimY: number): GunPose {
  const m = Math.max(0, Math.min(1, mount));
  // Track aim X gently so the bead follows the reticle without sliding off-screen.
  const mountedX = GUN_MOUNT.x + (aimX - 240) * 0.18;
  const x = GUN_REST.x + (mountedX - GUN_REST.x) * m;
  const y = GUN_REST.y + (GUN_MOUNT.y - GUN_REST.y) * m;
  const baseAngle = -12; // art default: low ready up toward horizon
  const angleDeg = baseAngle * (1 - m * 0.35) + barrelTiltDeg(x, aimX, m);
  return { x, y, angleDeg, mount: m };
}

/** Muzzle bead of the painted sprite (art/shotgun-fp-v3.png), sprite-local
 * from the anchor at origin (0.72, 1) = cell (65, 130); the bead pixel sits
 * at cell (8, 76). Rotate by the pose angle when placing the flash. */
export const GUN_MUZZLE_OFFSET = { x: -57, y: -54 };

/** GUN_MUZZLE_OFFSET rotated by the sprite's current angle (degrees). */
export function muzzlePoint(x: number, y: number, angleDeg: number): { x: number; y: number } {
  const r = (angleDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return {
    x: x + GUN_MUZZLE_OFFSET.x * c - GUN_MUZZLE_OFFSET.y * s,
    y: y + GUN_MUZZLE_OFFSET.x * s + GUN_MUZZLE_OFFSET.y * c,
  };
}

/** Recoil: a sharp kick that settles fast. */
export const RECOIL_MS = 150;
export const RECOIL_KICK_PX = 7;
export const RECOIL_KICK_DEG = 2.5;

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

/** @deprecated kept for callers that still use full atan2 aiming. */
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
