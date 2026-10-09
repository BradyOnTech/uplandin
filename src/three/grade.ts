import * as THREE from 'three';
import type { LookSettings } from './looks';

/**
 * The colour grade, built into every material's tone mapping.
 *
 * The approved Crisp grade and each ground's light used to live only in the
 * High tier's last screen pass, so Lightweight (phones) never had them. Now
 * the renderer uses three's CustomToneMapping, and the tone-mapping chunk
 * every material compiles runs ACES Filmic and then the grade. Lightweight
 * gets the same colour with no extra pass. High renders its scene linear
 * into the screen-effects target (three never tone maps into a render
 * target), and its last pass calls the same GLSL with the same values, so
 * each tier grades exactly once.
 *
 * The values are one shared Float32Array. three copies a non-three uniform
 * value by reference when it clones a material's uniforms, so putting the
 * array into ShaderLib reaches every built-in material, and through them
 * every onBeforeCompile shader; ShaderMaterials that tone map (the sky dome
 * and ridges) add `gradeUniforms()` themselves. Every value is stored as a
 * departure from neutral, so a shader that somehow lacks the uniform reads
 * zeros and renders plain ACES, never black.
 *
 * The grade works in display space, as it always did, so the chunk converts
 * to sRGB and back; three then encodes the result. Banding guard: a half-step
 * dither in display space, before the 8-bit write.
 */

export const GRADE_UNIFORM = 'uplandGrade';
const SLOTS = 7;
/**
 * Slot layout (vec4 each): 0 white balance - 1, saturation - 1; 1 slope - 1,
 * contrast blend; 2 offset, vignette; 3 shadow tint, dither; 4 highlight
 * tint; 5 power - 1; 6 1 / drawing-buffer size, aspect.
 */
export const GRADE = new Float32Array(SLOTS * 4);

export function gradeUniforms(): Record<string, THREE.IUniform> {
  return { [GRADE_UNIFORM]: { value: GRADE } };
}

/** `vec3 uplandGradeDisplay(vec3 linearHdr, float exposure)`: three's ACES
 * Filmic, then the grade; returns display (sRGB) colour. */
export const GRADE_GLSL = /* glsl */`
uniform vec4 ${GRADE_UNIFORM}[${SLOTS}];
vec3 uplandAces(vec3 v) {
  const mat3 inputMatrix = mat3(vec3(.59719, .07600, .02840), vec3(.35458, .90834, .13383), vec3(.04823, .01566, .83777));
  const mat3 outputMatrix = mat3(vec3(1.60475, -.10208, -.00327), vec3(-.53108, 1.10813, -.07276), vec3(-.07367, -.00605, 1.07602));
  v = inputMatrix * v;
  v = (v * (v + .0245786) - .000090537) / (v * (.983729 * v + .4329510) + .238081);
  return clamp(outputMatrix * v, 0.0, 1.0);
}
vec3 uplandToDisplay(vec3 c) {
  return mix(pow(c, vec3(1.0 / 2.4)) * 1.055 - .055, c * 12.92, vec3(lessThanEqual(c, vec3(.0031308))));
}
vec3 uplandToLinear(vec3 s) {
  return mix(pow((s + .055) / 1.055, vec3(2.4)), s / 12.92, vec3(lessThanEqual(s, vec3(.04045))));
}
float uplandLuma(vec3 c) { return dot(c, vec3(.2126, .7152, .0722)); }
vec3 uplandGradeDisplay(vec3 color, float exposure) {
  vec4 g0 = ${GRADE_UNIFORM}[0], g1 = ${GRADE_UNIFORM}[1], g2 = ${GRADE_UNIFORM}[2], g3 = ${GRADE_UNIFORM}[3];
  vec4 g4 = ${GRADE_UNIFORM}[4], g5 = ${GRADE_UNIFORM}[5], g6 = ${GRADE_UNIFORM}[6];
  vec3 s = uplandToDisplay(uplandAces(color * (1.0 + g0.rgb) * exposure / .6));
  s = pow(max(s * (1.0 + g1.rgb) + g2.rgb, 0.0), 1.0 + g5.rgb);
  float l = uplandLuma(s);
  s += g3.rgb * (1.0 - smoothstep(0.0, .55, l)) + g4.rgb * smoothstep(.45, 1.0, l);
  s = clamp(s, 0.0, 1.0);
  s = mix(s, s * s * (3.0 - 2.0 * s), g1.a);
  s = mix(vec3(uplandLuma(s)), s, 1.0 + g0.a);
  vec2 q = (gl_FragCoord.xy * g6.xy - .5) * vec2(g6.z, 1.0);
  s *= 1.0 - g2.a * smoothstep(.35, 1.05, length(q));
  s += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5) * g3.a;
  return clamp(s, 0.0, 1.0);
}`;

const CUSTOM_STUB = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
const CUSTOM_GRADE = `${GRADE_GLSL}
vec3 CustomToneMapping( vec3 color ) { return uplandToLinear(uplandGradeDisplay(color, toneMappingExposure)); }`;

/**
 * Patch three's tone-mapping chunk and built-in uniforms, then switch the
 * renderer to it. Must run before any material compiles (the engine calls it
 * as it builds the renderer). Returns false, leaving everything alone, if
 * three no longer declares the custom stub as expected; a test fails on that.
 */
export function installGrade(
  renderer: Pick<THREE.WebGLRenderer, 'toneMapping'> | null,
  chunks: Record<string, string> = THREE.ShaderChunk as unknown as Record<string, string>,
  lib: Record<string, { uniforms: Record<string, THREE.IUniform> }> = THREE.ShaderLib as unknown as Record<string, { uniforms: Record<string, THREE.IUniform> }>,
): boolean {
  const pars = chunks.tonemapping_pars_fragment;
  if (!pars?.includes(CUSTOM_STUB) && !pars?.includes(CUSTOM_GRADE)) return false;
  chunks.tonemapping_pars_fragment = pars.replace(CUSTOM_STUB, CUSTOM_GRADE);
  for (const shader of Object.values(lib)) Object.assign(shader.uniforms, gradeUniforms());
  if (renderer) renderer.toneMapping = THREE.CustomToneMapping;
  return true;
}

type Grade = LookSettings['grade'];

/** Write a look's grade (as it applies now) into the shared values; null is
 * plain ACES, the renderer's look before any grade. */
export function writeGrade(grade: Grade | null, out: Float32Array = GRADE): void {
  const size = [out[24], out[25], out[26]];
  out.fill(0);
  out.set(size, 24);
  if (!grade) return;
  const set = (slot: number, rgb: readonly number[], minus: number, a = 0) => {
    out[slot * 4] = rgb[0] - minus; out[slot * 4 + 1] = rgb[1] - minus; out[slot * 4 + 2] = rgb[2] - minus; out[slot * 4 + 3] = a;
  };
  set(0, grade.whiteBalance, 1, grade.saturation - 1);
  set(1, grade.slope, 1, Math.min(1, Math.max(-1, (grade.contrast - 1) * 2)));
  set(2, grade.offset, 0, grade.vignette);
  set(3, grade.shadowTint, 0, 1 / 255);
  set(4, grade.highlightTint, 0);
  set(5, grade.power, 1);
}

/** The drawing buffer the vignette is measured against, in pixels. */
export function setGradeViewport(width: number, height: number, out: Float32Array = GRADE): void {
  out[24] = 1 / Math.max(1, width); out[25] = 1 / Math.max(1, height); out[26] = width / Math.max(1, height);
}

const luma = (c: readonly number[]) => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const toDisplay = (c: number) => c <= .0031308 ? c * 12.92 : Math.pow(c, 1 / 2.4) * 1.055 - .055;

/** The grade's GLSL in JavaScript, for tests and colour checks: linear HDR
 * in, display sRGB out, at the frame centre without dither. */
export function gradeDisplay(color: readonly [number, number, number], exposure: number, g: Float32Array = GRADE): [number, number, number] {
  const v = color.map((c, i) => c * (1 + g[i]) * exposure / .6);
  const m = (a: number[], r: number[][]) => [0, 1, 2].map(i => r[0][i] * a[0] + r[1][i] * a[1] + r[2][i] * a[2]);
  const input = m(v, [[.59719, .07600, .02840], [.35458, .90834, .13383], [.04823, .01566, .83777]]);
  const fit = input.map(x => (x * (x + .0245786) - .000090537) / (x * (.983729 * x + .4329510) + .238081));
  const aces = m(fit, [[1.60475, -.10208, -.00327], [-.53108, 1.10813, -.07276], [-.07367, -.00605, 1.07602]]).map(x => Math.min(1, Math.max(0, x)));
  let s = aces.map(toDisplay).map((x, i) => Math.pow(Math.max(x * (1 + g[4 + i]) + g[8 + i], 0), 1 + g[20 + i]));
  const l = luma(s);
  s = s.map((x, i) => Math.min(1, Math.max(0, x + g[12 + i] * (1 - smooth(0, .55, l)) + g[16 + i] * smooth(.45, 1, l))));
  s = s.map(x => x + (x * x * (3 - 2 * x) - x) * g[7]);
  const l2 = luma(s);
  return s.map(x => Math.min(1, Math.max(0, l2 + (x - l2) * (1 + g[3])))) as [number, number, number];
}
