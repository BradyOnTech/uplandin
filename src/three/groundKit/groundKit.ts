import type * as THREE from 'three';
import type { AreaConfig } from '../../game/areas';
import type { LandscapeModel } from '../../game/landscape';
import type { Quality } from '../engine';
import { coverMapFor, farCoverMapFor, hasCoverRecipe } from './coverRecipes';
import { CATTAIL_PALETTE, CoverColorField, SHARPTAIL_PALETTE, type CoverPalette } from './coverPalette';
import { COVER_SURFACE_DECLARATIONS, COVER_SURFACE_FRAGMENT, coverSurfaceUniforms, type CoverSurfaceUniforms } from './coverSurface';

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
const KIT_GROUNDS: ReadonlySet<string> = new Set(['sharptail-prairie']);

const PALETTES: Readonly<Record<string, CoverPalette | undefined>> = {
  'sharptail-prairie': SHARPTAIL_PALETTE,
  'pheasant-coverts': CATTAIL_PALETTE,
};

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
  if (!field) { field = new CoverColorField(map, palette); fields.set(landscape.area, field); }
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
  const far = new CoverColorField(farMap, palette), map = near.map;
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
  const surface = {
    uniforms: coverSurfaceUniforms(groundKitColors(landscape)!, KIT_FLOOR_BAND[quality]),
    declarations: COVER_SURFACE_DECLARATIONS,
    fragment: COVER_SURFACE_FRAGMENT,
  };
  surfaces.set(landscape.area, { key, surface });
  return surface;
}
