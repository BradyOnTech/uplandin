import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { quailBurnAt } from '../src/game/quailFeatures';
import { Cover, LandAnalysis, buildCoverMap, type CoverCell, type CoverMap } from '../src/three/groundKit/coverMap';
import { QUAIL_COMMUNITY, QUAIL_COVER_HEIGHTS, QUAIL_SITE, coverMapFor, quailCoverRecipe } from '../src/three/groundKit/coverRecipes';
import { groundKitColors, groundKitStyle, groundKitTrunks, groundKitWoody, siteWoody } from '../src/three/groundKit/groundKit';

const cell = (): CoverCell => ({ cls: Cover.short, density: 0, height: 0, tone: 0, variant: 0 });

describe('Quail Fields on the ground kit', () => {
  const area = getArea('quail-fields'), landscape = new LandscapeModel(area);
  const map = coverMapFor(landscape)!;
  const sample = cell();

  it('is on the kit by default, with the old field kept for review', () => {
    expect(groundKitStyle('quail-fields', null)).toBe('masses');
    expect(groundKitStyle('quail-fields', 'legacy')).toBeNull();
  });

  it('is rangeland: open bunchgrass over red soil, plum and shinnery, a timbered creek', () => {
    const share = map.classShare();
    expect(share[Cover.short] + share[Cover.crown]).toBeGreaterThan(.55);
    expect(share[Cover.stand]).toBeGreaterThan(.04);
    expect(share[Cover.shrub]).toBeGreaterThan(.04);
    expect(share[Cover.shrub]).toBeLessThan(.2);
    expect(share[Cover.tree]).toBeGreaterThan(.01);
    expect(share[Cover.tree]).toBeLessThan(.1);
    // Bunches, not a carpet: the open range leaves soil between them.
    let open = 0, density = 0;
    for (let i = 0; i < map.cls.length; i += 5) if (map.cls[i] === Cover.short) { open++; density += map.density[i] / 255; }
    expect(density / open).toBeLessThan(.8);
    expect(density / open).toBeGreaterThan(.45);
    // The ground between plants is its own red soil, a separate floor.
    expect(groundKitColors(landscape)!.floor).toBeDefined();
  });

  it('keeps grass under a pointing dog\'s back, and woody floors open beneath', () => {
    for (let i = 0; i < map.cls.length; i += 3) {
      const cls = map.cls[i], height = map.height[i] * .02;
      if (cls === Cover.short || cls === Cover.crown || cls === Cover.stand) expect(height).toBeLessThanOrEqual(QUAIL_COVER_HEIGHTS.stand[1] + 1e-6);
      // A dog runs under the plum and the timber: they report the grass
      // beneath them, never their crowns.
      if (cls === Cover.tree || (cls === Cover.shrub && map.variant[i] === QUAIL_COMMUNITY.shrub.plum)) expect(height).toBeLessThan(.4);
    }
    expect(QUAIL_COVER_HEIGHTS.stand[1]).toBeLessThanOrEqual(.6);
  });

  it('builds every covey headquarters from clusters of sand plum in rank grass', () => {
    for (const patch of area.patches) {
      let plum = 0, total = 0;
      for (let y = patch.y + 4; y < patch.y + patch.h - 4; y += 2) for (let x = patch.x + 4; x < patch.x + patch.w - 4; x += 2) {
        map.sample(x, y, sample); total++;
        if (sample.cls === Cover.shrub && sample.variant === QUAIL_COMMUNITY.shrub.plum) plum++;
      }
      // Skip patches the creek's timber has taken over.
      if (!total) continue;
      expect(plum / total).toBeLessThan(.65);
    }
    // Plum belongs to the headquarters: nearly all of it lies within a
    // stride or two of the sim's cover.
    let plum = 0, near = 0;
    for (let i = 0; i < map.cls.length; i += 2) {
      if (map.cls[i] !== Cover.shrub || map.variant[i] !== QUAIL_COMMUNITY.shrub.plum) continue;
      const x = map.x0 + (i % map.cols + .5) * map.cell, y = map.y0 + (Math.floor(i / map.cols) + .5) * map.cell;
      plum++;
      if (area.patches.some(p => x > p.x - 24 && x < p.x + p.w + 24 && y > p.y - 24 && y < p.y + p.h + 24)) near++;
    }
    expect(plum).toBeGreaterThan(500);
    expect(near / plum).toBeGreaterThan(.9);
    const covered = area.patches.filter(patch => {
      let found = false;
      for (let y = patch.y; y < patch.y + patch.h && !found; y += 2) for (let x = patch.x; x < patch.x + patch.w && !found; x += 2) {
        map.sample(x, y, sample);
        found = sample.cls === Cover.shrub && sample.variant === QUAIL_COMMUNITY.shrub.plum;
      }
      return found;
    });
    expect(covered.length / area.patches.length).toBeGreaterThan(.8);
  });

  it('lines the creek with timber and scatters mesquite on the uplands, off the tracks and the burn', () => {
    const land = new LandAnalysis(map.x0, map.y0, map.cols * map.cell, map.rows * map.cell, (x, y) => landscape.heightAtProperty(x, y));
    const at = { height: 0, slope: 0, tpi: 0, relief: 0, wetness: 0, south: 0, west: 0, convergence: 0, channel: 0 };
    const groups = new Map<number, number>();
    for (const site of map.sites) {
      groups.set(site.group, (groups.get(site.group) ?? 0) + 1);
      land.sample(site.x, site.y, at);
      if (site.group === QUAIL_SITE.creek) expect(at.channel).toBeLessThan(40);
      if (site.group === QUAIL_SITE.mesquite) expect(at.wetness).toBeLessThan(.85);
      expect(quailBurnAt(site.x, site.y)).toBeLessThan(.3);
      let route = Infinity;
      for (const trail of area.trails) for (let k = 1; k < trail.points.length; k++) {
        const a = trail.points[k - 1], b = trail.points[k], dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((site.x - a.x) * dx + (site.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        route = Math.min(route, Math.hypot(site.x - a.x - dx * t, site.y - a.y - dy * t));
      }
      expect(route).toBeGreaterThan(1.6);
    }
    expect(groups.get(QUAIL_SITE.creek) ?? 0).toBeGreaterThan(80);
    expect(groups.get(QUAIL_SITE.mesquite) ?? 0).toBeGreaterThan(60);
    expect(groups.get(QUAIL_SITE.sage) ?? 0).toBeGreaterThan(300);
    // Hackberry on the uplands is the odd tree, not a grove.
    expect(groups.get(QUAIL_SITE.hackberry) ?? 0).toBeLessThan((groups.get(QUAIL_SITE.mesquite) ?? 0) / 4);
  });

  it('makes every tree trunk inside the fence solid, from the same plants the renderer draws', () => {
    const trunks = groundKitTrunks(landscape), woody = groundKitWoody('quail-fields')!;
    const inside = map.sites.filter(site => woody.trees!.includes(site.group)
      && site.x >= area.world.x && site.y >= area.world.y && site.x <= area.world.x + area.world.w && site.y <= area.world.y + area.world.h);
    expect(trunks.length).toBe(inside.length);
    for (const trunk of trunks) {
      expect(trunk.radius).toBeGreaterThan(.1);
      expect(trunk.radius).toBeLessThan(.7);
      expect(trunk.top).toBeGreaterThan(trunk.ground + .5);
    }
    // A site's plant is the same every time it is asked for.
    const site = inside[0];
    expect(siteWoody(site, woody)).toEqual(siteWoody({ ...site }, woody));
  });

  it('follows the sim\'s cover wherever it is, with no coordinates of its own', () => {
    // A plain swell with one patch: the headquarters grow where the patch
    // is, and move with it.
    const land = (x: number, y: number) => 10 + Math.sin(x / 90) * 1.5 + Math.cos(y / 70) * 1.2;
    const build = (patch: { x: number; y: number; w: number; h: number }): CoverMap => buildCoverMap({
      bounds: { x: 0, y: 0, w: 400, h: 300 }, heightAt: land, habitat: [patch], routes: [], clearings: [], recipe: quailCoverRecipe(), margin: 20,
    });
    const plumIn = (map: CoverMap, r: { x: number; y: number; w: number; h: number }) => {
      let plum = 0;
      for (let y = r.y; y < r.y + r.h; y += 2) for (let x = r.x; x < r.x + r.w; x += 2) {
        map.sample(x, y, sample);
        if (sample.cls === Cover.shrub && sample.variant === QUAIL_COMMUNITY.shrub.plum) plum++;
      }
      return plum;
    };
    const west = { x: 40, y: 100, w: 80, h: 60 }, east = { x: 280, y: 120, w: 80, h: 60 };
    const a = build(west), b = build(east);
    expect(plumIn(a, west)).toBeGreaterThan(40);
    expect(plumIn(b, east)).toBeGreaterThan(40);
    expect(plumIn(a, east)).toBeLessThan(plumIn(b, east) / 4);
    expect(plumIn(b, west)).toBeLessThan(plumIn(a, west) / 4);
  });

  it('is deterministic', () => {
    const land = (x: number, y: number) => 8 + Math.sin(x / 60) + Math.cos(y / 45);
    const build = () => buildCoverMap({ bounds: { x: 0, y: 0, w: 300, h: 200 }, heightAt: land, habitat: [{ x: 50, y: 50, w: 60, h: 40 }],
      routes: [[{ x: 0, y: 150 }, { x: 300, y: 150 }]], clearings: [], recipe: quailCoverRecipe(), margin: 20 });
    const a = build(), b = build();
    expect(Array.from(a.cls)).toEqual(Array.from(b.cls));
    expect(a.sites).toEqual(b.sites);
  });
});

describe('kit tree trunks on Quail', () => {
  it('stop shot through a trunk below the crown, never beside it or over it', async () => {
    const { trunksBlock } = await import('../src/three/subsystems/quailEnvironment');
    const trunk = { x: 10, z: 0, radius: .3, ground: 2, top: 4.5 };
    expect(trunksBlock([trunk], { x: 0, y: 3, z: 0 }, { x: 20, y: 3, z: 0 })).toBe(true);
    expect(trunksBlock([trunk], { x: 0, y: 3, z: 1 }, { x: 20, y: 3, z: 1 })).toBe(false);
    expect(trunksBlock([trunk], { x: 0, y: 6, z: 0 }, { x: 20, y: 6, z: 0 })).toBe(false);
    // A shot that ends short of the trunk is not stopped by it.
    expect(trunksBlock([trunk], { x: 0, y: 3, z: 0 }, { x: 8, y: 3, z: 0 })).toBe(false);
  });
});
