import { getDropPoint, type AreaConfig } from './areas';
import { dist } from './math';
import type { RNG, Vec2 } from './types';

/** Starting tuning for a field worth exploring; challenge multiplies this. */
export const QUAIL_FIELD_BIRD_COUNT = 35;

/** Choose a repeatable sequence of separated cover locations. Every challenge
 * uses the same sequence, then stocks a shorter or longer prefix. The opening
 * varies within the first walk-in area; later coveys occupy farther cover.
 * The player's actual route is never read and outcomes are not adapted live.
 */
export function quailEncounterAnchors(area: AreaConfig, dropId: string | undefined, rng: RNG): Vec2[] {
  const drop = getDropPoint(area, dropId);
  const forward = { x: Math.cos(drop.heading), y: Math.sin(drop.heading) };
  const candidates = area.patches.flatMap(patch => Array.from({ length: 10 }, (_, i) => ({
    // Keep the usable corners represented even when all random samples fall
    // outside the opening search band (notably the narrow West entry).
    x: patch.x + 12 + (i < 4 ? i % 2 : rng()) * Math.max(0, patch.w - 24),
    y: patch.y + 12 + (i < 4 ? Math.floor(i / 2) : rng()) * Math.max(0, patch.h - 24),
    variation: rng() * 45 + (i < 4 ? 80 : 0),
  }))).filter(point => area.dropPoints.every(entry => dist(point, entry.position) >= entry.safetyRadius + 16));
  const anchors: Vec2[] = [];
  const firstDistance = 80 + rng() * 75;
  for (let index = 0; index < 14; index++) {
    const wanted = index === 0 ? firstDistance : 160 + index * 95 + rng() * 55;
    let best: typeof candidates[number] | undefined;
    let bestScore = Infinity;
    for (const candidate of candidates) {
      if (anchors.some(anchor => dist(anchor, candidate) < 90)) continue;
      const dx = candidate.x - drop.position.x, dy = candidate.y - drop.position.y;
      const distance = Math.hypot(dx, dy);
      const ahead = dx * forward.x + dy * forward.y;
      const lateral = Math.abs(dx * forward.y - dy * forward.x);
      if (index === 0 && (distance < 70 || distance > 180 || ahead < 55 || lateral > 60)) continue;
      const score = Math.abs(distance - wanted) + candidate.variation + (index === 0 ? lateral * .25 : 0);
      if (score < bestScore) { bestScore = score; best = candidate; }
    }
    if (!best) break;
    anchors.push({ x: best.x, y: best.y });
  }
  return anchors;
}
