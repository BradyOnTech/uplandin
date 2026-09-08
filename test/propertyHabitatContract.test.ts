import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AREAS, getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import { PropertyTrailsSystem } from '../src/three/subsystems/propertyTrails';
import { pheasantPonds, samplePheasantHarvest } from '../src/three/subsystems/pheasantLandscape';
import type { Ctx } from '../src/three/engine';
import { spawnBirds } from '../src/game/birds';
import { mulberry32 } from '../src/game/math';
import { createThreeHuntSetup } from '../src/game/gameplayMode';
import { pheasantPondObstacles, pheasantPondRadii } from '../src/game/pheasantHabitat';

describe('authored habitat contracts', () => {
  it('faces each Chukar entry along its first switchback', () => {
    const area = getArea('chukar-ridge');
    for (const drop of area.dropPoints) {
      const route = area.trails.find(t => t.points[0].x === drop.position.x && t.points[0].y === drop.position.y)!;
      const next = route.points[1], dx = next.x - drop.position.x, dy = next.y - drop.position.y;
      expect((Math.cos(drop.heading) * dx + Math.sin(drop.heading) * dy) / Math.hypot(dx, dy)).toBeCloseTo(1);
    }
  });
  it('encloses pond water in the dry-land movement boundary', () => {
    for (const id of ['area-feature', 'south-slough']) {
      const { rx, rz } = pheasantPondRadii(id), circles = pheasantPondObstacles(id);
      for (let i = 0; i < 360; i++) {
        const angle = i * Math.PI / 180, x = Math.cos(angle) * rx, z = Math.sin(angle) * rz;
        expect(circles.some(c => Math.hypot(x - c.x, z - c.z) < c.radius)).toBe(true);
      }
    }
  });
  it('keeps pheasant cover and its initial birds outside open water', () => {
    const area = getArea('pheasant-coverts'), landscape = new LandscapeModel(area);
    const ponds = pheasantPonds(landscape);
    for (const patch of area.patches) {
      expect(patch.x).toBeGreaterThanOrEqual(area.world.x);
      expect(patch.y).toBeGreaterThanOrEqual(area.world.y);
      expect(patch.x + patch.w).toBeLessThanOrEqual(area.world.x + area.world.w);
      expect(patch.y + patch.h).toBeLessThanOrEqual(area.world.y + area.world.h);
      for (const pond of ponds) {
        // The nearest point of each rectangle proves the entire footprint
        // remains outside the water, including between sampled corners.
        const x = Math.max(patch.x, Math.min(pond.x, patch.x + patch.w));
        const y = Math.max(patch.y, Math.min(pond.y, patch.y + patch.h));
        expect(Math.hypot((x - pond.x) * PROPERTY_PX_TO_M / pond.rx,
          (y - pond.y) * PROPERTY_PX_TO_M / pond.ry)).toBeGreaterThan(1.15);
      }
    }
    for (let seed = 0; seed < 12; seed++) {
      const birds = spawnBirds({ patches: area.patches, bounds: area.world, speciesMix: area.speciesMix, birdCount: 60 }, mulberry32(seed));
      expect(birds).toHaveLength(60);
      for (const bird of birds) for (const pond of ponds) {
        expect(Math.hypot((bird.pos.x - pond.x) * PROPERTY_PX_TO_M / pond.rx,
          (bird.pos.y - pond.y) * PROPERTY_PX_TO_M / pond.ry)).toBeGreaterThan(1.15);
      }
    }
    for (const drop of area.dropPoints) for (const challenge of ['relaxed', 'balanced', 'wild']) {
      const { hunt } = createThreeHuntSetup(`?area=pheasant-coverts&drop=${drop.id}&challenge=${challenge}`, mulberry32(22), null);
      for (const bird of hunt.birds) for (const pond of ponds) {
        expect(Math.hypot((bird.pos.x - pond.x) * PROPERTY_PX_TO_M / pond.rx,
          (bird.pos.y - pond.y) * PROPERTY_PX_TO_M / pond.ry)).toBeGreaterThan(1.15);
      }
    }
  });
  it.each(AREAS)('$name has finite, connected routes from both entries', area => {
    const graph = new Map<string, Set<string>>();
    const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
    for (const trail of area.trails) {
      expect(trail.points.length).toBeGreaterThan(1);
      for (const p of trail.points) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(p.x).toBeGreaterThanOrEqual(area.world.x);
        expect(p.x).toBeLessThanOrEqual(area.world.x + area.world.w);
        expect(p.y).toBeGreaterThanOrEqual(area.world.y);
        expect(p.y).toBeLessThanOrEqual(area.world.y + area.world.h);
      }
      for (let i = 1; i < trail.points.length; i++) {
        const a = key(trail.points[i - 1]), b = key(trail.points[i]);
        if (!graph.has(a)) graph.set(a, new Set());
        if (!graph.has(b)) graph.set(b, new Set());
        graph.get(a)!.add(b); graph.get(b)!.add(a);
      }
    }
    const visited = new Set<string>(), queue = [key(area.dropPoints[0].position)];
    while (queue.length) {
      const point = queue.pop()!;
      if (visited.has(point)) continue;
      visited.add(point); queue.push(...graph.get(point) ?? []);
    }
    for (const drop of area.dropPoints) expect(visited.has(key(drop.position))).toBe(true);
    expect(visited.size).toBe(graph.size);
  });

  it.each(['pheasant-coverts', 'chukar-ridge', 'sharptail-prairie'])('%s builds grounded trail geometry without long bridging faces', id => {
    const scene = new THREE.Scene();
    const landscape = new LandscapeModel(getArea(id));
    const system = new PropertyTrailsSystem(landscape);
    const ctx = { scene, quality: 'lite' } as Ctx;
    system.init(ctx);
    expect(scene.children.length).toBeGreaterThan(0);
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const vertices = object.geometry.getAttribute('position');
      for (const value of vertices.array) expect(Number.isFinite(value)).toBe(true);
      for (let i = 0; i < vertices.count; i++) {
        const ground = landscape.heightAtWorld(vertices.getX(i), vertices.getZ(i));
        expect(vertices.getY(i) - ground).toBeGreaterThan(.025);
        expect(vertices.getY(i) - ground).toBeLessThan(.06);
      }
      const indices = object.geometry.getIndex()!;
      for (let i = 0; i < indices.count; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(vertices, indices.getX(i));
        for (let j = 1; j < 3; j++) {
          const b = new THREE.Vector3().fromBufferAttribute(vertices, indices.getX(i + j));
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(8);
        }
      }
    });
    system.dispose(ctx);
    expect(scene.children).toHaveLength(0);
  });

  it('keeps ponds in the same physical place and elevation from either gate', () => {
    const area = getArea('pheasant-coverts');
    const south = new LandscapeModel(area, 'south-gate'), west = new LandscapeModel(area, 'west-track');
    expect(pheasantPonds(south)).toEqual(pheasantPonds(west));
    expect(pheasantPonds(south)).toHaveLength(area.landmarks.filter(l => l.kind === 'pond').length);
  });

  it('keeps pheasant access routes on the pond shoulders, with room for both track edges', () => {
    const area = getArea('pheasant-coverts');
    const landscape = new LandscapeModel(area);
    for (const trail of area.trails) for (let i = 1; i < trail.points.length; i++) {
      const a = trail.points[i - 1], b = trail.points[i];
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
      for (let step = 0; step <= steps; step++) {
        const x = a.x + (b.x - a.x) * step / steps;
        const y = a.y + (b.y - a.y) * step / steps;
        for (const pond of pheasantPonds(landscape)) {
          const radius = Math.hypot((x - pond.x) * PROPERTY_PX_TO_M / pond.rx, (y - pond.y) * PROPERTY_PX_TO_M / pond.ry);
          expect(radius, `${trail.id} crosses ${pond.landmarkId}`).toBeGreaterThan(1.2);
        }
      }
    }
  });

  it('keeps cover uncut and feathers the verge before a fully harvested parcel', () => {
    const area = { ...getArea('pheasant-coverts'), patches: [{ x: 90, y: 90, w: 20, h: 20 }] };
    const fields = [{ x: 100, y: 100, rx: 100, ry: 100, angle: 0 }];
    const sample = (x: number) => samplePheasantHarvest(area, x, 100, fields, { amount: 0, row: 0, angle: 0 }).amount;
    expect(sample(100)).toBe(0); expect(sample(110)).toBe(0);
    expect(sample(113.5)).toBeCloseTo(.5);
    expect(sample(117)).toBe(1);
    expect(sample(205)).toBe(0);
  });

  it('keeps parallel rows aligned inside rotated parcels', () => {
    const area = { ...getArea('pheasant-coverts'), patches: [] };
    const angle = .35, field = { x: 300, y: 300, rx: 100, ry: 80, angle };
    const sample = (u: number, v: number) => samplePheasantHarvest(area,
      field.x + u * Math.cos(angle) - v * Math.sin(angle),
      field.y + u * Math.sin(angle) + v * Math.cos(angle), [field], { amount: 0, row: 0, angle: 0 });
    expect(sample(-30, 12).row).toBeCloseTo(sample(30, 12).row);
    expect(sample(0, 20).row - sample(0, 12).row).toBeCloseTo(8);
    expect(sample(0, 0).amount).toBe(1);
  });
});
