import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import {
  pheasantBaleRows, pheasantBaleSpacing, pheasantDuckBlind, pheasantOldFarmstead, pheasantOldFarmsteadCover, pheasantRockPiles, pheasantSheetWater,
} from '../src/game/pheasantFeatures';
import { pheasantFarmFields } from '../src/game/pheasantFarm';
import type { Ctx } from '../src/three/engine';
import { PheasantScenerySystem } from '../src/three/subsystems/pheasantScenery';
import { pheasantPlantClear, pheasantPonds, pheasantTrackDistance } from '../src/three/subsystems/pheasantLandscape';

const area = getArea('pheasant-coverts');
const inside = (r: { x: number; y: number; w: number; h: number }, x: number, y: number, pad = 0) =>
  x >= r.x + pad && x <= r.x + r.w - pad && y >= r.y + pad && y <= r.y + r.h - pad;
const field = (id: string) => pheasantFarmFields(area.world).find(f => f.id === id)!.rect;

describe('Cattail Coverts farm details', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('puts every rock pile on open field edges, off the routes, drops and water', () => {
    const landscape = new LandscapeModel(area);
    const piles = pheasantRockPiles(area.world);
    expect(piles.length).toBeGreaterThanOrEqual(6);
    for (const pile of piles) {
      expect(pheasantTrackDistance(area, pile.x, pile.y, 40)).toBeGreaterThan(pile.radius / PROPERTY_PX_TO_M + 6);
      for (const drop of area.dropPoints) expect(Math.hypot(pile.x - drop.position.x, pile.y - drop.position.y)).toBeGreaterThan(40);
      for (const pond of pheasantPonds(landscape))
        expect(Math.hypot((pile.x - pond.x) * PROPERTY_PX_TO_M / pond.rx, (pile.y - pond.y) * PROPERTY_PX_TO_M / pond.ry)).toBeGreaterThan(1.6);
      expect(area.patches.some(p => inside(p, pile.x, pile.y))).toBe(false);
      // Nothing grows through the stones.
      expect(pheasantPlantClear(area, pile.x, pile.y)).toBe(false);
    }
  });

  it('stores the bale rows inside the Stock Pond hay and keeps the old farmstead in its own weedy corner', () => {
    const hay = field('stock-pond-hay');
    for (const row of pheasantBaleRows(area.world)) {
      const step = pheasantBaleSpacing(row);
      for (const i of [0, row.count - 1]) {
        const x = row.x + Math.cos(row.angle) * step * i, y = row.y + Math.sin(row.angle) * step * i;
        expect(inside(hay, x, y, 8)).toBe(true);
        expect(pheasantTrackDistance(area, x, y, 20)).toBeGreaterThan(8);
      }
    }
    const home = pheasantOldFarmstead(area.world);
    expect(inside(field('north-wheat'), home.x, home.y, 20)).toBe(true);
    // Birds can hold in the weeds around the old place: it is real cover.
    expect(pheasantOldFarmsteadCover(area.world).every(r => inside(r, home.x, home.y, 12))).toBe(true);
    expect(area.patches.some(p => inside(p, home.x + 20, home.y))).toBe(true);
  });

  it('digs the blind into the Slough shore and floods only the low swale of the east corn', () => {
    const landscape = new LandscapeModel(area);
    const blind = pheasantDuckBlind(area.landmarks)!;
    const slough = pheasantPonds(landscape).find(p => p.landmarkId === 'south-slough')!;
    const ground = landscape.heightAtProperty(blind.x, blind.y);
    expect(ground - slough.waterY).toBeGreaterThan(-.15);
    expect(ground - slough.waterY).toBeLessThan(.6);
    // Facing the open water.
    const toWater = Math.atan2(slough.y - blind.y, slough.x - blind.x);
    expect(Math.abs(Math.atan2(Math.sin(toWater - blind.angle), Math.cos(toWater - blind.angle)))).toBeLessThan(.1);
    const sheet = pheasantSheetWater(area.world);
    expect(inside(field('east-corn'), sheet.x, sheet.y, sheet.rx / PROPERTY_PX_TO_M)).toBe(true);
    const centre = landscape.heightAtProperty(sheet.x, sheet.y);
    let ring = 0;
    for (let a = 0; a < 12; a++) ring += landscape.heightAtProperty(sheet.x + Math.cos(a) * 30, sheet.y + Math.sin(a) * 30) / 12;
    expect(ring).toBeGreaterThan(centre);
  });

  it('makes the blind, bales, rock piles and foundation solid to walk and shoot through', () => {
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('document', Object.assign(new EventTarget(), { getElementById: () => null }));
    vi.stubGlobal('location', { search: '' });
    const landscape = new LandscapeModel(area, 'south-gate');
    const scenery = new PheasantScenerySystem(landscape);
    const ctx = { quality: 'lite', time: 0, paused: false, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
      renderer: { domElement: new EventTarget() }, events: new EventTarget(),
      get: (id: string) => ({ hunt3d: { condition: () => 'mild', coverPatches: () => [] } }[id]),
    } as unknown as Ctx;
    scenery.init(ctx);
    for (const name of ['Field rock piles', 'Stored bale rows', 'Old farmstead foundation', 'Slough duck blind', 'East corn sheet water'])
      expect(ctx.scene.getObjectByName(name), name).toBeDefined();
    const circles = scenery.collisionCircles();
    const blocked = (px: number, py: number, height: number) => {
      const at = landscape.propertyToWorld(px, py, { x: 0, z: 0 });
      expect(circles.some(c => Math.hypot(c.x - at.x, c.z - at.z) < c.radius)).toBe(true);
      const y = landscape.heightAtWorld(at.x, at.z) + height;
      return scenery.blocksShot({ x: at.x - 6, y, z: at.z }, { x: at.x + 6, y, z: at.z });
    };
    const blind = pheasantDuckBlind(area.landmarks)!;
    expect(blocked(blind.x, blind.y, .8)).toBe(true);
    const bales = pheasantBaleRows(area.world)[0];
    expect(blocked(bales.x, bales.y + pheasantBaleSpacing(bales) * 3, 1.2)).toBe(true);
    const hill = pheasantRockPiles(area.world).reduce((a, b) => (b.radius > a.radius ? b : a));
    expect(blocked(hill.x, hill.y, .4)).toBe(true);
    // A shot well over the pile is clear.
    const top = landscape.propertyToWorld(hill.x, hill.y, { x: 0, z: 0 }), y = landscape.heightAtWorld(top.x, top.z) + 4;
    expect(scenery.blocksShot({ x: top.x - 6, y, z: top.z + 3 }, { x: top.x + 6, y, z: top.z + 3 })).toBe(false);
    scenery.dispose(ctx);
  });
});
