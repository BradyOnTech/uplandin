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
const FLOOR_SHADE = .8;

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
vec3 coverFloor = coverTexel.rgb * mix(1.0, ${FLOOR_SHADE.toFixed(2)}, coverTexel.a);
vec3 coverColor = mix(coverFloor, coverTexel.rgb, coverCanopy);
// The wind's sheen rolls across the far sward as well as the near plants.
coverColor *= 1.0 + kitSheen(vPropertyWorld.xz, uKitWind, uKitWindStrength, uKitTime) * .10 * coverCanopy * coverTexel.a;
// Cells the kit leaves alone (density 0) keep the ground's own paint.
diffuseColor.rgb = mix(diffuseColor.rgb, coverColor, coverInside * smoothstep(.02, .1, coverTexel.a));
`;
