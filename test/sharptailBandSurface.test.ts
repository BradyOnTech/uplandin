import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import { sampleSharptailVegetationBands, SHARPTAIL_VEGETATION_BAND_BOUNDS as BOUNDS } from '../src/game/sharptailVegetationBands';
import type { Ctx } from '../src/three/engine';
import { PropertyTerrain } from '../src/three/subsystems/propertyTerrain';
import { sharptailBandSurfaceTexture, SHARPTAIL_BAND_SURFACE_FRAGMENT, SHARPTAIL_BAND_TEXTURE_SIZE } from '../src/three/subsystems/sharptailBandSurface';

afterEach(() => vi.restoreAllMocks());

function compile(material: THREE.MeshLambertMaterial) {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader,
    fragmentShader: THREE.ShaderLib.lambert.fragmentShader } as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

describe('Sharptail vegetation ground alignment', () => {
  it('bakes the three analytic fields at real texel centers in linear opaque RGBA', () => {
    const texture = sharptailBandSurfaceTexture(), size = SHARPTAIL_BAND_TEXTURE_SIZE;
    try {
      expect(size).toBe(256);
      expect(texture.image.width).toBe(size); expect(texture.image.height).toBe(size);
      expect(texture.format).toBe(THREE.RGBAFormat);
      expect(texture.type).toBe(THREE.UnsignedByteType);
      expect(texture.colorSpace).toBe(THREE.NoColorSpace);
      expect(texture.flipY).toBe(false);
      expect(texture.premultiplyAlpha).toBe(false);
      expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
      expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
      expect(texture.magFilter).toBe(THREE.LinearFilter);
      expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
      expect(texture.generateMipmaps).toBe(true);
      const data = texture.image.data as Uint8Array, out = { scrub: 0, grass: 0, litter: 0 };
      expect(data.byteLength).toBe(256 * 256 * 4);
      const error = [0, 0, 0], sums = [0, 0, 0];
      let alphaMin = 255, alphaMax = 0;
      for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
        const x = BOUNDS.minX + (col + .5) / size * (BOUNDS.maxX - BOUNDS.minX);
        const y = BOUNDS.minY + (row + .5) / size * (BOUNDS.maxY - BOUNDS.minY);
        sampleSharptailVegetationBands(x, y, out);
        const i = (row * size + col) * 4;
        for (const [channel, key] of (['scrub', 'grass', 'litter'] as const).entries()) {
          error[channel] = Math.max(error[channel], Math.abs(data[i + channel] / 255 - out[key]));
          sums[channel] += data[i + channel];
        }
        alphaMin = Math.min(alphaMin, data[i + 3]); alphaMax = Math.max(alphaMax, data[i + 3]);
      }
      for (const value of error) expect(value).toBeLessThanOrEqual(.5 / 255 + 1e-14);
      for (const value of sums) expect(value).toBeGreaterThan(10000);
      expect(alphaMin).toBe(255); expect(alphaMax).toBe(255);
    } finally { texture.dispose(); }
  });

  it('leaves an eight-texel zero-mask border for filtering instead of clamping a colored band outward', () => {
    const texture = sharptailBandSurfaceTexture(), size = SHARPTAIL_BAND_TEXTURE_SIZE;
    try {
      const data = texture.image.data as Uint8Array;
      let largestBorderMask = 0;
      for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
        if (row >= 8 && row < size - 8 && col >= 8 && col < size - 8) continue;
        const i = (row * size + col) * 4;
        largestBorderMask = Math.max(largestBorderMask, data[i], data[i + 1], data[i + 2]);
      }
      expect(largestBorderMask).toBe(0);
      // At very coarse mip levels even a padded texture averages its interior;
      // the separate bounds gate must still suppress it outside the property box.
      expect(SHARPTAIL_BAND_SURFACE_FRAGMENT).toContain('prairieBand *= prairieBandInside;');
    } finally { texture.dispose(); }
  });

  it('keeps a shared ground/vegetation point aligned across both real drop origins', () => {
    const area = getArea('sharptail-prairie');
    expect(area.dropPoints.length).toBeGreaterThan(1);
    const origins: THREE.Vector2[] = [];
    for (const drop of area.dropPoints) {
      const landscape = new LandscapeModel(area, drop.id), terrain = new PropertyTerrain(landscape);
      const canopy = terrain.prairieCanopySurface()!;
      try {
        const shader = compile(canopy.material);
        const origin = shader.uniforms.uPropertyFloorOrigin.value as THREE.Vector2;
        origins.push(origin.clone());
        expect(shader.fragmentShader).toContain(SHARPTAIL_BAND_SURFACE_FRAGMENT);
        for (const [x, y] of [[110, 540], [-60, 590], [-185, 682], [-215, 574]]) {
          const world = landscape.propertyToWorld(x, y, { x: 0, z: 0 });
          const recoveredX = (world.x - origin.x) / PROPERTY_PX_TO_M;
          const recoveredY = (world.z - origin.y) / PROPERTY_PX_TO_M;
          expect(recoveredX).toBeCloseTo(x, 10); expect(recoveredY).toBeCloseTo(y, 10);
          const actual = { scrub: 0, grass: 0, litter: 0 }, expected = { ...actual };
          sampleSharptailVegetationBands(recoveredX, recoveredY, actual);
          sampleSharptailVegetationBands(x, y, expected);
          for (const key of ['scrub', 'grass', 'litter'] as const) expect(actual[key]).toBeCloseTo(expected[key], 12);
        }
        expect(canopy.material.transparent).toBe(false);
        expect(canopy.material.alphaTest).toBe(0);
        expect(canopy.material.alphaMap).toBeNull();
      } finally { canopy.material.dispose(); terrain.dispose({ scene: new THREE.Scene() } as Ctx); }
    }
    expect(origins[0].distanceTo(origins[1])).toBeGreaterThan(100);
  });

  it('shares one field texture with the canopy and releases it exactly once with the terrain', async () => {
    vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockResolvedValue(new THREE.Texture());
    const area = { ...getArea('sharptail-prairie'), world: { x: 0, y: 0, w: 120, h: 120 } };
    const terrain = new PropertyTerrain(new LandscapeModel(area));
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality: 'lite',
      events: new EventTarget(), timeOfDay: 'noon', time: 0 } as Ctx;
    await terrain.init(ctx);
    const ground = ctx.scene.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
    const canopy = terrain.prairieCanopySurface()!;
    const a = compile(ground.material), b = compile(canopy.material);
    const uniform = a.uniforms.uPrairieBands;
    expect(b.uniforms.uPrairieBands).toBe(uniform);
    const texture = uniform.value as THREE.DataTexture;
    expect(texture).toBeInstanceOf(THREE.DataTexture);
    expect(texture).not.toBe(a.uniforms.uPrairieSurfaceNormal.value);
    const disposed = vi.spyOn(texture, 'dispose');
    terrain.dispose(ctx);
    expect(disposed).toHaveBeenCalledOnce();
    expect(uniform.value).toBeNull();
    expect(ctx.scene.children).toHaveLength(0);
    terrain.dispose(ctx);
    expect(disposed).toHaveBeenCalledOnce();
    canopy.material.dispose();
  });

  it('does not attach the Sharptail field to another map material', () => {
    const terrain = new PropertyTerrain(new LandscapeModel(getArea('pheasant-coverts')));
    // Pheasant has no prairie canopy/material hook; its floor stays on its
    // existing farm palette rather than inheriting this exterior draw texture.
    expect(terrain.prairieCanopySurface()).toBeUndefined();
    terrain.dispose({ scene: new THREE.Scene() } as Ctx);
  });
});
