import * as THREE from 'three';
import type { SharptailMeadowSample } from './sharptailMeadow';

/**
 * Late-October mixed-grass prairie is not one straw colour. Plant
 * communities sort themselves by the land: little bluestem turns copper on
 * the dry crowns and slopes, big bluestem goes bronze-maroon in the swales,
 * western wheatgrass stays blue-grey on the flats and needle-and-thread
 * silvers the cured shoulders. These colonies are tens of yards across,
 * follow the existing meadow masses and never change habitat or placement.
 * Property yards in, weights 0..1 out; shared by grass, the middle sward and
 * the terrain paint so near blades, the canopy and the far ground agree.
 */
export interface SharptailCommunitySample { bluestem: number; bigBluestem: number; wheatgrass: number; needle: number }

export const SHARPTAIL_COMMUNITY_COLORS = {
  bluestem: 0xb7784c,
  bigBluestem: 0x8f6252,
  wheatgrass: 0x93a08e,
  needle: 0xdad2b4,
} as const;

function hash(x: number, y: number, salt: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, salt: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, salt), b = hash(ix + 1, iy, salt), c = hash(ix, iy + 1, salt), d = hash(ix + 1, iy + 1, salt);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

/** Colonies: a broad field, broken at the edge by a finer one. */
function colony(x: number, y: number, salt: number, scale: number): number {
  return valueNoise(x / scale, y / scale, salt) * .72 + valueNoise(x / (scale * .33), y / (scale * .33), salt + 7) * .28;
}

export function sharptailCommunityAt(x: number, y: number, meadow: SharptailMeadowSample, out: SharptailCommunitySample): SharptailCommunitySample {
  const smooth = THREE.MathUtils.smoothstep;
  const dry = 1 - meadow.hollow;
  out.bluestem = smooth(colony(x, y, 11, 95), .5, .68) * (.3 + meadow.crown * .7) * dry;
  out.bigBluestem = smooth(colony(x, y, 23, 70), .42, .62) * meadow.hollow;
  out.wheatgrass = smooth(colony(x, y, 37, 110), .56, .74) * (1 - meadow.crown * .6) * (1 - meadow.hollow * .5);
  out.needle = smooth(colony(x, y, 51, 60), .48, .66) * Math.max(meadow.cured, meadow.crown * .45) * dry;
  return out;
}

const colors = {
  bluestem: new THREE.Color(SHARPTAIL_COMMUNITY_COLORS.bluestem),
  bigBluestem: new THREE.Color(SHARPTAIL_COMMUNITY_COLORS.bigBluestem),
  wheatgrass: new THREE.Color(SHARPTAIL_COMMUNITY_COLORS.wheatgrass),
  needle: new THREE.Color(SHARPTAIL_COMMUNITY_COLORS.needle),
};

/** Tint a colour toward the local community, keeping its value so the
 * meadow's light crowns and dark lees still read. */
export function tintSharptailCommunity(color: THREE.Color, sample: SharptailCommunitySample, strength: number): THREE.Color {
  const value = color.r * .2126 + color.g * .7152 + color.b * .0722;
  for (const key of ['wheatgrass', 'needle', 'bluestem', 'bigBluestem'] as const) {
    const weight = sample[key] * strength;
    if (weight <= 0) continue;
    color.lerp(colors[key], weight);
  }
  // Restore most of the original value: communities change hue, the land
  // keeps its light and shade.
  const next = color.r * .2126 + color.g * .7152 + color.b * .0722;
  if (next > 0) color.multiplyScalar(THREE.MathUtils.lerp(1, value / next, .7));
  return color;
}
