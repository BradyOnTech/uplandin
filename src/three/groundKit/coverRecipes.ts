import type { AreaConfig } from '../../game/areas';
import type { LandscapeModel } from '../../game/landscape';
import { SHARPTAIL_SHELTERBELTS } from '../../game/sharptailLandscape';
import { pheasantPondRadii } from '../../game/pheasantHabitat';
import { PROPERTY_PX_TO_M } from '../../game/worldUnits';
import {
  Cover, buildCoverMap, coverNoise, coverSmooth, type CoverCell, type CoverClearing, type CoverMap,
  type CoverPoint, type CoverRecipe, type CoverSample,
} from './coverMap';

/*
 * Each ground's cover recipe: the plant communities its land grows. The
 * recipes read only land metrics, habitat distance and the working layout,
 * so they keep dressing a ground when its landform or patches change.
 */

/**
 * Sharptail Prairie, North Dakota mixed-grass on the Missouri Coteau.
 * Copper little bluestem on dry crowns and south faces; tawny western
 * wheatgrass and needle-and-thread on the grazed shoulders, knee-high so a
 * pointing dog stands above them; maroon big bluestem where water gathers
 * in swales; buckbrush, chokecherry and buffaloberry clumped at the heads of
 * draws, thinning downslope into the swale grass; rank stands round the
 * sim's bird cover.
 */
export const SHARPTAIL_COVER_HEIGHTS = {
  short: [.30, .44],
  crown: [.34, .50],
  swale: [.80, 1.15],
  stand: [.62, .92],
  shrub: [.9, 1.8],
} as const;

/** Sharptail's plant communities per class (the cover map's variant). */
export const SHARPTAIL_COMMUNITY = {
  short: { needle: 0, wheatgrass: 1, bluestem: 2, sage: 3 },
  crown: { bluestem: 0, needle: 1, sage: 2 },
  swale: { bigBluestem: 0, lowland: 1 },
  // Rank stands keep the community round them, grown taller and denser.
  stand: { needle: 0, wheatgrass: 1, bluestem: 2, bigBluestem: 3 },
  shrub: { thicket: 0, buckbrush: 1, rose: 2 },
} as const;

/** Moisture from the land: flow accumulation, hollows and basins. */
function prairieMoisture(s: CoverSample): number {
  return coverSmooth(.12, .8, s.wetness * .85 + Math.max(0, -s.tpi) * .32 + Math.max(0, -s.relief) * .07);
}

/** Exposure: crowns, swells and dry south and west faces. */
function prairieDryness(s: CoverSample): number {
  return coverSmooth(.18, .85, Math.max(0, s.tpi) * .42 + Math.max(0, s.relief) * .09
    + Math.max(0, s.south) * .26 + Math.max(0, s.west) * .08 - s.wetness * .6);
}

/** Side hollows and the upper reach of a draw: contours folding in on a
 * slope before water has gathered. */
function drawHollow(s: CoverSample): number {
  const hollow = coverSmooth(.25, .6, s.convergence) * (1 - coverSmooth(.3, .55, s.wetness)) * coverSmooth(.02, .06, s.slope);
  const upper = coverSmooth(.15, .5, s.convergence) * coverSmooth(.05, .3, -s.tpi)
    * (1 - coverSmooth(.35, .6, s.wetness)) * coverSmooth(.015, .05, s.slope);
  // Buckbrush favours the cooler north-facing side of a draw.
  return Math.max(hollow, upper * .85) * (.85 + Math.max(0, -s.south) * .3);
}

/** Lee slopes: the cool north and east faces below a crest, where snow
 * lies longest and snowberry colonies spread. */
function leeSlope(s: CoverSample): number {
  return coverSmooth(.15, .6, -s.south * .8 - s.west * .4) * coverSmooth(.03, .08, s.slope) * (1 - coverSmooth(.1, .5, s.tpi));
}

/** Real prairie is patchy at every scale: a broad field, broken by a
 * middle one, broken again at the scale of a few bunches. */
function patchiness(x: number, y: number, salt: number): number {
  return coverNoise(x / 110, y / 110, salt) * .5 + coverNoise(x / 36, y / 36, salt + 1) * .32 + coverNoise(x / 11, y / 11, salt + 2) * .18;
}

export const sharptailCoverRecipe = (shelterbelts: readonly { a: CoverPoint; b: CoverPoint; width: number }[],
  bounds?: { x: number; y: number; w: number; h: number }): CoverRecipe => ({
  classify(x, y, s, out) {
    const H = SHARPTAIL_COVER_HEIGHTS, C = SHARPTAIL_COMMUNITY;
    const colony = coverNoise(x / 70, y / 70, 11) * .7 + coverNoise(x / 23, y / 23, 12) * .3;
    out.tone = colony;
    if (s.clearing > .5) {
      out.cls = Cover.bare; out.density = .15; out.height = .08; return;
    }
    for (const belt of shelterbelts) {
      const dx = belt.b.x - belt.a.x, dy = belt.b.y - belt.a.y;
      const t = Math.max(0, Math.min(1, ((x - belt.a.x) * dx + (y - belt.a.y) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(x - belt.a.x - dx * t, y - belt.a.y - dy * t) < belt.width * .5) {
        out.cls = Cover.tree; out.density = .9; out.height = 1.2; return;
      }
    }
    const moist = prairieMoisture(s), dry = prairieDryness(s);
    const lerp = (range: readonly [number, number], t: number) => range[0] + (range[1] - range[0]) * t;
    const worn = 1 - coverSmooth(1.2, 3.2, s.route);
    // Woody cover, broken into clumps by a coarse colony field.
    const clump = coverNoise(x / 12, y / 12, 31) * .75 + coverNoise(x / 4, y / 4, 32) * .25;
    // A chokecherry and buffaloberry thicket at the head of every draw,
    // skirted with buckbrush, thinning downslope into the swale grass.
    const head = (1 - coverSmooth(8, 24, s.head + (clump - .5) * 16)) * coverSmooth(.2, .45, clump);
    // Buckbrush colonies in the side hollows and on the lee slopes.
    const colonies = coverNoise(x / 30, y / 30, 71) * .8 + coverNoise(x / 8, y / 8, 72) * .2;
    const buckbrush = Math.max(coverSmooth(.15, .55, drawHollow(s)) * coverSmooth(.45, .65, clump),
      leeSlope(s) * coverSmooth(.66, .8, colonies));
    // Wild rose and snowberry along the fence line.
    const fence = bounds ? Math.min(x - bounds.x, bounds.x + bounds.w - x, y - bounds.y, bounds.y + bounds.h - y) : Infinity;
    const rose = (1 - coverSmooth(1.5, 3.5, Math.abs(fence))) * coverSmooth(.5, .62, coverNoise(x / 6, y / 6, 81));
    if (worn < .5 && (head > .35 || buckbrush > .4 || rose > .5)) {
      out.cls = Cover.shrub;
      if (head > .35) {
        out.variant = head > .5 ? C.shrub.thicket : C.shrub.buckbrush;
        out.density = coverSmooth(.35, .8, head);
        out.height = H.shrub[0] + (H.shrub[1] - H.shrub[0]) * coverSmooth(.4, 1, head) * (.6 + clump * .4);
      } else if (buckbrush > .4) {
        out.variant = C.shrub.buckbrush; out.density = coverSmooth(.4, .8, buckbrush) * .9; out.height = .6 + clump * .35;
      } else {
        out.variant = C.shrub.rose; out.density = .55; out.height = .45 + clump * .3;
      }
      return;
    }
    // Bird cover: the sim's patches carry rank native stands with feathered
    // fringes that blend into whatever the land grows round them.
    const ragged = (coverNoise(x / 9, y / 9, 41) - .5) * 18;
    const stand = 1 - coverSmooth(-4, 12, s.habitat + Math.max(-4, ragged));
    const patch = patchiness(x, y, 51);
    // Fringed sage and forbs in small patches where the soil is thin.
    const sage = coverSmooth(.72, .8, coverNoise(x / 14, y / 14, 61)) * (.4 + dry * .6) * (1 - moist);
    // Copper bluestem creeps down the dry knobs and south faces; the rest
    // is a patchwork of silver needle-and-thread and tawny wheatgrass, the
    // wheatgrass on the moister, lower ground.
    const knob = dry * .6 + Math.max(0, s.south) * .35 + (coverNoise(x / 30, y / 30, 55) - .5) * .35;
    const shoulder = knob > .42 ? C.short.bluestem
      : patch + moist * .25 - Math.max(0, s.tpi) * .2 > .55 ? C.short.wheatgrass : C.short.needle;
    if (stand > .5 && moist < .7) {
      out.cls = Cover.stand;
      out.variant = moist > .35 ? C.stand.bigBluestem : shoulder;
      out.density = .82 + stand * .16;
      out.height = lerp(H.stand, colony * .6 + moist * .4);
    } else if (moist > .5) {
      out.cls = Cover.swale;
      out.variant = s.wetness > .75 && patch > .45 ? C.swale.lowland : C.swale.bigBluestem;
      out.density = .86 + moist * .14;
      out.height = lerp(H.swale, coverSmooth(.5, 1, moist) * .7 + colony * .3);
    } else if (dry > .45) {
      out.cls = Cover.crown;
      out.variant = sage > .5 ? C.crown.sage : patch > .6 ? C.crown.needle : C.crown.bluestem;
      // Little bluestem holds the crowns in close bunches; the wind opens
      // only a little more litter between them than on the shoulders.
      out.density = .76 + (1 - dry) * .14;
      out.height = lerp(H.crown, colony * .7 + (1 - dry) * .3) * (out.variant === C.crown.sage ? .78 : 1);
    } else {
      out.cls = Cover.short;
      out.variant = sage > .5 ? C.short.sage : shoulder;
      out.density = .7 + moist * .2;
      out.height = lerp(H.short, colony * .6 + moist * .4) * (out.variant === C.short.sage ? .8 : 1);
    }
    if (worn > 0) {
      out.density *= 1 - worn * .55;
      out.height *= 1 - worn * .5;
      if (worn > .8) out.cls = Cover.bare;
    }
  },
});

/**
 * Cattail Coverts, a prairie-pothole farm: the cover blocks only. CRP
 * switchgrass and big bluestem stand chest-high in the managed blocks, with
 * cattail rings where a block meets a slough. Fields, yards and verges are
 * not the kit's yet (density 0): the farm's own crop surface keeps them.
 */
export const CATTAIL_COVER_HEIGHTS = { stand: [1.1, 1.45], swale: [1.5, 1.9] } as const;

const cattailRecipe = (area: AreaConfig): CoverRecipe => {
  const ponds = area.landmarks.filter(mark => mark.kind === 'pond').map(mark => {
    const radii = pheasantPondRadii(mark.id);
    return { x: mark.position.x, y: mark.position.y, rx: radii.rx / PROPERTY_PX_TO_M, ry: radii.rz / PROPERTY_PX_TO_M };
  });
  return {
    classify(x, y, s, out) {
      const H = CATTAIL_COVER_HEIGHTS;
      const colony = coverNoise(x / 40, y / 40, 13) * .7 + coverNoise(x / 12, y / 12, 14) * .3;
      out.tone = colony;
      let pond = Infinity;
      for (const p of ponds) pond = Math.min(pond, Math.hypot((x - p.x) / p.rx, (y - p.y) / p.ry));
      if (pond < 1) { out.cls = Cover.water; out.density = 0; out.height = 0; return; }
      const ragged = (coverNoise(x / 7, y / 7, 15) - .5) * 7;
      const cover = 1 - coverSmooth(-1, 5, s.habitat + Math.max(-1, ragged));
      if (cover < .5 || s.clearing > .5) { out.cls = Cover.bare; out.density = 0; out.height = 0; return; }
      const lerp = (range: readonly [number, number], t: number) => range[0] + (range[1] - range[0]) * t;
      if (pond < 1.8 || s.wetness > .78) {
        out.cls = Cover.swale; out.density = .92; out.height = lerp(H.swale, colony);
      } else {
        out.cls = Cover.stand; out.density = .88; out.height = lerp(H.stand, colony);
      }
    },
  };
};

/** Clearings round entries and working landmarks, yards. */
function clearingsFor(area: AreaConfig): CoverClearing[] {
  const radius: Partial<Record<string, number>> = { barn: 20, windmill: 9, pond: 14, gate: 6, fence: 0 };
  return [
    ...area.dropPoints.map(drop => ({ x: drop.position.x, y: drop.position.y, radius: 14 })),
    ...area.landmarks.map(mark => ({ x: mark.position.x, y: mark.position.y, radius: radius[mark.kind] ?? 6 }))
      .filter(place => place.radius > 0),
  ];
}

const RECIPES: Readonly<Record<string, ((area: AreaConfig) => CoverRecipe) | undefined>> = {
  'sharptail-prairie': area => sharptailCoverRecipe(SHARPTAIL_SHELTERBELTS, area.world),
  'pheasant-coverts': area => cattailRecipe(area),
};

export function hasCoverRecipe(areaId: string): boolean {
  return !!RECIPES[areaId];
}

const cache = new WeakMap<AreaConfig, CoverMap>();

/** The ground's cover map, built once per property and shared by every
 * band. Drop-independent: it is sampled in property yards. */
export function coverMapFor(landscape: LandscapeModel): CoverMap | undefined {
  const area = landscape.area, recipe = RECIPES[area.id];
  if (!recipe) return undefined;
  let map = cache.get(area);
  if (!map) {
    map = buildCoverMap({
      bounds: area.world,
      heightAt: (x, y) => landscape.heightAtProperty(x, y),
      habitat: area.patches,
      routes: area.trails.map(trail => trail.points),
      clearings: clearingsFor(area),
      recipe: recipe(area),
    });
    cache.set(area, map);
  }
  return map;
}

const farCache = new WeakMap<AreaConfig, CoverMap>();

/** Yards per cell and margin of the coarse far map that carries the mosaic
 * out to the horizon ground beyond the fine map. */
const FAR_CELL_YARDS = 16;
const FAR_MARGIN_YARDS = 1100;

/** The same recipe on a coarse grid reaching the horizon: the terrain's
 * vertex paint beyond the fine map, so the mosaic never stops at a line. */
export function farCoverMapFor(landscape: LandscapeModel): CoverMap | undefined {
  const area = landscape.area, recipe = RECIPES[area.id];
  if (!recipe) return undefined;
  let map = farCache.get(area);
  if (!map) {
    map = buildCoverMap({
      bounds: area.world,
      heightAt: (x, y) => landscape.heightAtProperty(x, y),
      habitat: area.patches,
      routes: [],
      clearings: [],
      recipe: recipe(area),
      margin: FAR_MARGIN_YARDS,
      cell: FAR_CELL_YARDS,
      landStep: FAR_CELL_YARDS,
    });
    farCache.set(area, map);
  }
  return map;
}

/** Scratch cell for callers that sample in loops. */
export function coverCell(): CoverCell {
  return { cls: Cover.short, density: 0, height: 0, tone: 0, variant: 0 };
}
