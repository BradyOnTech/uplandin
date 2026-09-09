export interface ShotTarget { simId: number; x: number; y: number; z: number; status: string }
interface Point { x: number; y: number; z: number }

// Gameplay tuning, not a full pellet/drag simulation. A travelling pattern
// rewards crossing lead without random pellet rolls or extra rendered objects.
export const SHOT_SPEED_MPS = 300;
export const SHOT_RANGE_M = 55;

export class TravellingShot {
  readonly origin: Point;
  private direction: Point;
  private previous = new Map<number, Point>();
  private age = 0;
  done = false;

  constructor(origin: Point, direction: Point, private spread: number, targets: readonly ShotTarget[]) {
    this.origin = { ...origin };
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (!Number.isFinite(length) || length === 0) this.done = true;
    this.direction = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
    this.remember(targets);
  }

  private remember(targets: readonly ShotTarget[]): void {
    this.previous.clear();
    for (const t of targets) if (t.status === 'flying') this.previous.set(t.simId, { x: t.x, y: t.y, z: t.z });
  }

  advance(dt: number, targets: readonly ShotTarget[], visible: (target: ShotTarget) => boolean): number | null {
    if (this.done || dt <= 0) return null;
    const start = this.age * SHOT_SPEED_MPS;
    const end = (this.age + dt) * SHOT_SPEED_MPS;
    const d = this.direction, o = this.origin;
    let hit: ShotTarget | null = null, first = Infinity;
    for (const t of targets) {
      const p = this.previous.get(t.simId);
      if (!p || t.status !== 'flying') continue;
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
      if (perpendicular > Math.max(.48, along*Math.tan(this.spread))) continue;
      const candidate = { simId: t.simId, status: t.status, x, y, z };
      if (visible(candidate)) { hit = candidate; first = fraction; }
    }
    this.age += dt;
    this.done = hit !== null || end >= SHOT_RANGE_M;
    this.remember(targets);
    return hit?.simId ?? null;
  }
}
