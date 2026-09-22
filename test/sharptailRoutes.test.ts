import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import type { Vec2 } from '../src/game/types';

const area = getArea('sharptail-prairie');
const surface = () => ({ height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 });
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const segmentDistance = (point: Vec2, a: Vec2, b: Vec2) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
};
const key = (p: Vec2) => `${p.x},${p.y}`;
const routeSamples = (a: Vec2, b: Vec2) => {
  const count = Math.ceil(distance(a, b) / 4);
  return Array.from({ length: count + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / count, y: a.y + (b.y - a.y) * i / count }));
};

describe('Sharptail rolling prairie access', () => {
  it('keeps both parking entries connected to the Shack with a broad return loop', () => {
    const graph = new Map<string, Set<string>>();
    for (const trail of area.trails) {
      const first = key(trail.points[0]), last = key(trail.points.at(-1)!);
      if (!graph.has(first)) graph.set(first, new Set());
      if (!graph.has(last)) graph.set(last, new Set());
      graph.get(first)!.add(last); graph.get(last)!.add(first);
      for (const p of trail.points) {
        expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(area.world.w);
        expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(area.world.h);
      }
    }
    for (const drop of area.dropPoints) {
      const seen = new Set([key(drop.position)]), queue = [...seen];
      for (const node of queue) for (const next of graph.get(node) ?? []) {
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
      expect(seen.size).toBe(graph.size);
    }
    const approach = area.trails.find(t => t.id === 'wind-break-edge')!;
    const back = area.trails.find(t => t.id === 'prairie-return')!;
    expect(approach.points.at(-1)).toEqual(back.points[0]);
    expect(approach.points[0]).toEqual(back.points.at(-1));
    expect(Math.max(...back.points.map(p => p.x)) - Math.max(...approach.points.map(p => p.x))).toBeGreaterThan(150);
    // Bound extra segment-distance work in the mobile grass-placement path.
    expect(area.trails.reduce((sum, t) => sum + t.points.length, 0)).toBeLessThan(100);
  });

  it('keeps the lane and its shoulders outside the Shack collision circle', () => {
    const shack = area.landmarks.find(l => l.id === 'area-feature')!.position;
    let nearest = Infinity;
    for (const trail of area.trails) for (let i = 1; i < trail.points.length; i++) {
      nearest = Math.min(nearest, segmentDistance(shack, trail.points[i - 1], trail.points[i]) * PROPERTY_PX_TO_M);
    }
    // The existing building uses a 7.8m obstacle. Keep room for the lane's
    // shoulder and the player's body, rather than merely avoiding its center.
    expect(nearest).toBeGreaterThan(7.8 + 3);
  });

  it('adds readable relief without turning open-country casts into steep climbing', () => {
    const landscape = new LandscapeModel(area), ground = surface();
    let low = Infinity, high = -Infinity;
    for (let x = 0; x <= area.world.w; x += 12) for (let y = 0; y <= area.world.h; y += 12) {
      landscape.surfaceAtProperty(x, y, ground);
      expect(ground.slope).toBeLessThan(.2);
      low = Math.min(low, ground.height); high = Math.max(high, ground.height);
    }
    expect(high - low).toBeGreaterThan(16); expect(high - low).toBeLessThan(25);
  });

  it('shares safe route grades and physical terrain between both parking places', () => {
    const south = new LandscapeModel(area, 'south-gate'), west = new LandscapeModel(area, 'west-track');
    const ground = surface();
    for (const trail of area.trails) for (let i = 1; i < trail.points.length; i++) {
      for (const p of routeSamples(trail.points[i - 1], trail.points[i])) {
        const a = south.propertyToWorld(p.x, p.y, { x: 0, z: 0 });
        const b = west.propertyToWorld(p.x, p.y, { x: 0, z: 0 });
        expect(south.heightAtWorld(a.x, a.z)).toBeCloseTo(west.heightAtWorld(b.x, b.z), 8);
        south.surfaceAtProperty(p.x, p.y, ground);
        expect(ground.slope).toBeLessThan(.2);
      }
    }
    for (const drop of area.dropPoints) {
      const trail = area.trails.find(t => distance(t.points[0], drop.position) < .01)!;
      for (const p of routeSamples(drop.position, trail.points[1])) {
        south.surfaceAtProperty(p.x, p.y, ground);
        expect(ground.slope).toBeLessThan(.12);
      }
    }
  });
});
