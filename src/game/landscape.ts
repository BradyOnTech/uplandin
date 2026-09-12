import { wetPondLayout, wetPondRadius } from './wetPonds';
import {
  getDropPoint,
  type AreaConfig,
  type AreaTerrainProfile,
  type DropPoint,
} from './areas';
import type { Vec2 } from './types';
import { quailDrainageAt } from './quailLandscape';
import { pheasantPondRadii } from './pheasantHabitat';
import { PROPERTY_PX_TO_M } from './worldUnits';

/** One shared map pixel is one yard in the 3D presentation. */
export { PROPERTY_PX_TO_M } from './worldUnits';

/**
 * The selected parking place is kept near the origin for render precision.
 * All authored scenery uses property coordinates and this same transform,
 * so changing parking places cannot move landforms or vegetation.
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
    gradeX: number,
    gradeZ: number,
    noise: Noise2D,
    out: GroundSample,
  ): void;
}

export interface GroundSample {
  height: number;
  /** Rise over run at the query point. */
  slope: number;
  /** Signed east/west and north/south rise over run. */
  gradeX: number;
  gradeZ: number;
  /** 0 = soil/grass, 1 = exposed face or concentrated scree. */
  rockiness: number;
  /** 0 = barren, 1 = strongest local plant establishment. */
  vegetation: number;
  /** 0 = dry ground, 1 = pond/slough edge. */
  moisture: number;
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
  surfaceAt(x, z, _height, slope, _gradeX, _gradeZ, noise, out) {
    const fertility = noise(x * 0.055 + 40, z * 0.055 + 40) * 0.62
      + noise(x * 0.16 + 700, z * 0.16 + 700) * 0.38;
    out.rockiness = Math.max(0, Math.min(1, (slope - 0.42) * 1.8));
    out.vegetation = Math.max(0, Math.min(1, fertility - out.rockiness * 0.65));
    out.moisture = Math.max(0, Math.min(1, 0.18 + (0.46 - fertility) * 0.45));
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
      * profile.broadRelief * 2.35;
    const folds = (noise(u * 0.007 + 940, v * 0.004 + 940) - 0.5)
      * profile.rollingRelief * 2.75;
    const ribs = Math.pow(Math.abs(noise(u * 0.016 + 2700, v * 0.007 + 2700) - 0.5) * 2, 1.7)
      * profile.detailRelief * 2.1;
    const grade = x * profile.gradeX * 0.17
      + (z - HUNT_WORLD_ANCHOR.z) * profile.gradeZ * 0.17;
    const channel = u - 82 + Math.sin(v * 0.012) * 24;
    const drainage = -34 * Math.exp(-(channel * channel) / (2 * 48 * 48));
    const foldedBench = Math.sin(u * 0.011 + noise(v * 0.006 + 50, u * 0.004 + 50) * 2.8)
      * profile.rollingRelief * 0.52;
    return profile.baseHeight + broad + folds + ribs + grade + drainage + foldedBench;
  },
  surfaceAt(x, z, height, slope, _gradeX, _gradeZ, noise, out) {
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
    out.moisture = Math.max(0, Math.min(1, 0.08 + (1 - establishment) * 0.16 - slope * 0.08));
  },
};

/** Hungarian partridge country is the softer side of the Great Basin. The
 * benches are broad enough to flank and circle back across; they should not
 * inherit Chukar Ridge's sharper ribs and deep central cut just because both
 * properties share the rimrock terrain family. Keep the same property grade
 * so the authored contour still agrees with the map and dog work. */
const HUN_BENCH_LANDFORM: LandformAdapter = {
  heightAt(x, z, profile, noise) {
    const u = x * 0.82 + z * 0.57;
    const v = -x * 0.57 + z * 0.82;
    const broad = (noise(u * 0.0027 + 620, v * 0.0027 + 620) - 0.5)
      * profile.broadRelief * 1.2;
    const shelves = (noise(u * 0.006 + 1640, v * 0.0035 + 1640) - 0.5)
      * profile.rollingRelief * 1.35;
    const contourPhase = noise(v * 0.004 + 2520, u * 0.002 + 2520) * Math.PI * 1.4;
    const contour = Math.sin(v * 0.014 + contourPhase) * profile.rollingRelief * 0.52;
    const shallowDraw = -13 * Math.exp(-Math.pow((u - 96 + Math.sin(v * 0.009) * 18) / 72, 2));
    // `gradeX/Z` are metres per 100 property units. Keep the long contour
    // readable and walkable; the sharp sidehill belongs to Chukar Ridge.
    const grade = x / 100 * profile.gradeX
      + z / 100 * profile.gradeZ;
    return profile.baseHeight + broad + shelves + contour + shallowDraw + grade;
  },
  surfaceAt(x, z, height, slope, _gradeX, _gradeZ, noise, out) {
    const soil = noise(x * 0.026 + 3020, z * 0.026 + 3020);
    const benchBand = 0.5 + Math.sin((x * 0.012 - z * 0.009) + height * 0.045) * 0.5;
    out.rockiness = Math.max(0, Math.min(1,
      (slope - 0.24) * 1.02 + (soil - 0.64) * 0.42 + Math.max(0, benchBand - 0.82) * 0.18,
    ));
    out.vegetation = Math.max(0, Math.min(1,
      0.32 + soil * 0.58 + (1 - out.rockiness) * 0.16,
    ));
    out.moisture = Math.max(0, Math.min(1,
      0.07 + (1 - soil) * 0.18 + Math.max(0, 0.45 - slope) * 0.04,
    ));
  },
};

/** Low wet ground for alder bottoms and marsh edges: broad, quiet swales
 * replace the dry prairie rolls while retaining enough shoulder for a clear
 * dog silhouette and an honest walking surface. */
const WETLAND_LANDFORM: LandformAdapter = {
  heightAt(x, z, profile, noise) {
    const broad = (noise(x * 0.0032 + 170, z * 0.0032 + 170) - 0.5) * profile.broadRelief * .72;
    const swales = (noise(x * 0.012 + 940, z * 0.009 + 940) - 0.5) * profile.rollingRelief * .9;
    const drainage = Math.sin(x * .018 + Math.sin(z * .008) * 2.4) * 1.2;
    return profile.baseHeight + broad + swales + drainage + (x / 100) * profile.gradeX + (z / 100) * profile.gradeZ;
  },
  surfaceAt(_x, _z, _height, slope, _gradeX, _gradeZ, noise, out) {
    const reed = noise(_x * .025 + 320, _z * .025 + 320);
    out.rockiness = Math.max(0, Math.min(1, (slope - .55) * 1.2));
    out.moisture = Math.max(0, Math.min(1, .42 + (1 - reed) * .5 - slope * .28));
    out.vegetation = Math.max(0, Math.min(1, .5 + reed * .38 - out.rockiness * .35));
  },
};

/** Young timber has a broken, rooty floor: small shoulders and dark draws
 * create the short sightlines that make grouse country hunt close. */
const WOODS_LANDFORM: LandformAdapter = {
  heightAt(x, z, profile, noise) {
    const ridge = (noise(x * .0045 + 410, z * .0045 + 410) - .5) * profile.broadRelief * 1.1;
    const folds = (noise(x * .014 + 1290, z * .01 + 1290) - .5) * profile.rollingRelief * 1.7;
    const draw = -4.6 * Math.exp(-Math.pow((x + Math.sin(z * .012) * 27) / 26, 2));
    return profile.baseHeight + ridge + folds + draw + (x / 100) * profile.gradeX + (z / 100) * profile.gradeZ;
  },
  surfaceAt(_x, _z, _height, slope, _gradeX, _gradeZ, noise, out) {
    const duff = noise(_x * .035 + 520, _z * .035 + 520);
    out.rockiness = Math.max(0, Math.min(1, (slope - .42) * 1.15));
    out.moisture = Math.max(0, Math.min(1, .27 + (1 - duff) * .3));
    out.vegetation = Math.max(0, Math.min(1, .66 + duff * .28 - out.rockiness * .35));
  },
};

/** Desert washes need a directional cut in the ground so the hunter can read
 * a route instead of a noise tile. Oak Canyons has its own deeper landform
 * below. */
const DESERT_LANDFORM: LandformAdapter = {
  heightAt(x, z, profile, noise) {
    const mesa = (noise(x * .0028 + 1700, z * .0028 + 1700) - .5) * profile.broadRelief * 1.15;
    const ribs = (noise(x * .009 + 4200, z * .006 + 4200) - .5) * profile.rollingRelief * 1.3;
    const washAxis = x * .82 + z * .57 + Math.sin(z * .011) * 32;
    const wash = -7.5 * Math.exp(-(washAxis * washAxis) / (2 * 34 * 34));
    return profile.baseHeight + mesa + ribs + wash + (x / 100) * profile.gradeX + (z / 100) * profile.gradeZ;
  },
  surfaceAt(x, z, _height, slope, _gradeX, _gradeZ, noise, out) {
    const gravel = noise(x * .028 + 4700, z * .028 + 4700);
    // The wash is a real habitat signal, not only a darker ribbon drawn by
    // DryWashSystem. Keep this expression in lockstep with heightAt() so
    // encounter anchors and dog cover choices favor the same low corridor the
    // player can see in the terrain.
    const washAxis = x * .82 + z * .57 + Math.sin(z * .011) * 32;
    const wash = Math.exp(-(washAxis * washAxis) / (2 * 34 * 34));
    out.rockiness = Math.max(0, Math.min(1, .12 + gravel * .32 + Math.max(0, slope - .24) * 1.1));
    out.moisture = Math.max(0, Math.min(1, .035 + gravel * .08 + wash * .34));
    out.vegetation = Math.max(0, Math.min(1,
      .16 + (1 - out.rockiness) * .45 + noise(x * .06 + 310, z * .06 + 310) * .25 + wash * .2,
    ));
  },
};

/** Oak Canyons is a dry, red-rock property with a readable route through a
 * winding drainage. Its floor, benches, and exposed walls need a different
 * vertical rhythm from the open Sonoran washes, even though both are warm
 * climates. */
const CANYON_LANDFORM: LandformAdapter = {
  heightAt(x, z, profile, noise) {
    const u = x * 0.78 + z * 0.62;
    const v = -x * 0.62 + z * 0.78;
    const channel = v + Math.sin(u * 0.009) * 25 + Math.sin(u * 0.021) * 8;
    const mesas = (noise(u * 0.0024 + 6100, v * 0.0021 + 6100) - 0.5) * profile.broadRelief * 1.18;
    const benches = (noise(u * 0.008 + 7400, v * 0.004 + 7400) - 0.5) * profile.rollingRelief * 1.35;
    const shelf = Math.min(1, Math.max(0, (Math.abs(channel) - 28) / 72));
    const sidewall = shelf * shelf * 9.5;
    const floor = -31 * Math.exp(-(channel * channel) / (2 * 35 * 35));
    const grade = x * profile.gradeX * 0.18 + (z - HUNT_WORLD_ANCHOR.z) * profile.gradeZ * 0.18;
    return profile.baseHeight + mesas + benches + sidewall + floor + grade;
  },
  surfaceAt(x, z, _height, slope, _gradeX, _gradeZ, noise, out) {
    const u = x * 0.78 + z * 0.62;
    const v = -x * 0.62 + z * 0.78;
    const channel = v + Math.sin(u * 0.009) * 25 + Math.sin(u * 0.021) * 8;
    const gravel = noise(u * 0.026 + 8100, v * 0.026 + 8100);
    const floorWet = Math.exp(-(channel * channel) / (2 * 38 * 38));
    out.rockiness = Math.max(0, Math.min(1,
      0.2 + Math.min(1, Math.abs(channel) / 74) * 0.56 + gravel * 0.22 + Math.max(0, slope - 0.22) * 0.72,
    ));
    out.moisture = Math.max(0, Math.min(1, 0.035 + floorWet * 0.26 + (1 - gravel) * 0.06));
    out.vegetation = Math.max(0, Math.min(1,
      0.14 + floorWet * 0.34 + (1 - out.rockiness) * 0.42 + noise(u * 0.063 + 280, v * 0.063 + 280) * 0.16,
    ));
  },
};

const ALPINE_LANDFORM: LandformAdapter = {
  heightAt(x, z, profile, noise) {
    const shoulder = (noise(x * .002 + 610, z * .002 + 610) - .5) * profile.broadRelief * 1.55;
    const park = (noise(x * .007 + 1910, z * .004 + 1910) - .5) * profile.rollingRelief * 1.8;
    const grade = x * profile.gradeX * .22 + (z - HUNT_WORLD_ANCHOR.z) * profile.gradeZ * .22;
    return profile.baseHeight + shoulder + park + grade;
  },
  surfaceAt(x, z, _height, slope, _gradeX, _gradeZ, noise, out) {
    const alpine = noise(x * .018 + 7600, z * .018 + 7600);
    out.rockiness = Math.max(0, Math.min(1, .14 + alpine * .34 + Math.max(0, slope - .34) * .88));
    out.moisture = Math.max(0, Math.min(1, .16 + (1 - alpine) * .16));
    out.vegetation = Math.max(0, Math.min(1, .34 + alpine * .46 - out.rockiness * .5));
  },
};

const OAK_SAVANNA_LANDFORM: LandformAdapter = {
  heightAt(x, z, profile, noise) {
    const hills = (noise(x * .0035 + 870, z * .0035 + 870) - .5) * profile.broadRelief * 1.05;
    const rolls = (noise(x * .012 + 2410, z * .012 + 2410) - .5) * profile.rollingRelief * 1.2;
    const oakDraw = -2.8 * Math.exp(-Math.pow((x + z * .45 - 32) / 72, 2));
    return profile.baseHeight + hills + rolls + oakDraw + (x / 100) * profile.gradeX + (z / 100) * profile.gradeZ;
  },
  surfaceAt(x, z, _height, slope, _gradeX, _gradeZ, noise, out) {
    const grass = noise(x * .036 + 1200, z * .036 + 1200);
    out.rockiness = Math.max(0, Math.min(1, (slope - .46) * .95));
    out.moisture = Math.max(0, Math.min(1, .1 + (1 - grass) * .18));
    out.vegetation = Math.max(0, Math.min(1, .46 + grass * .46 - out.rockiness * .3));
  },
};

function pheasantLandform(area: AreaConfig): LandformAdapter {
  const canonical = getDropPoint(area);
  const homestead = area.landmarks.find(landmark => landmark.kind === 'barn');
  // Broad dry shoulders make the homestead, western fields and interior
  // crest distinct places. Coordinates belong to the property, not an entry.
  const shoulders = [
    { x: homestead?.position.x ?? area.world.w * .42, y: homestead?.position.y ?? area.world.h * .74, rx: 120, ry: 95, height: 6 },
    { x: area.world.x + area.world.w * .23, y: area.world.y + area.world.h * .68, rx: 180, ry: 110, height: 5 },
    { x: area.world.x + area.world.w * .53, y: area.world.y + area.world.h * .43, rx: 260, ry: 145, height: 9 },
  ];
  const ponds = area.landmarks
    .filter((landmark) => landmark.kind === 'pond')
    .map((landmark) => ({
      x: (landmark.position.x - canonical.position.x) * PROPERTY_PX_TO_M + HUNT_WORLD_ANCHOR.x,
      z: (landmark.position.y - canonical.position.y) * PROPERTY_PX_TO_M + HUNT_WORLD_ANCHOR.z,
      ...pheasantPondRadii(landmark.id),
    }));
  const nearestPondRadius = (x: number, z: number): number => {
    let radius = Infinity;
    for (const pond of ponds) {
      radius = Math.min(radius, Math.hypot((x - pond.x) / pond.rx, (z - pond.z) / pond.rz));
    }
    return radius;
  };
  return {
    heightAt(x, z, profile, noise) {
      const broad = (noise(x * 0.0024 + 170, z * 0.0024 + 170) - 0.5) * profile.broadRelief * 0.75;
      const swales = (noise(x * 0.007 + 940, z * 0.005 + 940) - 0.5) * profile.rollingRelief * 0.8;
      const hummocks = (noise(x * 0.035 + 2700, z * 0.035 + 2700) - 0.5) * profile.detailRelief * 0.75;
      const dropDistance = Math.hypot(x, z - HUNT_WORLD_ANCHOR.z);
      const dropRise = 2.4 * Math.exp(-(dropDistance * dropDistance) / (2 * 52 * 52));
      const propertyX = (x - HUNT_WORLD_ANCHOR.x) / PROPERTY_PX_TO_M + canonical.position.x;
      const propertyY = (z - HUNT_WORLD_ANCHOR.z) / PROPERTY_PX_TO_M + canonical.position.y;
      let authored = 0;
      for (const shoulder of shoulders) {
        authored += shoulder.height * Math.exp(-(((propertyX - shoulder.x) / shoulder.rx) ** 2
          + ((propertyY - shoulder.y) / shoulder.ry) ** 2));
      }
      // Preserve pond floors AND their existing shoreline, then ease into
      // dry upland relief. Shared water levels and walking barriers stay put.
      // Both influences are monotonic in normalized pond radius: the nearest
      // pond supplies maximum wetness and minimum dry relief. Evaluating that
      // radius once preserves the surface while avoiding repeated hypot,
      // power and exponential calls for every terrain/vegetation sample.
      const radius = nearestPondRadius(x, z);
      const t = Math.max(0, Math.min(1, (radius - 1.5) / 1.2));
      const dryBlend = t * t * (3 - 2 * t);
      const wetness = Math.exp(-Math.pow(radius, 3.2));
      return profile.baseHeight + broad + swales + hummocks + dropRise - wetness * 3.2 + authored * dryBlend;
    },
    surfaceAt(x, z, _height, slope, _gradeX, _gradeZ, noise, out) {
      const wet = Math.max(Math.exp(-Math.pow(nearestPondRadius(x, z), 3.2)), noise(x * 0.018 + 4400, z * 0.018 + 4400) * 0.28);
      const fertility = noise(x * 0.028 + 360, z * 0.028 + 360) * 0.58
        + noise(x * 0.095 + 1900, z * 0.095 + 1900) * 0.42;
      out.rockiness = Math.max(0, Math.min(1, (slope - 0.26) * 0.5));
      out.vegetation = Math.max(0, Math.min(1, 0.48 + fertility * 0.48 + wet * 0.28));
      out.moisture = Math.max(0, Math.min(1, wet));
    },
  };
}

/** Broad prairie shoulders and one shallow draw, stable across both entry points. */
function quailLandform(area: AreaConfig): LandformAdapter {
  const canonical = getDropPoint(area);
  const px = (x: number) => (x - HUNT_WORLD_ANCHOR.x) / PROPERTY_PX_TO_M + canonical.position.x;
  const py = (z: number) => (z - HUNT_WORLD_ANCHOR.z) / PROPERTY_PX_TO_M + canonical.position.y;
  const rise = (x: number, y: number, cx: number, cy: number, rx: number, ry: number, h: number) =>
    h * Math.exp(-(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2));
  return {
    heightAt(x, z, profile, noise) {
      const propertyX = px(x); const propertyY = py(z);
      const broad = rise(propertyX, propertyY, 340, 520, 220, 155, 6)
        + rise(propertyX, propertyY, 1060, 450, 280, 210, 9)
        + rise(propertyX, propertyY, 650, 75, 290, 160, 12)
        + rise(propertyX, propertyY, 55, 90, 225, 170, 7)
        + rise(propertyX, propertyY, 589, 552, 92, 52, 3.8)
        + rise(propertyX, propertyY, 397, 465, 105, 58, 4.6)
        + rise(propertyX, propertyY, 195, 446, 73, 36, 3.2)
        + rise(propertyX, propertyY, 859, 416, 78, 43, 4.1)
        + rise(propertyX, propertyY, 540, 545, 100, 48, 6.5)
        + rise(propertyX, propertyY, 255, 335, 95, 55, 6);
      const rolls = (noise(propertyX * 0.006 + 80, propertyY * 0.006 + 80) - 0.5) * 3.2;
      const softGround = (noise(propertyX * 0.024 + 340, propertyY * 0.024 + 340) - 0.5) * 0.28;
      return profile.baseHeight + broad + rolls + softGround - quailDrainageAt(propertyX, propertyY) * 2.7;
    },
    surfaceAt(x, z, _height, slope, _gradeX, _gradeZ, noise, out) {
      const propertyX = px(x); const propertyY = py(z);
      out.moisture = quailDrainageAt(propertyX, propertyY);
      out.rockiness = Math.max(0, Math.min(1, (slope - 0.24) * 1.2));
      out.vegetation = Math.max(0, Math.min(1, 0.35 + out.moisture * 0.4
        + noise(propertyX * 0.026 + 540, propertyY * 0.026 + 540) * 0.35 - out.rockiness * 0.4));
    },
  };
}

function woodcockLandform(area: AreaConfig): LandformAdapter {
  const canonical = getDropPoint(area);
  const noise = makeNoise(area.terrain.seed);
  const ponds = wetPondLayout(area).map(pond => ({ ...pond,
    floor: WETLAND_LANDFORM.heightAt(
      (pond.px - canonical.position.x) * PROPERTY_PX_TO_M + HUNT_WORLD_ANCHOR.x,
      (pond.py - canonical.position.y) * PROPERTY_PX_TO_M + HUNT_WORLD_ANCHOR.z,
      area.terrain, noise) - 1.1,
  }));
  const radius = (pond: typeof ponds[number], x: number, z: number) => wetPondRadius(pond,
    (x - HUNT_WORLD_ANCHOR.x) / PROPERTY_PX_TO_M + canonical.position.x,
    (z - HUNT_WORLD_ANCHOR.z) / PROPERTY_PX_TO_M + canonical.position.y);
  return {
    heightAt(x, z, profile, fieldNoise) {
      let height = WETLAND_LANDFORM.heightAt(x, z, profile, fieldNoise);
      for (const pond of ponds) {
        const r = radius(pond, x, z);
        if (r >= 1.6) continue;
        const t = Math.max(0, Math.min(1, (r - 1) / .6));
        const blend = t * t * (3 - 2 * t);
        const basin = pond.floor + .75 * r * r;
        height = basin * (1 - blend) + height * blend;
      }
      return height;
    },
    surfaceAt(x, z, height, slope, gx, gz, fieldNoise, out) {
      WETLAND_LANDFORM.surfaceAt(x, z, height, slope, gx, gz, fieldNoise, out);
      for (const pond of ponds) {
        const r = radius(pond, x, z);
        if (r >= 1.6) continue;
        out.moisture = Math.max(out.moisture, Math.max(0, 1 - Math.max(0, r - .8) / .8));
        if (r < 1) out.vegetation = 0;
      }
    },
  };
}

function landformFor(area: AreaConfig): LandformAdapter {
  if (area.id === 'quail-fields') return quailLandform(area);
  if (area.id === 'woodcock-bottoms') return woodcockLandform(area);
  if (area.id === 'pheasant-coverts') return pheasantLandform(area);
  if (area.id === 'hun-benches') return HUN_BENCH_LANDFORM;
  const profile = area.terrain;
  if (profile.kind === 'rimrock') return RIMROCK_LANDFORM;
  if (profile.kind === 'wetland') return WETLAND_LANDFORM;
  if (profile.kind === 'woods') return WOODS_LANDFORM;
  if (profile.kind === 'desert') return DESERT_LANDFORM;
  if (profile.kind === 'canyon') return CANYON_LANDFORM;
  if (profile.kind === 'alpine') return ALPINE_LANDFORM;
  if (profile.kind === 'oak-savanna') return OAK_SAVANNA_LANDFORM;
  return ROLLING_LANDFORM;
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
    this.landform = landformFor(area);
  }

  /** Physical property boundary in local meters, used by player navigation and rendering. */
  worldBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
    const a = this.propertyToWorld(this.area.world.x, this.area.world.y, { x: 0, z: 0 });
    const b = this.propertyToWorld(this.area.world.x + this.area.world.w, this.area.world.y + this.area.world.h, { x: 0, z: 0 });
    return { minX: a.x, maxX: b.x, minZ: a.z, maxZ: b.z };
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
    out.gradeX = dx;
    out.gradeZ = dz;
    this.landform.surfaceAt(x, z, height, out.slope, dx, dz, this.noise, out);
    return out;
  }
}
