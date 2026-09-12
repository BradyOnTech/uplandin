import type { AreaLandmark } from './areas';
import type { Rect } from './field';
import type { Vec2 } from './types';
import { PROPERTY_PX_TO_M } from './worldUnits';

/** The cut feeding field below West Pothole's dry shoulder. Shared by
 * stocking, the survey map, terrain paint, and stubble placement. */
export function pheasantWestHarvest(landmarks: readonly AreaLandmark[]): Rect | undefined {
  const pond = landmarks.find(l => l.id === 'west-pothole');
  if (!pond) return undefined;
  return { x: pond.position.x - 70, y: pond.position.y + 72, w: 140, h: 90 };
}

/** The same managed headlands bound the visible crop, initial holds and
 * covered running routes. The open east field makes the fence end real. */
export function pheasantWestHarvestParcels(landmarks: readonly AreaLandmark[]): Rect[] {
  const main = pheasantWestHarvest(landmarks);
  if (!main) return [];
  return [
    main,
    { x: main.x + main.w, y: main.y, w: 72, h: main.h },
    { x: main.x + main.w + 72, y: main.y - 154, w: 76, h: main.h + 154 },
  ];
}

/** A fence on the dry edge of the cover tongue, with its eastern end in
 * the open headland. The landmark, trail and rendered posts share it. */
export function pheasantWestFence(landmarks: readonly AreaLandmark[]): Vec2[] {
  const pond = landmarks.find(l => l.id === 'west-pothole');
  if (!pond) return [];
  return [
    { x: pond.position.x + 52, y: pond.position.y + 64 },
    { x: pond.position.x + 142, y: pond.position.y + 64 },
  ];
}

/** The Slough has a wet interior and a cut eastern headland. Unlike the
 * bounded West Pothole finger, its north neck leads into the farm shelterbelt. */
export function pheasantSouthHarvestParcels(landmarks: readonly AreaLandmark[]): Rect[] {
  const pond = landmarks.find(l => l.id === 'south-slough');
  if (!pond) return [];
  const { x, y } = pond.position;
  return [
    { x: x + 142, y: y - 108, w: 82, h: 208 },
    { x: x - 60, y: y + 64, w: 202, h: 42 },
  ];
}

export function pheasantHomesteadHarvestParcels(landmarks: readonly AreaLandmark[]): Rect[] {
  const barn = landmarks.find(l => l.id === 'old-homestead');
  if (!barn) return [];
  const { x, y } = barn.position;
  return [
    { x: x - 160, y: y - 106, w: 80, h: 168 },
    { x: x - 80, y: y - 132, w: 210, h: 38 },
    { x: x - 32, y: y - 51, w: 101, h: 50 },
  ];
}

/** A maintained yard, not standing bird habitat or planted stubble. */
export function pheasantHomesteadYard(landmarks: readonly AreaLandmark[]): Rect | undefined {
  const barn = landmarks.find(l => l.id === 'old-homestead');
  if (!barn) return undefined;
  return { x: barn.position.x - 34, y: barn.position.y - 28, w: 76, h: 74 };
}

export function pheasantManagedParcels(landmarks: readonly AreaLandmark[]): Rect[] {
  return [...pheasantWestHarvestParcels(landmarks), ...pheasantSouthHarvestParcels(landmarks),
    ...pheasantHomesteadHarvestParcels(landmarks)];
}

function pheasantSouthPocket(landmarks: readonly AreaLandmark[]): { boundary: Rect; cover: Rect[] } | undefined {
  const pond = landmarks.find(l => l.id === 'south-slough');
  if (!pond) return undefined;
  const { x, y } = pond.position;
  const { rx, rz } = pheasantPondRadii(pond.id);
  const a = (rx * 1.15 + 5) / PROPERTY_PX_TO_M;
  const b = (rz * 1.15 + 5) / PROPERTY_PX_TO_M;
  return {
    boundary: { x: x - 94, y: y - 114, w: 318, h: 224 },
    cover: [
      { x: x - a - 20, y: y - b - 8, w: 20, h: b * 2 + 16 },
      { x: x + a, y: y - b - 8, w: 22, h: b * 2 + 16 },
      { x: x - a - 4, y: y - b - 18, w: a * 2 + 8, h: 18 },
      { x: x - a - 4, y: y + b, w: a * 2 + 8, h: 18 },
      // A wide dry neck joins the Homestead's rough eastern windbreak.
      // It lets a runner change locations instead of every shore being a trap.
      { x: x + 10, y: y - 98, w: 48, h: 62 },
      { x: x + a - 2, y: y - b - 6, w: 65, h: 28 },
    ],
  };
}

function pheasantHomesteadPocket(landmarks: readonly AreaLandmark[]): { boundary: Rect; cover: Rect[] } | undefined {
  const barn = landmarks.find(l => l.id === 'old-homestead');
  if (!barn) return undefined;
  const { x, y } = barn.position;
  return {
    boundary: { x: x - 164, y: y - 136, w: 306, h: 194 },
    cover: [
      // Rough grass below the three-sided farm windbreak, with a broad
      // internal field and an open yard. The western leg has an exposed end;
      // the eastern leg connects into the Slough's north neck.
      { x: x - 66, y: y - 79, w: 25, h: 124 },
      { x: x - 66, y: y - 82, w: 166, h: 26 },
      { x: x + 77, y: y - 70, w: 23, h: 62 },
    ],
  };
}

function pheasantWestPocket(landmarks: readonly AreaLandmark[]): { boundary: Rect; cover: Rect[] } | undefined {
  const pond = landmarks.find(l => l.id === 'west-pothole');
  if (!pond) return undefined;
  const { x, y } = pond.position;
  const { rx, rz } = pheasantPondRadii(pond.id);
  const a = (rx * 1.15 + 5) / PROPERTY_PX_TO_M;
  const b = (rz * 1.15 + 5) / PROPERTY_PX_TO_M;
  return {
    boundary: { x: x - 94, y: y - 82, w: 312, h: 244 },
    cover: [
      // Overlapping corners allow a pressured bird to turn around the pond
      // rather than stop at a rectangle seam. The whole rim stays dense.
      { x: x - a - 18, y: y - b - 8, w: 18, h: b * 2 + 16 },
      { x: x + a, y: y - b - 8, w: 18, h: b * 2 + 16 },
      { x: x - a - 4, y: y - b - 16, w: a * 2 + 8, h: 16 },
      { x: x - a - 4, y: y + b, w: a * 2 + 8, h: 16 },
      // A substantial dry finger leads toward the visible fence end. It
      // has lateral room, but no accidental bridge to the next property stand.
      { x: x + a - 2, y: y + b - 8, w: 132 - a, h: 24 },
    ],
  };
}

function subtractCover(patches: readonly Rect[], cut: Rect): Rect[] {
  return patches.flatMap(p => {
    const x0 = Math.max(p.x, cut.x), x1 = Math.min(p.x + p.w, cut.x + cut.w);
    const y0 = Math.max(p.y, cut.y), y1 = Math.min(p.y + p.h, cut.y + cut.h);
    if (x0 >= x1 || y0 >= y1) return [p];
    return [
      { x: p.x, y: p.y, w: p.w, h: y0 - p.y },
      { x: p.x, y: y1, w: p.w, h: p.y + p.h - y1 },
      { x: p.x, y: y0, w: x0 - p.x, h: y1 - y0 },
      { x: x1, y: y0, w: p.x + p.w - x1, h: y1 - y0 },
    ].filter(fragment => fragment.w >= 10 && fragment.h >= 8);
  });
}

export function pheasantPondRadii(id: string): { rx: number; rz: number } {
  return id === 'area-feature' ? { rx: 34, rz: 23 } : { rx: 43, rz: 29 };
}

/** A conservative three-circle envelope for the current dry-land locomotion.
 * Offsets and radii are metres, matching player and prop collision. */
export function pheasantPondObstacles(id: string): { x: number; z: number; radius: number }[] {
  const { rx, rz } = pheasantPondRadii(id);
  return [-(rx - rz), 0, rx - rz].map(x => ({ x, z: 0, radius: rz + 2 }));
}

/** Keep initial holds on dry shoulders. Rectangular cover is shared by
 * the simulation, survey and vegetation; subtract a conservative water
 * envelope rather than hiding invalid bird positions in the renderer. */
export function pheasantDryCover(patches: readonly Rect[], landmarks: readonly AreaLandmark[]): Rect[] {
  const ponds = landmarks.filter(l => l.kind === 'pond');
  let result = patches.map(p => ({ ...p }));
  const pockets = [pheasantWestPocket(landmarks), pheasantSouthPocket(landmarks), pheasantHomesteadPocket(landmarks)]
    .filter((p): p is { boundary: Rect; cover: Rect[] } => !!p);
  for (const pocket of pockets) {
    // Own this hunting location as a whole. Previously overlapping random
    // rectangles carried its southern shore far beyond the visible fence.
    result = subtractCover(result, pocket.boundary);
  }
  // Clear random cover first, then join authored pockets. Their overlapping
  // boundaries must not cut the intentional Slough-to-shelterbelt connection.
  for (const pocket of pockets) result.push(...pocket.cover);
  for (const field of pheasantManagedParcels(landmarks)) result = subtractCover(result, field);
  const yard = pheasantHomesteadYard(landmarks);
  if (yard) result = subtractCover(result, yard);
  for (const pond of ponds) {
    const { rx, rz } = pheasantPondRadii(pond.id);
    const halfX = (rx * 1.15 + 3) / PROPERTY_PX_TO_M;
    const halfY = (rz * 1.15 + 3) / PROPERTY_PX_TO_M;
    const left = pond.position.x - halfX, right = pond.position.x + halfX;
    const top = pond.position.y - halfY, bottom = pond.position.y + halfY;
    result = subtractCover(result, { x: left, y: top, w: right - left, h: bottom - top });
  }
  return result;
}

/** Connected-looking grass shoulders around each wet pocket. Water-edge
 * reeds are rendered separately; these are the dry places birds can hold. */
export function pheasantShoreCover(landmarks: readonly AreaLandmark[]): Rect[] {
  return landmarks.filter(l => l.kind === 'pond').flatMap(pond => {
    const { rx, rz } = pheasantPondRadii(pond.id);
    const x = pond.position.x, y = pond.position.y;
    const a = (rx * 1.15 + 5) / PROPERTY_PX_TO_M;
    const b = (rz * 1.15 + 5) / PROPERTY_PX_TO_M;
    return [
      { x: x - a - 18, y: y - b, w: 18, h: b * 2 },
      { x: x + a, y: y - b, w: 18, h: b * 2 },
      { x: x - a, y: y - b - 16, w: a * 2, h: 16 },
      { x: x - a, y: y + b, w: a * 2, h: 16 },
    ];
  });
}
