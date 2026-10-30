import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import * as THREE from 'three';
import { Cover, buildCoverMap, LandAnalysis, type CoverCell, type CoverClass } from '../src/three/groundKit/coverMap';
import { coverMapFor, sharptailCoverRecipe, SHARPTAIL_COVER_HEIGHTS } from '../src/three/groundKit/coverRecipes';
import { CoverColorField, PaletteColors, SHARPTAIL_PALETTE } from '../src/three/groundKit/coverPalette';
import { groundKitLegacyReview, groundKitStyle } from '../src/three/groundKit/groundKit';

/** A swell falling south, cut by one draw that starts part-way down: the
 * draw head should sit where the channel begins, in the draw, upslope. */
const drawLand = (x: number, y: number) => {
  const start = Math.min(1, Math.max(0, (y - 120) / 160));
  const depth = 5 * start * start * (3 - 2 * start);
  return 14 - y * .02 - depth * Math.exp(-(((x - 200) / 34) ** 2)) - Math.abs(x - 200) * .004;
};
const bounds = { x: 0, y: 0, w: 400, h: 500 };
const build = (habitat = [] as { x: number; y: number; w: number; h: number }[], routes = [] as { x: number; y: number }[][]) =>
  buildCoverMap({ bounds, heightAt: drawLand, habitat, routes, clearings: [], recipe: sharptailCoverRecipe([]), margin: 40 });
const cellAt = (map: ReturnType<typeof build>, x: number, y: number): CoverCell =>
  map.sample(x, y, { cls: Cover.short, density: 0, height: 0, tone: 0, variant: 0 });

describe('ground kit cover map', () => {
  it('reads the land: wet draw bottoms, a head where the draw begins', () => {
    const land = new LandAnalysis(-40, -40, 480, 580, drawLand);
    const bottom = land.sample(200, 440, { height: 0, slope: 0, tpi: 0, relief: 0, wetness: 0, south: 0, west: 0, convergence: 0 });
    const shoulder = land.sample(80, 440, { height: 0, slope: 0, tpi: 0, relief: 0, wetness: 0, south: 0, west: 0, convergence: 0 });
    expect(bottom.wetness).toBeGreaterThan(shoulder.wetness + .3);
    expect(bottom.tpi).toBeLessThan(0);
    expect(shoulder.south).toBeGreaterThan(Math.abs(shoulder.west));
    expect(shoulder.south).toBeGreaterThan(0);
    expect(land.heads.length).toBeGreaterThan(0);
    const head = land.heads.reduce((a, b) => (Math.abs(a.x - 200) < Math.abs(b.x - 200) ? a : b));
    expect(Math.abs(head.x - 200)).toBeLessThan(24);
    expect(head.y).toBeGreaterThan(100);
    expect(head.y).toBeLessThan(400);
  });

  it('grows tall swale grass in the draw, knee-high grass on the shoulders, brush at the head', () => {
    const map = build();
    const swale = cellAt(map, 200, 460), shoulder = cellAt(map, 70, 300);
    expect(swale.cls).toBe(Cover.swale);
    expect([Cover.short, Cover.crown]).toContain(shoulder.cls);
    expect(swale.height).toBeGreaterThan(shoulder.height + .3);
    let shrubs = 0;
    for (let y = 80; y < 460; y += 2) for (let x = 150; x < 250; x += 2) if (cellAt(map, x, y).cls === Cover.shrub) shrubs++;
    expect(shrubs).toBeGreaterThan(10);
    let away = 0;
    for (let y = 0; y < 500; y += 2) for (let x = 0; x < 90; x += 2) if (cellAt(map, x, y).cls === Cover.shrub) away++;
    expect(away).toBe(0);
  });

  it('turns habitat into standing cover and keeps tracks worn', () => {
    const map = build([{ x: 40, y: 200, w: 60, h: 40 }], [[{ x: 300, y: 0 }, { x: 300, y: 500 }]]);
    expect(cellAt(map, 70, 220).cls).toBe(Cover.stand);
    const track = cellAt(map, 300, 250), beside = cellAt(map, 320, 250);
    expect(track.cls).toBe(Cover.bare);
    expect(track.height).toBeLessThan(beside.height);
  });

  it('is deterministic', () => {
    const a = build(), b = build();
    expect(Array.from(a.cls)).toEqual(Array.from(b.cls));
    expect(Array.from(a.height)).toEqual(Array.from(b.height));
  });
});

describe('Sharptail cover from its own land and habitat', () => {
  const landscape = new LandscapeModel(getArea('sharptail-prairie'));
  const map = coverMapFor(landscape)!;
  const cell = { cls: Cover.short, density: 0, height: 0, tone: 0, variant: 0 } as CoverCell;

  it('is a mosaic: mostly short shoulder grass, with crowns, swales and woody draw heads', () => {
    const share = map.classShare();
    expect(share[Cover.short]).toBeGreaterThan(.4);
    expect(share[Cover.crown]).toBeGreaterThan(.03);
    expect(share[Cover.swale]).toBeGreaterThan(.03);
    expect(share[Cover.shrub]).toBeGreaterThan(.005);
    expect(share[Cover.shrub]).toBeLessThan(.06);
    expect(share.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it('keeps open shoulder grass knee-high so a pointing dog stands above it', () => {
    for (let i = 0; i < map.cls.length; i += 7) {
      if (map.cls[i] === Cover.short || map.cls[i] === Cover.crown) expect(map.height[i] * .02).toBeLessThanOrEqual(.5 + 1e-6);
    }
    expect(SHARPTAIL_COVER_HEIGHTS.short[1]).toBeLessThanOrEqual(.5);
    expect(SHARPTAIL_COVER_HEIGHTS.crown[1]).toBeLessThanOrEqual(.5);
  });

  it('draws the sim cover as standing cover', () => {
    for (const patch of landscape.area.patches) {
      map.sample(patch.x + patch.w / 2, patch.y + patch.h / 2, cell);
      expect([Cover.stand, Cover.swale, Cover.shrub]).toContain(cell.cls);
      expect(cell.height).toBeGreaterThan(SHARPTAIL_COVER_HEIGHTS.short[0] + .1);
    }
  });

  it('feathers community edges in colour instead of drawing survey lines', () => {
    const field = new CoverColorField(map, SHARPTAIL_PALETTE);
    const raw = new PaletteColors(SHARPTAIL_PALETTE), a = new THREE.Color(), b = new THREE.Color();
    let worst = 0, sharp = 0;
    for (let r = 1; r < map.rows; r += 3) for (let c = 1; c < map.cols; c++) {
      const i = (r * map.cols + c) * 3, j = i - 3;
      worst = Math.max(worst, Math.abs(field.rgb[i] - field.rgb[j]) + Math.abs(field.rgb[i + 1] - field.rgb[j + 1]) + Math.abs(field.rgb[i + 2] - field.rgb[j + 2]));
      raw.canopy(map.cls[i / 3] as CoverClass, .5, a); raw.canopy(map.cls[i / 3 - 1] as CoverClass, .5, b);
      sharp = Math.max(sharp, Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b));
    }
    // Neighbouring cells step by well under half of a raw class boundary.
    expect(worst).toBeLessThan(sharp * .5);
  });
});

describe('ground kit selection', () => {
  it('puts Sharptail on the kit, keeps the old stack on request, and previews only where a recipe exists', () => {
    expect(groundKitStyle('sharptail-prairie', null)).toBe('masses');
    expect(groundKitStyle('sharptail-prairie', 'sparkles')).toBe('masses');
    expect(groundKitStyle('sharptail-prairie', 'legacy')).toBeNull();
    expect(groundKitStyle('pheasant-coverts', null)).toBeNull();
    expect(groundKitStyle('pheasant-coverts', 'masses')).toBe('masses');
    expect(groundKitStyle('chukar-ridge', 'masses')).toBeNull();
    expect(groundKitLegacyReview('sharptail-prairie', 'legacy')).toBe(true);
    expect(groundKitLegacyReview('chukar-ridge', 'legacy')).toBe(false);
  });
});
