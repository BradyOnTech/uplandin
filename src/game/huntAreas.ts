/**
 * Named hunt areas: the recognisable places a ground is made of. Each has its
 * own landform, cover and landmark, a name the survey map and HUD show, and
 * the uses birds make of it through the day and season.
 *
 * Membership comes from the land: a draw's floor belongs to its draw, and
 * everywhere else falls to the nearest area seed measured with elevation
 * weighted heavily, so an area follows its bench or slope and stops at the
 * rim above it. Grounds without named areas return none.
 */
import type { AreaConfig } from './areas';
import type { Vec2 } from './types';

/** What birds come to an area for. */
export type CoverRole = 'roost' | 'feed' | 'loaf' | 'escape' | 'water';
export const COVER_ROLES: readonly CoverRole[] = ['roost', 'feed', 'loaf', 'escape', 'water'];

export interface HuntArea {
  id: string;
  name: string;
  /** Label point and the area's character, for the map and the design. */
  center: Vec2;
  landform: string;
  cover: string;
  landmark: { name: string; position: Vec2 };
  /** 0..1 how much each use draws birds here, before hour and season. */
  uses: Partial<Record<CoverRole, number>>;
  /** Plain words for which birds use it when (design and field notes). */
  birds: string;
}

export interface HuntAreaModel {
  areas: readonly HuntArea[];
  /** Index into `areas` at a property position, or -1 outside them all. */
  indexAt(x: number, y: number): number;
}

const models = new Map<string, HuntAreaModel | null>();
const providers = new Map<string, () => HuntAreaModel>();

/** Ground modules register their model lazily; nothing builds until asked. */
export function registerHuntAreas(areaId: string, build: () => HuntAreaModel): void {
  providers.set(areaId, build);
  models.delete(areaId);
}

export function huntAreaModel(area: Pick<AreaConfig, 'id'>): HuntAreaModel | null {
  if (!models.has(area.id)) models.set(area.id, providers.get(area.id)?.() ?? null);
  return models.get(area.id)!;
}

export function huntAreasFor(area: Pick<AreaConfig, 'id'>): readonly HuntArea[] {
  return huntAreaModel(area)?.areas ?? [];
}

export function huntAreaAt(area: Pick<AreaConfig, 'id'>, x: number, y: number): HuntArea | null {
  const model = huntAreaModel(area);
  if (!model) return null;
  const index = model.indexAt(x, y);
  return index >= 0 ? model.areas[index] : null;
}

/**
 * A membership grid: draw floors claim their cells, the rest go to the
 * nearest seed by plan distance plus `climb` yards per metre of height
 * difference. Built once over the property at `cell` yards.
 */
export function seededAreaGrid(
  world: { x: number; y: number; w: number; h: number },
  cell: number,
  seeds: readonly { area: number; x: number; y: number; height: number }[],
  heightAt: (x: number, y: number) => number,
  claim: (x: number, y: number) => number,
  climb: number,
): (x: number, y: number) => number {
  const cols = Math.ceil(world.w / cell), rows = Math.ceil(world.h / cell);
  const grid = new Int8Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = world.x + (i + .5) * cell, y = world.y + (j + .5) * cell;
    let index = claim(x, y);
    if (index < 0) {
      const h = heightAt(x, y);
      let best = Infinity;
      for (const seed of seeds) {
        const d = Math.hypot(x - seed.x, y - seed.y) + Math.abs(h - seed.height) * climb;
        if (d < best) { best = d; index = seed.area; }
      }
    }
    grid[j * cols + i] = index;
  }
  return (x, y) => {
    const i = Math.floor((x - world.x) / cell), j = Math.floor((y - world.y) / cell);
    if (i < 0 || j < 0 || i >= cols || j >= rows) return -1;
    return grid[j * cols + i];
  };
}
