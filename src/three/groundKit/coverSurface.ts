import * as THREE from 'three';
import type { CoverMap } from './coverMap';
import type { CoverColorField } from './coverPalette';
import { KIT_SHEEN_GLSL } from './kitShader';

/**
 * THE FAR BAND: the cover map painted into the terrain itself. One RGBA
 * texture over the ground (a texel per cover cell) carries each cell's
 * canopy colour as it reads from a distance, with its density in alpha.
 * Near the hunter the terrain shows the darker litter between plants; with
 * distance it turns to the canopy colour, reaching it just where the middle
 * band's masses dither out, so the mosaic carries to the horizon on every
 * tier with no ring and no extra draw.
 */

/** Shared uniforms the kit system drives each frame (wind, clock). */
export interface CoverSurfaceUniforms {
  uCoverMap: { value: THREE.DataTexture };
  /** Map origin and size in property yards. */
  uCoverRect: { value: THREE.Vector4 };
  /** Floor-to-canopy handover (metres): litter before x, canopy past y. */
  uCoverBand: { value: THREE.Vector2 };
  uKitTime: { value: number };
  uKitWind: { value: THREE.Vector2 };
  uKitWindStrength: { value: number };
  [key: string]: { value: unknown };
}

/** Darkness of the floor beneath a full canopy, near the hunter. */
const FLOOR_SHADE = .74;
/** How far the floor leans toward cured litter (warm grey-brown thatch). */
const LITTER_MIX = .42;
const LITTER = new THREE.Color(0x6e6452);

export function coverSurfaceTexture(field: CoverColorField): THREE.DataTexture {
  const { map } = field, color = new THREE.Color();
  const data = new Uint8Array(map.cols * map.rows * 4);
  for (let i = 0; i < map.cols * map.rows; i++) {
    color.setRGB(field.rgb[i * 3], field.rgb[i * 3 + 1], field.rgb[i * 3 + 2]).convertLinearToSRGB();
    data[i * 4] = Math.round(color.r * 255);
    data[i * 4 + 1] = Math.round(color.g * 255);
    data[i * 4 + 2] = Math.round(color.b * 255);
    data[i * 4 + 3] = map.density[i];
  }
  const texture = new THREE.DataTexture(data, map.cols, map.rows);
  texture.name = 'Ground kit cover map';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function coverSurfaceUniforms(field: CoverColorField, band: readonly [number, number]): CoverSurfaceUniforms {
  const map: CoverMap = field.map;
  return {
    uCoverMap: { value: coverSurfaceTexture(field) },
    uCoverRect: { value: new THREE.Vector4(map.x0, map.y0, map.cols * map.cell, map.rows * map.cell) },
    uCoverBand: { value: new THREE.Vector2(band[0], band[1]) },
    uKitTime: { value: 0 },
    uKitWind: { value: new THREE.Vector2(1, 0) },
    uKitWindStrength: { value: 0 },
  };
}

export const COVER_SURFACE_DECLARATIONS = /* glsl */ `
uniform sampler2D uCoverMap;
uniform vec4 uCoverRect;
uniform vec2 uCoverBand;
uniform float uKitTime;
uniform vec2 uKitWind;
uniform float uKitWindStrength;
${KIT_SHEEN_GLSL}
float coverThatchHash(vec2 p) {
  uvec2 cell = uvec2(ivec2(floor(p)) + 65536);
  uint h = (cell.x * 374761393u) ^ (cell.y * 668265263u);
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float(h ^ (h >> 16u)) / 4294967295.0;
}
/** Cured litter: short strands lying every which way, one per cell, the
 * strand's lit body over the shaded gaps between. 0 gap .. 1 strand. */
float coverThatchStrands(vec2 p) {
  vec2 cell = floor(p), local = fract(p) - .5;
  // Wind-laid: most strands lie roughly one way, a few cross them.
  float seed = coverThatchHash(cell), angle = .6 + (seed - .5) * (seed > .8 ? 6.2832 : 1.6);
  vec2 axis = vec2(cos(angle), sin(angle));
  float along = dot(local, axis), across = dot(local, vec2(-axis.y, axis.x));
  return smoothstep(.2, .02, abs(across)) * smoothstep(.62, .2, abs(along)) * (.5 + .5 * coverThatchHash(cell + 17.0));
}
`;

/**
 * Terrain colour from the cover map. Needs vPropertyWorld (world position)
 * and uPropertyFloorOrigin (world position of property 0,0). Replaces the
 * base colour; the terrain's own light, drench and cloud shade follow it.
 */
export const COVER_SURFACE_FRAGMENT = /* glsl */ `
vec2 coverYards = (vPropertyWorld.xz - uPropertyFloorOrigin) / .9144;
vec2 coverUV = (coverYards - uCoverRect.xy) / uCoverRect.zw;
vec4 coverTexel = texture2D(uCoverMap, coverUV);
vec2 coverEdge = min(coverUV, 1.0 - coverUV);
float coverInside = smoothstep(0.0, .04, min(coverEdge.x, coverEdge.y));
float coverDistance = distance(vPropertyWorld.xz, cameraPosition.xz);
float coverCanopy = smoothstep(uCoverBand.x, uCoverBand.y, coverDistance);
// Under the grass near the hunter: cured litter and thatch, the plants'
// own colour sunk toward a warm grey-brown, broken at two small scales.
// Each scale fades as it shrinks below a pixel, so it never ripples.
vec3 coverFloor = mix(coverTexel.rgb * mix(1.0, ${FLOOR_SHADE.toFixed(2)}, coverTexel.a), vec3(${LITTER.r.toFixed(4)}, ${LITTER.g.toFixed(4)}, ${LITTER.b.toFixed(4)}), ${LITTER_MIX.toFixed(2)} * coverTexel.a);
vec2 thatchWorld = vPropertyWorld.xz * mat2(.8, -.6, .6, .8);
float thatchSpan = max(fwidth(thatchWorld).x, fwidth(thatchWorld).y);
// Two interleaved strand grids (about 0.3 m strands) fade out as a strand
// shrinks toward a pixel, so the floor never ripples at grazing angles.
float thatchFine = max(coverThatchStrands(thatchWorld * 4.4), coverThatchStrands(thatchWorld * 4.4 + vec2(.5, .27)))
  * .6 + coverThatchStrands(thatchWorld * 2.1 + vec2(.21, .73)) * .4;
float thatch = (thatchFine - .3) * (1.0 - smoothstep(.025, .09, thatchSpan));
coverFloor *= 1.0 + thatch * .16;
vec3 coverColor = mix(coverFloor, coverTexel.rgb, coverCanopy);
// The wind's sheen rolls across the far sward as well as the near plants.
coverColor *= 1.0 + kitSheen(vPropertyWorld.xz, uKitWind, uKitWindStrength, uKitTime) * .10 * coverCanopy * coverTexel.a;
// Cells the kit leaves alone (density 0) keep the ground's own paint.
diffuseColor.rgb = mix(diffuseColor.rgb, coverColor, coverInside * smoothstep(.02, .1, coverTexel.a));
`;
