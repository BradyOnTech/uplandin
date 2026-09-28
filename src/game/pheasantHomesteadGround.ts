import type { AreaConfig } from './areas';
import { pheasantHomesteadYard } from './pheasantHabitat';
import { PROPERTY_PX_TO_M } from './worldUnits';

/** Barn-local metres, shared by ground, construction and physical obstacles. */
export const PHEASANT_GRAIN_BIN = { x: 14, z: -9, radius: 2.85 };
export const PHEASANT_HOMESTEAD_OBSTACLES = [
  { x: 0, z: 0, radius: 7.8 },
  { ...PHEASANT_GRAIN_BIN, radius: 3.1 },
] as const;

export interface HomesteadGroundSample {
  upper: number;
  turnout: number;
  drive: number;
  bank: number;
  grading: number;
}

type Segment = { ax: number; az: number; dx: number; dz: number; lengthSquared: number };
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const smooth = (n: number, a: number, b: number) => {
  const t = clamp((n - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const segment = (ax: number, az: number, bx: number, bz: number): Segment => ({
  ax, az, dx: bx - ax, dz: bz - az, lengthSquared: (bx - ax) ** 2 + (bz - az) ** 2,
});
function distanceToSegments(x: number, z: number, segments: readonly Segment[]): number {
  let distanceSquared = Infinity;
  for (const s of segments) {
    const t = clamp(((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.lengthSquared);
    const dx = x - s.ax - t * s.dx, dz = z - s.az - t * s.dz;
    distanceSquared = Math.min(distanceSquared, dx * dx + dz * dz);
  }
  return Math.sqrt(distanceSquared);
}

/** Shared land use and supported grades for the compact Homestead work court.
 * Property inputs are yards; all authored shapes below are barn-local metres.
 * The old cleared-yard boundary and foundations remain physical constraints;
 * tracks keep their XZ routes but follow the continuous new ground surface. */
export function createPheasantHomesteadGround(area: AreaConfig) {
  if (area.id !== 'pheasant-coverts') return undefined;
  const barn = area.landmarks.find(l => l.id === 'old-homestead');
  const yard = pheasantHomesteadYard(area.landmarks);
  if (!barn || !yard) return undefined;
  const bx = barn.position.x, by = barn.position.y;
  const x0 = (yard.x - bx) * PROPERTY_PX_TO_M, x1 = x0 + yard.w * PROPERTY_PX_TO_M;
  const z0 = (yard.y - by) * PROPERTY_PX_TO_M, z1 = z0 + yard.h * PROPERTY_PX_TO_M;
  const routes: Segment[] = [];
  for (const trail of area.trails) for (let i = 1; i < trail.points.length; i++) {
    const a = trail.points[i - 1], b = trail.points[i];
    if (Math.max(a.x, b.x) < yard.x - 8 || Math.min(a.x, b.x) > yard.x + yard.w + 8
      || Math.max(a.y, b.y) < yard.y - 8 || Math.min(a.y, b.y) > yard.y + yard.h + 8) continue;
    const s = segment((a.x - bx) * PROPERTY_PX_TO_M, (a.y - by) * PROPERTY_PX_TO_M,
      (b.x - bx) * PROPERTY_PX_TO_M, (b.y - by) * PROPERTY_PX_TO_M);
    if (s.lengthSquared > .001) routes.push(s);
  }
  // One curved connection follows the western shoulder to the barn doors,
  // avoiding a straight painted shortcut across the face of the bank.
  const service: Segment[] = [];
  let lastX = 0, lastZ = 8;
  for (let i = 1; i <= 12; i++) {
    const t = i / 12, u = 1 - t;
    const x = -26 * u * t - 16 * t * t;
    const z = 8 * u * u + 28 * u * t + 27.432 * t * t;
    service.push(segment(lastX, lastZ, x, z)); lastX = x; lastZ = z;
  }
  const work: HomesteadGroundSample = { upper: 0, turnout: 0, drive: 0, bank: 0, grading: 0 };
  let prepared = false, upperHeight = 0, upperGradeX = 0;
  let turnoutGradeZ = 0;
  const lowerProfile: number[] = [];
  const lowerAt = (x: number): number => {
    const sample = clamp((x + 34) / 2, 1, lowerProfile.length - 3);
    const i = Math.floor(sample), t = sample - i, t2 = t * t, t3 = t2 * t;
    const a = lowerProfile[i], b = lowerProfile[i + 1];
    const da = (b - lowerProfile[i - 1]) * .5;
    const db = (lowerProfile[i + 2] - a) * .5;
    return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * da
      + (-2 * t3 + 3 * t2) * b + (t3 - t2) * db;
  };
  const junctionX = 8 * PROPERTY_PX_TO_M, junctionZ = 30 * PROPERTY_PX_TO_M;

  function sample(propertyX: number, propertyY: number, out: HomesteadGroundSample): HomesteadGroundSample {
    out.upper = out.turnout = out.drive = out.bank = out.grading = 0;
    const x = (propertyX - bx) * PROPERTY_PX_TO_M, z = (propertyY - by) * PROPERTY_PX_TO_M;
    if (x <= x0 || x >= x1 || z <= z0 || z >= z1) return out;
    const edge = smooth(Math.min(x - x0, x1 - x, z - z0, z1 - z), 0, 5);
    // A rounded court wraps actual barn/bin foundations, with a recognisable
    // front apron; it no longer treats the entire 70m clearing as a dirt yard.
    const court = Math.hypot((x - 3) / 20, (z + 4) / 14);
    out.upper = (1 - smooth(court, .84, 1.10)) * edge;
    const turnout = Math.hypot((x - junctionX) / 9, (z - junctionZ) / 6);
    out.turnout = (1 - smooth(turnout, .76, 1.18)) * edge;
    const routeDistance = distanceToSegments(x, z, routes);
    const serviceDistance = distanceToSegments(x, z, service);
    out.drive = (1 - smooth(Math.min(routeDistance, serviceDistance), 2.8, 4.1)) * edge;
    const working = Math.max(out.upper, out.turnout, out.drive);
    out.bank = Math.max(0, edge - working);
    const barnDistance = Math.hypot(Math.max(Math.abs(x) - 7.4, 0), Math.max(Math.abs(z) - 3.35, 0));
    const binDistance = Math.hypot(x - PHEASANT_GRAIN_BIN.x, z - PHEASANT_GRAIN_BIN.z) - 3.2;
    out.grading = edge * smooth(Math.min(barnDistance, binDistance), 0, 4);
    return out;
  }

  return {
    bounds: { x: yard.x, y: yard.y, w: yard.w, h: yard.h },
    sample,
    /** Cache the court datum and lower turn from the unmodified landscape. */
    prepare(rawHeight: (x: number, y: number) => number): void {
      if (prepared) return;
      const at = (x: number, z: number) => rawHeight(bx + x / PROPERTY_PX_TO_M, by + z / PROPERTY_PX_TO_M);
      upperHeight = at(0, -6);
      upperGradeX = clamp((at(10, -6) - at(-10, -6)) / 20, -.02, .02);
      turnoutGradeZ = clamp((at(junctionX, junctionZ + 6) - at(junctionX, junctionZ - 6)) / 12, -.08, .08);
      // Preserve the existing lower lane's cross-slope rather than extend a
      // locally fitted plane or parabola across the entire hill.
      for (let x = -34; x <= 42; x += 2) lowerProfile.push(at(x, junctionZ));
      prepared = true;
    },
    apply(propertyX: number, propertyY: number, original: number): number {
      sample(propertyX, propertyY, work);
      if (!prepared || work.grading === 0) return original;
      const x = (propertyX - bx) * PROPERTY_PX_TO_M, z = (propertyY - by) * PROPERTY_PX_TO_M;
      const upper = upperHeight + upperGradeX * x - .025 * (z + 6);
      const lower = lowerAt(x) + turnoutGradeZ * (z - junctionZ);
      // The grassed bank carries the level change, while the court drains
      // gently. The diagonal follows the existing shoulder and west access.
      const q = z + x * .40;
      const t = clamp((q - 7) / 25), t2 = t * t, t3 = t2 * t;
      const a = upperHeight + upperGradeX * x - .025 * (13 - x * .40);
      const endZ = 32 - x * .40 - junctionZ;
      const b = lowerAt(x) + turnoutGradeZ * endZ;
      const endGrade = turnoutGradeZ;
      const bank = (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * 25 * -.025
        + (-2 * t3 + 3 * t2) * b + (t3 - t2) * 25 * endGrade;
      const target = q < 7 ? upper : q > 32 ? lower : bank;
      // Grade only the connected work court and its foreground bank; the
      // north and far side shoulders ease back to their original landform.
      const extent = (1 - smooth(Math.abs(x - 3), 23, 35))
        * smooth(z, -21, -12) * (1 - smooth(z, 32, 41));
      return original + (target - original) * work.grading * extent * .88;
    },
  };
}
