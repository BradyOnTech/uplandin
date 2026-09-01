import {
  getDropPoint,
  type AreaConfig,
  type AreaTerrainProfile,
  type DropPoint,
} from './areas';
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

type Noise2D = ReturnType<typeof makeNoise>;

interface LandformAdapter {
  heightAt(x: number, z: number, profile: AreaTerrainProfile, noise: Noise2D): number;
  surfaceAt(
    x: number,
    z: number,
    height: number,
    slope: number,
    noise: Noise2D,
    out: GroundSample,
  ): void;
}

export interface GroundSample {
  height: number;
  /** Rise over run at the query point. */
  slope: number;
  /** 0 = soil/grass, 1 = exposed face or concentrated scree. */
  rockiness: number;
  /** 0 = barren, 1 = strongest local plant establishment. */
  vegetation: number;
}

const ROLLING_LANDFORM: LandformAdapter = {
  heightAt(x, z, profile, noise) {
    const n1 = noise(x * 0.006 + 100, z * 0.006 + 100);
    const n15 = noise(x * 0.016 + 1300, z * 0.016 + 1300);
    const n2 = noise(x * 0.05 + 300, z * 0.05 + 300);
    const grade = x / 100 * profile.gradeX + z / 100 * profile.gradeZ;
    return (n1 - 0.5) * profile.broadRelief
      + (n15 - 0.5) * profile.rollingRelief
      + (n2 - 0.5) * profile.detailRelief
      + profile.baseHeight
      + grade;
  },
  surfaceAt(x, z, _height, slope, noise, out) {
    const fertility = noise(x * 0.055 + 40, z * 0.055 + 40) * 0.62
      + noise(x * 0.16 + 700, z * 0.16 + 700) * 0.38;
    out.rockiness = Math.max(0, Math.min(1, (slope - 0.42) * 1.8));
    out.vegetation = Math.max(0, Math.min(1, fertility - out.rockiness * 0.65));
  },
};

/**
 * Great Basin adapter: broad folds carry the scale, a directional grade
 * creates the huntable sidehill, and a soft diagonal drainage cuts the
 * property without turning the walkable heightfield into a vertical cliff.
 * Rock faces remain authored surface features layered onto this ground.
 */
const RIMROCK_LANDFORM: LandformAdapter = {
  heightAt(x, z, profile, noise) {
    const u = x * 0.86 + z * 0.5;
    const v = -x * 0.5 + z * 0.86;
    const broad = (noise(u * 0.0025 + 170, v * 0.0025 + 170) - 0.5)
      * profile.broadRelief * 1.9;
    const folds = (noise(u * 0.007 + 940, v * 0.004 + 940) - 0.5)
      * profile.rollingRelief * 2.25;
    const ribs = Math.pow(Math.abs(noise(u * 0.016 + 2700, v * 0.007 + 2700) - 0.5) * 2, 1.7)
      * profile.detailRelief * 2.1;
    const grade = x * profile.gradeX * 0.12
      + (z - HUNT_WORLD_ANCHOR.z) * profile.gradeZ * 0.12;
    const channel = u - 82 + Math.sin(v * 0.012) * 24;
    const drainage = -19 * Math.exp(-(channel * channel) / (2 * 42 * 42));
    return profile.baseHeight + broad + folds + ribs + grade + drainage;
  },
  surfaceAt(x, z, height, slope, noise, out) {
    const geology = noise(x * 0.021 + 6100, z * 0.021 + 6100);
    const fractured = noise(x * 0.075 + 8300, z * 0.075 + 8300);
    const strata = 0.5 + Math.sin(height * 0.38 + geology * 3.4) * 0.5;
    out.rockiness = Math.max(0, Math.min(1,
      (slope - 0.16) * 1.45
      + (geology - 0.56) * 0.95
      + (fractured - 0.68) * 0.5
      + Math.max(0, strata - 0.78) * 0.34,
    ));
    const establishment = noise(x * 0.032 + 360, z * 0.032 + 360) * 0.58
      + noise(x * 0.11 + 1900, z * 0.11 + 1900) * 0.42;
    out.vegetation = Math.max(0, Math.min(1,
      0.22 + establishment * 0.78 - out.rockiness * 0.82 - Math.max(0, slope - 0.52) * 0.5,
    ));
  },
};

function landformFor(profile: AreaTerrainProfile): LandformAdapter {
  return profile.kind === 'rimrock' ? RIMROCK_LANDFORM : ROLLING_LANDFORM;
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
  private readonly landform: LandformAdapter;

  constructor(readonly area: AreaConfig, dropPointId?: string) {
    this.dropPoint = getDropPoint(area, dropPointId);
    this.canonicalDrop = getDropPoint(area);
    this.noise = makeNoise(area.terrain.seed);
    this.landform = landformFor(area.terrain);
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
    return this.landform.heightAt(x, z, this.area.terrain, this.noise);
  }

  /** Elevation beneath a hunt-local 3D position. No per-query allocation. */
  heightAtWorld(worldX: number, worldZ: number): number {
    const propertyX =
      (worldX - HUNT_WORLD_ANCHOR.x) / PROPERTY_PX_TO_M + this.dropPoint.position.x;
    const propertyY =
      (worldZ - HUNT_WORLD_ANCHOR.z) / PROPERTY_PX_TO_M + this.dropPoint.position.y;
    return this.heightAtProperty(propertyX, propertyY);
  }

  /** Shared terrain/vegetation classification beneath a local 3D point. */
  surfaceAtWorld(worldX: number, worldZ: number, out: GroundSample): GroundSample {
    const propertyX =
      (worldX - HUNT_WORLD_ANCHOR.x) / PROPERTY_PX_TO_M + this.dropPoint.position.x;
    const propertyY =
      (worldZ - HUNT_WORLD_ANCHOR.z) / PROPERTY_PX_TO_M + this.dropPoint.position.y;
    return this.surfaceAtProperty(propertyX, propertyY, out);
  }

  /** Shared terrain/vegetation classification at an exact map position. */
  surfaceAtProperty(propertyX: number, propertyY: number, out: GroundSample): GroundSample {
    const x =
      (propertyX - this.canonicalDrop.position.x) * PROPERTY_PX_TO_M + HUNT_WORLD_ANCHOR.x;
    const z =
      (propertyY - this.canonicalDrop.position.y) * PROPERTY_PX_TO_M + HUNT_WORLD_ANCHOR.z;
    const step = 1.5;
    const height = this.landform.heightAt(x, z, this.area.terrain, this.noise);
    const dx = (
      this.landform.heightAt(x + step, z, this.area.terrain, this.noise)
      - this.landform.heightAt(x - step, z, this.area.terrain, this.noise)
    ) / (step * 2);
    const dz = (
      this.landform.heightAt(x, z + step, this.area.terrain, this.noise)
      - this.landform.heightAt(x, z - step, this.area.terrain, this.noise)
    ) / (step * 2);
    out.height = height;
    out.slope = Math.hypot(dx, dz);
    this.landform.surfaceAt(x, z, height, out.slope, this.noise, out);
    return out;
  }
}
