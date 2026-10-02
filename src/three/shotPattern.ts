import { NO_SHOT_ASSISTANCE, shotAssistanceAllowance, type ShotAssistanceProfile } from './shotAssistance';

export interface ShotTarget {
  simId: number; x: number; y: number; z: number; status: string;
  /** A hit bird still in the air (towering, sailing or wing-tipped) that a
   * second shot can anchor. */
  anchorable?: boolean;
}
/** A bird the pattern can take: flying, or hit and still coming down under its own power. */
export const shootable = (t: Readonly<ShotTarget>): boolean => t.status === 'flying' || t.anchorable === true;
interface Point { x: number; y: number; z: number }

// Gameplay tuning, not a full pellet/drag simulation. A travelling pattern
// rewards crossing lead without random pellet rolls or extra rendered objects.
export const SHOT_SPEED_MPS = 300;
export const SHOT_RANGE_M = 55;
/** Outer share of the pattern, and range, past which a hit only wounds. */
export const WOUND_FRINGE = .78;
export const WOUND_RANGE_M = 44;

/** Where the pattern went relative to a bird it missed. */
export type MissCall = 'behind' | 'ahead' | 'high' | 'low';
export interface NearMiss { call: MissCall; /** Miss distance in pattern radii (1 = just outside). */ margin: number }

export class TravellingShot {
  readonly origin: Point;
  private direction: Point;
  private previous = new Map<number, Point>();
  private age = 0;
  private hit: Readonly<ShotTarget> | null = null;
  /** How squarely the pattern took the bird: 0 at the core, 1 at the fringe. */
  private hitOffset = 0;
  private hitRange = 0;
  private closest: NearMiss | null = null;
  done = false;

  /**
   * A bird taken on the fringe of the pattern, or at the limit of range,
   * comes down wounded and runs. Deterministic: a centred shot kills clean.
   */
  get wounding(): boolean { return this.hit !== null && (this.hitOffset > WOUND_FRINGE || this.hitRange > this.woundRangeM); }

  /** The nearest a missed pattern came to a flying bird, and which way it was off. */
  get nearMiss(): NearMiss | null { return this.hit === null ? this.closest : null; }

  /** Actual swept crossing point, available only after a successful hit. */
  get impact(): Readonly<ShotTarget> | null { return this.hit; }

  /** How far from the pattern's core the hit bird was: 0 at the core, 1 at its edge; null without a hit. */
  get hitOffsetShare(): number | null { return this.hit === null ? null : this.hitOffset; }

  constructor(origin: Point, direction: Point, private spread: number, targets: readonly ShotTarget[],
    private readonly assistance: Readonly<ShotAssistanceProfile> = NO_SHOT_ASSISTANCE,
    /** A tighter choke carries clean kills further. */
    private readonly woundRangeM = WOUND_RANGE_M) {
    this.origin = { ...origin };
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (!Number.isFinite(length) || length === 0) this.done = true;
    this.direction = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
    this.remember(targets);
  }

  private remember(targets: readonly ShotTarget[]): void {
    this.previous.clear();
    for (const t of targets) if (shootable(t)) this.previous.set(t.simId, { x: t.x, y: t.y, z: t.z });
  }

  /**
   * A shooting coach's call on a miss: compare the bird's offset from the
   * pattern centre with its own line of flight. A bird still ahead along its
   * flight means the pattern went behind it; otherwise high or low.
   */
  private noteMiss(margin: number, ox: number, oy: number, oz: number, vx: number, vy: number, vz: number): void {
    if (margin > 4 || (this.closest && this.closest.margin <= margin)) return;
    const d = this.direction;
    // Bird motion across the line of fire only.
    const vAlong = vx * d.x + vy * d.y + vz * d.z;
    const cx = vx - d.x * vAlong, cy = vy - d.y * vAlong, cz = vz - d.z * vAlong;
    const speed = Math.hypot(cx, cy, cz);
    const lead = speed > 1e-4 ? (ox * cx + oy * cy + oz * cz) / speed : 0;
    const call: MissCall = Math.abs(lead) >= Math.abs(oy) * .8 && speed > 1e-4
      ? lead > 0 ? 'behind' : 'ahead'
      : oy > 0 ? 'low' : 'high';
    this.closest = { call, margin };
  }

  advance(dt: number, targets: readonly ShotTarget[], visible: (target: ShotTarget) => boolean): number | null {
    if (this.done || dt <= 0) return null;
    const start = this.age * SHOT_SPEED_MPS;
    const end = (this.age + dt) * SHOT_SPEED_MPS;
    const d = this.direction, o = this.origin;
    let hit: ShotTarget | null = null, first = Infinity;
    for (const t of targets) {
      const p = this.previous.get(t.simId);
      if (!p || !shootable(t)) continue;
      const a = (p.x-o.x)*d.x + (p.y-o.y)*d.y + (p.z-o.z)*d.z;
      const b = (t.x-o.x)*d.x + (t.y-o.y)*d.y + (t.z-o.z)*d.z;
      // Sweep both bird and pattern across the frame, so a low frame rate
      // cannot skip a bird between successive pattern positions.
      const relativeTravel = end-start-(b-a);
      if (relativeTravel <= 0) continue;
      const fraction = (a-start)/relativeTravel;
      if (fraction < 0 || fraction > 1 || fraction >= first) continue;
      const along = start+(end-start)*fraction;
      if (along <= 0 || along > SHOT_RANGE_M) continue;
      const x = p.x+(t.x-p.x)*fraction, y = p.y+(t.y-p.y)*fraction, z = p.z+(t.z-p.z)*fraction;
      const perpendicular = Math.hypot(x-o.x-d.x*along, y-o.y-d.y*along, z-o.z-d.z*along);
      const radius = Math.max(.48, along*Math.tan(this.spread)) + shotAssistanceAllowance(along, this.assistance);
      if (perpendicular > radius) {
        this.noteMiss(perpendicular / radius, x - o.x - d.x * along, y - o.y - d.y * along, z - o.z - d.z * along, t.x - p.x, t.y - p.y, t.z - p.z);
        continue;
      }
      const candidate = { simId: t.simId, status: t.status, anchorable: t.anchorable, x, y, z };
      if (visible(candidate)) { hit = candidate; first = fraction; this.hitOffset = perpendicular / radius; this.hitRange = along; }
    }
    this.age += dt;
    this.hit = hit;
    this.done = hit !== null || end >= SHOT_RANGE_M;
    this.remember(targets);
    return hit?.simId ?? null;
  }
}
