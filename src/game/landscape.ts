import { getDropPoint, type AreaConfig, type DropPoint } from './areas';
import type { Vec2 } from './types';

/** One shared map pixel is one yard in the 3D presentation. */
export const PROPERTY_PX_TO_M = 0.9144;

/**
 * The selected parking place is kept near the origin for render precision.
 * The first location pass was composed around this start, so retaining it
 * also keeps Quail Fields visually unchanged while property coordinates
 * become stable behind the local-world transform.
 */
export const HUNT_WORLD_ANCHOR = Object.freeze({ x: 0, z: 40 });

/** Deterministic 2D value noise shared by every view of a named property. */
function makeNoise(seed: number) {
  const hash = (x: number, y: number) => {
    let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

/**
 * Deep, renderer-neutral landscape seam.
 *
 * Property coordinates are stable shared-map pixels. World coordinates are
 * local meters anchored at the selected truck. Changing the selected drop
 * therefore changes only the local transform: heightAtProperty() continues
 * to describe one physical property, and heightAtWorld() samples that same
 * property through the selected approach.
 */
export class LandscapeModel {
  readonly dropPoint: DropPoint;
  private readonly canonicalDrop: DropPoint;
  private readonly noise: ReturnType<typeof makeNoise>;

  constructor(readonly area: AreaConfig, dropPointId?: string) {
    this.dropPoint = getDropPoint(area, dropPointId);
    this.canonicalDrop = getDropPoint(area);
    this.noise = makeNoise(area.terrain.seed);
  }

  /** Shared property pixels -> hunt-local world meters. Writes into out. */
  propertyToWorld<T extends { x: number; z: number }>(
    propertyX: number,
    propertyY: number,
    out: T,
  ): T {
    out.x = (propertyX - this.dropPoint.position.x) * PROPERTY_PX_TO_M + HUNT_WORLD_ANCHOR.x;
    out.z = (propertyY - this.dropPoint.position.y) * PROPERTY_PX_TO_M + HUNT_WORLD_ANCHOR.z;
    return out;
  }

  /** Hunt-local world meters -> shared property pixels. Writes into out. */
  worldToProperty<T extends Vec2>(worldX: number, worldZ: number, out: T): T {
    out.x = (worldX - HUNT_WORLD_ANCHOR.x) / PROPERTY_PX_TO_M + this.dropPoint.position.x;
    out.y = (worldZ - HUNT_WORLD_ANCHOR.z) / PROPERTY_PX_TO_M + this.dropPoint.position.y;
    return out;
  }

  /** Stable elevation at a shared-map position, independent of selected drop. */
  heightAtProperty(propertyX: number, propertyY: number): number {
    // Keep the original primary-drop composition as the canonical landform
    // frame. Alternate drops sample another offset within this same frame.
    const x =
      (propertyX - this.canonicalDrop.position.x) * PROPERTY_PX_TO_M + HUNT_WORLD_ANCHOR.x;
    const z =
      (propertyY - this.canonicalDrop.position.y) * PROPERTY_PX_TO_M + HUNT_WORLD_ANCHOR.z;
    const profile = this.area.terrain;
    const n1 = this.noise(x * 0.006 + 100, z * 0.006 + 100);
    const n15 = this.noise(x * 0.016 + 1300, z * 0.016 + 1300);
    const n2 = this.noise(x * 0.05 + 300, z * 0.05 + 300);
    const grade = x / 100 * profile.gradeX + z / 100 * profile.gradeZ;
    return (n1 - 0.5) * profile.broadRelief
      + (n15 - 0.5) * profile.rollingRelief
      + (n2 - 0.5) * profile.detailRelief
      + profile.baseHeight
      + grade;
  }

  /** Elevation beneath a hunt-local 3D position. No per-query allocation. */
  heightAtWorld(worldX: number, worldZ: number): number {
    const propertyX =
      (worldX - HUNT_WORLD_ANCHOR.x) / PROPERTY_PX_TO_M + this.dropPoint.position.x;
    const propertyY =
      (worldZ - HUNT_WORLD_ANCHOR.z) / PROPERTY_PX_TO_M + this.dropPoint.position.y;
    return this.heightAtProperty(propertyX, propertyY);
  }
}
