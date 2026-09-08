import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import { QUAIL_DRAINAGE, distanceToLine, quailCoverAt, quailDrainageAt, trailDistanceAt } from '../src/game/quailLandscape';
import { buildQuailTerrainGeometry, paintQuailGround, QUAIL_TERRAIN_TILE } from '../src/three/subsystems/quailTerrain';

const area = getArea('quail-fields');
const surface = () => ({ height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 });

describe('Quail Fields physical property', () => {
  it('connects both existing entries to the windmill and a return loop on the shared map', () => {
    const endpoints = new Map<string, Set<string>>();
    const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
    for (const trail of area.trails) for (let n = 1; n < trail.points.length; n++) {
      const a = key(trail.points[n - 1]); const b = key(trail.points[n]);
      if (!endpoints.has(a)) endpoints.set(a, new Set());
      if (!endpoints.has(b)) endpoints.set(b, new Set());
      endpoints.get(a)!.add(b); endpoints.get(b)!.add(a);
    }
    const visited = new Set<string>(); const next = [key(area.dropPoints[0].position)];
    while (next.length) { const p = next.pop()!; if (visited.has(p)) continue; visited.add(p); next.push(...endpoints.get(p) ?? []); }
    expect(visited.has(key(area.dropPoints[1].position))).toBe(true);
    const access = area.trails.find(t => t.id === 'windmill-track')!.points.at(-1)!;
    expect(visited.has(key(access))).toBe(true);
    expect(area.trails.find(t => t.id === 'east-return')!.points[0]).toEqual(access);
    expect(area.trails[0].points).toContainEqual(area.trails.find((t) => t.id === 'east-return')?.points.at(-1));
    expect(trailDistanceAt(area, access.x, access.y)).toBeCloseTo(0);
  });

  it('keeps the full windmill service track clear of the tower and stock tank', () => {
    const feature = area.landmarks.find(l => l.kind === 'windmill')!.position;
    const trackHalfWidthM = 1.9 * 1.035;
    for (const [dx, dy] of [[0, 0], [3.35, 0.35]]) {
      const centerlineDistanceM = trailDistanceAt(area,
        feature.x + dx / PROPERTY_PX_TO_M, feature.y + dy / PROPERTY_PX_TO_M) * PROPERTY_PX_TO_M;
      expect(centerlineDistanceM - trackHalfWidthM).toBeGreaterThan(1.3 + 0.32);
    }
    const approach = area.trails.find(t => t.id === 'windmill-track')!.points;
    const departure = area.trails.find(t => t.id === 'east-return')!.points;
    const incoming = new THREE.Vector2(approach.at(-1)!.x - approach.at(-2)!.x, approach.at(-1)!.y - approach.at(-2)!.y).normalize();
    const outgoing = new THREE.Vector2(departure[1].x - departure[0].x, departure[1].y - departure[0].y).normalize();
    expect(incoming.dot(outgoing)).toBeCloseTo(1, 7);
  });

  it('keeps a broad, walkable shallow drainage continuous across either drop', () => {
    const south = new LandscapeModel(area, 'south-gate'); const west = new LandscapeModel(area, 'west-track');
    for (const point of QUAIL_DRAINAGE.slice(1, -1)) {
      expect(quailDrainageAt(point.x, point.y)).toBe(1);
      const a = south.surfaceAtProperty(point.x, point.y, surface());
      const w = west.propertyToWorld(point.x, point.y, { x: 0, z: 0 });
      expect(west.surfaceAtWorld(w.x, w.z, surface())).toEqual(a);
      expect(a.moisture).toBe(1);
      expect(a.slope).toBeLessThan(0.25);
      const shoulder = south.heightAtProperty(point.x, point.y + 50);
      expect(shoulder - a.height).toBeGreaterThan(0.8);
    }
  });

  it('keeps the local trail index identical to the full curved trail corridor', () => {
    for (let y = 11; y < 700; y += 27) for (let x = 7; x < 1200; x += 31) {
      const exact = Math.min(...area.trails.map((trail) => distanceToLine(x, y, trail.points)));
      const indexed = trailDistanceAt(area, x, y, 16);
      if (exact <= 16) expect(indexed).toBeCloseTo(exact, 8);
      else expect(indexed).toBe(Infinity);
    }
  });

  it('keeps the authored prairie folds walkable throughout the property', () => {
    const landscape = new LandscapeModel(area); const sample = surface();
    let steepest = 0;
    for (let y = 0; y <= 700; y += 20) for (let x = 0; x <= 1200; x += 20) {
      landscape.surfaceAtProperty(x, y, sample); steepest = Math.max(steepest, sample.slope);
      expect(Number.isFinite(sample.height)).toBe(true);
    }
    expect(steepest).toBeLessThan(0.33);
    const entry = landscape.heightAtProperty(504, 658);
    const crest = landscape.heightAtProperty(540, 545);
    expect(crest - entry).toBeGreaterThan(4);
  });

  it('retains the authoritative bird habitat independent of visual detail tier', () => {
    for (const patch of area.patches) {
      expect(quailCoverAt(area, patch.x + patch.w / 2, patch.y + patch.h / 2)).toBe(1);
      expect(quailCoverAt(area, patch.x, patch.y)).toBe(1);
    }
    expect(area.patches).toHaveLength(28);
    expect(area.dropPoints[0].position).toEqual({ x: 504, y: 658 });
    expect(area.dropPoints[1].position.x).toBe(42);
    expect(area.dropPoints[1].position.y).toBeCloseTo(406);
  });

  it('covers the full 1097 by 640 meter property in either local coordinate frame', () => {
    for (const drop of area.dropPoints) {
      const landscape = new LandscapeModel(area, drop.id); const bounds = landscape.worldBounds();
      expect(bounds.maxX - bounds.minX).toBeCloseTo(1200 * PROPERTY_PX_TO_M);
      expect(bounds.maxZ - bounds.minZ).toBeCloseTo(700 * PROPERTY_PX_TO_M);
      for (const [px, py] of [[0, 0], [1136, 636]]) {
        const geometry = buildQuailTerrainGeometry(landscape, px, py, 64, 64, 8);
        geometry.computeBoundingBox(); const box = geometry.boundingBox!;
        const corner = landscape.propertyToWorld(px, py, { x: 0, z: 0 });
        expect(box.min.x).toBeCloseTo(corner.x, 3); expect(box.min.z).toBeCloseTo(corner.z, 3);
        expect(box.max.x).toBeCloseTo(corner.x + 64 * PROPERTY_PX_TO_M, 3);
        geometry.dispose();
      }
    }
  });

  it('matches high and distant terrain at shared samples including their edges', () => {
    const landscape = new LandscapeModel(area); const x = QUAIL_TERRAIN_TILE * 8; const y = QUAIL_TERRAIN_TILE * 4;
    const near = buildQuailTerrainGeometry(landscape, x, y, QUAIL_TERRAIN_TILE, QUAIL_TERRAIN_TILE, 32);
    const far = buildQuailTerrainGeometry(landscape, x, y, QUAIL_TERRAIN_TILE, QUAIL_TERRAIN_TILE, 8);
    const a = near.getAttribute('position'); const b = far.getAttribute('position');
    for (let z = 0; z <= 8; z++) for (let x = 0; x <= 8; x++) {
      const i = z * 4 * 33 + x * 4; const j = z * 9 + x;
      expect(a.getX(i)).toBe(b.getX(j)); expect(a.getY(i)).toBe(b.getY(j)); expect(a.getZ(i)).toBe(b.getZ(j));
    }
    const normal = near.getAttribute('normal'); expect(normal.getY(33 * 16 + 16)).toBeGreaterThan(0.95);
    near.dispose(); far.dispose();
  });

  it('paints property coordinates consistently when switching truck drops', () => {
    const south = new LandscapeModel(area, 'south-gate'); const west = new LandscapeModel(area, 'west-track');
    for (const point of [{ x: 504, y: 570 }, { x: 828, y: 217 }, { x: 1040, y: 550 }]) {
      expect(paintQuailGround(south, point.x, point.y, new THREE.Color()))
        .toEqual(paintQuailGround(west, point.x, point.y, new THREE.Color()));
    }
  });
});
