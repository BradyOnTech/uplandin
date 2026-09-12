import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { spawnBirds, updateBirds } from '../src/game/birds';
import type { Rect } from '../src/game/field';
import { mulberry32 } from '../src/game/math';
import { pheasantPondRadii, pheasantWestFence, pheasantWestHarvestParcels } from '../src/game/pheasantHabitat';
import type { Vec2 } from '../src/game/types';
import { PROPERTY_PX_TO_M } from '../src/game/worldUnits';

const contains = (p: Rect, v: Vec2) => v.x >= p.x && v.x <= p.x + p.w && v.y >= p.y && v.y <= p.y + p.h;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe('West Pothole hunting location', () => {
  const area = getArea('pheasant-coverts');
  const pond = area.landmarks.find(l => l.id === 'west-pothole')!;
  const fence = pheasantWestFence(area.landmarks);
  const end = fence.at(-1)!;
  const fields = pheasantWestHarvestParcels(area.landmarks);
  const radii = pheasantPondRadii(pond.id);
  const a = (radii.rx * 1.15 + 5) / PROPERTY_PX_TO_M;
  const b = (radii.rz * 1.15 + 5) / PROPERTY_PX_TO_M;

  it('ends its connected live cover before the headland while retaining a route around all four shores', () => {
    const probe = { x: pond.position.x, y: pond.position.y + b + 8 };
    const connected = new Set(area.patches.filter(p => contains(p, probe)));
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of area.patches) if (!connected.has(p) && [...connected].some(other => overlaps(p, other))) {
        connected.add(p); changed = true;
      }
    }
    // Positive overlap at the corners matters: diagonally touching rectangles
    // can look joined but still stop a runner's continuously sampled movement.
    for (const probe of [
      { x: pond.position.x - a - 9, y: pond.position.y },
      { x: pond.position.x + a + 9, y: pond.position.y },
      { x: pond.position.x, y: pond.position.y - b - 8 },
      { x: end.x - 24, y: end.y - 18 },
    ]) expect([...connected].some(p => contains(p, probe))).toBe(true);
    expect(Math.max(...[...connected].map(p => p.x + p.w))).toBeLessThan(end.x - 8);
    for (const field of fields) for (const patch of area.patches) expect(overlaps(field, patch)).toBe(false);
  });

  it('offers a connected open-field approach to the same visible fence end', () => {
    const live = area.trails.find(t => t.id === 'west-pothole-line')!;
    const flank = area.trails.find(t => t.id === 'west-harvest-flank')!;
    expect(live.points).toContainEqual(flank.points[0]);
    expect(live.points).toContainEqual(flank.points.at(-1));
    expect(flank.points.at(-1)).toEqual(area.landmarks.find(l => l.id === 'north-fence')!.position);
    expect(flank.points.at(-1)).toEqual(end);
    // After entering the field, the alternative stays in actual cut habitat,
    // so a handler can get around the finger without walking its live center.
    for (let i = 2; i < flank.points.length; i++) {
      const start = flank.points[i - 1], finish = flank.points[i];
      for (let n = 0; n <= 30; n++) {
        const v = { x: start.x + (finish.x - start.x) * n / 30, y: start.y + (finish.y - start.y) * n / 30 };
        expect(area.patches.some(p => contains(p, v))).toBe(false);
      }
    }
    expect(fields.some(f => contains(f, flank.points[1]))).toBe(true);
    expect(fields.some(f => contains(f, flank.points[2]))).toBe(true);
  });

  it('allows a pressured rooster to turn along the end and retreat onto the rim without crossing harvested ground', () => {
    const run = (start: Vec2, pressure: number, hunter?: Vec2) => {
      const bird = spawnBirds({ patches: area.patches, bounds: area.world,
        speciesMix: [{ speciesId: 'ringneck', weight: 1 }], birdCount: 1 }, mulberry32(7))[0];
      bird.runs = true; bird.pos = { ...start };
      const path: Vec2[] = [];
      for (let i = 0; i < 90; i++) {
        updateBirds(1000 / 30, [bird], { x: bird.pos.x + pressure, y: bird.pos.y }, {
          patches: area.patches, bounds: area.world, trails: area.trails, worldScale: true,
          runnerStyle: 'pheasant', hunterPos: hunter,
        });
        path.push({ ...bird.pos });
        expect(area.patches.some(p => contains(p, bird.pos))).toBe(true);
        expect(fields.some(f => contains(f, bird.pos))).toBe(false);
      }
      expect(bird.state).toBe('hidden');
      return path;
    };
    const nearEnd = { x: end.x - 24, y: end.y - 18 };
    const endTurn = run(nearEnd, -18);
    expect(Math.max(...endTurn.map(p => Math.abs(p.y - nearEnd.y)))).toBeGreaterThan(2);
    expect(Math.max(...endTurn.map(p => p.x))).toBeLessThan(end.x - 8);
    const blocked = run(nearEnd, -18, { x: end.x - 2, y: nearEnd.y });
    expect(Math.max(...blocked.map(p => p.x))).toBeLessThan(Math.max(...endTurn.map(p => p.x)) - 1);
    const rimReturn = run({ x: pond.position.x + a + 7, y: pond.position.y + b + 4 }, 18);
    expect(rimReturn.at(-1)!.x).toBeLessThan(pond.position.x + a);
  });
});
