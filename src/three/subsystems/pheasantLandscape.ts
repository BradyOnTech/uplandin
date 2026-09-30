import type { AreaConfig } from '../../game/areas';
import { PROPERTY_PX_TO_M, type LandscapeModel } from '../../game/landscape';
import { pheasantHomesteadYard, pheasantManagedParcels, pheasantPondRadii, pheasantWestHarvest } from '../../game/pheasantHabitat';
import { pheasantFarmFields, type PheasantCrop } from '../../game/pheasantFarm';

const clamp = (n: number) => Math.max(0, Math.min(1, n));
/** Vertical offset from the sampled pond basin floor used by all Pheasant water surfaces. */
export const PHEASANT_WATER_LEVEL_OFFSET = 2.95;
/** A harvested field: rows run along local +u (the field's rotated x). */
export interface PheasantField { x: number; y: number; rx: number; ry: number; angle: number; crop?: PheasantCrop }
export interface PheasantHarvestSample { amount: number; row: number; angle: number; crop?: PheasantCrop }
export interface PheasantBelt { x: number; y: number; angle: number; length: number; count: number }
export interface PheasantPond { landmarkId: string; x: number; y: number; rx: number; ry: number; waterY: number }

/** The farm's harvested fields. Managed parcels beside the ponds are part of
 * the field that contains them and share its crop and planter direction.
 * Terrain, residue and the survey map all read this one list. */
function farmFields(area: AreaConfig): PheasantField[] {
  // Fields stop short of the section lines, leaving a grass headland and
  // fencerow between every pair of parcels.
  const inset = 3.5;
  return pheasantFarmFields(area.world).map(({ rect: full, rows, crop }) => ({ rows, crop,
    rect: { x: full.x + inset, y: full.y + inset, w: full.w - inset * 2, h: full.h - inset * 2 } }))
    .map(({ rect, rows, crop }) => rows === 'ew'
    ? { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, rx: rect.w / 2, ry: rect.h / 2, angle: 0, crop }
    : { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, rx: rect.h / 2, ry: rect.w / 2, angle: Math.PI / 2, crop });
}

export function pheasantFields(area: AreaConfig): PheasantField[] {
  const farm = farmFields(area);
  return [...farm, ...pheasantManagedParcels(area.landmarks).map(parcel => {
    const x = parcel.x + parcel.w / 2, y = parcel.y + parcel.h / 2;
    const home = farm.find(f => Math.abs(x - f.x) <= (f.angle ? f.ry : f.rx) && Math.abs(y - f.y) <= (f.angle ? f.rx : f.ry));
    return home?.angle
      ? { x, y, rx: parcel.h / 2, ry: parcel.w / 2, angle: home.angle, crop: home.crop }
      : { x, y, rx: parcel.w / 2, ry: parcel.h / 2, angle: 0, crop: home?.crop ?? 'corn' };
  })];
}

export function pheasantCoverAt(area: AreaConfig, x: number, y: number): boolean {
  return area.patches.some(p => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
}

/** A visual fringe outside authoritative bird cover. Dense interiors stay
 * intact; a varying verge breaks up the rectangular management boundaries. */
export function pheasantCoverFringeAt(area: AreaConfig, x: number, y: number): number {
  let distance = Infinity;
  for (const patch of area.patches) {
    distance = Math.min(distance, Math.hypot(Math.max(patch.x - x, 0, x - patch.x - patch.w),
      Math.max(patch.y - y, 0, y - patch.y - patch.h)));
  }
  if (distance === 0) return 1;
  const width = 5.5 + Math.sin(x * .093 + Math.sin(y * .057) * 1.6) * 2 + Math.cos(y * .12) * 1.2;
  const t = clamp(1 - distance / width);
  return t * t * (3 - 2 * t);
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
  out.amount = 0; out.row = 0; out.angle = 0; out.crop = undefined;
  const yard = pheasantHomesteadYard(area.landmarks);
  if (yard && x >= yard.x && x <= yard.x + yard.w && y >= yard.y && y <= yard.y + yard.h) return out;
  let coverDistanceSquared = 49;
  for (const patch of area.patches) {
    const dx = Math.max(patch.x - x, 0, x - patch.x - patch.w);
    const dy = Math.max(patch.y - y, 0, y - patch.y - patch.h);
    if (dx === 0 && dy === 0) return out;
    coverDistanceSquared = Math.min(coverDistanceSquared, dx * dx + dy * dy);
  }
  // Leave a soft uncut verge around gameplay cover. Both the ground painter
  // and the plants read this, so low-density mobile cover keeps its edge.
  const verge = Math.sqrt(coverDistanceSquared) / 7;
  const coverFade = verge * verge * (3 - 2 * verge);
  for (const field of fields) {
    const dx = x - field.x, dy = y - field.y;
    const c = Math.cos(field.angle), s = Math.sin(field.angle);
    const u = dx * c + dy * s, v = -dx * s + dy * c;
    const amount = clamp(Math.min(field.rx - Math.abs(u), field.ry - Math.abs(v)) / 8) * coverFade;
    if (amount <= out.amount) continue;
    out.amount = amount;
    out.row = v;
    out.crop = field.crop;
    // Local +Z follows the rows; Three.js yaw maps +Z toward +X.
    out.angle = Math.PI / 2 - field.angle;
  }
  return out;
}

/** Optional bound avoids projecting onto remote routes during dense planting.
 * Unbounded calls still return the exact nearest distance in metres. */
export function pheasantTrackDistance(area: AreaConfig, x: number, y: number, maximum = Infinity): number {
  const limitSquared = (maximum / PROPERTY_PX_TO_M) ** 2;
  let distanceSquared = limitSquared;
  for (const trail of area.trails) for (let i = 1; i < trail.points.length; i++) {
    const a = trail.points[i - 1], b = trail.points[i], dx = b.x - a.x, dy = b.y - a.y;
    const boxX = Math.max(Math.min(a.x, b.x) - x, 0, x - Math.max(a.x, b.x));
    const boxY = Math.max(Math.min(a.y, b.y) - y, 0, y - Math.max(a.y, b.y));
    if (boxX * boxX + boxY * boxY >= distanceSquared) continue;
    const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1));
    const nearX = x - a.x - dx * t, nearY = y - a.y - dy * t;
    distanceSquared = Math.min(distanceSquared, nearX * nearX + nearY * nearY);
  }
  return distanceSquared === limitSquared ? maximum : Math.sqrt(distanceSquared) * PROPERTY_PX_TO_M;
}

export function pheasantPlantClear(area: AreaConfig, x: number, y: number, radius = .7): boolean {
  if (x < area.world.x + 1 || y < area.world.y + 1 || x > area.world.x + area.world.w - 1 || y > area.world.y + area.world.h - 1) return false;
  if (pheasantTrackDistance(area, x, y, 2.1 + radius) < 2.1 + radius) return false;
  if (area.dropPoints.some(d => Math.hypot(x - d.position.x, y - d.position.y) * PROPERTY_PX_TO_M < 7 + radius)) return false;
  const yard = pheasantHomesteadYard(area.landmarks);
  if (yard && x >= yard.x - radius && x <= yard.x + yard.w + radius && y >= yard.y - radius && y <= yard.y + yard.h + radius) return false;
  return !area.landmarks.some(l => l.kind !== 'pond' && Math.hypot(x - l.position.x, y - l.position.y) * PROPERTY_PX_TO_M < (l.kind === 'barn' ? 12 : 3) + radius);
}

export function pheasantPonds(landscape: LandscapeModel): PheasantPond[] {
  return landscape.area.landmarks.filter(l => l.kind === 'pond').map(l => ({
    landmarkId: l.id,
    x: l.position.x, y: l.position.y, rx: pheasantPondRadii(l.id).rx, ry: pheasantPondRadii(l.id).rz,
    waterY: landscape.heightAtProperty(l.position.x, l.position.y) + PHEASANT_WATER_LEVEL_OFFSET,
  }));
}

export function pheasantShelterbelts(area: AreaConfig): PheasantBelt[] {
  // Field windbreaks sit on the farm's edges: the classic west-side belt,
  // the north property line, a belt shading the section road above the east
  // corn and one along the south-east line. Positions scale with the plan.
  const { x: ox, y: oy, w, h } = area.world, sx = w / 1400, sy = h / 800;
  const result: PheasantBelt[] = [
    { x: ox + 14 * sx, y: oy + 210 * sy, angle: Math.PI / 2, length: 170 * sy, count: 13 },
    { x: ox + 500 * sx, y: oy + 10 * sy, angle: 0, length: 150 * sx, count: 12 },
    { x: ox + 1010 * sx, y: oy + 290 * sy, angle: 0, length: 170 * sx, count: 14 },
    { x: ox + 1250 * sx, y: oy + 790 * sy, angle: 0, length: 160 * sx, count: 12 },
  ];
  const west = pheasantWestHarvest(area.landmarks);
  // The west track bends along the north edge; plant inside the cut field
  // so the new shelterbelt frames that route instead of crossing its ruts.
  if (west) result.push({ x: west.x + west.w / 2, y: west.y + 14, angle: 0, length: Math.min(180, west.w * .625), count: 13 });
  const barn = area.landmarks.find(l => l.kind === 'barn');
  if (barn) result.push(
    { x: barn.position.x - 54, y: barn.position.y - 18, angle: Math.PI / 2, length: 105, count: 11 },
    { x: barn.position.x + 16, y: barn.position.y - 69, angle: 0, length: 147, count: 15 },
    { x: barn.position.x + 88, y: barn.position.y - 37, angle: Math.PI / 2, length: 50, count: 6 },
  );
  return result;
}
