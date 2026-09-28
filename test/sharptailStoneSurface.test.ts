import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSharptailStoneSurface } from '../src/three/subsystems/sharptailStoneSurface';

const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach(dispose => dispose());
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function controlledLoad() {
  vi.stubGlobal('document', { createElementNS: vi.fn() });
  const texture = new THREE.Texture<HTMLImageElement>();
  const textureDisposed = vi.fn(); texture.addEventListener('dispose', textureDisposed);
  let resolve: (texture: THREE.Texture<HTMLImageElement>) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const load = vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((_url, onLoad, _progress, onError) => {
    resolve = onLoad ?? (() => {}); reject = onError ?? (() => {}); return texture;
  });
  return { texture, load, textureDisposed,
    async succeed() { await Promise.resolve(); resolve(texture); },
    async fail() { await Promise.resolve(); reject(new Error('offline')); },
  };
}

function surface() {
  const base = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x4b5347, emissiveIntensity: .1 });
  const baseDisposed = vi.fn(); base.addEventListener('dispose', baseDisposed);
  const result = createSharptailStoneSurface(base);
  const materialDisposed = vi.fn(); result.material.addEventListener('dispose', materialDisposed);
  cleanup.push(() => { result.dispose(); base.dispose(); });
  return { ...result, base, baseDisposed, materialDisposed };
}

function compile(material: THREE.MeshLambertMaterial) {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader,
    fragmentShader: THREE.ShaderLib.lambert.fragmentShader } as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

describe('shared Sharptail stone surface', () => {
  it('keeps vertex-colored fallback until one async texture is ready for every compiled material use', async () => {
    const loading = controlledLoad(), stone = surface();
    const first = compile(stone.material), second = compile(stone.material);
    expect(loading.load).toHaveBeenCalledOnce();
    expect(stone.material).not.toBe(stone.base);
    expect(stone.material.vertexColors).toBe(true); expect(stone.material.flatShading).toBe(true);
    expect(first.uniforms.uPrairieStone).toBe(second.uniforms.uPrairieStone);
    expect(first.uniforms.uPrairieStoneReady).toBe(second.uniforms.uPrairieStoneReady);
    expect(first.uniforms.uPrairieStoneReady.value).toBe(0);
    await loading.succeed();
    expect(first.uniforms.uPrairieStoneReady.value).toBe(1);
    expect(second.uniforms.uPrairieStone.value).toBe(loading.texture);
    expect(loading.texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(loading.texture.wrapS).toBe(THREE.RepeatWrapping); expect(loading.texture.wrapT).toBe(THREE.RepeatWrapping);
    expect(loading.texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(loading.texture.generateMipmaps).toBe(true);
    // This is a surface tint, not a displacement or opacity map. The actual
    // Lambert program keeps its normal/shadow stages and the supplied tint.
    expect(first.vertexShader).toContain('vStonePosition = position;');
    expect(first.vertexShader).toContain('#include <project_vertex>');
    expect(first.fragmentShader).toContain('#include <normal_fragment_begin>');
    expect(first.fragmentShader).toContain('#include <shadowmap_pars_fragment>');
    expect(first.fragmentShader).toContain('#include <color_fragment>');
    expect(first.fragmentShader.match(/texture2D\(uPrairieStone,/g)).toHaveLength(3);
    expect(stone.material.transparent).toBe(false); expect(stone.material.alphaMap).toBeNull();
    expect(stone.base.map).toBeNull(); expect(stone.baseDisposed).not.toHaveBeenCalled();
    stone.dispose(); stone.dispose();
    expect(loading.textureDisposed).toHaveBeenCalledOnce(); expect(stone.materialDisposed).toHaveBeenCalledOnce();
    expect(first.uniforms.uPrairieStone.value).toBeNull(); expect(first.uniforms.uPrairieStoneReady.value).toBe(0);
    expect(stone.baseDisposed).not.toHaveBeenCalled();
  });

  it('retains the valid fallback after an async load failure and releases the pending texture', async () => {
    const loading = controlledLoad(), stone = surface(), shader = compile(stone.material);
    await loading.fail();
    expect(shader.uniforms.uPrairieStoneReady.value).toBe(0);
    expect(stone.material.vertexColors).toBe(true);
    expect(stone.material.color).toEqual(stone.base.color);
    expect(loading.textureDisposed).not.toHaveBeenCalled();
    stone.dispose();
    expect(loading.textureDisposed).toHaveBeenCalledOnce(); expect(stone.materialDisposed).toHaveBeenCalledOnce();
    expect(stone.baseDisposed).not.toHaveBeenCalled();
  });

  it('cannot resurrect or double-release the surface when loading completes after disposal', async () => {
    const loading = controlledLoad(), stone = surface(), shader = compile(stone.material);
    stone.dispose();
    await loading.succeed();
    expect(shader.uniforms.uPrairieStoneReady.value).toBe(0);
    expect(shader.uniforms.uPrairieStone.value).toBeNull();
    expect(loading.textureDisposed).toHaveBeenCalledOnce(); expect(stone.materialDisposed).toHaveBeenCalledOnce();
    expect(stone.baseDisposed).not.toHaveBeenCalled();
  });

  it.each([undefined, {}])('does not attempt image loading without a capable document: %s', document => {
    vi.stubGlobal('document', document);
    const load = vi.spyOn(THREE.TextureLoader.prototype, 'load');
    const stone = surface(), shader = compile(stone.material);
    expect(load).not.toHaveBeenCalled();
    expect(shader.uniforms.uPrairieStoneReady.value).toBe(0);
    expect(shader.uniforms.uPrairieStone.value).toBeNull();
    expect(stone.material.vertexColors).toBe(true);
  });
});
