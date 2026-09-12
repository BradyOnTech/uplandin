import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { spawnBirds, updateBirds } from '../src/game/birds';
import type { Rect } from '../src/game/field';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import { mulberry32 } from '../src/game/math';
import { pheasantHomesteadYard, pheasantManagedParcels, pheasantPondObstacles, pheasantPondRadii } from '../src/game/pheasantHabitat';
import type { Vec2 } from '../src/game/types';
import type { Ctx } from '../src/three/engine';
import { LandmarksSystem } from '../src/three/subsystems/landmarks';
import { PHEASANT_GRAIN_BIN, PHEASANT_HOMESTEAD_OBSTACLES } from '../src/three/subsystems/pheasantHomestead';
import { pheasantFields, pheasantHarvestAt, pheasantPlantClear } from '../src/three/subsystems/pheasantLandscape';

const contains = (p: Rect, v: Vec2) => v.x >= p.x && v.x <= p.x + p.w && v.y >= p.y && v.y <= p.y + p.h;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const area = getArea('pheasant-coverts');
const pond = area.landmarks.find(l => l.id === 'south-slough')!;
const barn = area.landmarks.find(l => l.id === 'old-homestead')!;
const fields = pheasantManagedParcels(area.landmarks);

describe('South Slough and Old Homestead hunting locations', () => {
  it('joins all four shores to the rough farm windbreak while preserving real harvested approaches and a maintained yard', () => {
    const { rx, rz } = pheasantPondRadii(pond.id);
    const a = (rx * 1.15 + 5) / PROPERTY_PX_TO_M;
    const b = (rz * 1.15 + 5) / PROPERTY_PX_TO_M;
    const connected = new Set(area.patches.filter(p => contains(p, { x: pond.position.x, y: pond.position.y + b + 8 })));
    let changed = true;
    while (changed) {
      changed = false;
      for (const patch of area.patches) if (!connected.has(patch) && [...connected].some(p => overlaps(p, patch))) {
        connected.add(patch); changed = true;
      }
    }
    for (const point of [
      { x: pond.position.x - a - 10, y: pond.position.y },
      { x: pond.position.x + a + 10, y: pond.position.y },
      { x: pond.position.x, y: pond.position.y - b - 9 },
      { x: pond.position.x + 28, y: pond.position.y - 86 },
      { x: barn.position.x + 88, y: barn.position.y - 34 },
      { x: barn.position.x + 18, y: barn.position.y - 69 },
      { x: barn.position.x - 54, y: barn.position.y + 34 },
    ]) expect([...connected].some(p => contains(p, point)), JSON.stringify(point)).toBe(true);
    const yard = pheasantHomesteadYard(area.landmarks)!;
    for (const field of [...fields, yard]) for (const patch of area.patches) expect(overlaps(field, patch)).toBe(false);
    const yardCenter = { x: yard.x + yard.w / 2, y: yard.y + yard.h / 2 };
    expect(pheasantPlantClear(area, yardCenter.x, yardCenter.y)).toBe(false);
    expect(pheasantHarvestAt(area, yardCenter.x, yardCenter.y, pheasantFields(area))).toBe(0);
  });

  it('provides open alternatives around the slough and shelterbelt without routing the player through water or the farm buildings', () => {
    for (const id of ['south-headland-flank', 'homestead-field-loop']) {
      const route = area.trails.find(t => t.id === id)!;
      // The South branch starts in the live shoreline. Once in its cut
      // field it stays outside standing cover all the way to the far corner.
      for (let i = id === 'south-headland-flank' ? 2 : 1; i < route.points.length; i++) {
        const a = route.points[i - 1], b = route.points[i];
        for (let step = 0; step <= 40; step++) {
          const v = { x: a.x + (b.x - a.x) * step / 40, y: a.y + (b.y - a.y) * step / 40 };
          expect(area.patches.some(p => contains(p, v)), `${id}: ${JSON.stringify(v)}`).toBe(false);
        }
      }
    }
    const obstacles = [
      ...area.landmarks.filter(l => l.kind === 'pond').flatMap(l => pheasantPondObstacles(l.id).map(c => ({
        x: l.position.x * PROPERTY_PX_TO_M + c.x, z: l.position.y * PROPERTY_PX_TO_M + c.z, radius: c.radius,
      }))),
      ...PHEASANT_HOMESTEAD_OBSTACLES.map(c => ({
        x: barn.position.x * PROPERTY_PX_TO_M + c.x, z: barn.position.y * PROPERTY_PX_TO_M + c.z, radius: c.radius,
      })),
    ];
    for (const route of area.trails) for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1], b = route.points[i];
      for (let step = 0; step <= 100; step++) {
        const x = (a.x + (b.x - a.x) * step / 100) * PROPERTY_PX_TO_M;
        const z = (a.y + (b.y - a.y) * step / 100) * PROPERTY_PX_TO_M;
        for (const obstacle of obstacles)
          expect(Math.hypot(x - obstacle.x, z - obstacle.z) - obstacle.radius, route.id).toBeGreaterThan(2.5);
      }
    }
  });

  it('lets a pressured runner cross the Slough-to-farm connection in either direction through live cover', () => {
    const run = (direction: number) => {
      const bird = spawnBirds({ patches: area.patches, bounds: area.world,
        speciesMix: [{ speciesId: 'ringneck', weight: 1 }], birdCount: 1 }, mulberry32(7))[0];
      bird.runs = true;
      bird.pos = { x: barn.position.x + 88, y: barn.position.y - 13 };
      const start = { ...bird.pos };
      for (let i = 0; i < 120; i++) {
        updateBirds(1000 / 30, [bird], { x: bird.pos.x, y: bird.pos.y + direction * 18 }, {
          patches: area.patches, bounds: area.world, worldScale: true, runnerStyle: 'pheasant',
        });
        expect(area.patches.some(p => contains(p, bird.pos))).toBe(true);
        expect(fields.some(p => contains(p, bird.pos))).toBe(false);
      }
      expect(bird.state).toBe('hidden');
      expect((start.y - bird.pos.y) * direction).toBeGreaterThan(12);
      return bird.pos;
    };
    expect(run(1).y).toBeLessThan(pond.position.y - 98);
    expect(run(-1).y).toBeGreaterThan(barn.position.y - 8);
  });
});

describe('grounded Pheasant farm construction', () => {
  it.each(['south-gate', 'west-track'])('keeps farm collision and actual shot occlusion aligned from %s', dropId => {
    const landscape = new LandscapeModel(area, dropId);
    const scene = new THREE.Scene(), system = new LandmarksSystem();
    const hunt = {
      areaConfig: () => area,
      dropPoint: () => area.dropPoints.find(d => d.id === dropId)!,
      simToWorld: (x: number, y: number, out: { x: number; z: number }) => landscape.propertyToWorld(x, y, out),
      truckWorld: (out: { x: number; z: number }) => {
        const drop = area.dropPoints.find(d => d.id === dropId)!;
        return landscape.propertyToWorld(drop.position.x, drop.position.y, out);
      },
    };
    const ctx = { scene, quality: 'lite', get: (id: string) => id === 'hunt3d' ? hunt
      : { heightAt: (x: number, z: number) => landscape.heightAtWorld(x, z) } } as unknown as Ctx;
    system.init(ctx);
    const center = landscape.propertyToWorld(barn.position.x, barn.position.y, { x: 0, z: 0 });
    const bin = { x: center.x + PHEASANT_GRAIN_BIN.x, z: center.z + PHEASANT_GRAIN_BIN.z };
    expect(system.collisionCircles()).toContainEqual({ ...bin, radius: 3.1 });
    for (const prop of [center, bin]) {
      const ground = landscape.heightAtWorld(prop.x, prop.z);
      const from = { x: prop.x, y: ground + 2.5, z: prop.z + 12 };
      const to = { ...from, z: prop.z - 12 };
      expect(system.blocksShot(from, to)).toBe(true);
      expect(system.blocksShot({ ...from, y: ground + 15 }, { ...to, y: ground + 15 })).toBe(false);
      expect(system.blocksShot(from, { ...from, z: from.z - .1 })).toBe(false);
    }
    expect(system.blocksShot({ x: bin.x + 6, y: 20, z: bin.z + 8 }, { x: bin.x + 6, y: 20, z: bin.z - 8 })).toBe(false);
    const mesh = scene.getObjectByName('Pheasant homestead') as THREE.Mesh;
    expect(mesh).toBeDefined();
    // The prop grouping remains a single shared-material draw.
    expect(Array.isArray(mesh.material)).toBe(false);
    for (const value of mesh.geometry.getAttribute('position').array) expect(Number.isFinite(value)).toBe(true);
    system.dispose(ctx);
    expect(system.collisionCircles()).toHaveLength(0);
    expect(system.blocksShot({ x: bin.x, y: 2, z: bin.z + 12 }, { x: bin.x, y: 2, z: bin.z - 12 })).toBe(false);
  });
});
