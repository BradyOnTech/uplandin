import type { AreaConfig } from '../../game/areas';
import { PROPERTY_PX_TO_M, type LandscapeModel } from '../../game/landscape';

const clamp = (n: number) => Math.max(0, Math.min(1, n));
/** Vertical offset from the sampled pond basin floor used by all Pheasant water surfaces. */
export const PHEASANT_WATER_LEVEL_OFFSET = 2.95;
export interface PheasantField { x: number; y: number; rx: number; ry: number; angle: number }
export interface PheasantHarvestSample { amount: number; row: number; angle: number }
export interface PheasantBelt { x: number; y: number; angle: number; length: number; count: number }
export interface PheasantPond { landmarkId: string; x: number; y: number; rx: number; ry: number; waterY: number }

/** Harvested feeding fields are visual management units. They never alter the
 * shared hunting rectangles or stocking; tall habitat remains authoritative. */
export function pheasantFields(area: AreaConfig): PheasantField[] {
  return [[.23, .72, .17, .13, -.08], [.62, .80, .17, .13, .12], [.75, .43, .15, .15, -.15], [.34, .27, .20, .13, .08]]
    .map(([x, y, rx, ry, angle]) => ({ x: area.world.x + area.world.w * x, y: area.world.y + area.world.h * y, rx: area.world.w * rx, ry: area.world.h * ry, angle }));
}

export function pheasantCoverAt(area: AreaConfig, x: number, y: number): boolean {
  return area.patches.some(p => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
}

/** Reusable by terrain paint: zero means cover/unharvested, one means the
 * interior of a cut field. The width is feathered over an eight-yard verge. */
export function pheasantHarvestAt(area: AreaConfig, x: number, y: number, fields = pheasantFields(area)): number {
  return samplePheasantHarvest(area, x, y, fields, { amount: 0, row: 0, angle: 0 }).amount;
}

/** One field orientation for the cut ground and its stubble. Supply a reused
 * output and cached fields during construction of terrain or plant batches. */
export function samplePheasantHarvest(
  area: AreaConfig, x: number, y: number, fields: readonly PheasantField[], out: PheasantHarvestSample,
): PheasantHarvestSample {
  out.amount = 0; out.row = 0; out.angle = 0;
  let coverDistance = Infinity;
  for (const patch of area.patches) {
    const dx = Math.max(patch.x - x, 0, x - patch.x - patch.w);
    const dy = Math.max(patch.y - y, 0, y - patch.y - patch.h);
    coverDistance = Math.min(coverDistance, Math.hypot(dx, dy));
  }
  if (coverDistance === 0) return out;
  // Leave a soft uncut verge around gameplay cover. Both the ground painter
  // and the plants read this, so low-density mobile cover keeps its edge.
  const verge = clamp(coverDistance / 7);
  const coverFade = verge * verge * (3 - 2 * verge);
  for (const field of fields) {
    const dx = x - field.x, dy = y - field.y;
    const c = Math.cos(field.angle), s = Math.sin(field.angle);
    const u = dx * c + dy * s, v = -dx * s + dy * c;
    const amount = clamp(Math.min(field.rx - Math.abs(u), field.ry - Math.abs(v)) / 8) * coverFade;
    if (amount <= out.amount) continue;
    out.amount = amount;
    out.row = v;
    // Local +Z follows the rows; Three.js yaw maps +Z toward +X.
    out.angle = Math.PI / 2 - field.angle;
  }
  return out;
}

export function pheasantTrackDistance(area: AreaConfig, x: number, y: number): number {
  let distance = Infinity;
  for (const trail of area.trails) for (let i = 1; i < trail.points.length; i++) {
    const a = trail.points[i - 1], b = trail.points[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1));
    distance = Math.min(distance, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
  }
  return distance * PROPERTY_PX_TO_M;
}

export function pheasantPlantClear(area: AreaConfig, x: number, y: number, radius = .7): boolean {
  if (x < area.world.x + 1 || y < area.world.y + 1 || x > area.world.x + area.world.w - 1 || y > area.world.y + area.world.h - 1) return false;
  if (pheasantTrackDistance(area, x, y) < 2.1 + radius) return false;
  if (area.dropPoints.some(d => Math.hypot(x - d.position.x, y - d.position.y) * PROPERTY_PX_TO_M < 7 + radius)) return false;
  return !area.landmarks.some(l => l.kind !== 'pond' && Math.hypot(x - l.position.x, y - l.position.y) * PROPERTY_PX_TO_M < (l.kind === 'barn' ? 12 : 3) + radius);
}

export function pheasantPonds(landscape: LandscapeModel): PheasantPond[] {
  return landscape.area.landmarks.filter(l => l.kind === 'pond').map(l => ({
    landmarkId: l.id,
    x: l.position.x, y: l.position.y, rx: l.id === 'area-feature' ? 34 : 43, ry: l.id === 'area-feature' ? 23 : 29,
    waterY: landscape.heightAtProperty(l.position.x, l.position.y) + PHEASANT_WATER_LEVEL_OFFSET,
  }));
}

export function pheasantShelterbelts(area: AreaConfig): PheasantBelt[] {
  const result = pheasantFields(area).map((field, i) => ({ x: field.x, y: field.y - field.ry - 10, angle: field.angle,
    length: Math.min(180, field.rx * 1.25), count: i % 2 ? 10 : 13 }));
  const barn = area.landmarks.find(l => l.kind === 'barn');
  if (barn) result.push({ x: barn.position.x - 32, y: barn.position.y + 9, angle: 1.36, length: 83, count: 9 });
  return result;
}
