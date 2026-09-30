import { getDropPoint, type AreaConfig, type AreaTrail } from './areas';
import { LandscapeModel, type GroundSample } from './landscape';
import { dist } from './math';
import type { RNG, Vec2 } from './types';
import { huntHabitatAffinity, huntingDoctrine } from './huntDoctrine';

/**
 * A small amount of authored structure makes the larger properties read as
 * places to hunt instead of a bag of random rectangles.  The returned points
 * are still cover anchors, so the existing spawn code remains responsible for
 * species mix, covey size, jitter, and all exclusion rules.
 */
const MAX_ANCHORS = 28;
const CANDIDATES_PER_PATCH = 12;
const PATCH_EDGE = 10;
const DROP_BUFFER = 16;

interface Candidate {
  point: Vec2;
  routeDistance: number;
  distanceFromDrop: number;
  ahead: number;
  lateral: number;
  /** Signed lateral offset: positive to the left of the drop heading. */
  side: number;
  variation: number;
  /** Terrain affinity keeps a route from becoming a species-blind scatter. */
  habitat: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distanceToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-6) return dist(point, start);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function distanceToTrails(point: Vec2, trails: readonly AreaTrail[]): number {
  let nearest = Infinity;
  for (const trail of trails) {
    for (let index = 1; index < trail.points.length; index++) {
      nearest = Math.min(nearest, distanceToSegment(point, trail.points[index - 1], trail.points[index]));
    }
  }
  return nearest;
}

function outsideDropSafety(point: Vec2, area: AreaConfig): boolean {
  return area.dropPoints.every((drop) => dist(point, drop.position) >= drop.safetyRadius + DROP_BUFFER);
}

function candidateFor(
  point: Vec2,
  area: AreaConfig,
  drop: ReturnType<typeof getDropPoint>,
  rng: RNG,
  landscape: LandscapeModel,
  surface: GroundSample,
): Candidate | undefined {
  if (!outsideDropSafety(point, area)) return undefined;
  landscape.surfaceAtProperty(point.x, point.y, surface);
  const dx = point.x - drop.position.x;
  const dy = point.y - drop.position.y;
  const forwardX = Math.cos(drop.heading);
  const forwardY = Math.sin(drop.heading);
  return {
    point,
    routeDistance: distanceToTrails(point, area.trails),
    distanceFromDrop: Math.hypot(dx, dy),
    ahead: dx * forwardX + dy * forwardY,
    lateral: Math.abs(dx * forwardY - dy * forwardX),
    side: dx * forwardY - dy * forwardX,
    variation: rng() * 70,
    habitat: huntHabitatAffinity(huntingDoctrine(area.id), surface),
  };
}

/** Weighted pick among the few best-scoring candidates. Close scores are
 * near-equal choices; a clearly worse spot is rarely taken. */
export function pickAmongBest<T>(scored: { candidate: T; score: number }[], rng: RNG, count = 5, softness = 28): T | undefined {
  if (scored.length === 0) return undefined;
  const top = [...scored].sort((a, b) => a.score - b.score).slice(0, count);
  const weights = top.map(entry => Math.exp(-(entry.score - top[0].score) / softness));
  let roll = rng() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < top.length; index++) {
    roll -= weights[index];
    if (roll <= 0) return top[index].candidate;
  }
  return top[0].candidate;
}

/**
 * Choose separated cover positions in route order for a Three.js field.
 *
 * The map's trail network supplies the hunting line and the selected drop
 * supplies the first direction.  We deliberately choose points *inside* the
 * existing cover patches: the renderer, dog, and 2D scene continue to share
 * one world definition, while the 3D hunt no longer starts with arbitrary
 * cover that ignores the property layout.
 */
export function authoredEncounterAnchors(
  area: AreaConfig,
  dropId: string | undefined,
  rng: RNG = Math.random,
): Vec2[] {
  if (area.patches.length === 0 || area.trails.length === 0) return [];

  const drop = getDropPoint(area, dropId);
  const landscape = new LandscapeModel(area);
  const surface: GroundSample = {
    height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0,
  };
  const candidates: Candidate[] = [];
  for (const patch of area.patches) {
    const insetX = Math.min(PATCH_EDGE, patch.w / 2);
    const insetY = Math.min(PATCH_EDGE, patch.h / 2);
    for (let index = 0; index < CANDIDATES_PER_PATCH; index++) {
      const point = {
        x: patch.x + insetX + rng() * Math.max(0, patch.w - insetX * 2),
        y: patch.y + insetY + rng() * Math.max(0, patch.h - insetY * 2),
      };
      const candidate = candidateFor(point, area, drop, rng, landscape, surface);
      if (candidate) candidates.push(candidate);
    }
  }

  // A patch can be narrower than PATCH_EDGE*2. Keep its center available so
  // a hand-authored or future mobile-sized property still gets encounters.
  for (const patch of area.patches) {
    const point = { x: patch.x + patch.w / 2, y: patch.y + patch.h / 2 };
    const candidate = candidateFor(point, area, drop, rng, landscape, surface);
    if (candidate) candidates.push(candidate);
  }
  if (candidates.length === 0) return [];

  const chosen: Candidate[] = [];
  const style = area.terrain.kind;
  // Close enough that a hunter working the routes meets birds every minute
  // or two; far enough that one flush never spills into the next covey.
  const spacing = style === 'woods' || style === 'wetland' ? 56 : style === 'rimrock' || style === 'canyon' ? 64 : 72;
  // Each visit leans the day a different way: an opening further out or
  // closer in, a favoured flank, and a pick among the good cover rather
  // than the single best spot, so the birds are not waiting in the same
  // place every hunt. Habitat and route still decide what "good" means.
  const firstDistance = 72 + rng() * 108;
  const flank = rng() < .34 ? 0 : rng() < .5 ? 1 : -1;
  for (let index = 0; index < MAX_ANCHORS; index++) {
    const wantedDistance = firstDistance + index * (spacing + 8) + rng() * 80;
    const previousDistance = chosen.at(-1)?.distanceFromDrop ?? 0;
    const remaining = candidates.filter((candidate) =>
      !chosen.some((picked) => dist(picked.point, candidate.point) < spacing) &&
      candidate.distanceFromDrop >= previousDistance + (index === 0 ? 0 : spacing * 0.58),
    );
    if (remaining.length === 0) break;

    const scored: { candidate: Candidate; score: number }[] = [];
    for (const candidate of remaining) {
      const routeWeight = style === 'prairie' ? 0.62 : style === 'desert' ? 0.78 : 0.9;
      const routePenalty = Math.min(candidate.routeDistance, 180) * routeWeight;
      const habitatPenalty = (1 - candidate.habitat) * 74;
      // The opening needs to be ahead of the hunter. Later anchors may use a
      // flank, which is how loops and benches become useful hunting lines.
      const openingPenalty = index === 0
        ? (candidate.ahead < 42 ? 220 : Math.max(0, candidate.lateral - 150) * 0.35)
        : 0;
      const flankPenalty = flank === 0 ? 0 : Math.max(0, -flank * candidate.side) * (index === 0 ? .35 : .2);
      const score = Math.abs(candidate.distanceFromDrop - wantedDistance) +
        routePenalty + habitatPenalty + openingPenalty + flankPenalty + candidate.variation;
      scored.push({ candidate, score });
    }
    const best = pickAmongBest(scored, rng);
    if (!best) break;
    chosen.push(best);
  }

  // Candidate availability can be sparse on a future hand-authored map. A
  // final distance sort preserves progression even if the loop had to stop
  // early, and keeps the result stable for a seeded RNG.
  return chosen
    .sort((a, b) => a.distanceFromDrop - b.distanceFromDrop)
    .map((candidate) => candidate.point);
}
