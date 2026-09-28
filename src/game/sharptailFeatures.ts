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
  let clearance = 1;
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
