import * as THREE from 'three';
import type { TimeOfDay, TodSpec } from './palette';

/**
 * Regional atmosphere: the fog every material draws, driven from the sky.
 *
 * three's fog is one colour at one density. Here the shared fog chunk keeps
 * the scene's FogExp2 colour and density (per ground and hour, palette.ts)
 * as the air away from the sun, with a curve that is squared near and
 * linear far (`distanceFog`), and adds two things, on both tiers:
 *   - the air warms toward the sun's azimuth, taking the sky's horizon
 *     colour there, so the far field melts into the sky it sits under;
 *   - a height fog pools in low ground: densest at a floor taken from the
 *     landform (a low quantile of the property's heights), thinning upward
 *     over the region's layer depth. It is integrated along each view ray
 *     from the camera, so a hunter standing in a pothole at dawn sees it
 *     around him and a crest or overview view sees it lying in the low
 *     ground below, never a wash over the whole frame.
 * This replaces High's screen-space height haze, whose floor followed the
 * camera and turned every raised view white.
 *
 * three applies fog after tone mapping and sRGB encoding, so on screen its
 * linear fog colour was mixed into display colour, while High (rendering
 * linear into a target, tone mapped later) mixed it into linear light: the
 * same fog read dark on Lightweight and pale on High. The fog now runs at
 * the start of the tone-mapping chunk, in linear light on both tiers, and
 * three's own fog chunk stands down. (three also hands the fog colour over
 * sRGB-encoded on screen; the chunk decodes it.)
 *
 * Like the grade (grade.ts), the values are one shared Float32Array put into
 * ShaderLib, and every value is a departure from three's own fog, so a
 * shader without the uniform draws plain fog.
 */

export const FOG_UNIFORM = 'uplandFog';
const SLOTS = 4;
/**
 * Slot layout (vec4 each): 0 sunward colour, sunward strength; 1 sun's flat
 * direction (x, z), lobe power; 2 pool floor (world y), 1 / layer depth,
 * density per metre at the floor, most it hides; 3 pool colour, 1 - most
 * the distance fog hides.
 */
export const ATMOSPHERE = new Float32Array(SLOTS * 4);

export function atmosphereUniforms(): Record<string, THREE.IUniform> {
  return { [FOG_UNIFORM]: { value: ATMOSPHERE } };
}

/** `uplandFogTint(away, dir)` and `uplandPooledFog(ray, dist)`; needs
 * three's `cameraPosition`. Exported for the sky and ridge shaders. */
export const ATMOSPHERE_GLSL = /* glsl */`
uniform vec4 ${FOG_UNIFORM}[${SLOTS}];
vec3 uplandFogTint(vec3 away, vec3 dir) {
  vec2 level = dir.xz / max(length(dir.xz), 1e-4);
  float toward = max(dot(level, ${FOG_UNIFORM}[1].xy), 0.0);
  return mix(away, ${FOG_UNIFORM}[0].rgb, ${FOG_UNIFORM}[0].a * pow(toward, max(${FOG_UNIFORM}[1].z, 1.0)));
}
float uplandPooledFog(vec3 ray, float dist) {
  vec4 p = ${FOG_UNIFORM}[2];
  if (p.z <= 0.0) return 0.0;
  // Mean density along the ray of a layer that thins exponentially above
  // the floor; below the floor it holds its floor density.
  float h0 = max(cameraPosition.y - p.x, 0.0), h1 = max(cameraPosition.y + ray.y - p.x, 0.0);
  float e0 = exp(-p.y * h0), dh = h1 - h0;
  float mean = abs(dh) > .01 ? (e0 - exp(-p.y * h1)) / (p.y * dh) : e0;
  return min(1.0 - exp(-p.z * mean * dist), p.w);
}`;

const FOG_APPLY = `
	// three hands fog its colour in the output's colour space, since it fogs
	// after encoding (sRGB on screen, linear into a target); take it back to
	// linear light on screen too.
	vec3 fogLinear = linearToOutputTexel( vec4( .5 ) ).r == .5 ? fogColor : sRGBTransferEOTF( vec4( fogColor, 1.0 ) ).rgb;
	float fogDistance = length( vFogRay );
	#ifdef FOG_EXP2
		// Squared near (the hunter's ground stays clear), linear far, so each
		// band of far country steps back paler instead of all reaching the
		// same haze by two kilometres.
		float fogX = fogDensity * fogDistance;
		float fogFactor = min( 1.0 - exp( - fogX * fogX / ( 1.0 + fogX ) ), 1.0 - ${FOG_UNIFORM}[3].w );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, ${FOG_UNIFORM}[3].rgb, uplandPooledFog( vFogRay, fogDistance ) );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, uplandFogTint( fogLinear, vFogRay / max( fogDistance, 1e-4 ) ), fogFactor );`;
const STOCK_TONE_MAPPING = '#if defined( TONE_MAPPING )\n\tgl_FragColor.rgb = toneMapping( gl_FragColor.rgb );\n#endif';

const CHUNKS = {
  fog_pars_vertex: '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec3 vFogRay;\n#endif',
  // The world-space ray from the camera: the view-space position rotated
  // back by the view matrix (a rigid transform, so its transpose).
  fog_vertex: '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvFogRay = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;\n#endif',
  fog_pars_fragment: `#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogRay;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	${ATMOSPHERE_GLSL}
#endif`,
  // Fog in linear light, then tone mapping; a shader that never includes
  // the tone-mapping chunk still gets its fog from three's fog chunk.
  tonemapping_fragment: `#ifdef USE_FOG
	${FOG_APPLY}
	#define UPLAND_FOG_DONE
#endif
${STOCK_TONE_MAPPING}`,
  fog_fragment: `#if defined( USE_FOG ) && ! defined( UPLAND_FOG_DONE )
	${FOG_APPLY}
#endif`,
} as const;
const STOCK_FOG_FRAGMENT = 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );';

/**
 * Patch three's fog chunks and built-in uniforms. Must run before any
 * material compiles. Returns false, leaving everything alone, if three's fog
 * chunk no longer reads as expected; a test fails on that.
 */
export function installAtmosphere(
  chunks: Record<string, string> = THREE.ShaderChunk as unknown as Record<string, string>,
  lib: Record<string, { uniforms: Record<string, THREE.IUniform> }> = THREE.ShaderLib as unknown as Record<string, { uniforms: Record<string, THREE.IUniform> }>,
): boolean {
  const fragment = chunks.fog_fragment, toneMapping = chunks.tonemapping_fragment;
  if (!fragment?.includes(STOCK_FOG_FRAGMENT) && fragment !== CHUNKS.fog_fragment) return false;
  if (toneMapping !== STOCK_TONE_MAPPING && toneMapping !== CHUNKS.tonemapping_fragment) return false;
  Object.assign(chunks, CHUNKS);
  for (const shader of Object.values(lib)) Object.assign(shader.uniforms, atmosphereUniforms());
  return true;
}

type Rgb = readonly [number, number, number];

/** One hour of a region's air (see RegionAtmosphere). */
export interface AtmosphereHour {
  /** How far the fog takes the sky's sunward horizon colour (0 to 1), and
   * how tightly around the sun's azimuth. */
  sunward: number;
  sunwardPower: number;
  /** Pooled fog: density per metre at the floor, layer depth in metres, the
   * most it ever hides, and its colour as a multiplier on the fog colour. */
  pool: { density: number; depth: number; cap: number; tint: Rgb };
}

/** A region's air: where its fog pools and how each hour fills it. */
export interface RegionAtmosphere {
  /** The pool's floor as a quantile of the property's ground heights. */
  floor: number;
  /** The most of any far surface the distance fog hides, so the farthest
   * land stays a band of graded colour below the sky, never sky itself. */
  distance: number;
  /** The ground's own light (groundLight.ts): how strongly the sky map
   * darkens draws and lifts crests, and the cloud shadows the hunt's wind
   * carries over it. Cloud cover scales with the hour's sky cover, and
   * the shadows fade as the sun drops. */
  ground: { occlusion: number; crest: number; floor: number; cloudCover: number; cloudStrength: number; cloudSize: number };
  byTime: Record<TimeOfDay, AtmosphereHour>;
}

const pool = (density: number, depth: number, cap: number, tint: Rgb = [1, 1, 1]) => ({ density, depth, cap, tint });
const MIST: Rgb = [1.06, 1.07, 1.1];
const DUST: Rgb = [1.06, 1.0, .9];
const CANYON: Rgb = [.86, .96, 1.08];

/** Each core ground's air. Others share the plains default. */
export const REGION_ATMOSPHERE: Readonly<Record<string, RegionAtmosphere>> = {
  // Cool, clear high-plains air: the least haze of any ground, a thin mist
  // in the coulee bottoms at the ends of the day.
  'sharptail-prairie': { floor: .08, distance: .93,
    // Big sky: cloud shadows race across the swells; coulees sit dark.
    ground: { occlusion: .7, crest: .14, floor: .58, cloudCover: .42, cloudStrength: .5, cloudSize: 420 },
    byTime: {
    dawn: { sunward: .7, sunwardPower: 2.5, pool: pool(.0008, 5, .4, MIST) },
    morning: { sunward: .35, sunwardPower: 3, pool: pool(.00025, 6, .25, MIST) },
    noon: { sunward: .15, sunwardPower: 3, pool: pool(0, 1, 0) },
    evening: { sunward: .75, sunwardPower: 2.5, pool: pool(.0003, 6, .25, MIST) },
    lastlight: { sunward: .65, sunwardPower: 2, pool: pool(.0008, 6, .4, MIST) },
  } },
  // Warm, dusty Red Plains air with haze lying in the creek bottom: a thin
  // layer on the lowest ground, not a sheet over the rolling uplands.
  'quail-fields': { floor: .03, distance: .9,
    ground: { occlusion: .65, crest: .12, floor: .6, cloudCover: .32, cloudStrength: .4, cloudSize: 380 },
    byTime: {
    dawn: { sunward: .7, sunwardPower: 2, pool: pool(.001, 4, .35, MIST) },
    morning: { sunward: .45, sunwardPower: 2.5, pool: pool(.0005, 4, .3, DUST) },
    noon: { sunward: .25, sunwardPower: 3, pool: pool(.0003, 4, .2, DUST) },
    evening: { sunward: .75, sunwardPower: 2, pool: pool(.0005, 4, .3, DUST) },
    lastlight: { sunward: .6, sunwardPower: 2, pool: pool(.0008, 4, .35, MIST) },
  } },
  // Prairie potholes: dawn fog lies in the sloughs and burns off by mid
  // morning; cold blue air the rest of the day.
  'pheasant-coverts': { floor: .15, distance: .92,
    ground: { occlusion: .65, crest: .1, floor: .6, cloudCover: .36, cloudStrength: .45, cloudSize: 460 },
    byTime: {
    dawn: { sunward: .6, sunwardPower: 2.5, pool: pool(.0028, 3.5, .7, MIST) },
    morning: { sunward: .3, sunwardPower: 3, pool: pool(.0003, 3, .2, MIST) },
    noon: { sunward: .12, sunwardPower: 3, pool: pool(0, 1, 0) },
    evening: { sunward: .7, sunwardPower: 2.5, pool: pool(.0005, 4, .3, MIST) },
    lastlight: { sunward: .55, sunwardPower: 2, pool: pool(.0016, 4, .55, MIST) },
  } },
  // A canyon: cool haze fills the depths, so every bench and ridge below
  // the hunter steps back in a bluer band.
  'chukar-ridge': { floor: .02, distance: .9,
    // The canyon floor and north faces sit in deep sky shade.
    ground: { occlusion: .8, crest: .14, floor: .5, cloudCover: .3, cloudStrength: .4, cloudSize: 520 },
    byTime: {
    dawn: { sunward: .65, sunwardPower: 2.5, pool: pool(.0009, 26, .35, CANYON) },
    morning: { sunward: .35, sunwardPower: 3, pool: pool(.0005, 30, .25, CANYON) },
    noon: { sunward: .15, sunwardPower: 3, pool: pool(.0004, 32, .2, CANYON) },
    evening: { sunward: .7, sunwardPower: 2.5, pool: pool(.0005, 30, .25, CANYON) },
    lastlight: { sunward: .55, sunwardPower: 2, pool: pool(.0006, 26, .28, CANYON) },
  } },
};

const PLAINS: RegionAtmosphere = { floor: .1, distance: 1,
  ground: { occlusion: .8, crest: .1, floor: .5, cloudCover: 0, cloudStrength: 0, cloudSize: 400 },
  byTime: {
  dawn: { sunward: .6, sunwardPower: 2.5, pool: pool(0, 1, 0) },
  morning: { sunward: .3, sunwardPower: 3, pool: pool(0, 1, 0) },
  noon: { sunward: .12, sunwardPower: 3, pool: pool(0, 1, 0) },
  evening: { sunward: .65, sunwardPower: 2.5, pool: pool(0, 1, 0) },
  lastlight: { sunward: .5, sunwardPower: 2, pool: pool(0, 1, 0) },
} };

export function regionAtmosphere(areaId: string): RegionAtmosphere {
  return REGION_ATMOSPHERE[areaId] ?? PLAINS;
}

/** The height a region's fog pools at: a quantile of the ground heights on a
 * grid over the property, so a bigger or reshaped ground moves it too. */
export function poolFloor(heightAt: (x: number, z: number) => number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, quantile: number, cells = 40): number {
  const heights: number[] = [];
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    heights.push(heightAt(bounds.minX + (bounds.maxX - bounds.minX) * (i + .5) / cells,
      bounds.minZ + (bounds.maxZ - bounds.minZ) * (j + .5) / cells));
  }
  heights.sort((a, b) => a - b);
  return heights[Math.min(heights.length - 1, Math.max(0, Math.round(quantile * (heights.length - 1))))];
}

const scratch = new THREE.Color(), hot = new THREE.Color();

/** Write one hour of a region's air into the shared values. `sun` is the
 * sun's world direction; `floor` the pool floor in world metres. */
export function writeAtmosphere(spec: TodSpec, region: RegionAtmosphere, tod: TimeOfDay, sun: THREE.Vector3, floor: number,
  out: Float32Array = ATMOSPHERE): void {
  const hour = region.byTime[tod];
  // Sunward air takes the warmth of the dome's horizon toward the sun (its
  // horizon stop heated by the hot band) at the far land's own value, so
  // looking into the sun the land warms instead of whitening.
  scratch.setHex(spec.skyHorizon).lerp(hot.setHex(spec.hotBand), Math.min(.85, spec.hotStrength));
  const fog = new THREE.Color(spec.fogColor), value = (c: THREE.Color) => .2126 * c.r + .7152 * c.g + .0722 * c.b;
  scratch.multiplyScalar(value(fog) * 1.12 / Math.max(1e-4, value(scratch)));
  out[0] = scratch.r; out[1] = scratch.g; out[2] = scratch.b; out[3] = hour.sunward;
  const level = Math.hypot(sun.x, sun.z) || 1;
  out[4] = sun.x / level; out[5] = sun.z / level; out[6] = hour.sunwardPower; out[7] = 0;
  const p = hour.pool;
  out[8] = floor; out[9] = 1 / Math.max(.5, p.depth); out[10] = p.density; out[11] = p.cap;
  // Mist is a little paler than the far land, never white.
  scratch.setHex(spec.fogColor).lerp(hot.setHex(spec.skyHorizon), .2);
  out[12] = scratch.r * p.tint[0]; out[13] = scratch.g * p.tint[1]; out[14] = scratch.b * p.tint[2]; out[15] = 1 - region.distance;
}

/** The distance fog's curve in JavaScript: the share of a surface `metres`
 * away the fog hides at `density`, before the region's cap. */
export function distanceFog(density: number, metres: number): number {
  const x = density * metres;
  return 1 - Math.exp(-x * x / (1 + x));
}

/** `uplandPooledFog` in JavaScript, for tests and checks: the share of a
 * surface `ray` metres from a camera at `cameraY` the pooled fog hides. */
export function pooledFog(cameraY: number, ray: { x: number; y: number; z: number }, a: Float32Array = ATMOSPHERE): number {
  const [floor, falloff, density, cap] = [a[8], a[9], a[10], a[11]];
  if (density <= 0) return 0;
  const dist = Math.hypot(ray.x, ray.y, ray.z);
  const h0 = Math.max(cameraY - floor, 0), h1 = Math.max(cameraY + ray.y - floor, 0);
  const e0 = Math.exp(-falloff * h0), dh = h1 - h0;
  const mean = Math.abs(dh) > .01 ? (e0 - Math.exp(-falloff * h1)) / (falloff * dh) : e0;
  return Math.min(1 - Math.exp(-density * mean * dist), cap);
}
