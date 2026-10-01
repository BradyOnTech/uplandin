import type * as THREE from 'three';

/**
 * Ambient-occlusion weight, written to the scene's alpha and read by the
 * screen effects (postEffects.ts): how much occlusion a surface takes and
 * casts. Solid surfaces keep three's opaque alpha of 1. Grass, sedge, forbs
 * and stubble already darken their own roots, and depth-based occlusion over
 * dense thin blades reads as dirt, so foliage writes less. The canvas has an
 * alpha channel (three always requests one), so the weight is written only
 * while the screen effects render the scene into their own target; the
 * plain render (Lightweight, or `?look=off`) stays opaque.
 */
export const OCCLUSION_WEIGHT = {
  /** Dense grass swards, turf and sedge. */
  grass: .2,
  /** Tall cover stands (cattail, switchgrass): enough to keep their depth. */
  cover: .45,
} as const;

/** 1 while postEffects.ts renders the scene into its target, else 0. */
export const OCCLUSION_WEIGHT_ACTIVE = { value: 0 };

/**
 * Make a material's shader write an occlusion weight; call it from
 * onBeforeCompile. The weight is a uniform, so materials that share a
 * compiled program can still differ.
 */
export function writeOcclusionWeight(shader: { fragmentShader: string; uniforms: Record<string, THREE.IUniform> }, weight: number): void {
  shader.uniforms.uOcclusionWeight = { value: Math.min(1, Math.max(0, weight)) };
  shader.uniforms.uOcclusionWeightActive = OCCLUSION_WEIGHT_ACTIVE;
  const declare = 'uniform float uOcclusionWeight;\nuniform float uOcclusionWeightActive;';
  // A chained onBeforeCompile may already have written it: only the value changes.
  if (shader.fragmentShader.includes(declare)) return;
  const common = '#include <common>';
  shader.fragmentShader = shader.fragmentShader.includes(common)
    ? shader.fragmentShader.replace(common, `${common}\n${declare}`)
    : `${declare}\n${shader.fragmentShader}`;
  const write = 'gl_FragColor.a = mix(1.0, uOcclusionWeight, uOcclusionWeightActive);';
  const last = '#include <dithering_fragment>';
  shader.fragmentShader = shader.fragmentShader.includes(last)
    ? shader.fragmentShader.replace(last, `${last}\n\t${write}`)
    : shader.fragmentShader.replace(/\}\s*$/, `\t${write}\n}`);
}
