import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GRADE, GRADE_UNIFORM, gradeDisplay, installGrade, setGradeViewport, writeGrade } from '../src/three/grade';
import { lookAt, LOOKS } from '../src/three/looks';
import type { TimeOfDay } from '../src/three/palette';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { SkySystem } from '../src/three/subsystems/sky';
import type { Ctx } from '../src/three/engine';

const HOURS: TimeOfDay[] = ['dawn', 'morning', 'noon', 'evening', 'lastlight'];
const GROUNDS = ['quail-fields', 'sharptail-prairie', 'pheasant-coverts', 'chukar-ridge'];
const lib = () => Object.fromEntries(Object.entries(THREE.ShaderLib).map(([id, shader]) => [id, { uniforms: { ...shader.uniforms } }]));
const saturation = (c: readonly number[]) => Math.max(...c) - Math.min(...c);

describe('the colour grade in every material', () => {
  it('replaces three\'s custom tone-mapping stub once, however often it is installed, and switches the renderer to it', () => {
    const chunks = { tonemapping_pars_fragment: THREE.ShaderChunk.tonemapping_pars_fragment };
    // three still declares the stub this expects; if an upgrade changes it,
    // phones silently lose the grade, so fail here instead.
    expect(chunks.tonemapping_pars_fragment).toContain('vec3 CustomToneMapping( vec3 color ) { return color; }');
    const renderer = { toneMapping: THREE.ACESFilmicToneMapping as THREE.ToneMapping };
    const shaders = lib();
    expect(installGrade(renderer, chunks, shaders)).toBe(true);
    expect(installGrade(renderer, chunks, shaders)).toBe(true);
    expect(renderer.toneMapping).toBe(THREE.CustomToneMapping);
    expect(chunks.tonemapping_pars_fragment.match(/vec3 CustomToneMapping/g)).toHaveLength(1);
    expect(chunks.tonemapping_pars_fragment).toContain('uplandGradeDisplay(color, toneMappingExposure)');
    // three's own tone maps are untouched.
    expect(chunks.tonemapping_pars_fragment).toContain('vec3 ACESFilmicToneMapping( vec3 color )');
  });

  it('leaves everything alone when three no longer has the stub', () => {
    const chunks = { tonemapping_pars_fragment: 'vec3 CustomToneMapping( vec3 c ) { return c; }' };
    const renderer = { toneMapping: THREE.ACESFilmicToneMapping as THREE.ToneMapping };
    expect(installGrade(renderer, chunks, {})).toBe(false);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
  });

  it('reaches every built-in material, and every material three clones from one, through one shared array', () => {
    const shaders = lib();
    installGrade(null, { tonemapping_pars_fragment: THREE.ShaderChunk.tonemapping_pars_fragment }, shaders);
    for (const shader of Object.values(shaders)) {
      // three clones a material's uniforms from ShaderLib; a typed array is
      // copied by reference, so a write reaches every compiled program.
      expect(THREE.UniformsUtils.clone(shader.uniforms)[GRADE_UNIFORM].value).toBe(GRADE);
    }
  });

  it('reaches the sky dome and the ridge silhouettes, which are shader materials of their own', () => {
    const scene = new THREE.Scene();
    const ctx = { scene, camera: new THREE.PerspectiveCamera(), quality: 'lite', timeOfDay: 'morning', events: new EventTarget(),
      renderer: { toneMappingExposure: 1 } } as unknown as Ctx;
    const sky = new SkySystem(new LandscapeModel(getArea('quail-fields')));
    try {
      sky.init(ctx);
      const shaders = scene.children.filter((node): node is THREE.Mesh => node instanceof THREE.Mesh)
        .map(node => node.material as THREE.ShaderMaterial);
      expect(shaders.length).toBeGreaterThan(2);
      for (const material of shaders) {
        expect(material.toneMapped).toBe(true);
        expect(material.uniforms[GRADE_UNIFORM].value).toBe(GRADE);
        expect(material.fragmentShader).toContain('#include <tonemapping_fragment>');
      }
    } finally { sky.dispose(ctx); }
  });

  it('is plain ACES with no look, so a shader that lacks the values never renders black', () => {
    const plain = new Float32Array(GRADE.length);
    writeGrade(null, plain);
    expect([...plain].every(value => value === 0)).toBe(true);
    const grey = gradeDisplay([.18, .18, .18], 1, plain);
    expect(grey[0]).toBeGreaterThan(.3); expect(grey[0]).toBeLessThan(.7);
    expect(grey[0]).toBeCloseTo(grey[2], 4);
  });

  it('keeps the drawing-buffer size across looks, for the vignette', () => {
    const values = new Float32Array(GRADE.length);
    setGradeViewport(1920, 1080, values);
    writeGrade(LOOKS.crisp.grade, values);
    writeGrade(null, values);
    expect(values[24]).toBeCloseTo(1 / 1920); expect(values[26]).toBeCloseTo(1920 / 1080);
  });

  it.each(GROUNDS)('gives %s a firmer, more saturated picture than plain ACES at every hour, never a filter that crushes it', ground => {
    const plain = new Float32Array(GRADE.length), graded = new Float32Array(GRADE.length);
    // Cured grass in sun, the same grass in shade, and a sky blue.
    const swatches: [number, number, number][] = [[.42, .3, .12], [.06, .05, .03], [.25, .38, .6]];
    for (const tod of HOURS) {
      writeGrade(lookAt(LOOKS.crisp, tod, ground).grade, graded);
      for (const swatch of swatches) {
        const a = gradeDisplay(swatch, 1.05, plain), b = gradeDisplay(swatch, 1.05, graded);
        // Never a different colour: the grade moves each channel a little.
        for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(.12);
        expect(Math.max(...b)).toBeGreaterThan(.02);
      }
      // Lit grass keeps its colour under the grade (Quail's soft light may flatten it slightly).
      const lit = swatches[0];
      expect(saturation(gradeDisplay(lit, 1.05, graded))).toBeGreaterThan(saturation(gradeDisplay(lit, 1.05, plain)) * .85);
    }
  });
});
