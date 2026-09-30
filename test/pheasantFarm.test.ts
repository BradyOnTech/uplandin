import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import type { Rect } from '../src/game/field';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import { pheasantFarmCover, pheasantFarmFenceLines, pheasantFarmFields } from '../src/game/pheasantFarm';
import { pheasantHomesteadYard } from '../src/game/pheasantHabitat';
import type { Ctx } from '../src/three/engine';
import { createPheasantFarmMap, PHEASANT_FARM_TEXEL } from '../src/three/subsystems/pheasantCropSurface';
import { PheasantCropResidueSystem } from '../src/three/subsystems/pheasantCropResidue';
import { pheasantCoverAt, pheasantFields, pheasantPonds, samplePheasantHarvest, type PheasantHarvestSample } from '../src/three/subsystems/pheasantLandscape';

const area = getArea('pheasant-coverts');
const overlapArea = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

describe('Cattail Coverts farm plan', () => {
  it('tiles the whole property with fields and never overlaps two of them', () => {
    const fields = pheasantFarmFields(area.world);
    const total = fields.reduce((sum, f) => sum + f.rect.w * f.rect.h, 0);
    expect(total).toBe(area.world.w * area.world.h);
    for (const a of fields) for (const b of fields) if (a !== b) expect(overlapArea(a.rect, b.rect)).toBe(0);
    expect(new Set(fields.map(f => f.crop))).toEqual(new Set(['corn', 'beans', 'wheat', 'hay']));
  });

  it('leaves no bare ground: every dry yard is crop, cover, water, yard or a verge by a field edge', () => {
    const fields = pheasantFields(area), ponds = pheasantPonds(new LandscapeModel(area));
    const yard = pheasantHomesteadYard(area.landmarks)!;
    const farm = pheasantFarmFields(area.world);
    const sample: PheasantHarvestSample = { amount: 0, row: 0, angle: 0 };
    let bare = 0, checked = 0;
    for (let y = 5; y < area.world.h; y += 10) for (let x = 5; x < area.world.w; x += 10) {
      checked++;
      if (samplePheasantHarvest(area, x, y, fields, sample).amount > 0 || pheasantCoverAt(area, x, y)) continue;
      if (x >= yard.x - 12 && x <= yard.x + yard.w + 12 && y >= yard.y - 12 && y <= yard.y + yard.h + 12) continue;
      if (ponds.some(p => Math.hypot((x - p.x) * PROPERTY_PX_TO_M / p.rx, (y - p.y) * PROPERTY_PX_TO_M / p.ry) < 2.2)) continue;
      // Otherwise it must be the verge a few yards from a field's edge.
      const edge = Math.min(...farm.map(f => Math.min(Math.abs(x - f.rect.x), Math.abs(x - f.rect.x - f.rect.w),
        Math.abs(y - f.rect.y), Math.abs(y - f.rect.y - f.rect.h))));
      if (edge <= 14) continue;
      bare++;
    }
    expect(bare / checked).toBeLessThan(.01);
  });

  it('puts bird cover in farm structure and keeps it off the crop', () => {
    const cover = pheasantFarmCover(area.world);
    const coverArea = area.patches.reduce((sum, p) => sum + p.w * p.h, 0);
    // Comparable to the random cover it replaced, spread across many stands.
    expect(coverArea).toBeGreaterThan(90000);
    expect(area.patches.length).toBeGreaterThanOrEqual(30);
    const fields = pheasantFields(area), sample: PheasantHarvestSample = { amount: 0, row: 0, angle: 0 };
    for (const patch of cover) {
      expect(samplePheasantHarvest(area, patch.x + patch.w / 2, patch.y + patch.h / 2, fields, sample).amount).toBe(0);
    }
  });

  it('runs every fence line along a field boundary', () => {
    const edges = pheasantFarmFields(area.world).flatMap(f => [f.rect.x, f.rect.x + f.rect.w, f.rect.y, f.rect.y + f.rect.h]);
    for (const line of pheasantFarmFenceLines(area.world)) {
      const [a, b] = line, vertical = a.x === b.x;
      const coordinate = vertical ? a.x : a.y;
      const onEdge = edges.some(e => Math.abs(e - coordinate) < 7);
      expect(onEdge, `${JSON.stringify(line)} follows a field edge`).toBe(true);
    }
  });
});

describe('Cattail Coverts crop surfaces', () => {
  it('bakes each field\'s crop, planter direction and harvest into the terrain map', () => {
    const landscape = new LandscapeModel(area);
    const { texture, size } = createPheasantFarmMap(landscape);
    expect(size.x).toBe(area.world.w);
    const data = texture.image.data as Uint8Array, width = texture.image.width;
    const read = (x: number, y: number) => {
      const i = (Math.floor(y / PHEASANT_FARM_TEXEL) * width + Math.floor(x / PHEASANT_FARM_TEXEL)) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    };
    // East corn (rows north-south) and south-east wheat (rows east-west).
    const corn = read(1200, 450), wheat = read(1200, 700);
    expect(corn[0]).toBe(Math.round(255 / 4));
    expect(corn[1]).toBe(255);
    expect(wheat[0]).toBe(Math.round(255 * 3 / 4));
    expect(wheat[1]).toBe(0);
    expect(corn[2]).toBeGreaterThan(200);
    // The section line between them is a grass verge, not crop.
    const verge = read(1000, 560);
    expect(verge[2]).toBeLessThan(40);
    expect(verge[3]).toBeGreaterThan(200);
    texture.dispose();
  });

  it('stands corn residue on the rows the terrain draws and streams it around the hunter', () => {
    const landscape = new LandscapeModel(area);
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality: 'high', time: 0,
      timeOfDay: 'morning', paused: true, events: new EventTarget() } as unknown as Ctx;
    const residue = new PheasantCropResidueSystem(landscape);
    // Stand in the east corn, well inside the field.
    const world = landscape.propertyToWorld(1150, 440, { x: 0, z: 0 });
    ctx.camera.position.set(world.x, 2, world.z);
    residue.init(ctx);
    const roots = residue.roots();
    const corn = roots.filter(r => r.crop === 'corn');
    expect(corn.length).toBeGreaterThan(2000);
    for (const root of corn.slice(0, 500)) {
      // East corn rows run north-south: every stalk sits on x = k * 30 in.
      const offset = Math.abs(root.x / .762 - Math.round(root.x / .762)) * .762;
      expect(offset).toBeLessThan(.001);
      const property = landscape.worldToProperty(root.x, root.z, { x: 0, y: 0 });
      expect(pheasantCoverAt(area, property.x, property.y)).toBe(false);
    }
    // Walking away releases the chunks behind the hunter.
    const far = landscape.propertyToWorld(200, 700, { x: 0, z: 0 });
    ctx.camera.position.set(far.x, 2, far.z);
    residue.update(ctx);
    expect(residue.roots().some(r => Math.hypot(r.x - world.x, r.z - world.z) < 30)).toBe(false);
    expect(residue.roots().some(r => r.crop === 'wheat')).toBe(true);
    residue.dispose(ctx);
    expect(ctx.scene.children.length).toBe(0);
  });
});
