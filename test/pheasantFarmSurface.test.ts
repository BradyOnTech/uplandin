import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import { pheasantHomesteadYard } from '../src/game/pheasantHabitat';
import type { Ctx } from '../src/three/engine';
import { createPheasantFarmPainter } from '../src/three/subsystems/pheasantFarmSurface';
import { PropertyTrailsSystem } from '../src/three/subsystems/propertyTrails';

describe('Pheasant maintained farm surface', () => {
  it('leaves all exterior ground and other properties untouched', () => {
    const area = getArea('pheasant-coverts'), before = JSON.stringify(area);
    const yard = pheasantHomesteadYard(area.landmarks)!;
    const paint = createPheasantFarmPainter(area)!;
    let exteriorCount = 0, yardCount = 0;
    for (let y = area.world.y; y <= area.world.y + area.world.h; y += 4) {
      for (let x = area.world.x; x <= area.world.x + area.world.w; x += 4) {
        const original = new THREE.Color(.28, .31, .18), color = original.clone();
        paint(x, y, .5, color);
        const outside = Math.hypot(Math.max(yard.x - x, 0, x - yard.x - yard.w),
          Math.max(yard.y - y, 0, y - yard.y - yard.h));
        if (outside >= 5) {
          expect(color.equals(original)).toBe(true); exteriorCount++;
        } else if (outside === 0 && !color.equals(original)) yardCount++;
      }
    }
    expect(exteriorCount).toBeGreaterThan(10000);
    expect(yardCount).toBeGreaterThan(300);
    expect(createPheasantFarmPainter(getArea('sharptail-prairie'))).toBeUndefined();
    expect(createPheasantFarmPainter(getArea('quail-fields'))).toBeUndefined();
    expect(JSON.stringify(area)).toBe(before);
  });

  it('joins yard margins continuously and retains distinct barn and grain-bin access', () => {
    const area = getArea('pheasant-coverts'), yard = pheasantHomesteadYard(area.landmarks)!;
    const barn = area.landmarks.find(l => l.id === 'old-homestead')!.position;
    const paint = createPheasantFarmPainter(area)!;
    const sample = (x: number, y: number) => {
      const color = new THREE.Color(.28, .31, .18); paint(x, y, .5, color); return color;
    };
    for (const x of [yard.x - 5, yard.x, yard.x + yard.w, yard.x + yard.w + 5]) {
      for (let y = yard.y - 5; y <= yard.y + yard.h + 5; y += 3) {
        const a = sample(x - .001, y), b = sample(x + .001, y);
        expect(Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b))).toBeLessThan(.001);
      }
    }
    const at = (x: number, z: number) => sample(barn.x + x / PROPERTY_PX_TO_M, barn.y + z / PROPERTY_PX_TO_M);
    const door = at(0, 5), bin = at(14, -9), quiet = at(-18, -18);
    expect(door.r - door.g).toBeGreaterThan(.02);
    expect(bin.r - bin.g).toBeGreaterThan(.02);
    expect(quiet.r - quiet.g).toBeLessThan(.02);
    expect(Math.hypot(door.r - quiet.r, door.g - quiet.g, door.b - quiet.b)).toBeGreaterThan(.04);
  });

  it('keeps the same route placement and metre-scaled wear from both parking places', () => {
    const area = getArea('pheasant-coverts'), before = JSON.stringify(area);
    const samples: number[][] = [];
    for (const drop of ['west-track', 'south-gate']) {
      const landscape = new LandscapeModel(area, drop);
      const ctx = { scene: new THREE.Scene(), quality: 'lite' } as Ctx;
      const routes = new PropertyTrailsSystem(landscape); routes.init(ctx);
      const mesh = ctx.scene.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
      const position = mesh.geometry.getAttribute('position'), surface = mesh.geometry.getAttribute('routeSurface');
      expect(surface.count).toBe(position.count);
      const points: number[] = [];
      for (let i = 0; i < position.count; i++) {
        const p = landscape.worldToProperty(position.getX(i), position.getZ(i), { x: 0, y: 0 });
        points.push(p.x, p.y, surface.getX(i), surface.getY(i));
      }
      samples.push(points);
      expect(mesh.material.forceSinglePass).toBe(true);
      expect(mesh.material.depthWrite).toBe(false);
      routes.dispose(ctx);
    }
    expect(samples[0].length).toBe(samples[1].length);
    for (let i = 0; i < samples[0].length; i++) expect(samples[0][i]).toBeCloseTo(samples[1][i], 3);
    expect(JSON.stringify(area)).toBe(before);
  });
});
