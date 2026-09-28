import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { SkySystem } from '../src/three/subsystems/sky';
import { createSharptailCloudAtlas, SHARPTAIL_CLOUD_BANKS, SHARPTAIL_CLOUD_ATLAS_GLSL } from '../src/three/subsystems/sharptailCloudAtlas';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function loading() {
  vi.stubGlobal('document', { createElementNS: vi.fn() });
  const texture = new THREE.Texture<HTMLImageElement>(), released = vi.fn();
  texture.addEventListener('dispose', released);
  let complete: (texture: THREE.Texture<HTMLImageElement>) => void = () => {};
  let fail: (error: unknown) => void = () => {};
  const load = vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((_url, onLoad, _progress, onError) => {
    complete = onLoad ?? complete; fail = onError ?? fail; return texture;
  });
  return { texture, released, load, succeed: (loaded = texture) => complete(loaded), fail: () => fail(new Error('missing')) };
}

describe('painted Sharptail sky atlas', () => {
  it('keeps painting proportions and maps all four source quadrants upright with transparent guards', () => {
    const quadrants = new Set<string>();
    for (const bank of SHARPTAIL_CLOUD_BANKS) {
      const [left, top, right, bottom] = bank.crop;
      expect(bank.width / bank.height).toBeCloseTo((right - left) / (bottom - top), 10);
      expect(bank.uv[0]).toBeCloseTo((bank.column * 627 + left) / 1254, 10);
      // Bottom of an upright rendered cloud maps to the image's bottom,
      // not to the top of the opposite vertically flipped atlas quadrant.
      expect(bank.uv[1]).toBeCloseTo(1 - (bank.row * 627 + bottom) / 1254, 10);
      expect(bank.uv[1] + bank.uv[3]).toBeCloseTo(1 - (bank.row * 627 + top) / 1254, 10);
      expect(Math.min(left, top, 627 - right, 627 - bottom)).toBeGreaterThan(4);
      quadrants.add(`${bank.column},${bank.row}`);
    }
    expect(quadrants.size).toBe(4);
    expect(SHARPTAIL_CLOUD_BANKS.map(bank => bank.heading).slice(0, 2)).toEqual([252, 212]);
  });

  it('uses nonoverlapping angular rectangles and returns immediately after one covered-pixel read', () => {
    let covered = 0;
    for (let heading = 0; heading < 360; heading += 1) for (let elevation = 0; elevation < 60; elevation += 1) {
      const az = THREE.MathUtils.degToRad(180 - heading), el = THREE.MathUtils.degToRad(elevation);
      const count = SHARPTAIL_CLOUD_BANKS.filter(bank => {
        const delta = Math.atan2(Math.sin(az - bank.center[0]), Math.cos(az - bank.center[0])) * Math.cos(el);
        return Math.abs(delta) <= bank.span[0] / 2 && Math.abs(el - bank.center[1]) <= bank.span[1] / 2;
      }).length;
      expect(count).toBeLessThanOrEqual(1); covered += count;
    }
    expect(covered).toBeGreaterThan(1500);
    expect(covered).toBeLessThan(3500); // open sky remains most of the hemisphere
    expect(SHARPTAIL_CLOUD_ATLAS_GLSL.match(/vec4 painted = textureGrad\(/g)).toHaveLength(4);
    expect(SHARPTAIL_CLOUD_ATLAS_GLSL.match(/return painted;/g)).toHaveLength(4);
    expect(SHARPTAIL_CLOUD_ATLAS_GLSL.match(/painted.a = smoothstep\(.015, .99, painted.a\) \* lowerGuard.x \* lowerGuard.y \* upperGuard.x \* upperGuard.y;/g)).toHaveLength(4);
    // Every quad's mip gradients exist before any quad can branch/return.
    // Moving only the current quad's derivative outside its own if is not enough.
    expect(SHARPTAIL_CLOUD_ATLAS_GLSL.lastIndexOf('dFdy(')).toBeLessThan(SHARPTAIL_CLOUD_ATLAS_GLSL.indexOf('  if ('));
  });

  it('loads relative to the deployment base, then enables one mipmapped straight-alpha texture', () => {
    const l = loading(), sky = createSharptailCloudAtlas('/uplandin/');
    expect(l.load.mock.calls[0][0]).toBe('/uplandin/textures/sky/sharptail-cloud-atlas-v1.webp');
    expect(sky.ready.value).toBe(0);
    l.succeed();
    expect(sky.ready.value).toBe(1); expect(sky.atlas.value).toBe(l.texture);
    expect(l.texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(l.texture.flipY).toBe(true); expect(l.texture.premultiplyAlpha).toBe(false);
    expect(l.texture.wrapS).toBe(THREE.ClampToEdgeWrapping); expect(l.texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(l.texture.generateMipmaps).toBe(true); expect(l.texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    sky.dispose(); sky.dispose(); expect(l.released).toHaveBeenCalledOnce();
    expect(sky.atlas.value).toBeNull(); expect(sky.ready.value).toBe(0);
  });

  it('keeps the procedural fallback after failure and releases the failed pending resource', () => {
    const l = loading(), sky = createSharptailCloudAtlas(); l.fail();
    expect(sky.ready.value).toBe(0); expect(sky.atlas.value).toBeNull();
    expect(l.released).toHaveBeenCalledOnce(); sky.dispose();
    expect(l.released).toHaveBeenCalledOnce();
  });

  it('cannot resurrect a disposed sky when either the original or a distinct async texture arrives late', () => {
    const l = loading(), sky = createSharptailCloudAtlas(); sky.dispose(); l.succeed();
    const other = new THREE.Texture<HTMLImageElement>(), released = vi.fn(); other.addEventListener('dispose', released);
    l.succeed(other); sky.dispose();
    expect(l.released).toHaveBeenCalledOnce(); expect(released).toHaveBeenCalledOnce();
    expect(sky.atlas.value).toBeNull(); expect(sky.ready.value).toBe(0);
  });

  it.each(['quail-fields', 'chukar-ridge', 'pheasant-coverts', 'sharptail-prairie'])('owns loading and disposal only for the Sharptail property: %s', areaId => {
    const l = loading(), ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(70, 1, .05, 1600),
      quality: 'lite', timeOfDay: 'noon', events: new EventTarget(), renderer: { toneMappingExposure: 1 } } as unknown as Ctx;
    const sky = new SkySystem(new LandscapeModel(getArea(areaId))); sky.init(ctx);
    const dome = ctx.scene.children.find((object): object is THREE.Mesh => object instanceof THREE.Mesh && object.geometry instanceof THREE.SphereGeometry)!;
    const material = dome.material as THREE.ShaderMaterial;
    if (areaId === 'sharptail-prairie') {
      expect(l.load).toHaveBeenCalledOnce(); l.succeed();
      expect(material.uniforms.uSharptailCloudReady.value).toBe(1);
      ctx.events.dispatchEvent(new CustomEvent('tod', { detail: 'evening' }));
      expect(material.uniforms.uSharptailCloudReady.value).toBe(1);
      expect(material.fragmentShader).toContain('if (!paintedPrairie) cAboveRaw = cloudField');
    } else {
      expect(l.load).not.toHaveBeenCalled(); expect(material.uniforms.uSharptailCloudReady.value).toBe(0);
    }
    sky.dispose(ctx);
    expect(l.released.mock.calls.length).toBe(areaId === 'sharptail-prairie' ? 1 : 0);
  });
});
