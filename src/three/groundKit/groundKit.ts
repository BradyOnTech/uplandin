import type * as THREE from 'three';
import type { AreaConfig } from '../../game/areas';
import type { LandscapeModel } from '../../game/landscape';
import type { Quality } from '../engine';
import { coverHash, CoverSiteIndex, type CoverSite } from './coverMap';
import { coverMapFor, farCoverMapFor, hasCoverRecipe, QUAIL_COMMUNITY, QUAIL_SITE, SHARPTAIL_COMMUNITY } from './coverRecipes';
import type { WoodySpecies } from './woodyKit';
import {
  CATTAIL_PALETTE, CoverColorField, DEFAULT_PALETTE_STYLE, QUAIL_PALETTE, SHARPTAIL_PALETTE, type CoverPalette, type PaletteStyle,
} from './coverPalette';
import { coverSurfaceDeclarations, coverSurfaceFragment, coverSurfaceUniforms, type CoverSurfaceUniforms } from './coverSurface';

/**
 * THE SHARED GROUND KIT: one cover map feeding three distance bands.
 *  - near: blade garnish and a basal mat round the hunter and dog;
 *  - middle: faceted sward masses, the bake-off winner (cover.md);
 *  - far: the cover map's colour mosaic painted into the terrain.
 * A ground opts in by having a cover recipe and a palette; its old
 * per-ground vegetation stack stands down while the kit is active.
 */

/** 'masses' is the kit; 'bare' is the review baseline (far band and woody
 * clumps only) that cost numbers are measured against. */
export type CoverStyle = 'masses' | 'bare';
const STYLES: readonly CoverStyle[] = ['masses', 'bare'];

/** Grounds that are on the kit unless a review asks for the old stack. */
const KIT_GROUNDS: ReadonlySet<string> = new Set(['sharptail-prairie', 'quail-fields']);

const PALETTES: Readonly<Record<string, CoverPalette | undefined>> = {
  'sharptail-prairie': SHARPTAIL_PALETTE,
  'pheasant-coverts': CATTAIL_PALETTE,
  'quail-fields': QUAIL_PALETTE,
};

/** Quail's bunchgrass shows its red soil between bunches, near and far. */
const PALETTE_STYLES: Readonly<Record<string, PaletteStyle | undefined>> = {
  'quail-fields': { soilShow: .55, floors: true },
};

export function groundKitPaletteStyle(areaId: string): PaletteStyle {
  return PALETTE_STYLES[areaId] ?? DEFAULT_PALETTE_STYLE;
}

function requestedStyle(): string | null {
  if (typeof location === 'undefined') return null;
  return new URLSearchParams(location.search).get('cover');
}

/** Review only: the legacy stack with the kit's review hooks beside it. */
export function groundKitLegacyReview(areaId: string, requested = requestedStyle()): boolean {
  return requested === 'legacy' && hasCoverRecipe(areaId);
}

/** The kit style on a ground, or null for its old stack. Grounds on the
 * kit use masses; ?cover=legacy brings their old stack back for review,
 * and ?cover=masses previews the kit on a ground with a recipe. */
export function groundKitStyle(areaId: string, requested = requestedStyle()): CoverStyle | null {
  if (!hasCoverRecipe(areaId) || !PALETTES[areaId] || requested === 'legacy') return null;
  if (STYLES.includes(requested as CoverStyle)) return requested as CoverStyle;
  return KIT_GROUNDS.has(areaId) ? 'masses' : null;
}

/** Tall cover open at dog height (chest-high stands), or solid masses. */
export function groundKitTallCoverOpen(areaId: string): boolean {
  return areaId === 'pheasant-coverts';
}

/** One species in a woody group: its share and its height range (m). */
export interface WoodyGroup { species: WoodySpecies; weight: number; height: readonly [number, number] }

/** A ground's woody plants: thickets keyed by the shrub class's variant in
 * its cover recipe, and lone plants keyed by the recipe's site groups. */
export interface GroundWoody {
  shrubs: Readonly<Record<number, readonly WoodyGroup[]>>;
  sites?: Readonly<Record<number, readonly WoodyGroup[]>>;
  /** Site groups that are trees: drawn far past the brush, solid to walk
   * into and to shot. */
  trees?: readonly number[];
}

/**
 * Each ground's woody plants.
 *
 * Sharptail: chokecherry and buffaloberry thickets skirted with buckbrush
 * at the heads of draws; buckbrush colonies with a little rose on the lee
 * slopes and in side hollows; wild rose and snowberry on the fence line.
 *
 * Quail: sand plum thickets in the covey headquarters, shinnery oak mottes
 * (with the odd plum) on the sand between; lone sand sage on the sandy
 * swells, mesquite low and spreading over the upland pastures, a rounded
 * hackberry here and there, and hackberry, elm and cottonwood on the creek.
 */
const WOODY: Readonly<Record<string, GroundWoody | undefined>> = {
  'sharptail-prairie': {
    shrubs: {
      [SHARPTAIL_COMMUNITY.shrub.thicket]: [
        { species: 'chokecherry', weight: .42, height: [1.9, 3.1] },
        { species: 'buffaloberry', weight: .33, height: [1.6, 2.7] },
        { species: 'buckbrush', weight: .25, height: [.6, 1.0] },
      ],
      [SHARPTAIL_COMMUNITY.shrub.buckbrush]: [
        { species: 'buckbrush', weight: .85, height: [.55, 1.0] },
        { species: 'wild-rose', weight: .15, height: [.4, .7] },
      ],
      [SHARPTAIL_COMMUNITY.shrub.rose]: [
        { species: 'wild-rose', weight: .6, height: [.4, .75] },
        { species: 'buckbrush', weight: .4, height: [.5, .9] },
      ],
    },
  },
  'quail-fields': {
    shrubs: {
      [QUAIL_COMMUNITY.shrub.plum]: [{ species: 'sand-plum', weight: 1, height: [1.1, 2.7] }],
      [QUAIL_COMMUNITY.shrub.shinnery]: [
        { species: 'shinnery', weight: .86, height: [.65, 1.35] },
        { species: 'sand-plum', weight: .14, height: [1.0, 1.7] },
      ],
    },
    sites: {
      [QUAIL_SITE.creek]: [
        { species: 'cottonwood', weight: .28, height: [11, 16.5] },
        { species: 'elm', weight: .34, height: [7, 11] },
        { species: 'hackberry', weight: .38, height: [6, 9] },
      ],
      [QUAIL_SITE.mesquite]: [{ species: 'mesquite', weight: 1, height: [2.4, 4.8] }],
      [QUAIL_SITE.hackberry]: [{ species: 'hackberry', weight: 1, height: [5.5, 8.5] }],
      [QUAIL_SITE.sage]: [{ species: 'sand-sage', weight: 1, height: [.55, 1.15] }],
    },
    trees: [QUAIL_SITE.creek, QUAIL_SITE.mesquite, QUAIL_SITE.hackberry],
  },
};

export function groundKitWoody(areaId: string): GroundWoody | undefined {
  return WOODY[areaId];
}

/** One lone plant at a site: its species, size and pose, the same for the
 * renderer's every detail and for the trunk the hunter walks into. */
export interface SitePlant { species: WoodySpecies; height: number; yaw: number; aspect: number; depth: number; shade: number }

export function siteWoody(site: CoverSite, woody: GroundWoody): SitePlant | null {
  const group = woody.sites?.[site.group];
  if (!group?.length) return null;
  const ix = Math.round(site.x * 8), iy = Math.round(site.y * 8);
  let pick = coverHash(ix, iy, 401) * group.reduce((sum, entry) => sum + entry.weight, 0), entry = group[0];
  for (const candidate of group) { pick -= candidate.weight; if (pick <= 0) { entry = candidate; break; } }
  return {
    species: entry.species,
    height: entry.height[0] + coverHash(ix, iy, 402) * (entry.height[1] - entry.height[0]),
    yaw: coverHash(ix, iy, 403) * Math.PI * 2,
    aspect: .88 + coverHash(ix, iy, 404) * .3,
    depth: .88 + coverHash(ix, iy, 405) * .3,
    shade: .9 + coverHash(ix, iy, 406) * .18,
  };
}

const siteIndices = new WeakMap<AreaConfig, CoverSiteIndex>();

/** The ground's lone woody plants, bucketed for the renderer's chunks. */
export function groundKitSites(landscape: LandscapeModel): CoverSiteIndex {
  let index = siteIndices.get(landscape.area);
  if (!index) { index = new CoverSiteIndex(coverMapFor(landscape)?.sites ?? []); siteIndices.set(landscape.area, index); }
  return index;
}

/** A tree's trunk (or a mesquite's knot of trunks): solid to the hunter
 * and to shot. World metres; `top` is where the crown takes over. */
export interface KitTrunk { x: number; z: number; radius: number; ground: number; top: number }

/** Trunk radius as a share of the tree's height. */
const TRUNK_RADIUS: Partial<Record<WoodySpecies, number>> = { cottonwood: .03, elm: .026, hackberry: .03, mesquite: .07 };

/** Every tree trunk on the ground (inside the fence), from the same sites
 * and picks the renderer uses. Empty off the kit or without trees. */
export function groundKitTrunks(landscape: LandscapeModel): KitTrunk[] {
  const woody = WOODY[landscape.area.id], map = groundKitStyle(landscape.area.id) ? coverMapFor(landscape) : undefined;
  if (!woody?.trees?.length || !map) return [];
  const trees = new Set(woody.trees), world = landscape.area.world, out: KitTrunk[] = [], at = { x: 0, z: 0 };
  for (const site of map.sites) {
    if (!trees.has(site.group) || site.x < world.x || site.y < world.y || site.x > world.x + world.w || site.y > world.y + world.h) continue;
    const plant = siteWoody(site, woody);
    if (!plant) continue;
    landscape.propertyToWorld(site.x, site.y, at);
    const ground = landscape.heightAtProperty(site.x, site.y);
    out.push({ x: at.x, z: at.z, radius: plant.height * (TRUNK_RADIUS[plant.species] ?? .03), ground, top: ground + plant.height * .35 });
  }
  return out;
}

export function groundKitPalette(areaId: string): CoverPalette | undefined {
  return PALETTES[areaId];
}

/** Where the terrain hands from litter to canopy colour, per tier (m). */
export const KIT_FLOOR_BAND: Record<Quality, readonly [number, number]> = { high: [10, 70], lite: [8, 48] };

export interface GroundKitSurface {
  uniforms: CoverSurfaceUniforms;
  declarations: string;
  fragment: string;
}

const fields = new WeakMap<AreaConfig, CoverColorField>();

/** The ground's cover colour field, shared by the terrain and the plants. */
export function groundKitColors(landscape: LandscapeModel): CoverColorField | undefined {
  const palette = PALETTES[landscape.area.id], map = coverMapFor(landscape);
  if (!palette || !map) return undefined;
  let field = fields.get(landscape.area);
  if (!field) { field = new CoverColorField(map, palette, groundKitPaletteStyle(landscape.area.id)); fields.set(landscape.area, field); }
  return field;
}

/**
 * The kit's colour for the terrain's vertex paint: the fine field over the
 * ground and its margin, the coarse far field out to the horizon. Returns
 * false where the kit grows nothing (a farm's fields keep their own paint).
 */
export function groundKitPaint(landscape: LandscapeModel): ((x: number, y: number, out: THREE.Color) => boolean) | undefined {
  const near = groundKitColors(landscape), palette = PALETTES[landscape.area.id], farMap = farCoverMapFor(landscape);
  if (!near || !palette || !farMap) return undefined;
  const far = new CoverColorField(farMap, palette, { ...groundKitPaletteStyle(landscape.area.id), floors: false }), map = near.map;
  return (x, y, out) => {
    const inNear = x > map.x0 + 4 && y > map.y0 + 4 && x < map.x0 + map.cols * map.cell - 4 && y < map.y0 + map.rows * map.cell - 4;
    const source = inNear ? map : farMap;
    if (source.density[source.index(x, y)] < 5) return false;
    (inNear ? near : far).sample(x, y, out);
    return true;
  };
}

const surfaces = new WeakMap<AreaConfig, { key: string; surface: GroundKitSurface }>();

/**
 * The terrain's share of the kit, or undefined when the ground is not on
 * it. Shared, memoised per property: the kit system drives these uniforms.
 */
export function groundKitSurface(landscape: LandscapeModel, quality: Quality): GroundKitSurface | undefined {
  const style = groundKitStyle(landscape.area.id), palette = PALETTES[landscape.area.id];
  if (!style || !palette) return undefined;
  const key = `${style}-${quality}`;
  const saved = surfaces.get(landscape.area);
  if (saved?.key === key) return saved.surface;
  saved?.surface.uniforms.uCoverMap.value.dispose();
  saved?.surface.uniforms.uCoverFloor?.value.dispose();
  const field = groundKitColors(landscape)!, floors = !!field.floor;
  const surface = {
    uniforms: coverSurfaceUniforms(field, KIT_FLOOR_BAND[quality]),
    declarations: coverSurfaceDeclarations(floors),
    fragment: coverSurfaceFragment(floors),
  };
  surfaces.set(landscape.area, { key, surface });
  return surface;
}
