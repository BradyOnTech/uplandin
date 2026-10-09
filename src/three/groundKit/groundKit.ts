import type { AreaConfig } from '../../game/areas';
import type { LandscapeModel } from '../../game/landscape';
import type { Quality } from '../engine';
import { coverMapFor, hasCoverRecipe } from './coverRecipes';
import { CATTAIL_PALETTE, CoverColorField, SHARPTAIL_PALETTE, type CoverPalette } from './coverPalette';
import {
  COVER_SURFACE_DECLARATIONS, coverSurfaceFragment, coverSurfaceUniforms,
  type CoverSurfaceStyle, type CoverSurfaceUniforms,
} from './coverSurface';

/**
 * THE SHARED GROUND KIT: one cover map feeding three distance bands.
 *  - near: blade garnish round the hunter and dog;
 *  - middle: the chosen grass representation (the bake-off);
 *  - far: the cover map's colour mosaic painted into the terrain.
 * A ground opts in by having a cover recipe and a palette; its old
 * per-ground vegetation stack stands down while the kit is active.
 */

/** Grass representations under trial (milestone 1 bake-off); 'bare' is
 * the review baseline (far band and woody clumps only) for cost numbers. */
export type CoverStyle = 'masses' | 'tufts' | 'strokes' | 'bare';
const STYLES: readonly CoverStyle[] = ['masses', 'tufts', 'strokes', 'bare'];

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

/** The grass style the kit renders on a ground, or null for the old stack. */
export function groundKitStyle(areaId: string, requested = requestedStyle()): CoverStyle | null {
  if (!hasCoverRecipe(areaId) || !PALETTES[areaId]) return null;
  return STYLES.includes(requested as CoverStyle) ? requested as CoverStyle : null;
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

const surfaces = new WeakMap<AreaConfig, { key: string; surface: GroundKitSurface }>();

/**
 * The terrain's share of the kit, or undefined when the ground is not on
 * it. Shared, memoised per property: the kit system drives these uniforms.
 */
export function groundKitSurface(landscape: LandscapeModel, quality: Quality): GroundKitSurface | undefined {
  const style = groundKitStyle(landscape.area.id), palette = PALETTES[landscape.area.id];
  if (!style || !palette) return undefined;
  const surfaceStyle: CoverSurfaceStyle = style === 'strokes' ? 'strokes' : 'paint';
  const key = `${surfaceStyle}-${quality}`;
  const saved = surfaces.get(landscape.area);
  if (saved?.key === key) return saved.surface;
  saved?.surface.uniforms.uCoverMap.value.dispose();
  const surface = {
    uniforms: coverSurfaceUniforms(groundKitColors(landscape)!, KIT_FLOOR_BAND[quality]),
    declarations: COVER_SURFACE_DECLARATIONS,
    fragment: coverSurfaceFragment(surfaceStyle),
  };
  surfaces.set(landscape.area, { key, surface });
  return surface;
}
