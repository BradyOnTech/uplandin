import * as THREE from 'three';

/**
 * Light that belongs to the ground: sky occlusion and cloud shadows, for
 * every lit material on both tiers.
 *
 * Sky occlusion is baked once per hunt from the landform into a small map
 * over the property and its terrain apron: how much of the sky each spot
 * sees (draws, coulees and the canyon floor see less) and whether it stands
 * proud of its surroundings (crests). Cloud shadows are one drifting noise
 * field, carried by the hunt's wind. Both are applied in three's shared
 * `lights_fragment_end` chunk at each surface's world position: occlusion
 * scales the sky's (indirect) light, cloud shade the sun's (direct) light.
 * So the terrain, the grass and cover standing on it, the dog and props all
 * darken together in a draw or under a cloud, with no per-system hook.
 *
 * Like the grade and fog, the values are one shared array put into
 * ShaderLib, stored as departures from neutral; the map is a texture whose
 * clones share one GPU upload. A lit shader of another kind can take the
 * same light with `GROUND_LIGHT_GLSL` and `groundLightUniforms()`:
 * `vec2 l = uplandGroundLight(worldPosition)` gives the sky factor (x) for
 * indirect light and the cloud factor (y) for direct light.
 */

export const GROUND_UNIFORM = 'uplandGround';
export const SKY_MAP_UNIFORM = 'uplandSkyMap';
const SLOTS = 3;
/**
 * Slot layout (vec4 each): 0 map origin (world x, z), 1 / map size (x, z);
 * 1 occlusion strength, crest lift, darkest sky factor, cloud cover
 * threshold; 2 cloud drift (world x, z), 1 / cloud size, cloud strength.
 */
export const GROUND = new Float32Array(SLOTS * 4);

/** A white map, so nothing darkens before a ground is baked. */
const BLANK = new THREE.DataTexture(new Uint8Array([255, 128, 0, 255]), 1, 1);
BLANK.needsUpdate = true;

export function groundLightUniforms(map: THREE.Texture = BLANK): Record<string, THREE.IUniform> {
  return { [GROUND_UNIFORM]: { value: GROUND }, [SKY_MAP_UNIFORM]: { value: map } };
}

export const GROUND_LIGHT_GLSL = /* glsl */`
uniform vec4 ${GROUND_UNIFORM}[${SLOTS}];
uniform sampler2D ${SKY_MAP_UNIFORM};
float uplandHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float uplandNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(uplandHash(i), uplandHash(i + vec2(1.0, 0.0)), f.x),
             mix(uplandHash(i + vec2(0.0, 1.0)), uplandHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 uplandGroundLight(vec3 world) {
  vec4 m = ${GROUND_UNIFORM}[0], k = ${GROUND_UNIFORM}[1], c = ${GROUND_UNIFORM}[2];
  float sky = 1.0, shade = 1.0;
  if (k.x > 0.0) {
    vec2 uv = (world.xz - m.xy) * m.zw;
    vec4 t = texture2D(${SKY_MAP_UNIFORM}, uv);
    // Fade out past the map's edge rather than smear its last row outward.
    vec2 edge = smoothstep(vec2(0.0), vec2(.02), uv) * smoothstep(vec2(0.0), vec2(.02), 1.0 - uv);
    float open = k.z + (1.0 - k.z) * t.r;
    sky = mix(1.0, open * (1.0 + k.y * (t.g * 2.0 - 1.0)), k.x * edge.x * edge.y);
  }
  if (c.w > 0.0) {
    vec2 p = (world.xz + c.xy) * c.z;
    float n = uplandNoise(p) * .62 + uplandNoise(p * 2.07 + vec2(5.3, 1.7)) * .38;
    shade = 1.0 - c.w * smoothstep(k.w - .07, k.w + .07, n);
  }
  return vec2(sky, shade);
}`;

const APPLY = /* glsl */`
{
	vec2 uplandLight = uplandGroundLight( cameraPosition + ( vec4( geometryPosition, 0.0 ) * viewMatrix ).xyz );
	reflectedLight.indirectDiffuse *= uplandLight.x;
	// A deep draw also loses a little of a low sun's light.
	reflectedLight.directDiffuse *= uplandLight.y * mix( 1.0, uplandLight.x, .3 );
	reflectedLight.directSpecular *= uplandLight.y;
}`;
const MARK = '// upland ground light';

/**
 * Patch three's lights chunks and built-in uniforms. Must run before any
 * material compiles. Returns false, leaving everything alone, if three's
 * lights chunks no longer read as expected; a test fails on that.
 */
export function installGroundLight(
  chunks: Record<string, string> = THREE.ShaderChunk as unknown as Record<string, string>,
  lib: Record<string, { uniforms: Record<string, THREE.IUniform> }> = THREE.ShaderLib as unknown as Record<string, { uniforms: Record<string, THREE.IUniform> }>,
): boolean {
  const end = chunks.lights_fragment_end, begin = chunks.lights_fragment_begin, pars = chunks.lights_pars_begin;
  if (!end?.includes('reflectedLight') || !begin?.includes('vec3 geometryPosition') || pars === undefined) return false;
  if (!end.includes(MARK)) {
    chunks.lights_pars_begin = `${pars}\n${MARK}${GROUND_LIGHT_GLSL}`;
    chunks.lights_fragment_end = `${end}\n${MARK}${APPLY}`;
  }
  for (const shader of Object.values(lib)) Object.assign(shader.uniforms, groundLightUniforms());
  return true;
}

/** Give every material compiled from now on this ground's sky map. Call it
 * before the field first renders (the sky system does, as it builds). */
export function setSkyMap(map: THREE.Texture,
  lib: Record<string, { uniforms: Record<string, THREE.IUniform> }> = THREE.ShaderLib as unknown as Record<string, { uniforms: Record<string, THREE.IUniform> }>): void {
  for (const shader of Object.values(lib)) if (shader.uniforms[SKY_MAP_UNIFORM]) shader.uniforms[SKY_MAP_UNIFORM].value = map;
}

export interface SkyOcclusion {
  /** RGBA bytes, row-major from the map's origin: R sky openness, G crest. */
  data: Uint8Array;
  width: number;
  height: number;
  origin: { x: number; z: number };
  size: { x: number; z: number };
}

/** Sample spacing for the bake: fine on small grounds, coarser on big ones,
 * never more than this many samples a side. */
const MAX_SIDE = 320;

/**
 * Bake sky occlusion over a world rectangle from a height sampler. Each
 * sample looks out in eight directions to about a hundred metres for the
 * highest rise; openness falls with the sine of that horizon angle,
 * stretched by `gain` so gentle prairie draws still read. Crest is the
 * height above the surrounding ground within about fifty metres.
 */
export function bakeSkyOcclusion(heightAt: (x: number, z: number) => number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, gain = 3.2): SkyOcclusion {
  const sx = bounds.maxX - bounds.minX, sz = bounds.maxZ - bounds.minZ;
  const step = Math.min(24, Math.max(8, Math.max(sx, sz) / 256, Math.max(sx, sz) / MAX_SIDE));
  const width = Math.max(2, Math.ceil(sx / step) + 1), height = Math.max(2, Math.ceil(sz / step) + 1);
  const h = new Float32Array(width * height);
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    h[j * width + i] = heightAt(bounds.minX + i * step, bounds.minZ + j * step);
  }
  const at = (i: number, j: number) => h[Math.min(height - 1, Math.max(0, j)) * width + Math.min(width - 1, Math.max(0, i))];
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const;
  const reach = [1, 2, 3, 5, 8].map(r => Math.max(1, Math.round(r * 12 / step)));
  const data = new Uint8Array(width * height * 4);
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const h0 = at(i, j);
    let closed = 0, around = 0, count = 0;
    for (const [dx, dz] of dirs) {
      const unit = Math.hypot(dx, dz) * step;
      let horizon = 0;
      for (const r of reach) {
        const rise = (at(i + dx * r, j + dz * r) - h0) / (r * unit);
        if (rise > horizon) horizon = rise;
        if (r * unit <= 50) { around += at(i + dx * r, j + dz * r); count++; }
      }
      closed += horizon / Math.sqrt(1 + horizon * horizon);
    }
    const open = Math.max(0, 1 - gain * closed / dirs.length);
    const crest = Math.max(-1, Math.min(1, (h0 - around / Math.max(1, count)) / 4));
    const k = (j * width + i) * 4;
    data[k] = Math.round(open * 255); data[k + 1] = Math.round((crest * .5 + .5) * 255); data[k + 3] = 255;
  }
  return { data, width, height, origin: { x: bounds.minX, z: bounds.minZ }, size: { x: (width - 1) * step, z: (height - 1) * step } };
}

/** The bake as a filtered texture, sampled at texel centres over its rect. */
export function skyOcclusionTexture(bake: SkyOcclusion): THREE.DataTexture {
  const texture = new THREE.DataTexture(bake.data, bake.width, bake.height);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** One hour's ground light on a ground. */
export interface GroundLightSettings {
  /** How much the sky map scales the sky's light (0 is none). */
  occlusion: number;
  /** How much crests brighten and hollows darken beyond openness alone. */
  crest: number;
  /** The darkest the sky's light gets at the bottom of a closed draw. */
  floor: number;
  /** Share of the ground under cloud shadow (0 to about .6). */
  cloudCover: number;
  /** How much of the sun a cloud shadow takes. */
  cloudStrength: number;
  /** Typical cloud-shadow size, metres. */
  cloudSize: number;
}

/** Write a bake's placement and an hour's settings into the shared values. */
export function writeGroundLight(bake: Pick<SkyOcclusion, 'origin' | 'size'> | null, s: GroundLightSettings,
  drift: { x: number; z: number }, out: Float32Array = GROUND): void {
  if (bake) { out[0] = bake.origin.x; out[1] = bake.origin.z; out[2] = 1 / bake.size.x; out[3] = 1 / bake.size.z; }
  out[4] = bake ? s.occlusion : 0; out[5] = s.crest; out[6] = s.floor;
  // The noise is two octaves around one half: map a share of cover onto
  // the threshold that leaves about that share above it.
  out[7] = .5 + (.5 - Math.min(.9, Math.max(0, s.cloudCover))) * .42;
  out[8] = drift.x; out[9] = drift.z; out[10] = 1 / Math.max(50, s.cloudSize); out[11] = s.cloudCover > 0 ? s.cloudStrength : 0;
}

/** `uplandGroundLight` in JavaScript, for tests: the sky factor at a map
 * sample (openness and crest bytes) and whether a world point is shaded. */
export function groundLightAt(openByte: number, crestByte: number, values: Float32Array = GROUND): number {
  const open = values[6] + (1 - values[6]) * openByte / 255;
  return 1 + (open * (1 + values[5] * (crestByte / 255 * 2 - 1)) - 1) * values[4];
}
