import type { AreaLandmark } from './areas';
import type { Rect } from './field';
import { PROPERTY_PX_TO_M } from './worldUnits';

export function pheasantPondRadii(id: string): { rx: number; rz: number } {
  return id === 'area-feature' ? { rx: 34, rz: 23 } : { rx: 43, rz: 29 };
}

/** Keep initial holds on dry shoulders. Rectangular cover is shared by
 * the simulation, survey and vegetation; subtract a conservative water
 * envelope rather than hiding invalid bird positions in the renderer. */
export function pheasantDryCover(patches: readonly Rect[], landmarks: readonly AreaLandmark[]): Rect[] {
  const ponds = landmarks.filter(l => l.kind === 'pond');
  let result = patches.map(p => ({ ...p }));
  for (const pond of ponds) {
    const { rx, rz } = pheasantPondRadii(pond.id);
    const halfX = (rx * 1.15 + 3) / PROPERTY_PX_TO_M;
    const halfY = (rz * 1.15 + 3) / PROPERTY_PX_TO_M;
    const left = pond.position.x - halfX, right = pond.position.x + halfX;
    const top = pond.position.y - halfY, bottom = pond.position.y + halfY;
    result = result.flatMap(p => {
      const x0 = Math.max(p.x, left), x1 = Math.min(p.x + p.w, right);
      const y0 = Math.max(p.y, top), y1 = Math.min(p.y + p.h, bottom);
      if (x0 >= x1 || y0 >= y1) return [p];
      return [
        { x: p.x, y: p.y, w: p.w, h: y0 - p.y },
        { x: p.x, y: y1, w: p.w, h: p.y + p.h - y1 },
        { x: p.x, y: y0, w: x0 - p.x, h: y1 - y0 },
        { x: x1, y: y0, w: p.x + p.w - x1, h: y1 - y0 },
      ].filter(fragment => fragment.w >= 10 && fragment.h >= 8);
    });
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
