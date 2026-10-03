import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleVertexColorsInside, VERTEX_COLOR_CHUNKS } from '../src/three/centroidColors';
import { HDR_CEILING, PostEffects } from '../src/three/postEffects';
import { LOOKS } from '../src/three/looks';

vi.mock('three', async (original) => {
  const three = await original<typeof import('three')>();
  return { ...three, WebGLRenderer: class {
    shadowMap = { enabled: false, type: 0 };
    domElement: HTMLCanvasElement;
    info = { autoReset: true, render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 }, reset() {} };
    constructor(options: { canvas: HTMLCanvasElement }) { this.domElement = options.canvas; }
    dispose() {} setPixelRatio() {} setSize() {} render() {}
    getDrawingBufferSize(target: { set(x: number, y: number): unknown }) { return target.set(1920, 1080); }
  } };
});
afterEach(() => vi.unstubAllGlobals());

const declarations = (source: string) => source.match(/(centroid )?varying vec4 vColor;/g) ?? [];

describe('vertex colours under multisampling', () => {
  it('are sampled inside the triangle in both stages, once, however often it is asked', () => {
    const chunks = { color_pars_vertex: THREE.ShaderChunk.color_pars_vertex, color_pars_fragment: THREE.ShaderChunk.color_pars_fragment };
    // three still declares the varying as this expects; if an upgrade changes
    // it, the flashes come back unnoticed, so fail here instead.
    for (const name of VERTEX_COLOR_CHUNKS) expect(declarations(chunks[name])).toEqual(['varying vec4 vColor;']);
    expect(sampleVertexColorsInside(chunks)).toBe(true);
    expect(sampleVertexColorsInside(chunks)).toBe(true);
    for (const name of VERTEX_COLOR_CHUNKS) expect(declarations(chunks[name])).toEqual(['centroid varying vec4 vColor;']);
    // The rest of each chunk is untouched.
    expect(chunks.color_pars_vertex.replace('centroid ', '')).toBe(THREE.ShaderChunk.color_pars_vertex);
  });

  it('leaves both stages alone rather than make them disagree', () => {
    const chunks = { color_pars_vertex: 'varying vec4 vColor;', color_pars_fragment: 'varying vec3 vColor;' };
    expect(sampleVertexColorsInside(chunks)).toBe(false);
    expect(chunks).toEqual({ color_pars_vertex: 'varying vec4 vColor;', color_pars_fragment: 'varying vec3 vColor;' });
  });

  it('is in place as soon as the field engine exists, before any material compiles', async () => {
    vi.stubGlobal('window', Object.assign(new EventTarget(), { innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1 }));
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { Engine } = await import('../src/three/engine');
    const engine = new Engine({} as HTMLCanvasElement, 'high');
    for (const name of VERTEX_COLOR_CHUNKS) expect(declarations(THREE.ShaderChunk[name])).toEqual(['centroid varying vec4 vColor;']);
    engine.dispose();
  });
});

describe('the bloom input', () => {
  it('caps any one pixel above everything the field draws, and floors it at black, before the haze and bloom', () => {
    const effects = new PostEffects(LOOKS.crisp);
    const source = (effects as unknown as { composite: THREE.ShaderMaterial }).composite.fragmentShader;
    const cap = source.indexOf(`color.rgb = clamp(color.rgb, 0.0, ${HDR_CEILING.toFixed(1)});`);
    expect(cap).toBeGreaterThan(source.indexOf('vec4 color = texture2D(tColor, vUv);'));
    expect(cap).toBeLessThan(source.indexOf('Exponential height haze'));
    // Prairie water's sun glint (five times a sun colour of up to 1.6, plus
    // its sheen) is the brightest thing drawn on purpose; the ceiling leaves
    // it alone. The flashes ran to thousands.
    expect(HDR_CEILING).toBeGreaterThan((5 + .18) * 1.6);
    expect(HDR_CEILING).toBeLessThan(20);
    expect(HDR_CEILING).toBeGreaterThan(LOOKS.crisp.bloom.threshold);
    effects.dispose();
  });
});
