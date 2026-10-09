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

/** How the terrain itself carries grass at middle distance. */
export type CoverSurfaceStyle = 'paint' | 'strokes';

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
export function coverSurfaceFragment(style: CoverSurfaceStyle): string {
  return /* glsl */ `
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
${style === 'strokes' ? STROKES_GLSL : ''}
// Cells the kit leaves alone (density 0) keep the ground's own paint.
diffuseColor.rgb = mix(diffuseColor.rgb, coverColor, coverInside * smoothstep(.02, .1, coverTexel.a));
`;
}

/**
 * Candidate B's grass, drawn by the terrain: short wind-combed strokes in
 * world space, lit on one side and shaded on the other, that average out to
 * the canopy colour as they shrink below a pixel.
 */
const STROKES_GLSL = /* glsl */ `
{
  // Two octaves of wind-combed strokes in world space: fine blades near the
  // hunter, broad drifts through the middle distance. Each octave fades as
  // its strokes shrink below a pixel, so the field averages to the canopy.
  vec2 strokeAxis = normalize(uKitWind + vec2(.3, .2));
  mat2 strokeFrame = mat2(strokeAxis.x, -strokeAxis.y, strokeAxis.y, strokeAxis.x);
  float strokeShade = 0.0;
  for (int octave = 0; octave < 2; octave++) {
    vec2 strokeScale = octave == 0 ? vec2(2.4, 8.0) : vec2(.7, 2.6);
    vec2 strokeSpace = strokeFrame * vPropertyWorld.xz * strokeScale + float(octave) * 17.3;
    vec2 strokeCell = floor(strokeSpace);
    vec2 strokeLocal = fract(strokeSpace) - .5;
    float strokeSeed = fract(sin(dot(strokeCell, vec2(12.9898, 78.233))) * 43758.5453);
    strokeLocal.x += (strokeSeed - .5) * .5;
    float strokeBody = smoothstep(.5, .12, abs(strokeLocal.x)) * smoothstep(.5, .25, abs(strokeLocal.y));
    vec2 strokeFootprint = fwidth(strokeSpace);
    float strokeResolved = 1.0 - smoothstep(.3, 1.0, max(strokeFootprint.x, strokeFootprint.y));
    // Lit blade tops against the shaded litter between them.
    strokeShade += (mix(-.05, .2, strokeSeed) * strokeBody - .1 * (1.0 - strokeBody)) * strokeResolved * (octave == 0 ? 1.0 : .8);
  }
  coverColor *= 1.0 + strokeShade * coverTexel.a * 1.4;
}
`;
