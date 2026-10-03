import * as THREE from 'three';

/**
 * Sample vertex colours inside the triangle (centroid interpolation).
 *
 * The field renders multisampled. A pixel that a triangle only partly covers
 * is shaded once, at the pixel centre, and that centre can lie outside the
 * triangle; plain interpolation then extrapolates the vertex colour to it.
 * A thin strip whose alpha runs from 0 at its edges to about .5 down the
 * middle (the worn tracks on Chukar Ridge and Quail Fields, Cattail's wet
 * margins, Sharptail's ruts) turns into sub-pixel slivers far off, where the
 * extrapolated alpha ran into the hundreds. Blending then wrote single pixels
 * at up to 16,000 times the scene's brightness, and bloom spread each into a
 * flash of white light near the horizon: the "glare" of the October 2026
 * playtest, in about half of all morning frames on Quail Fields. Centroid
 * sampling keeps every sample inside its triangle.
 *
 * Patches three's shared shader chunks, so it must run before any material
 * compiles (the engine calls it as it builds the renderer). Returns false,
 * leaving the chunks alone, if three no longer declares the varying as
 * expected; the test suite fails on that.
 */
const PLAIN = 'varying vec4 vColor;';
const CENTROID = 'centroid varying vec4 vColor;';
export const VERTEX_COLOR_CHUNKS = ['color_pars_vertex', 'color_pars_fragment'] as const;

export function sampleVertexColorsInside(chunks: Record<string, string> = THREE.ShaderChunk as unknown as Record<string, string>): boolean {
  // Both stages must agree on the qualifier, so patch both or neither.
  if (!VERTEX_COLOR_CHUNKS.every(name => chunks[name]?.includes(PLAIN))) return false;
  for (const name of VERTEX_COLOR_CHUNKS) {
    if (!chunks[name].includes(CENTROID)) chunks[name] = chunks[name].replace(PLAIN, CENTROID);
  }
  return true;
}
