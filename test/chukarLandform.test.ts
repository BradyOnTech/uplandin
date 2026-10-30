import { describe, expect, it } from 'vitest';
import { AREAS, getArea } from '../src/game/areas';
import {
  CHUKAR_RIM_IDS, CHUKAR_RIVER_LEVEL, CHUKAR_WALL, chukarAnalyticHeight, chukarHeight, chukarRimBlockers, chukarRimModules,
  chukarSolidAt, chukarWallAt,
} from '../src/game/chukarCanyon';
import { CHUKAR_SPRING_SEAM, chukarGroundAt } from '../src/game/chukarHabitat';
import { CHUKAR_ENTRIES, CHUKAR_HUNT_AREAS, CHUKAR_PLACES } from '../src/game/chukarRidge';
import { HunterBreath, climbCosts, climbSpeedFactor } from '../src/game/climbing';
import { createThreeHuntSetup } from '../src/game/gameplayMode';
import { huntAreaAt, huntAreasFor } from '../src/game/huntAreas';
import { derivedCoverRects, habitatClassAt, landDrivenAnchors, landHabitat } from '../src/game/landHabitat';
import { LandformNav } from '../src/game/landformNav';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import { mulberry32 } from '../src/game/math';

/**
 * Chukar Ridge's landform contract, written as rules that always hold rather
 * than pinned heights: drops sit on the ground, routes are walkable and clear
 * of the rimrock, cover is reachable, no bird or fall is inside rock, the
 * hunt areas cover the ground, and the habitat follows the land.
 */
const area = getArea('chukar-ridge');
const land = new LandscapeModel(area);
const sample = () => ({ height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 });
const memoryStorage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), removeItem: (key: string) => void values.delete(key) };
};

/** Cells reachable on foot from a point, flooding round solid rock (4 yd grid). */
function reachable(from: { x: number; y: number }): (x: number, y: number) => boolean {
  const cell = 4, cols = Math.ceil(area.world.w / cell), rows = Math.ceil(area.world.h / cell), seen = new Uint8Array(cols * rows);
  const blocked = (i: number, j: number) => chukarSolidAt((i + .5) * cell, (j + .5) * cell, .4);
  const start = Math.floor(from.y / cell) * cols + Math.floor(from.x / cell), queue = [start];
  seen[start] = 1;
  while (queue.length) {
    const k = queue.pop()!, i = k % cols, j = Math.floor(k / cols);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, nk = nj * cols + ni;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || seen[nk] || blocked(ni, nj)) continue;
      seen[nk] = 1; queue.push(nk);
    }
  }
  return (x, y) => seen[Math.floor(y / cell) * cols + Math.floor(x / cell)] === 1;
}

describe('Chukar Ridge landform', () => {
  it('is one authoritative surface: the cache agrees with the authored canyon', () => {
    for (let y = 0; y <= area.world.h; y += 98) for (let x = 0; x <= area.world.w; x += 102) {
      const nodeX = Math.round(x / 2) * 2, nodeY = Math.round(y / 2) * 2;
      expect(chukarHeight(nodeX, nodeY)).toBeCloseTo(chukarAnalyticHeight(nodeX, nodeY), 3);
      expect(land.heightAtProperty(x, y)).toBe(chukarHeight(x, y));
    }
    // Defined well beyond the fence for the horizon and far terrain.
    for (const [x, y] of [[-900, -900], [3100, 2600], [1100, 1650]]) expect(Number.isFinite(land.heightAtProperty(x, y))).toBe(true);
  });

  it('is a canyon you climb: the rim flat stands well above the breaks, the river far below', () => {
    const top = Math.max(...[300, 700, 1100, 1500].map(x => chukarHeight(x, 60)));
    const bottom = Math.min(...[300, 700, 1100].map(x => chukarHeight(x, 1360)));
    expect(top - bottom).toBeGreaterThan(150);
    expect(CHUKAR_RIVER_LEVEL).toBeLessThan(bottom - 40);
    // A rim face is a cliff in the heightfield: steeper than any walk.
    const rim = chukarRimModules().find(m => m.decay === 0)!;
    const drop = chukarHeight(rim.x - rim.nx * 2, rim.y - rim.ny * 2) - chukarHeight(rim.x + rim.nx * 2, rim.y + rim.ny * 2);
    expect(drop / (4 * PROPERTY_PX_TO_M)).toBeGreaterThan(1);
  });

  it('runs three basalt rims along the contours, each broken in places', () => {
    for (const id of CHUKAR_RIM_IDS) {
      const band = CHUKAR_WALL.band(id), modules = chukarRimModules().filter(m => m.rim === id);
      expect(modules.length * 4.2, id).toBeGreaterThan(900);
      // Every module sits on its own band of the wall: a contour, not a scatter.
      for (const m of modules.filter((_, i) => i % 7 === 0)) {
        const s = chukarWallAt(m.x, m.y, { s: 0, broken: 0, draw: 0, drawId: null, crest: 0 }).s;
        expect(Math.abs(s - (band.from + band.to) / 2), id).toBeLessThan(4.5);
      }
    }
    // Breaks: gaps in the module chain wider than a hunter, on every rim.
    for (const id of CHUKAR_RIM_IDS) {
      const modules = chukarRimModules().filter(m => m.rim === id);
      let gaps = 0;
      for (let i = 1; i < modules.length; i++) if (Math.hypot(modules[i].x - modules[i - 1].x, modules[i].y - modules[i - 1].y) > 12) gaps++;
      expect(gaps, id).toBeGreaterThan(4);
    }
  });

  it('sets every truck on gentle ground inside the fence, clear of rock and of each other', () => {
    expect(area.dropPoints.length).toBeGreaterThanOrEqual(3);
    expect(area.dropPoints.length).toBeLessThanOrEqual(4);
    for (const drop of area.dropPoints) {
      const { x, y } = drop.position;
      expect(x >= area.world.x && x <= area.world.x + area.world.w && y >= area.world.y && y <= area.world.y + area.world.h, drop.id).toBe(true);
      expect(land.surfaceAtProperty(x, y, sample()).slope, drop.id).toBeLessThan(.3);
      expect(chukarSolidAt(x, y, 4), drop.id).toBe(false);
      for (const other of area.dropPoints) if (other !== drop) expect(Math.hypot(other.position.x - x, other.position.y - y)).toBeGreaterThan(400);
    }
  });

  it('keeps every route walkable, connected to an entry and clear of the rimrock', () => {
    const blockers = chukarRimBlockers();
    const ends = new Set(area.dropPoints.map(d => `${d.position.x},${d.position.y}`));
    const nodes = area.trails.flatMap(t => t.points.map(p => `${p.x},${p.y}`));
    for (const trail of area.trails) {
      const touches = trail.points.some(p => ends.has(`${p.x},${p.y}`)) || area.trails.some(other => other !== trail && trail.points.some(p =>
        other.points.some(q => Math.hypot(p.x - q.x, p.y - q.y) < 12)));
      expect(touches, trail.id).toBe(true);
      for (let i = 1; i < trail.points.length; i++) {
        const a = trail.points[i - 1], b = trail.points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
        for (let d = 0; d <= length; d += 3) {
          const x = a.x + (b.x - a.x) * d / (length || 1), y = a.y + (b.y - a.y) * d / (length || 1);
          // The grade along the route itself, the way a hunter walks it; a
          // route may traverse a steep sidehill on the contour.
          const step = Math.min(3, length - d), x2 = x + (b.x - a.x) * step / (length || 1), y2 = y + (b.y - a.y) * step / (length || 1);
          if (step > .5) expect(Math.abs(land.heightAtProperty(x2, y2) - land.heightAtProperty(x, y)) / (step * PROPERTY_PX_TO_M), `${trail.id} ${x.toFixed(0)},${y.toFixed(0)}`).toBeLessThan(.7);
          for (const rock of blockers) if (Math.abs(rock.x - x) < 6 && Math.abs(rock.y - y) < 6)
            expect(Math.hypot(rock.x - x, rock.y - y) - rock.radius, trail.id).toBeGreaterThan(1.2);
        }
      }
    }
    expect(nodes.length).toBeGreaterThan(100);
  });

  it('opens every entry on its authored view, the River Road truck under the canyon wall', () => {
    for (const entry of CHUKAR_ENTRIES) {
      const drop = area.dropPoints.find(d => d.id === entry.id)!, dx = entry.toward.x - drop.position.x, dy = entry.toward.y - drop.position.y;
      expect((Math.cos(drop.heading) * dx + Math.sin(drop.heading) * dy) / Math.hypot(dx, dy), entry.id).toBeCloseTo(1);
    }
    // From the bottom the wall stands over the truck: across the middle of
    // the view the skyline is well above the eye, not low rims far off.
    const river = area.dropPoints.find(d => d.id === 'south-gate')!, eye = chukarHeight(river.position.x, river.position.y) + 1.62;
    const skyline = (bearing: number) => {
      let best = -90;
      for (let d = 10; d <= 1600; d += 8) {
        const h = chukarHeight(river.position.x + Math.cos(bearing) * d, river.position.y + Math.sin(bearing) * d);
        best = Math.max(best, Math.atan2(h - eye, d * PROPERTY_PX_TO_M) * 180 / Math.PI);
      }
      return best;
    };
    // (Before the spur it was 11 to 14 degrees everywhere.)
    const centre = [-10, -5, 0, 5, 10].map(degrees => skyline(river.heading + degrees * Math.PI / 180));
    expect(Math.min(...centre)).toBeGreaterThan(20);
    expect(Math.max(...centre)).toBeGreaterThan(28);
    // And it reads as basalt: the lower rim wraps the spur's nose whole, a
    // short walk up, in the middle of the view. (While the rim there could
    // weather away, no rimrock in the middle of the view was nearer than 180 yd.)
    const rimrock = chukarRimModules().filter(m => {
      const off = Math.atan2(m.y - river.position.y, m.x - river.position.x) - river.heading;
      return Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) <= 15 * Math.PI / 180 && Math.hypot(m.x - river.position.x, m.y - river.position.y) < 160;
    });
    expect(rimrock.length).toBeGreaterThan(15);
  });

  it('lets a hunter walk from every entry to every piece of cover', () => {
    const rects = derivedCoverRects(area);
    expect(rects.length).toBeGreaterThan(20);
    for (const drop of area.dropPoints) {
      const can = reachable(drop.position);
      const unreached = rects.filter(r => ![[.5, .5], [.25, .25], [.75, .75], [.25, .75], [.75, .25]].some(([u, v]) => can(r.x + r.w * u, r.y + r.h * v)));
      expect(unreached.length, drop.id).toBe(0);
    }
  }, 60_000);

  it('routes a dog round a rim to a fall on its far side', () => {
    const nav = new LandformNav(chukarRimBlockers());
    const rim = chukarRimModules().filter(m => m.rim === 'middle-rim' && m.decay === 0)[40];
    const above = { x: rim.x - rim.nx * 8, y: rim.y - rim.ny * 8 }, below = { x: rim.x + rim.nx * 8, y: rim.y + rim.ny * 8 };
    expect(nav.clear(above, below)).toBe(false);
    let at = { ...above };
    for (let i = 0; i < 400 && Math.hypot(at.x - below.x, at.y - below.y) > 1.5; i++) {
      const next = nav.steer(at, below), d = Math.hypot(next.x - at.x, next.y - at.y) || 1;
      at = { x: at.x + (next.x - at.x) / d * Math.min(d, 1.5), y: at.y + (next.y - at.y) / d * Math.min(d, 1.5) };
      expect(chukarSolidAt(at.x, at.y)).toBe(false);
    }
    expect(Math.hypot(at.x - below.x, at.y - below.y)).toBeLessThan(1.5);
  });
});

describe('Chukar Ridge hunt areas', () => {
  it('names six to ten areas that between them cover the ground', () => {
    const areas = huntAreasFor(area);
    expect(areas.length).toBeGreaterThanOrEqual(6); expect(areas.length).toBeLessThanOrEqual(10);
    const count = new Map<string, number>(); let total = 0;
    for (let y = 4; y < area.world.h; y += 16) for (let x = 4; x < area.world.w; x += 16) {
      const here = huntAreaAt(area, x, y); total++;
      if (here) count.set(here.id, (count.get(here.id) ?? 0) + 1);
    }
    expect([...count.values()].reduce((a, b) => a + b, 0) / total).toBeGreaterThan(.97);
    for (const a of areas) {
      expect((count.get(a.id) ?? 0) / total, a.id).toBeGreaterThan(.007);
      // The landmark stands inside the property, in or beside its own area.
      const near = [0, 8, 16, 24].some(r => [0, 1, 2, 3, 4, 5, 6, 7].some(k => huntAreaAt(area, a.landmark.position.x + Math.cos(k * Math.PI / 4) * r, a.landmark.position.y + Math.sin(k * Math.PI / 4) * r)?.id === a.id));
      expect(near, a.id).toBe(true);
      expect(a.birds.length, a.id).toBeGreaterThan(20);
      expect(Object.keys(a.uses).length, a.id).toBeGreaterThan(1);
    }
    expect(new Set(CHUKAR_HUNT_AREAS.map(a => a.name)).size).toBe(CHUKAR_HUNT_AREAS.length);
  });

  it('follows the land: a rim divides areas, and each draw owns its floor', () => {
    // The middle rim across the centre of the wall: High Bench above it,
    // the Cheat Face below.
    const rims = chukarRimModules().filter(m => m.rim === 'middle-rim' && m.decay === 0 && m.x > 650 && m.x < 1000 && m.ny > .6);
    expect(rims.length).toBeGreaterThan(3);
    for (const rim of rims) {
      const above = huntAreaAt(area, rim.x - rim.nx * 14, rim.y - rim.ny * 14), below = huntAreaAt(area, rim.x + rim.nx * 40, rim.y + rim.ny * 40);
      expect(above?.id).not.toBe(below?.id);
    }
    expect(huntAreaAt(area, 640, 900)?.id).toBe('sage-draw');
    expect(huntAreaAt(area, CHUKAR_SPRING_SEAM[2].x, CHUKAR_SPRING_SEAM[2].y)?.id).toBe('spring-creek');
  });
});

describe('Chukar Ridge habitat from the land', () => {
  it('puts sage in the draws and on the flat, cheat on the sunny slopes and bunchgrass on the shaded ones', () => {
    const at = (x: number, y: number) => ({ ...chukarGroundAt(x, y) });
    const draw = at(640, 900), flat = at(620, 140), seam = at(CHUKAR_SPRING_SEAM[1].x, CHUKAR_SPRING_SEAM[1].y);
    expect(draw.sage).toBeGreaterThan(.5);
    expect(seam.cover).toBe('seep');
    let southCheat = 0, northCheat = 0, southBunch = 0, northBunch = 0, south = 0, north = 0;
    for (let y = 20; y < area.world.h; y += 22) for (let x = 20; x < area.world.w; x += 22) {
      const g = chukarGroundAt(x, y);
      if (g.southness > .5) { south++; southCheat += g.cheat; southBunch += g.bunchgrass; }
      if (g.southness < -.5) { north++; northCheat += g.cheat; northBunch += g.bunchgrass; }
    }
    expect(north).toBeGreaterThan(30);
    expect(southCheat / south).toBeGreaterThan(northCheat / north + .2);
    expect(northBunch / north).toBeGreaterThan(southBunch / south + .2);
    expect(flat.sage + flat.cheat + flat.bunchgrass).toBeGreaterThan(.5);
  });

  it('marks the rimrock on the habitat map where the rims stand', () => {
    const h = landHabitat(area)!;
    expect(h).not.toBeNull();
    let rock = 0, checked = 0;
    for (const m of chukarRimModules().filter((_, i) => i % 11 === 0)) {
      if (m.x < 4 || m.y < 4 || m.x > area.world.w - 4 || m.y > area.world.h - 4) continue;
      checked++;
      const near = [0, 3, -3].some(o => ['rimrock', 'talus'].includes(habitatClassAt(area, m.x + m.nx * o, m.y + m.ny * o) ?? ''));
      if (near) rock++;
    }
    expect(rock / checked).toBeGreaterThan(.8);
  });

  it('keeps the derived cover patchy and out of the rock', () => {
    const rects = derivedCoverRects(area), share = rects.reduce((s, r) => s + r.w * r.h, 0) / (area.world.w * area.world.h);
    expect(share).toBeGreaterThan(.15); expect(share).toBeLessThan(.35);
    for (const r of rects) {
      let open = 0;
      for (const u of [.2, .5, .8]) for (const v of [.2, .5, .8]) if (!chukarSolidAt(r.x + r.w * u, r.y + r.h * v)) open++;
      expect(open).toBeGreaterThanOrEqual(6);
    }
  });

  it('keeps the cover a dog hunts off the fence, where no covey ever sits', () => {
    // Coveys stay 70 yd inside the fence; a strip of cover by the fence
    // would only draw the dog away from the birds at an entry.
    const w = area.world;
    for (const r of derivedCoverRects(area)) {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      expect(Math.min(cx - w.x, cy - w.y, w.x + w.w - cx, w.y + w.h - cy)).toBeGreaterThan(50);
    }
  });
});

describe('Chukar Ridge birds live where the land says', () => {
  it('never stages a covey in front of the truck, but always has one within a fair walk', () => {
    for (const drop of area.dropPoints) for (const seed of [1, 7, 41]) {
      const anchors = landDrivenAnchors(area, drop, mulberry32(seed * 7919 + drop.id.length));
      expect(anchors.length).toBeGreaterThan(20);
      const distances = anchors.map(a => Math.hypot(a.x - drop.position.x, a.y - drop.position.y));
      expect(Math.min(...distances), drop.id).toBeGreaterThanOrEqual(150);
      expect(distances[0], drop.id).toBeLessThan(560);
      for (const a of anchors) {
        expect(chukarSolidAt(a.x, a.y)).toBe(false);
        expect(a.x).toBeGreaterThan(60); expect(a.y).toBeGreaterThan(60);
        expect(a.x).toBeLessThan(area.world.w - 60); expect(a.y).toBeLessThan(area.world.h - 60);
      }
    }
  });

  it('finds birds in different places on different hunts', () => {
    const drop = area.dropPoints[0], areasOf = (seed: number) => new Set(landDrivenAnchors(area, drop, mulberry32(seed)).slice(0, 12).map(a => huntAreaAt(area, a.x, a.y)?.id));
    const a = areasOf(3), b = areasOf(99), c = areasOf(2026);
    // Where the land offers several pockets out ahead (the West Bench), the
    // first covey moves between them; from the River Road the mouth of Sage
    // Draw is the one escape cover in a fair walk, and the land says so.
    const west = area.dropPoints.find(d => d.id === 'west-track')!;
    const firstOf = (seed: number) => landDrivenAnchors(area, west, mulberry32(seed))[0];
    expect(new Set([3, 99, 2026, 5, 8].map(s => `${Math.round(firstOf(s).x / 40)},${Math.round(firstOf(s).y / 40)}`)).size).toBeGreaterThan(2);
    expect([...a].every(id => b.has(id)) && [...b].every(id => c.has(id)) && a.size === c.size).toBe(false);
  });

  it('reads the hour: water at a September dawn, loafing ground at noon', () => {
    const drop = area.dropPoints[0], h = landHabitat(area)!;
    const roleAt = (role: 'water' | 'loaf', anchors: { x: number; y: number }[]) => anchors.reduce((s, p) => {
      const k = Math.floor(p.y / h.cell) * h.cols + Math.floor(p.x / h.cell);
      return s + (h.role[role][k] ?? 0);
    }, 0) / anchors.length;
    let water = 0, waterNoon = 0, loaf = 0, loafDawn = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const dawn = landDrivenAnchors(area, drop, mulberry32(seed), { timeOfDay: 'dawn', week: 1 });
      const noon = landDrivenAnchors(area, drop, mulberry32(seed), { timeOfDay: 'noon', week: 1 });
      water += roleAt('water', dawn); waterNoon += roleAt('water', noon);
      loaf += roleAt('loaf', noon); loafDawn += roleAt('loaf', dawn);
    }
    expect(loaf).toBeGreaterThan(loafDawn);
    expect(water + waterNoon).toBeGreaterThan(0);
  });

  it('starts no bird and lands no fall inside the rimrock', () => {
    for (const drop of area.dropPoints) for (const seed of [11, 23]) {
      const setup = createThreeHuntSetup(`?area=chukar-ridge&drop=${drop.id}&seed=${seed}`, Math.random, memoryStorage() as never);
      for (const bird of setup.hunt.birds) expect(chukarSolidAt(bird.pos.x, bird.pos.y), `${drop.id} ${bird.id}`).toBe(false);
    }
    const out = { x: 0, y: 0 };
    for (const m of chukarRimModules().filter((_, i) => i % 23 === 0)) {
      land.openPropertyNear(m.x, m.y, out);
      expect(chukarSolidAt(out.x, out.y, 1.5)).toBe(false);
    }
  });
});

describe('Chukar Ridge climbing', () => {
  it('slows the climb, eases it on a trail, and costs breath that comes back', () => {
    expect(climbSpeedFactor(0, 0)).toBe(1);
    expect(climbSpeedFactor(.2, 0)).toBeLessThan(.8);
    expect(climbSpeedFactor(.4, 0)).toBeLessThan(climbSpeedFactor(.2, 0));
    expect(climbSpeedFactor(.3, 1)).toBeGreaterThan(climbSpeedFactor(.3, 0));
    expect(climbSpeedFactor(.4, 0)).toBeGreaterThan(.35); // costs something, not punishing
    expect(climbSpeedFactor(-.1, 0)).toBeGreaterThanOrEqual(1);
    expect(climbSpeedFactor(-.5, 0)).toBeLessThan(1);
    const breath = new HunterBreath();
    for (let t = 0; t < 120; t++) breath.step(1, .45, true, false);
    expect(breath.winded()).toBe(true);
    expect(breath.speedFactor()).toBeLessThan(1); expect(breath.speedFactor()).toBeGreaterThanOrEqual(.6);
    expect(breath.canRun()).toBe(false);
    for (let t = 0; t < 20; t++) breath.step(1, 0, false, false);
    expect(breath.winded()).toBe(false);
  });

  it('charges for the climb only where the ground was built as one', () => {
    // Timberline Parks has an uphill for its runners, but no climb was
    // designed into it: its walk stays free.
    expect(getArea('timberline-parks').slope).toBeDefined();
    expect(AREAS.filter(climbCosts).map(a => a.id)).toEqual(['chukar-ridge']);
  });

  it('puts the remembered places on their own ground', () => {
    const bandOf = (p: { x: number; y: number }) => chukarGroundAt(p.x, p.y).band;
    expect(bandOf(CHUKAR_PLACES.cairn)).toBe('high-bench');
    expect(bandOf(CHUKAR_PLACES.corral)).toBe('rim-flat');
    expect(chukarGroundAt(CHUKAR_PLACES.guzzler.x, CHUKAR_PLACES.guzzler.y).band).toBe('lower-bench');
    expect(land.surfaceAtProperty(CHUKAR_PLACES.guzzler.x, CHUKAR_PLACES.guzzler.y, sample()).slope).toBeLessThan(.25);
    for (const place of [CHUKAR_PLACES.cairn, CHUKAR_PLACES.corral, CHUKAR_PLACES.guzzler, CHUKAR_PLACES.snag, CHUKAR_PLACES.chimney, CHUKAR_PLACES.splitRock]) expect(chukarSolidAt(place.x, place.y, 2)).toBe(false);
  });
});
