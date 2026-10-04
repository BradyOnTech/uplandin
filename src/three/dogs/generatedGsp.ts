import * as THREE from 'three';
import { createGeneratedGriffonHead, createGeneratedGspHead, createGeneratedSetterHead } from './generatedGspHead';
import { BOUND_STRIDE, createLocomotionPose, writeLocomotionPose, type LocomotionGait, type FootTuple } from './locomotion';
import { createTwoBoneSolution, solveTwoBone } from './legIk';
import { germanShorthairedPointerAppearance, isGspCoatId, type GspCoatId } from './germanShorthairedPointer';
import { englishSetterAppearance, isEnglishSetterCoatId, type EnglishSetterCoatId } from './englishSetter';
import { griffonAppearance, griffonHash, griffonMarkerTone, isGriffonCoatId, type GriffonCoatId } from './griffon';
import { resolveCoatFor, type ModeledBreedId } from '../../game/dogCoats';

/** Coat ids are disjoint between breeds, so a coat also names its breed. */
export type GeneratedCoatId = GspCoatId | EnglishSetterCoatId | GriffonCoatId;
export type GeneratedBreed = ModeledBreedId;
export function generatedBreedForCoat(coatId: GeneratedCoatId): GeneratedBreed {
  return isEnglishSetterCoatId(coatId) ? 'english-setter' : isGriffonCoatId(coatId) ? 'griffon' : 'gsp';
}
export function isGeneratedCoatId(value: string | null | undefined): value is GeneratedCoatId {
  return isGspCoatId(value) || isEnglishSetterCoatId(value) || isGriffonCoatId(value);
}
/** A coat of this breed's model: the requested one if it belongs, else the default. */
export function generatedCoatFor(breed: GeneratedBreed, coatId: string | null | undefined): GeneratedCoatId {
  return resolveCoatFor(breed, coatId) as GeneratedCoatId;
}

/** Authored in metres, +Z nose. Geometry is generated once, never per frame. */
type Ring = readonly [x: number, y: number, z: number, width: number, height: number, underside?: number];
type Point = readonly [number, number, number];
export const GENERATED_STRIDE_SCALE: Record<LocomotionGait,number> = {walk:.72,trot:.95,canter:.95,gallop:1,bound:1};
/** Metres per cycle; a bound's stride is set per leap (this is its reference). */
export const GENERATED_STRIDE: Record<LocomotionGait,number> = {walk:.72*.72,trot:.94*.95,canter:1.38*.95,gallop:1.9,bound:BOUND_STRIDE};
const GENERATED_GALLOP_TOUCHDOWN: FootTuple<number> = [.58,.50,.08,0];
const WHITE = 0xd1cdc1, LIVER = 0x51382e;
/** Head-relative grip: the mandible moves around it, never drives the bird. */
export const GENERATED_MOUTH_GRIP: Point = [0, -.065, .125];

/** Coat coordinates stay in the bind pose so pigment follows the skin. */
function applyGspCoat(material: THREE.MeshLambertMaterial, coatId: GspCoatId): void {
  const appearance = germanShorthairedPointerAppearance(coatId);
  material.onBeforeCompile = shader => {
    withCoatLighting(shader);
    shader.uniforms.gspWhite = { value: new THREE.Color(coatId === 'liver-white' ? WHITE : appearance.ground) };
    shader.uniforms.gspLiver = { value: new THREE.Color(coatId === 'liver-white' ? LIVER : appearance.primary) };
    shader.uniforms.gspRoan = { value: appearance.pattern === 'roan' ? 1 : 0 };
    shader.uniforms.gspSolid = { value: appearance.pattern === 'solid' ? 1 : 0 };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vGspBindPosition;
varying float vGspWhiteSurface;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vGspBindPosition = position;
vGspWhiteSurface = step(0.25, min(color.r, min(color.g, color.b)));`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vGspBindPosition;
varying float vGspWhiteSurface;
uniform vec3 gspWhite;
uniform vec3 gspLiver;
uniform float gspRoan;
uniform float gspSolid;
float gspIsland(vec3 point, vec3 center, vec3 radius) {
  vec3 p = (point - center) / radius;
  float edge = length(p) + 0.075 * sin(point.z * 53.0 + point.y * 31.0)
    + 0.045 * sin(point.x * 91.0 - point.y * 61.0);
  return 1.0 - smoothstep(0.96, 1.025, edge);
}
float gspHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}`).replace('#include <color_fragment>', `#include <color_fragment>
if (vGspWhiteSurface > 0.5) {
  vec3 p = vGspBindPosition;
  float liverArea = max(gspIsland(p, vec3(-0.085, 0.55, 0.125), vec3(0.15, 0.155, 0.175)),
    gspIsland(p, vec3(0.105, 0.57, -0.31), vec3(0.16, 0.13, 0.14)));
  liverArea = max(liverArea, gspIsland(p, vec3(0.095, 0.555, 0.24), vec3(0.115, 0.115, 0.10)));
  // Sparse, small ticking breaks up the white without a noisy roan texture.
  vec3 cell = floor(p * 91.0);
  float choice = gspHash(cell);
  vec3 center = vec3(gspHash(cell + 3.1), gspHash(cell + 7.7), gspHash(cell + 11.3));
  float spot = (1.0 - smoothstep(0.10, 0.23, length(fract(p * 91.0) - center))) * step(mix(0.76, 0.32, gspRoan), choice);
  float footprint = max(length(dFdx(p)), length(dFdy(p)));
  spot *= 1.0 - smoothstep(0.0025, 0.009, footprint);
  float underside = 1.0 - smoothstep(0.26, 0.56, p.y);
  vec3 cleanCoat = gspWhite * (1.0 - underside * 0.025);
  diffuseColor.rgb = mix(cleanCoat, gspLiver, max(gspSolid, max(liverArea, spot * mix(0.70, 0.92, gspRoan))));
}`);
  };
  material.customProgramCacheKey = () => 'generated-gsp-bind-coat-v4';
}

/**
 * Belton coat for the smooth English Setter. White ground carries fine,
 * dense flecking that resolves to an even tint at field distance rather than
 * shimmering, plus a few soft patches and optional tricolour tan points.
 */
function applySetterCoat(material: THREE.MeshLambertMaterial, coatId: EnglishSetterCoatId, faceted = false): void {
  const a = englishSetterAppearance(coatId);
  material.onBeforeCompile = shader => {
    withCoatLighting(shader);
    shader.uniforms.setterGround = { value: new THREE.Color(a.ground).lerp(new THREE.Color(0xd8d2c4), .35) };
    shader.uniforms.setterPrimary = { value: new THREE.Color(a.primary) };
    shader.uniforms.setterTan = { value: new THREE.Color(a.tanPoint ?? a.primary) };
    shader.uniforms.setterTanAmount = { value: a.tanPoint === undefined ? 0 : 1 };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vSetterBindPosition;
varying float vSetterCoatSurface;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vSetterBindPosition = position;
vSetterCoatSurface = step(0.25, min(color.r, min(color.g, color.b)));`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vSetterBindPosition;
varying float vSetterCoatSurface;
uniform vec3 setterGround;
uniform vec3 setterPrimary;
uniform vec3 setterTan;
uniform float setterTanAmount;
float setterIsland(vec3 point, vec3 center, vec3 radius) {
  vec3 p = (point - center) / radius;
  float edge = length(p) + 0.09 * sin(point.z * 61.0 + point.y * 37.0) + 0.05 * sin(point.x * 83.0 - point.y * 57.0);
  return 1.0 - smoothstep(0.95, 1.03, edge);
}
float setterHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}`).replace('#include <color_fragment>', `#include <color_fragment>
if (vSetterCoatSurface > 0.5) {
  vec3 p = vSetterBindPosition;
  // A soft patch behind the ears, continuous with the coloured hood.
  float markPatch = setterIsland(p, vec3(0.0, 0.665, 0.425), vec3(0.07, 0.055, 0.055));
  // Belton flecking: many small ticks, denser down the legs and muzzle.
  vec3 cell = floor(p * SETTER_FLECK_SCALE);
  float choice = setterHash(cell);
  vec3 center = vec3(setterHash(cell + 3.1), setterHash(cell + 7.7), setterHash(cell + 11.3)) * 0.7 + 0.15;
  float legs = 1.0 - smoothstep(0.18, 0.34, p.y);
  // Low-frequency clustering: belton ticking gathers in drifts, not an even grid.
  float drift = 0.5 + 0.5 * sin(p.z * 23.0 + sin(p.y * 17.0) * 2.0) * sin(p.y * 29.0 - p.x * 21.0);
  float density = mix(SETTER_FLECK_DENSITY, SETTER_FLECK_DENSITY - 0.18, legs) + (0.5 - drift) * 0.34;
  vec3 offset = fract(p * SETTER_FLECK_SCALE) - center;
  #ifdef SETTER_FACETED
  // Faceted coat: crisp diamond flecks, the way the sculpted dog was painted.
  float tick = (1.0 - step(0.2, abs(offset.x) + abs(offset.y) + abs(offset.z) * 0.6)) * step(density, choice);
  #else
  float tick = (1.0 - smoothstep(0.12, 0.26, length(offset))) * step(density, choice);
  #endif
  float footprint = max(length(dFdx(p)), length(dFdy(p)));
  float resolve = 1.0 - smoothstep(0.002, 0.008, footprint);
  // Beyond the resolving distance the ticks average to a light roan tint.
  float coverage = mix(0.10, 0.16, legs);
  float fleck = mix(coverage, tick * 0.85, resolve);
  float underside = 1.0 - smoothstep(0.26, 0.56, p.y);
  vec3 coat = mix(setterGround * (1.0 - underside * 0.03), setterPrimary, max(markPatch * 0.9, fleck));
  // Tan points shade in gradually over the pasterns and feet.
  float tanLegs = setterTanAmount * (1.0 - smoothstep(0.03, 0.15, p.y));
  diffuseColor.rgb = mix(coat, setterTan * 0.9, tanLegs * 0.62);
}`);
  };
  material.defines = { ...material.defines, SETTER_FLECK_SCALE: faceted ? '40.0' : '118.0', SETTER_FLECK_DENSITY: faceted ? '0.60' : '0.58',
    ...(faceted ? { SETTER_FACETED: '' } : {}) };
  material.customProgramCacheKey = () => `generated-setter-bind-coat-v3${faceted ? '-faceted' : ''}`;
}

/**
 * Steel gray with brown markings for the Griffon. Brown runs back from the
 * brown head over the nape, lies in a saddle over the back and at the tail
 * set, with a patch on the near shoulder. Everywhere else the harsh coat is
 * grizzled: each facet is its own lock of hair, a shade darker or lighter
 * steel gray and now and then brown-gray (the coat marker carries its tone),
 * with short wiry strokes of pale and brown hair inside the facets close up.
 * The beard, moustache and lower legs are a little browner.
 */
function applyGriffonCoat(material: THREE.MeshLambertMaterial, coatId: GriffonCoatId, faceted = false): void {
  const a = griffonAppearance(coatId);
  material.onBeforeCompile = shader => {
    withCoatLighting(shader);
    shader.uniforms.griffonGray = { value: new THREE.Color(a.ground) };
    shader.uniforms.griffonPale = { value: new THREE.Color(a.grizzle) };
    shader.uniforms.griffonBrown = { value: new THREE.Color(a.primary) };
    shader.uniforms.griffonBrownDeep = { value: new THREE.Color(a.primaryDeep) };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vGriffonBindPosition;
varying float vGriffonCoatSurface;
varying float vGriffonTone;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vGriffonBindPosition = position;
vGriffonCoatSurface = step(0.25, min(color.r, min(color.g, color.b)));
vGriffonTone = color.r;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vGriffonBindPosition;
varying float vGriffonCoatSurface;
varying float vGriffonTone;
uniform vec3 griffonGray;
uniform vec3 griffonPale;
uniform vec3 griffonBrown;
uniform vec3 griffonBrownDeep;
float griffonIsland(vec3 point, vec3 center, vec3 radius) {
  vec3 p = (point - center) / radius;
  float edge = length(p) + 0.11 * sin(point.z * 57.0 + point.y * 33.0) + 0.06 * sin(point.x * 89.0 - point.y * 63.0);
  return 1.0 - smoothstep(0.95, 1.03, edge);
}
float griffonHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}`).replace('#include <color_fragment>', `#include <color_fragment>
if (vGriffonCoatSurface > 0.5) {
  vec3 p = vGriffonBindPosition;
  // The facet's own lock of hair, carried in the marker's brightness.
  float lock = clamp((vGriffonTone - GRIFFON_TONE_LOW) / GRIFFON_TONE_SPAN, 0.0, 1.0);
  float marks = max(griffonIsland(p, vec3(0.0, 0.715, 0.295), vec3(0.064, 0.072, 0.085)),
    griffonIsland(p, vec3(0.0, 0.645, -0.12), vec3(0.115, 0.075, 0.165)));
  marks = max(marks, griffonIsland(p, vec3(0.0, 0.6, -0.335), vec3(0.095, 0.075, 0.085)));
  marks = max(marks, griffonIsland(p, vec3(-0.1, 0.55, 0.165), vec3(0.052, 0.07, 0.07)));
  // Wiry strokes, longer down the hair's fall than across it.
  vec3 q = p * vec3(GRIFFON_STROKE_SCALE, GRIFFON_STROKE_SCALE * 0.5, GRIFFON_STROKE_SCALE);
  vec3 cell = floor(q);
  float pick = griffonHash(cell);
  vec3 offset = fract(q) - (vec3(griffonHash(cell + 3.1), griffonHash(cell + 7.7), griffonHash(cell + 11.3)) * 0.6 + 0.2);
  #ifdef GRIFFON_FACETED
  float stroke = 1.0 - step(0.24, abs(offset.x) + abs(offset.y) * 0.45 + abs(offset.z));
  #else
  float stroke = 1.0 - smoothstep(0.13, 0.25, length(offset * vec3(1.0, 0.45, 1.0)));
  #endif
  float footprint = max(length(dFdx(p)), length(dFdy(p)));
  // Strokes only where they resolve; farther off the locks carry the grizzle.
  float resolve = 1.0 - smoothstep(0.002, 0.008, footprint);
  float pale = stroke * step(0.6, pick) * resolve;
  float dark = stroke * step(pick, 0.2) * resolve;
  // Steel grays, darker and lighter lock by lock, and now and then a
  // brown-gray one.
  vec3 grizzle = mix(griffonGray * 0.9, mix(griffonGray, griffonPale, 0.3), lock);
  grizzle = mix(grizzle, mix(griffonGray, griffonBrown, 0.5), step(lock, 0.13));
  grizzle = mix(grizzle, griffonPale, pale * 0.45);
  grizzle = mix(grizzle, griffonBrownDeep, dark * 0.5);
  // The grizzle browns a little down the legs to the feet, and in the
  // furnishings of the face.
  float legs = 1.0 - smoothstep(0.1, 0.3, p.y);
  float face = smoothstep(0.4, 0.43, p.z);
  grizzle = mix(grizzle, griffonBrown, max(legs * 0.22, face * 0.3));
  vec3 brown = mix(griffonBrownDeep, griffonBrown, 0.55 + 0.45 * lock);
  brown = mix(brown, griffonBrownDeep, dark * 0.4);
  float underside = 1.0 - smoothstep(0.26, 0.56, p.y);
  diffuseColor.rgb = mix(grizzle * (1.0 - underside * 0.04), brown, marks);
}`);
  };
  // The marker's red channel at the darkest and lightest lock, as stored (linear).
  const red = (tone: number) => new THREE.Color(griffonMarkerTone(WHITE, tone)).r;
  material.defines = { ...material.defines, GRIFFON_STROKE_SCALE: faceted ? '56.0' : '112.0',
    GRIFFON_TONE_LOW: red(0).toFixed(5), GRIFFON_TONE_SPAN: (red(1) - red(0)).toFixed(5), ...(faceted ? { GRIFFON_FACETED: '' } : {}) };
  material.customProgramCacheKey = () => `generated-griffon-bind-coat-v2${faceted ? '-faceted' : ''}`;
}

/** Shared smooth-coat lighting: baked occlusion and a soft sky rim. */
function withCoatLighting(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
attribute float occlusion;
varying float vCoatOcclusion;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vCoatOcclusion = occlusion;`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying float vCoatOcclusion;`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
diffuseColor.rgb *= vCoatOcclusion;
// A thin, soft rim separates the silhouette from grass and sky without
// reading as a glossy highlight. Strongest on the lit, sky-facing coat.
float coatRim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
totalEmissiveRadiance += diffuseColor.rgb * coatRim * (0.16 + 0.1 * clamp(normal.y, 0.0, 1.0)) * vCoatOcclusion;`);
}

class Surface {
  private positions: number[] = [];
  private colors: number[] = [];
  constructor(private sides: number) {}
  loft(rings: readonly Ring[], color: number | ((p: THREE.Vector3) => number), axis: 'z' | 'y' = 'z'): void {
    const vertices = rings.map(([x, y, z, w, h, underside = h]) => Array.from({ length: this.sides }, (_, i) => {
      const a = i * Math.PI * 2 / this.sides;
      const height = Math.sin(a) < 0 ? underside : h;
      return new THREE.Vector3(x + Math.cos(a) * w, y + (axis === 'z' ? Math.sin(a) * height : 0), z + (axis === 'y' ? -Math.sin(a) * height : 0));
    }));
    const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
      const center = a.clone().add(b).add(c).multiplyScalar(1 / 3);
      const shade = new THREE.Color(typeof color === 'number' ? color : color(center));
      for (const v of [a, b, c]) { this.positions.push(v.x, v.y, v.z); this.colors.push(shade.r, shade.g, shade.b); }
    };
    for (let r = 1; r < rings.length; r++) for (let i = 0; i < this.sides; i++) {
      const j = (i + 1) % this.sides;
      tri(vertices[r - 1][i], vertices[r - 1][j], vertices[r][i]);
      tri(vertices[r - 1][j], vertices[r][j], vertices[r][i]);
    }
    for (let i = 0; i < this.sides; i++) {
      const j = (i + 1) % this.sides;
      tri(vertices[0][j], vertices[0][i], new THREE.Vector3(...rings[0].slice(0, 3) as [number, number, number]));
      const last = rings.length - 1;
      tri(vertices[last][i], vertices[last][j], new THREE.Vector3(...rings[last].slice(0, 3) as [number, number, number]));
    }
  }
  geometry(softness = 0): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeVertexNormals();
    if (softness > 0) {
      // Blend lighting across duplicated loft vertices without changing the
      // faceted silhouette or introducing extra geometry/materials.
      const normal = g.getAttribute('normal');
      const sums = new Map<string, THREE.Vector3>();
      const keys = this.positions.reduce<string[]>((result, _, i) => {
        if (i % 3 === 0) result.push(this.positions.slice(i, i + 3).map(v => v.toFixed(6)).join(','));
        return result;
      }, []);
      keys.forEach((key, i) => {
        const sum = sums.get(key) ?? new THREE.Vector3();
        sum.add(new THREE.Vector3().fromBufferAttribute(normal, i)); sums.set(key, sum);
      });
      for (const sum of sums.values()) sum.normalize();
      const blended = new THREE.Vector3();
      keys.forEach((key, i) => {
        blended.fromBufferAttribute(normal, i).lerp(sums.get(key)!, softness).normalize();
        normal.setXYZ(i, blended.x, blended.y, blended.z);
      });
    }
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

export type GeneratedLook = 'smooth' | 'faceted';

export function createGeneratedGsp(detail: 'high' | 'lite' = 'high', live = false, coatId: GeneratedCoatId = 'liver-white', look: GeneratedLook = 'smooth') {
  // The faceted look keeps every loft triangle flat, with fewer, broader
  // planes: the sculpted low-poly dog on the same skinned rig and motion.
  const faceted = look === 'faceted';
  const sides = detail === 'high' ? (faceted ? 8 : 10) : 6;
  const breed = generatedBreedForCoat(coatId), setter = breed === 'english-setter', griffon = breed === 'griffon';
  const root = new THREE.Group(); root.name = `generated-${breed}`;
  const label = setter ? englishSetterAppearance(coatId as EnglishSetterCoatId).label
    : griffon ? griffonAppearance(coatId as GriffonCoatId).label : germanShorthairedPointerAppearance(coatId as GspCoatId).label;
  root.userData.coatId = coatId; root.userData.coatLabel = label; root.userData.breedId = breed; root.userData.look = look;
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  if (faceted) material.flatShading = true;
  // Coat surfaces carry the marker. The Griffon's carries each facet's own
  // lock of hair in its brightness (griffon.ts); the other coats are even.
  const coat: number | ((p: THREE.Vector3) => number) = griffon ? p => griffonMarkerTone(WHITE, griffonHash(p.x, p.y, p.z)) : WHITE;
  // A few hairs of grizzled brown, darker than the coat marker so they keep
  // their own colour: the Griffon's eyebrows.
  const brow = (p: THREE.Vector3) => [0x6f5a4a, 0x7d6857, 0x5e4a3d][Math.floor(griffonHash(p.z, p.y, p.x) * 3)];
  if (setter) applySetterCoat(material, coatId as EnglishSetterCoatId, faceted);
  else if (griffon) applyGriffonCoat(material, coatId as GriffonCoatId, faceted);
  else applyGspCoat(material, coatId as GspCoatId);
  const geometries: THREE.BufferGeometry[] = [];
  const joints: Record<string, THREE.Bone> = {};
  const joint = (name: string, parent: THREE.Object3D, position: Point) => {
    const group = new THREE.Bone(); group.name = name; group.position.set(...position); parent.add(group); joints[name] = group; return group;
  };
  const surface = (parent: THREE.Object3D, author: (s: Surface) => void, softness = 0, ringSides = sides) => {
    const s = new Surface(ringSides); author(s); const geometry = s.geometry(faceted ? 0 : softness); geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const body = joint('body', root, [0, 0, 0]);
  // Behind the ribcage the trunk is compressed toward a square outline: a
  // GSP is barely longer than tall, a setter a little longer, and a Griffon
  // slightly longer than tall, with a moderate tuck-up.
  const rear = (z: number) => z < -.05 ? -.05 + (z + .05) * (setter ? .96 : griffon ? .945 : .915) : z;
  const tuck = setter ? .092 : griffon ? .085 : .079;
  // The Griffon's harsh coat stands off the neck a little.
  const coatNeck = griffon ? 1.05 : 1;
  const torsoMesh = surface(body, s => s.loft(([
    // A continuous ribcage tapers into a tucked loin, a short sloping croup
    // and a high tail set; the withers are the top of the outline.
    [0,.522,-.39,.040,.064,.062], [0,.526,-.355,.070,.086,.088], [0,.532,-.30,.093,.096,.104],
    [0,.546,-.23,.090,.086,.100], [0,.552,-.16,.082,.086,tuck], [0,.536,-.08,.093,.105,.108],
    [0,.52,0,.112,.13,.14], [0,.512,.08,.121,.143,.162], [0,.516,.16,.12,.152,.172],
  ] as Ring[]).map(([x, y, z, w, h, u], i) => {
    // A harsh coat breaks the clean outline a little, ring by ring.
    const rough = griffon ? (k: number) => 1 + .04 * Math.sin(i * 12.9898 + k * 78.233) : () => 1;
    return [x, y, rear(z), w * rough(1), h * rough(2), (u ?? h) * rough(3)] as Ring;
  }).concat([
    [0,.531,.23,.099,.132,.173], [0,.55,.25,.092,.12,.15],
    // A clean, slightly arched neck carries the head well above the withers.
    ...([[0,.59,.268,.082,.098,.13], [0,.63,.29,.068,.08,.09],
    [0,.662,.312,.057,.063,.062], [0,.69,.335,.048,.05,.052],
    [0,.703,.357,.042,.04,.045], [0,.707,.375,.037,.034,.038]] as Ring[]).map(([x, y, z, w, h, u]) => [x, y, z, w * coatNeck, h * coatNeck, (u ?? h) * coatNeck] as Ring),
  ]), coat), .88);
  const neck = joint('neck', body, [0,.51,.245]);
  torsoMesh.userData.neckJoint = neck;
  const head = joint('head', neck, [0,.19,.105]);
  const jaw = joint('jaw', head, [0,-.027,.026]);
  const leftEar = joint('ear-left', head, [-.052,.019,-.012]);
  const rightEar = joint('ear-right', head, [.052,.019,-.012]);
  // The faceted head uses the coarser authored surface: broader planes that
  // match the body's.
  const headDetail = faceted ? 'lite' : detail;
  const headGeometry = setter ? createGeneratedSetterHead(headDetail, coatId as EnglishSetterCoatId, faceted)
    : griffon ? createGeneratedGriffonHead(headDetail, coatId as GriffonCoatId, faceted)
    : createGeneratedGspHead(headDetail, coatId as GspCoatId, faceted);
  geometries.push(headGeometry);
  const headMesh = new THREE.Mesh(headGeometry, material);
  headMesh.castShadow = true; headMesh.receiveShadow = true;
  headMesh.userData.headSkinJoints = [head, jaw, leftEar, rightEar];
  head.add(headMesh);
  const tail = joint('tail', body, [0,.576,rear(-.366)]);
  if (setter) {
    // A long, tapering setter tail carried near the topline. Its underside
    // carries a flag of feathering that is longest through the middle third.
    surface(tail, s => s.loft([[0,-.004,-.42,.002,.002,.006],[0,.002,-.37,.005,.005,.030],[0,.007,-.31,.007,.007,.052],
      [0,.010,-.24,.009,.009,.064],[0,.011,-.17,.011,.011,.058],[0,.009,-.10,.013,.013,.042],[0,.005,-.045,.016,.017,.026],[0,0,0,.020,.022,.022]], WHITE), .85);
  } else if (griffon) {
    // Docked by about a third, and as rough as the coat: thicker and blunt.
    surface(tail, s => s.loft([[0,.018,-.27,.008,.009],[0,.022,-.226,.013,.014],[0,.016,-.14,.017,.018],[0,.007,-.06,.021,.022],[0,0,0,.024,.026]], coat), .8);
  } else surface(tail, s => s.loft([[0,.017,-.25,.005,.006],[0,.02,-.205,.009,.01],[0,.014,-.125,.014,.015],[0,.006,-.055,.019,.02],[0,0,0,.022,.024]], WHITE), .8);
  // Hanging hair: thin vertical blades with a scalloped lower edge read as
  // hair, not bulk. Each path point is [x, y, z, hang] in the parent's frame.
  const fringe = (parent: THREE.Object3D, path: readonly (readonly [number, number, number, number])[], x: number, thickness: number, top = .012) => {
    const rings: Ring[] = [];
    for (let k = 0; k < path.length - 1; k++) for (let j = 0; j < 2; j++) {
      const u = j / 2, a = path[k], b = path[k + 1], i = k * 2 + j;
      const hang = THREE.MathUtils.lerp(a[3], b[3], u) * (i % 2 ? .88 : 1.05);
      rings.push([x + THREE.MathUtils.lerp(a[0], b[0], u), THREE.MathUtils.lerp(a[1], b[1], u), THREE.MathUtils.lerp(a[2], b[2], u), thickness, top, hang]);
    }
    const last = path[path.length - 1]; rings.push([x + last[0], last[1], last[2], thickness, top, last[3]]);
    // A diamond cross-section is enough for a thin hanging blade.
    surface(parent, s => s.loft(rings, coat), .55, 4);
  };
  if (setter) {
    // Brisket feathering hangs below the sternum between the elbows, and a
    // light fringe follows each side of the belly toward the flank.
    fringe(body, [[0,.43,-.04,.01],[0,.395,.03,.03],[0,.372,.09,.046],[0,.364,.15,.052],[0,.37,.2,.04],[0,.39,.235,.02],[0,.43,.262,.008]], 0, .034);
    for (const side of [-1, 1]) fringe(body, [[0,.478,rear(-.20),.012],[0,.462,rear(-.14),.030],[0,.438,rear(-.07),.042],[0,.414,0,.048],[0,.394,.06,.036],[0,.386,.10,.012]], side * .040, .013);
  }
  if (griffon) {
    // The harsh coat leaves a short, ragged edge under the chest, not a
    // setter's feathering.
    fringe(body, [[0,.43,-.04,.006],[0,.396,.03,.017],[0,.374,.09,.024],[0,.366,.15,.026],[0,.372,.2,.019],[0,.392,.235,.011],[0,.43,.262,.005]], 0, .03);
    // Furnishings. Eyebrows: a short, bushy wedge from the brow ridge out
    // over each eye.
    for (const side of [-1, 1]) surface(head, s => s.loft([[side*.026,.045,.048,.012,.006,.006],[side*.030,.043,.064,.010,.006,.005],[side*.033,.040,.079,.003,.002,.002]], brow), .5, 4);
    // The moustache and beard belong to the head surface, skinned across the
    // head and jaw (generatedGspHead.ts).
  }
  const paws: THREE.Bone[] = [];
  for (let i = 0; i < 4; i++) {
    const fore = i < 2, side = i % 2 ? 1 : -1, prefix = `${fore ? 'front' : 'hind'}-${side < 0 ? 'left' : 'right'}`;
    const upper = joint(prefix, body, [side*.068,.515,fore ? .205 : rear(-.292)]);
    const upperEnd: Point = [0,fore ? -.195 : -.205,fore ? -.055 : .090];
    const lowerEnd: Point = [0,fore ? -.25 : -.17,fore ? .062 : -.110];
    const distalEnd: Point = [0,fore ? -.048 : -.117,fore ? .012 : .016];
    const lower = joint(prefix+'-lower', upper, upperEnd);
    const distal = joint(prefix+'-distal', lower, lowerEnd);
    const paw = joint(prefix+'-paw', distal, distalEnd); paws.push(paw);
    // A continuous leg envelope spans the joints. Skin weights bend the
    // envelope; separate rigid tubes would expose caps during a stride.
    const wristY = upperEnd[1] + lowerEnd[1], wristZ = upperEnd[2] + lowerEnd[2];
    const ankleY = wristY + distalEnd[1], ankleZ = wristZ + distalEnd[2];
    // Setter furnishings: feathering behind the forearm and full breeches
    // down the back of the thigh deepen only the rear contour of the limb.
    const fb = setter ? (fore ? [1.1, 1.6, 1.9, 1.55, 1.12] : [1.28, 1.25, 1.4, 1.48, 1.32])
      : griffon ? (fore ? [1.04, 1.22, 1.32, 1.22, 1.06] : [1.14, 1.12, 1.2, 1.26, 1.14]) : [1, 1, 1, 1, 1];
    const at = (t: number): [number, number] => [upperEnd[1] + lowerEnd[1] * t, upperEnd[2] + lowerEnd[2] * t];
    const [lowY, lowZ] = at(.62), [highY, highZ] = at(.2);
    // Anatomical envelope, paw to withers/croup. Fore: pastern, wrist knob,
    // tapering cannon, forearm muscle below the elbow, olecranon, upper arm,
    // point of shoulder, scapula. Hind: metatarsus, point of hock, gaskin,
    // stifle, first thigh and hip. Setter feathering deepens the rear edge.
    const legMesh = surface(upper, s => s.loft(fore ? [
      [0,ankleY-.004,ankleZ,.0185,.019,.02],
      [0,(ankleY+wristY)*.5,(ankleZ+wristZ)*.5,.018,.019,.021],
      [0,wristY,wristZ,.022,.025*fb[0],.023],
      [0,wristY+.032,wristZ-.004,.0195,.022*fb[1],.022],
      [0,lowY,lowZ,.021,.024*fb[2],.025],
      [0,highY,highZ,.028,.03*fb[3],.034],
      [0,upperEnd[1],upperEnd[2],.031,.047*fb[4],.036],
      [side*.006,upperEnd[1]*.6,upperEnd[2]*.6,.04,.058,.056],
      [side*.008,-.054,.016,.046,.062,.074],
      [side*.003,.008,-.036,.041,.062,.065],
      [0,.062,-.06,.025,.037],
    ] : [
      [0,ankleY-.004,ankleZ,.018,.019,.02],
      [0,(ankleY+wristY)*.5,(ankleZ+wristZ)*.5,.0175,.02,.019],
      [0,wristY,wristZ-.004,.02,.035*fb[0],.021],
      [0,wristY+.03,wristZ,.019,.026*fb[1],.02],
      [0,lowY,lowZ,.023,.037*fb[2],.026],
      [0,highY,highZ,.03,.046*fb[3],.031],
      [0,upperEnd[1],upperEnd[2],.036,.05,.044],
      [side*.006,upperEnd[1]*.64,.052,.056,.082*fb[4],.07],
      [side*.008,-.054,.016,.062,.096,.07],
      [side*.003,.008,-.006,.052,.07,.055],
      [0,.062,-.014,.025,.037],
    ], coat, 'y'), .9);
    legMesh.userData.skinChain = [upper, lower, distal, paw];
    // A compact, arched foot: knuckles rise over the pads instead of a flat
    // slipper, and the toes close into a rounded front.
    surface(paw, s => s.loft([[0,.003,-.024,.012,.012],[0,.007,-.004,.019,.022,.020],
      [0,.005,.018,.022,.024,.024],[0,.002,.035,.021,.019,.021],[0,-.003,.049,.016,.013,.016],[0,-.005,.057,.008,.007,.008]], coat), .78);
  }
  // Bake bind-space geometry into one draw call, retaining code-authored bones.
  root.updateMatrixWorld(true);
  const bones = Object.values(joints), positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [], weights: number[] = [], occlusion: number[] = [];
  const meshes: THREE.Mesh[] = []; root.traverse(node => { if (node instanceof THREE.Mesh) meshes.push(node); });
  for (const mesh of meshes) {
    const geometry = mesh.geometry, pos = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), color = geometry.getAttribute('color');
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const owner = mesh.parent as THREE.Bone;
    const chain = mesh.userData.skinChain as THREE.Bone[] | undefined;
    const chainY = chain?.map(bone => bone.getWorldPosition(new THREE.Vector3()).y);
    const chainZ = chain?.[0].getWorldPosition(new THREE.Vector3()).z;
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);
      const n = new THREE.Vector3().fromBufferAttribute(normal,i).applyMatrix3(normalMatrix).normalize();
      positions.push(p.x,p.y,p.z); normals.push(n.x,n.y,n.z); colors.push(color.getX(i),color.getY(i),color.getZ(i));
      // Baked contact occlusion from bind-pose shape: undersides of the body
      // and neck, the inner faces of the limbs where they meet the trunk, and
      // the armpit/groin creases. It models form without a runtime AO pass.
      {
        const down = THREE.MathUtils.smoothstep(-n.y, .15, .95);
        const inward = Math.max(0, -n.x * Math.sign(p.x || 1));
        const trunk = THREE.MathUtils.smoothstep(p.y, .26, .42);
        const crease = mesh.userData.skinChain ? THREE.MathUtils.smoothstep(p.y, .3, .46) * inward : 0;
        const sole = 1 - THREE.MathUtils.smoothstep(p.y, .005, .03);
        occlusion.push(THREE.MathUtils.clamp(1 - down * (.12 + .2 * trunk) - inward * .07 - crease * .16 - sole * .12, .55, 1));
      }
      let first = bones.indexOf(owner), second = first, blend = 0;
      if (mesh.userData.neckJoint) {
        // Keep the sternum on the chest while the throat above it follows
        // the cervical column. The nape begins turning above the shoulder;
        // the upper throat reaches full neck weight before meeting the head.
        second = bones.indexOf(mesh.userData.neckJoint);
        const nape = THREE.MathUtils.smoothstep(p.z, .2, .33)
          * THREE.MathUtils.smoothstep(p.y, .5, .68);
        const throat = THREE.MathUtils.smoothstep(p.z, .25, .345);
        blend = Math.max(nape, throat);
      }
      if (chain && chainY) {
        // The shoulder/hip surface stays attached to the torso while the
        // limb swings beneath it; a rigid proximal cap pokes through the back.
        first=bones.indexOf(body);second=bones.indexOf(chain[0]);
        if(chain[0].name.startsWith('front-')) {
          // Gently favor the ribcage on the upper/rear scapular plane,
          // retaining humeral support across the breast when a foreleg folds.
          const attachmentY=chainY[0]+.022+(p.z-chainZ!)*.35;
          const levelAttachment=THREE.MathUtils.smoothstep(chainY[0]+.035-p.y,0,.115);
          const scapularAttachment=THREE.MathUtils.smoothstep(attachmentY-p.y,0,.095);
          blend=THREE.MathUtils.lerp(levelAttachment,scapularAttachment,.45);
        } else blend=THREE.MathUtils.smoothstep(chainY[0]+.035-p.y,0,.115);
        // Narrow transition bands retain muscle volume while closing seams.
        for (let k=1;k<chain.length;k++) {
          const band = k === 1 ? .045 : .025;
          if (p.y < chainY[k] + band) {
            first = bones.indexOf(chain[k-1]); second = bones.indexOf(chain[k]);
            blend = THREE.MathUtils.smoothstep(chainY[k]+band-p.y,0,band*2);
          }
        }
      }
      const headJoints = mesh.userData.headSkinJoints as THREE.Bone[] | undefined;
      if (headJoints) {
        first = bones.indexOf(headJoints[0]);
        second = bones.indexOf(headJoints[geometry.getAttribute('headBone').getX(i)]);
        blend = geometry.getAttribute('headWeight').getX(i);
        if (blend > .5) { [first, second] = [second, first]; blend = 1 - blend; }
      }
      indices.push(first,second,0,0); weights.push(1-blend,blend,0,0);
    }
    mesh.removeFromParent(); geometry.dispose();
  }
  geometries.length = 0;
  const skinGeometry = new THREE.BufferGeometry();
  skinGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  skinGeometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  skinGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  skinGeometry.setAttribute('occlusion',new THREE.Float32BufferAttribute(occlusion,1));
  skinGeometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
  skinGeometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  geometries.push(skinGeometry);
  const skin = new THREE.SkinnedMesh(skinGeometry,material); skin.name = 'gsp-surface'; skin.castShadow = true; skin.receiveShadow = true;
  const skeleton = new THREE.Skeleton(bones); root.add(skin); skin.bind(skeleton);
  // Runtime uses a conservative local envelope; do not reskin every vertex
  // on the CPU merely to update culling bounds each animation frame.
  if(live){skin.boundingBox=new THREE.Box3(new THREE.Vector3(-.8,-.4,-1),new THREE.Vector3(.8,1.3,1));skin.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,.4,0),1.6);}
  const rest = Object.values(joints).map(node => ({ node, position: node.position.clone(), rotation: node.quaternion.clone() }));
  // Keep the elbow bend on the same side as the gait/ground solver. The
  // former positive lower-arm fold forced a reversal during release.
  const liftPaw = (t: number) => {
    joints['front-left'].rotation.x = .40 * t;
    joints['front-left-lower'].rotation.x = -1.60 * t;
    joints['front-left-distal'].rotation.x = 1.90 * t;
  };
  /** Over the current pose, raise only the pointing forefoot this far (0..1). */
  const liftPointingPaw = (t: number) => {
    liftPaw(THREE.MathUtils.clamp(t, 0, 1));
    root.updateMatrixWorld(true); skeleton.update();
  };
  const setPose = (pose: 'stand' | 'point', presence = 1) => {
    for (const {node,position,rotation} of rest) { node.position.copy(position); node.quaternion.copy(rotation); }
    if (pose === 'point') {
      const t = THREE.MathUtils.clamp(presence, 0, 1);
      // Reach through the neck with a nearly level muzzle and a lifted,
      // still tail. The feet remain controlled by the field contact solver.
      // A setter stands up to its bird: the neck carried higher, the head
      // up and the muzzle level down the scent line.
      // A Griffon stands firm between the two, head a little high.
      neck.rotation.x = (setter ? .02 : griffon ? .1 : .16) * t;
      head.rotation.x = (setter ? -.06 : griffon ? -.12 : -.16) * t;
      neck.position.z += .045 * t;
      liftPaw(t);
      // Reference stance: the hind legs brace behind the pelvis rather
      // than stacking both paws under it. Slight asymmetry avoids a pose stamp.
      joints['hind-left'].rotation.x = .32 * t;
      joints['hind-right'].rotation.x = .22 * t;
      // A setter holds a high, still flag on point, near twelve o'clock; the
      // docked GSP tail stays firm just above the topline, and the Griffon's
      // nearly level with it.
      tail.rotation.x = (setter ? 1.2 : griffon ? .08 : .20) * t;
    }
    root.updateMatrixWorld(true); skeleton.update(); if(!live){skin.computeBoundingBox(); skin.computeBoundingSphere();}
  };
  const locomotion = createLocomotionPose(), solution = createTwoBoneSolution();
  const chains = paws.map(paw => {
    const distal = paw.parent as THREE.Bone, lower = distal.parent as THREE.Bone, upper = lower.parent as THREE.Bone;
    return { paw,distal,lower,upper,
      upperLength:lower.position.length(),lowerLength:distal.position.length(),distalLength:paw.position.length(),
      upperAngle:Math.atan2(lower.position.z,-lower.position.y),lowerAngle:Math.atan2(distal.position.z,-distal.position.y),distalAngle:Math.atan2(paw.position.z,-paw.position.y),
      footZ:lower.position.z+distal.position.z+paw.position.z,
    };
  });
  /** Ground-relative targets; travel must advance by the returned stride per
   * cycle. A bound may carry its own stride (m), set by the leap it makes. */
  const setLocomotion = (gait: LocomotionGait, cycle: number, boundStride = BOUND_STRIDE) => {
    for (const {node,position,rotation} of rest) { node.position.copy(position); node.quaternion.copy(rotation); }
    writeLocomotionPose(gait,cycle,'left',locomotion,gait==='bound'?boundStride/BOUND_STRIDE:1,gait==='gallop'?GENERATED_GALLOP_TOUCHDOWN:undefined);
    const strideScale=gait==='bound'?1:GENERATED_STRIDE_SCALE[gait];
    body.position.y = (gait==='walk'?-.035:gait==='gallop'||gait==='bound'?-.09:-.06) + locomotion.bodyY*.25;
    let clamped = 0;
    chains.forEach((leg,i) => {
      const foot=locomotion.feet[i], footY=.023+foot.lift;
      const shoulderTravel=i<2?locomotion.scapulaZ[i]*strideScale:0;
      leg.upper.position.z+=shoulderTravel;
      solveTwoBone(footY+leg.distalLength-leg.upper.position.y-body.position.y,leg.footZ+foot.z*strideScale-shoulderTravel,leg.upperLength,leg.lowerLength,i<2?-1:1,solution);
      if(solution.clamped)clamped++;
      leg.upper.rotation.x=leg.upperAngle-solution.upper;
      leg.lower.rotation.x=leg.lowerAngle-solution.lowerAbsolute-leg.upper.rotation.x;
      leg.distal.rotation.x=leg.distalAngle-leg.upper.rotation.x-leg.lower.rotation.x;
      leg.paw.rotation.x=-leg.upper.rotation.x-leg.lower.rotation.x-leg.distal.rotation.x;
    });
    // The raised standing carriage lowers into a working reach with speed.
    // A bounding dog carries its head up to see over the cover it leaps.
    neck.rotation.x=gait==='gallop'?.36:gait==='canter'?.29:gait==='trot'?.22:gait==='bound'?.12:.18;head.rotation.x=gait==='bound'?-.16:-.1;
    root.updateMatrixWorld(true);skeleton.update();if(!live){skin.computeBoundingBox();skin.computeBoundingSphere();}
    return {stride:locomotion.stride*strideScale,feet:locomotion.feet,clamped,rise:locomotion.rise,pitch:gait==='bound'?locomotion.chestPitch:0};
  };
  /** Submerged paddling targets: no stance phase or planted ground plane. */
  const setSwimming = (cycle: number) => {
    for (const {node,position,rotation} of rest) { node.position.copy(position); node.quaternion.copy(rotation); }
    body.position.y = -.025;
    let clamped = 0;
    chains.forEach((leg,i) => {
      const phase = (cycle + [0, .5, .58, .08][i]) * Math.PI * 2;
      const reach = Math.sin(phase) * (i < 2 ? .105 : .075);
      const footY = .14 + (1 + Math.cos(phase)) * .055;
      solveTwoBone(footY + leg.distalLength - leg.upper.position.y - body.position.y,
        leg.footZ + reach, leg.upperLength, leg.lowerLength, i < 2 ? -1 : 1, solution);
      if (solution.clamped) clamped++;
      leg.upper.rotation.x = leg.upperAngle - solution.upper;
      leg.lower.rotation.x = leg.lowerAngle - solution.lowerAbsolute - leg.upper.rotation.x;
      leg.distal.rotation.x = leg.distalAngle - leg.upper.rotation.x - leg.lower.rotation.x;
      leg.paw.rotation.x = -.18 * Math.sin(phase) - leg.upper.rotation.x - leg.lower.rotation.x - leg.distal.rotation.x;
    });
    neck.rotation.x = -.08; head.rotation.x = -.04;
    tail.rotation.x = -.08;
    root.updateMatrixWorld(true); skeleton.update();
    if (!live) { skin.computeBoundingBox(); skin.computeBoundingSphere(); }
    return clamped;
  };
  const hip=new THREE.Vector3(),wrist=new THREE.Vector3(),direction=new THREE.Vector3(),bendAxis=new THREE.Vector3(),elbow=new THREE.Vector3(),aim=new THREE.Vector3(),normalLocal=new THREE.Vector3();
  const inverse=new THREE.Quaternion(),parentWorld=new THREE.Quaternion(),desiredWorld=new THREE.Quaternion(),rootWorld=new THREE.Quaternion();
  const up=new THREE.Vector3(0,1,0),forward=new THREE.Vector3(0,0,1);
  /** Targets and normals are world-space; all limb joints retain their authored lengths. */
  const solveWorldFeet=(targets: readonly THREE.Vector3[], normals: readonly THREE.Vector3[], posedFoot = -1)=>{
    root.updateMatrixWorld(true);body.getWorldQuaternion(parentWorld);inverse.copy(parentWorld).invert();root.getWorldQuaternion(rootWorld);
    let clamped=0;
    chains.forEach((leg,i)=>{
      if (i === posedFoot) return;
      hip.copy(leg.upper.position);
      wrist.copy(targets[i]).addScaledVector(normals[i],leg.distalLength);body.worldToLocal(wrist);
      direction.copy(wrist).sub(hip);const raw=direction.length();direction.normalize();
      const distance=THREE.MathUtils.clamp(raw,Math.abs(leg.upperLength-leg.lowerLength)+1e-5,leg.upperLength+leg.lowerLength-1e-5);
      if(Math.abs(distance-raw)>1e-5)clamped++;
      const along=(leg.upperLength**2-leg.lowerLength**2+distance**2)/(2*distance);
      const height=Math.sqrt(Math.max(0,leg.upperLength**2-along**2));
      bendAxis.copy(forward).addScaledVector(direction,-forward.dot(direction));if(bendAxis.lengthSq()<1e-8)bendAxis.copy(up);bendAxis.normalize();
      elbow.copy(direction).multiplyScalar(along).addScaledVector(bendAxis,(i<2?-1:1)*height);
      leg.upper.quaternion.setFromUnitVectors(aim.copy(leg.lower.position).normalize(),wrist.copy(elbow).normalize());
      aim.copy(direction).multiplyScalar(distance).sub(elbow).applyQuaternion(inverse.copy(leg.upper.quaternion).invert()).normalize();
      leg.lower.quaternion.setFromUnitVectors(bendAxis.copy(leg.distal.position).normalize(),aim);
      normalLocal.copy(normals[i]).applyQuaternion(inverse.copy(parentWorld).invert());
      inverse.copy(leg.upper.quaternion).multiply(leg.lower.quaternion).invert();
      aim.copy(normalLocal).negate().applyQuaternion(inverse);
      leg.distal.quaternion.setFromUnitVectors(bendAxis.copy(leg.paw.position).normalize(),aim);
      leg.distal.updateWorldMatrix(true,false);leg.distal.getWorldQuaternion(inverse).invert();
      desiredWorld.setFromUnitVectors(up,normals[i]).multiply(rootWorld);
      leg.paw.quaternion.copy(inverse).multiply(desiredWorld);
    });
    root.updateMatrixWorld(true);skeleton.update();if(!live){skin.computeBoundingBox();skin.computeBoundingSphere();}
    return clamped;
  };
  /** Lower the supported body only as far as required by finite limb reach. */
  const fitBodyToFeet=(targets:readonly THREE.Vector3[],normals:readonly THREE.Vector3[],posedFoot = -1)=>{
    root.updateMatrixWorld(true);let allowed=body.position.y;
    chains.forEach((leg,i)=>{
      if (i === posedFoot) return;
      wrist.copy(targets[i]).addScaledVector(normals[i],leg.distalLength);root.worldToLocal(wrist);
      // A supported torso may pitch or bank. Measure the actual hip in the
      // root frame rather than assuming that every shoulder stays upright.
      leg.upper.getWorldPosition(hip);root.worldToLocal(hip);
      const dx=wrist.x-hip.x,dz=wrist.z-hip.z;
      const length=leg.upperLength+leg.lowerLength-.006;
      const vertical=Math.sqrt(Math.max(0,length*length-dx*dx-dz*dz));
      allowed=Math.min(allowed,body.position.y+wrist.y+vertical-hip.y);
    });
    body.position.y=Math.max(-.14,allowed);root.updateMatrixWorld(true);return body.position.y;
  };
  setPose('stand');
  return { root, joints, paws, setPose, liftPointingPaw, setLocomotion, setSwimming, solveWorldFeet, fitBodyToFeet, material, skin, skeleton,
    stats: { triangles: geometries.reduce((n,g) => n + g.getAttribute('position').count / 3,0), meshes: geometries.length, materials: 1, geometryBytes: geometries.reduce((n,g) => n + Object.values(g.attributes).reduce((s,a) => s + a.array.byteLength,0),0) },
    dispose() { geometries.forEach(g => g.dispose()); material.dispose(); skeleton.dispose(); root.removeFromParent(); },
  };
}
