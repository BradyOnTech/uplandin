import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { OCCLUSION_WEIGHT, OCCLUSION_WEIGHT_ACTIVE, writeOcclusionWeight } from '../src/three/foliageMask';
import { LOOKS } from '../src/three/looks';
import { PostEffects } from '../src/three/postEffects';

const lambert = () => ({ fragmentShader: THREE.ShaderLib.lambert.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> });

describe('foliage occlusion weight', () => {
  it('writes the weight as the last word on alpha, only while the screen effects are active', () => {
    const shader = lambert();
    writeOcclusionWeight(shader, OCCLUSION_WEIGHT.grass);
    const source = shader.fragmentShader;
    expect(source).toContain('uniform float uOcclusionWeight;');
    expect(source.indexOf('uniform float uOcclusionWeight;')).toBeGreaterThan(source.indexOf('#include <common>'));
    const write = source.indexOf('gl_FragColor.a = mix(1.0, uOcclusionWeight, uOcclusionWeightActive);');
    expect(write).toBeGreaterThan(source.indexOf('#include <dithering_fragment>'));
    expect(write).toBeGreaterThan(source.indexOf('#include <opaque_fragment>'));
    expect(shader.uniforms.uOcclusionWeight.value).toBe(OCCLUSION_WEIGHT.grass);
    // Every material shares the one switch the screen effects flip.
    expect(shader.uniforms.uOcclusionWeightActive).toBe(OCCLUSION_WEIGHT_ACTIVE);
    expect(OCCLUSION_WEIGHT_ACTIVE.value).toBe(0);
  });

  it('survives a chained onBeforeCompile: one declaration, the last weight wins', () => {
    const shader = lambert();
    writeOcclusionWeight(shader, OCCLUSION_WEIGHT.cover);
    writeOcclusionWeight(shader, OCCLUSION_WEIGHT.grass);
    expect(shader.fragmentShader.split('uniform float uOcclusionWeight;').length).toBe(2);
    expect(shader.fragmentShader.split('gl_FragColor.a =').length).toBe(2);
    expect(shader.uniforms.uOcclusionWeight.value).toBe(OCCLUSION_WEIGHT.grass);
  });

  it('keeps foliage lighter than solid ground, and cover between grass and solid', () => {
    expect(OCCLUSION_WEIGHT.grass).toBeGreaterThan(0);
    expect(OCCLUSION_WEIGHT.grass).toBeLessThan(OCCLUSION_WEIGHT.cover);
    expect(OCCLUSION_WEIGHT.cover).toBeLessThan(1);
  });

  it('turns the weight on only for the scene render into the effects target', () => {
    const look = { ...LOOKS.crisp, bloom: { ...LOOKS.crisp.bloom, strength: 0 } };
    const effects = new PostEffects(look);
    effects.setSize(64, 36);
    const seen: { target: unknown; active: number }[] = [];
    let current: unknown = null;
    const renderer = {
      toneMappingExposure: 1,
      getRenderTarget: () => current,
      setRenderTarget: (target: unknown) => { current = target; },
      render: vi.fn(() => { seen.push({ target: current, active: OCCLUSION_WEIGHT_ACTIVE.value }); }),
    } as unknown as THREE.WebGLRenderer;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70, 16 / 9, .05, 1600);
    effects.render(renderer, scene, camera);
    // The scene render comes first with the weight on; every screen pass runs with it off.
    expect(seen[0].active).toBe(1);
    expect(seen.slice(1).every(pass => pass.active === 0)).toBe(true);
    expect(seen.length).toBeGreaterThan(3);
    expect(current).toBeNull();
    expect(OCCLUSION_WEIGHT_ACTIVE.value).toBe(0);
    // A failing scene render still leaves the canvas opaque for the plain path.
    const failing = { ...renderer, render: () => { throw new Error('lost context'); } } as unknown as THREE.WebGLRenderer;
    expect(() => effects.render(failing, scene, camera)).toThrow('lost context');
    expect(OCCLUSION_WEIGHT_ACTIVE.value).toBe(0);
    effects.dispose();
  });
});
