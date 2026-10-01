import type { Rect } from './field';
import type { Vec2 } from './types';
/** Small remembered places in the open prairie. Positions and horizontal
 * radii are property yards; relief and stone dimensions are metres. These
 * are stable landforms, independent of hunt seed, entry and render quality. */
export const SHARPTAIL_LANDFORM_DETAILS = [
  { id: 'west-draw', x: 225, y: 575, rx: 110, ry: 40, yaw: -.48, height: -1.8, bend: .22, surface: 'hollow' },
  { id: 'erratic-shoulder', x: 246, y: 535, rx: 95, ry: 40, yaw: -.48, height: 2.2, bend: -.18, surface: 'stone' },
  { id: 'south-draw', x: 458, y: 717, rx: 110, ry: 38, yaw: -.18, height: -1.6, bend: -.24, surface: 'hollow' },
  { id: 'south-stony-brow', x: 450, y: 675, rx: 84, ry: 43, yaw: -.18, height: 2.2, bend: .18, surface: 'stone' },
  { id: 'middle-till-spur', x: 584, y: 516, rx: 89, ry: 42, yaw: -.36, height: 2.4, bend: .26, surface: 'stone' },
  { id: 'east-saddle-lip', x: 1038, y: 483, rx: 73, ry: 40, yaw: .35, height: 1.7, bend: -.18, surface: 'crown' },
  // A rancher's stock dam pushed across the north-west draw, and the pit
  // dug behind it for fill: the water stands against the dam.
  { id: 'stock-dam', x: 322, y: 271, rx: 50, ry: 22, yaw: 1.78, height: 2.6, bend: 0, surface: 'crown' },
  { id: 'stock-pond-pit', x: 356, y: 278, rx: 38, ry: 22, yaw: .21, height: -1.7, bend: 0, surface: 'hollow' },
  // A low knoll the badgers have dug over, south-west of the arrival lane.
  { id: 'badger-knoll', x: 612, y: 704, rx: 22, ry: 16, yaw: .4, height: 1.3, bend: 0, surface: 'crown' },
] as const;

export const SHARPTAIL_ERRATICS = [
  { id: 'west-graystone', x: 250, y: 535, width: 4.8, height: 2.55, depth: 3.7, yaw: .6, seed: 21 },
  { id: 'west-graystone-low', x: 259, y: 540, width: 2.4, height: 1.05, depth: 2.0, yaw: -1.2, seed: 84 },
  { id: 'west-graystone-satellite', x: 241, y: 546, width: 1.8, height: .75, depth: 1.45, yaw: 2.1, seed: 33 },
  { id: 'south-split-stone', x: 449, y: 692, width: 3.9, height: 1.95, depth: 3.3, yaw: -.8, seed: 117 },
  { id: 'south-split-stone-low', x: 456, y: 699, width: 2.6, height: 1.2, depth: 2.25, yaw: .4, seed: 53 },
  { id: 'middle-lone-stone', x: 583, y: 517, width: 4.1, height: 2.15, depth: 3.4, yaw: 1.8, seed: 209 },
  { id: 'east-saddle-stone', x: 1038, y: 487, width: 3.1, height: 1.55, depth: 2.7, yaw: -.4, seed: 71 },
  { id: 'east-saddle-low', x: 1045, y: 494, width: 2.0, height: .85, depth: 1.6, yaw: .8, seed: 152 },
  // The western swale stays open, but its near lip has one remembered stone
  // group visible from West Track's outward-facing shoulder. These are well
  // west of the concealed stand at x110, with open ground around each rock.
  { id: 'west-swale-stone', x: 115, y: 515, width: 6.5, height: 3.0, depth: 5.2, yaw: -.35, seed: 312 },
  { id: 'west-swale-low', x: 105, y: 523, width: 3.2, height: 1.25, depth: 2.8, yaw: .95, seed: 422 },
  { id: 'west-swale-satellite', x: 100, y: 531, width: 2.25, height: .85, depth: 1.9, yaw: -1.7, seed: 617 },
  { id: 'west-swale-fore-stone', x: 125, y: 508, width: 3.6, height: 1.55, depth: 2.7, yaw: .65, seed: 913 },
  { id: 'west-swale-fore-chip', x: 106, y: 505, width: 1.75, height: .65, depth: 1.4, yaw: -.7, seed: 821 },
] as const;

const frames = SHARPTAIL_LANDFORM_DETAILS.map(shape => ({ ...shape, cos: Math.cos(shape.yaw), sin: Math.sin(shape.yaw) }));
const stoneFrames = SHARPTAIL_ERRATICS.map(stone => ({ ...stone, cos: Math.cos(stone.yaw), sin: Math.sin(stone.yaw) }));
function influence(x: number, y: number, shape: typeof frames[number]): number {
  const dx = x - shape.x, dy = y - shape.y;
  if (Math.abs(dx) > shape.rx + shape.ry || Math.abs(dy) > shape.rx + shape.ry) return 0;
  const u = (dx * shape.cos + dy * shape.sin) / shape.rx;
  const v = (-dx * shape.sin + dy * shape.cos) / shape.ry - shape.bend * (1 - u * u);
  if (Math.abs(u) >= 1 || Math.abs(v) >= 1) return 0;
  // Broad tapered shapes join the existing terrain with zero slope. No
  // high-frequency bumps or visual-only hills under the walking surface.
  return (1 - u * u) ** 2 * (1 - v * v) ** 2;
}

export function sharptailDetailHeight(x: number, y: number): number {
  let height = 0;
  for (const shape of frames) height += influence(x, y, shape) * shape.height;
  return height;
}

/** Same footprints guide the ground, near grass and distant canopy. The
 * habitat rectangles and moisture law remain owned by the hunting model. */
export function sharptailDetailGrowth(x: number, y: number, out: { crown: number; hollow: number; exposed: number }): void {
  out.crown = 0; out.hollow = 0; out.exposed = 0;
  for (const shape of frames) {
    const amount = influence(x, y, shape);
    if (shape.surface === 'hollow') out.hollow = Math.max(out.hollow, amount * .88);
    else {
      out.crown = Math.max(out.crown, amount * .9);
      if (shape.surface === 'stone') out.exposed = Math.max(out.exposed, amount * .78);
    }
  }
}

/** Local grass clearance under actual stone footprints; soft edge outside
 * the rock. Returns one on open ground, zero beneath the solid. */
export function sharptailStoneClearance(x: number, y: number): number {
  let clearance = featureClearance(x, y);
  if (clearance === 0) return 0;
  for (const stone of stoneFrames) {
    const dx = (x - stone.x) * .9144, dz = (y - stone.y) * .9144;
    const reach = Math.max(stone.width, stone.depth) * .5 + 1.2;
    if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
    const u = (dx * stone.cos - dz * stone.sin) / (stone.width * .5 + .25);
    const v = (dx * stone.sin + dz * stone.cos) / (stone.depth * .5 + .25);
    const t = Math.min(1, Math.max(0, (Math.hypot(u, v) - 1) / .45));
    clearance = Math.min(clearance, t * t * (3 - 2 * t));
  }
  return clearance;
}

/**
 * The pasture's history, placed in property yards. The stock pond stands
 * behind the dam in the north-west draw (its level is set from the dam's
 * crest by the renderer). The homestead is a caved-in claim shack with its
 * lilac windbreak on the south bench; three tipi rings hold the high east
 * knob; badgers have dug over the knoll west of the arrival lane.
 */
export const SHARPTAIL_STOCK_POND = {
  x: 364, y: 273, rx: 38, ry: 34, angle: .21,
  dam: { x: 322, y: 271 },
  /** Metres from the dam crest down to the water. */
  freeboard: 1.1,
} as const;
export const SHARPTAIL_HOMESTEAD = { x: 292, y: 700, angle: -.35 } as const;
export const SHARPTAIL_BADGER_KNOLL = { x: 612, y: 704 } as const;
const TIPI_RINGS = [
  { x: 1094, y: 456, radius: 2.9, seed: 11 },
  { x: 1112, y: 468, radius: 2.5, seed: 29 },
  { x: 1083, y: 474, radius: 3.2, seed: 47 },
] as const;

const hash = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export interface SharptailSmallStone { x: number; y: number; /** Metres. */ size: number; seed: number }
/** Weathered cobbles laid in circles to hold down lodge covers: a few
 * missing, some rolled out, all sunk into the sod. */
export const SHARPTAIL_TIPI_STONES: readonly SharptailSmallStone[] = TIPI_RINGS.flatMap(ring => {
  const rng = hash(ring.seed * 977), out: SharptailSmallStone[] = [];
  const count = Math.round(ring.radius * 6.5);
  for (let i = 0; i < count; i++) {
    if (rng() < .14) continue;
    const a = i / count * Math.PI * 2 + (rng() - .5) * .12, r = ring.radius * (.95 + rng() * .12) + (rng() < .08 ? .6 + rng() : 0);
    out.push({ x: ring.x + Math.cos(a) * r / .9144, y: ring.y + Math.sin(a) * r / .9144, size: .28 + rng() * .24, seed: ring.seed * 100 + i });
  }
  return out;
});
export const SHARPTAIL_TIPI_RINGS = TIPI_RINGS;

export interface SharptailBurrow { x: number; y: number; /** Direction the spoil fans out, radians. */ angle: number; size: number; badger: boolean }
export const SHARPTAIL_BURROWS: readonly SharptailBurrow[] = (() => {
  const rng = hash(7717), out: SharptailBurrow[] = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + rng() * .8, r = 5 + rng() * 11;
    out.push({ x: SHARPTAIL_BADGER_KNOLL.x + Math.cos(a) * r, y: SHARPTAIL_BADGER_KNOLL.y + Math.sin(a) * r * .8,
      angle: a + (rng() - .5) * .8, size: 1.1 + rng() * .5, badger: true });
  }
  // Pocket gopher mounds scattered over the rest of the knoll.
  for (let i = 0; i < 12; i++) {
    const a = rng() * Math.PI * 2, r = 4 + rng() * 22;
    out.push({ x: SHARPTAIL_BADGER_KNOLL.x + Math.cos(a) * r, y: SHARPTAIL_BADGER_KNOLL.y + Math.sin(a) * r * .75,
      angle: rng() * Math.PI * 2, size: .45 + rng() * .25, badger: false });
  }
  return out;
})();

export interface SharptailEntrance {
  dropId: string;
  /** Centre of the opening on the boundary fence, property yards. */
  x: number; y: number;
  /** Direction along the fence, radians. */
  along: number;
  kind: 'cattle-guard' | 'wire-gate';
  /** Where the two-track ends: the parked truck. */
  truck: { x: number; y: number };
}
export const SHARPTAIL_FENCE_INSET = 4;
/** Each parking place is reached through its own opening in the boundary
 * fence: a cattle guard on the south lane, a wire gate on the west track. */
export function sharptailEntrances(world: Rect, drops: readonly { id: string; position: Vec2; heading?: number }[]): SharptailEntrance[] {
  const inset = SHARPTAIL_FENCE_INSET;
  return drops.map(drop => {
    const { x, y } = drop.position;
    const sides = [
      { d: y - world.y - inset, at: { x, y: world.y + inset }, along: 0 },
      { d: world.y + world.h - inset - y, at: { x, y: world.y + world.h - inset }, along: 0 },
      { d: x - world.x - inset, at: { x: world.x + inset, y }, along: Math.PI / 2 },
      { d: world.x + world.w - inset - x, at: { x: world.x + world.w - inset, y }, along: Math.PI / 2 },
    ].sort((a, b) => a.d - b.d)[0];
    const heading = drop.heading ?? 0;
    return { dropId: drop.id, x: sides.at.x, y: sides.at.y, along: sides.along,
      kind: sides.along === 0 ? 'cattle-guard' : 'wire-gate',
      truck: { x: x - Math.cos(heading) * 6, y: y - Math.sin(heading) * 6 } };
  });
}

/** Metres from an opening's centre to its gateposts and to the brace posts
 * of each H-brace beside it. The fence runs in to the brace post. */
export const SHARPTAIL_ENTRANCE_POSTS = { gatepost: 3.0, brace: 5.4 } as const;

function segmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - ax - dx * t, y - ay - dy * t);
}

const smooth = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
const pond = SHARPTAIL_STOCK_POND, pondCos = Math.cos(pond.angle), pondSin = Math.sin(pond.angle);
let entrances: SharptailEntrance[] | undefined;
/** Grass clearance for the ranch's history pieces: open water in the stock
 * pond, the shack floor, spoil mounds, tipi stones and the two-track ruts. */
function featureClearance(x: number, y: number): number {
  let clearance = 1;
  // Stock pond: open water upstream of the dam crest.
  if (Math.abs(x - pond.x) < pond.rx + 4 && Math.abs(y - pond.y) < pond.ry + 4) {
    const dx = x - pond.x, dy = y - pond.y;
    const u = dx * pondCos + dy * pondSin, v = -dx * pondSin + dy * pondCos;
    const dam = (pond.dam.x - pond.x) * pondCos + (pond.dam.y - pond.y) * pondSin;
    if (u > dam + 3) clearance = Math.min(clearance, smooth(.62, .86, Math.hypot(u / 30, v / 25)));
  }
  const home = SHARPTAIL_HOMESTEAD;
  if (Math.abs(x - home.x) < 8 && Math.abs(y - home.y) < 8) clearance = Math.min(clearance, smooth(3.2, 4.6, Math.hypot(x - home.x, y - home.y)));
  const knoll = SHARPTAIL_BADGER_KNOLL;
  if (Math.abs(x - knoll.x) < 32 && Math.abs(y - knoll.y) < 28) for (const b of SHARPTAIL_BURROWS) {
    const reach = b.size * (b.badger ? 1.6 : 1) / .9144;
    const d = Math.hypot(x - b.x - Math.cos(b.angle) * reach * .35, y - b.y - Math.sin(b.angle) * reach * .35);
    if (d < reach * 1.4) clearance = Math.min(clearance, smooth(reach * .8, reach * 1.4, d));
  }
  for (const ring of TIPI_RINGS) if (Math.abs(x - ring.x) < 6 && Math.abs(y - ring.y) < 6) {
    // The old lodge floor still grows a shorter, thinner sod.
    const inside = Math.hypot(x - ring.x, y - ring.y) * .9144;
    clearance = Math.min(clearance, .45 + .55 * smooth(ring.radius - .4, ring.radius + .2, inside));
  }
  for (const ring of TIPI_RINGS) if (Math.abs(x - ring.x) < 6 && Math.abs(y - ring.y) < 6) for (const stone of SHARPTAIL_TIPI_STONES) {
    const d = Math.hypot(x - stone.x, y - stone.y) * .9144;
    if (d < stone.size + .25) clearance = Math.min(clearance, smooth(stone.size * .7, stone.size + .25, d));
  }
  if (entrances) for (const e of entrances) {
    if (Math.abs(x - e.x) > 60 || Math.abs(y - e.y) > 60) continue;
    // Two wheel tracks 1.7 m apart, bare where the tires run.
    const dx = e.truck.x - e.x, dy = e.truck.y - e.y, length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length * .93, ny = dx / length * .93;
    for (const side of [-1, 1]) {
      const d = segmentDistance(x, y, e.x + nx * side, e.y + ny * side, e.truck.x + nx * side, e.truck.y + ny * side) * .9144;
      clearance = Math.min(clearance, smooth(.42, .8, d));
    }
    const across = segmentDistance(x, y, e.x - Math.cos(e.along) * 3, e.y - Math.sin(e.along) * 3, e.x + Math.cos(e.along) * 3, e.y + Math.sin(e.along) * 3);
    if (e.kind === 'cattle-guard' && across < 2.2) clearance = 0;
  }
  return clearance;
}

/** Fix the entrances once the area's parking places are known. */
export function registerSharptailEntrances(list: SharptailEntrance[]): void { entrances = list; }
