import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { PropertyTerrain } from '../src/three/subsystems/propertyTerrain';
import { sharptailMeadowNormalTexture, SHARPTAIL_SURFACE_SIZE } from '../src/three/subsystems/sharptailMeadowSurface';

describe('Sharptail distant meadow surface field', () => {
  it('keeps bounded normals and meaningful density continuous across the periodic seam', () => {
    const texture = sharptailMeadowNormalTexture();
    const size = SHARPTAIL_SURFACE_SIZE, data = texture.image.data as Uint8Array;
    expect(data.byteLength).toBe(512 * 512 * 4);
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(texture.wrapT).toBe(THREE.RepeatWrapping);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(texture.generateMipmaps).toBe(true);
    // Alpha is scalar density, not opacity; neither color conversion nor
    // premultiplication may alter the encoded normal/density relationship.
    expect(texture.colorSpace).toBe(THREE.NoColorSpace);
    expect(texture.premultiplyAlpha).toBe(false);
    let lengthError = 0, minimumUp = 1, maximumSeamStep = 0, slopeSum = 0;
    let densitySum = 0, densitySquared = 0, sparsePixels = 0, densePixels = 0, densitySeamStep = 0;
    const normal = (pixel: number, channel: number) => data[pixel * 4 + channel] / 127.5 - 1;
    const density = (pixel: number) => data[pixel * 4 + 3] / 255;
    for (let i = 0; i < size * size; i++) {
      const x = normal(i, 0), z = normal(i, 1), up = normal(i, 2);
      lengthError = Math.max(lengthError, Math.abs(Math.hypot(x, z, up) - 1));
      minimumUp = Math.min(minimumUp, up);
      slopeSum += Math.hypot(x, z);
      const mass = density(i);
      densitySum += mass; densitySquared += mass * mass;
      if (mass < .15) sparsePixels++;
      if (mass > .5) densePixels++;
    }
    for (let i = 0; i < size; i++) for (let c = 0; c < 3; c++) {
      maximumSeamStep = Math.max(maximumSeamStep,
        Math.abs(normal(i * size, c) - normal(i * size + size - 1, c)),
        Math.abs(normal(i, c) - normal((size - 1) * size + i, c)));
    }
    for (let i = 0; i < size; i++) {
      densitySeamStep = Math.max(densitySeamStep,
        Math.abs(density(i * size) - density(i * size + size - 1)),
        Math.abs(density(i) - density((size - 1) * size + i)));
    }
    expect(lengthError).toBeLessThan(.012);
    expect(minimumUp).toBeGreaterThan(.8);
    expect(maximumSeamStep).toBeLessThan(.09);
    // The field must carry visible connected relief, not a flat normal map.
    expect(slopeSum / (size * size)).toBeGreaterThan(.04);
    const pixels = size * size, averageDensity = densitySum / pixels;
    expect(sparsePixels / pixels).toBeGreaterThan(.05);
    expect(densePixels / pixels).toBeGreaterThan(.05);
    expect(densitySquared / pixels - averageDensity ** 2).toBeGreaterThan(.01);
    expect(densitySeamStep).toBeLessThan(.09);
    texture.dispose();
  });

  it('shares one density/normal read between actual ground and canopy shader stages', () => {
    const terrain = new PropertyTerrain(new LandscapeModel(getArea('sharptail-prairie')));
    const first = terrain.prairieCanopySurface()!, second = terrain.prairieCanopySurface()!;
    const compile = (material: THREE.MeshLambertMaterial) => {
      const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader,
        fragmentShader: THREE.ShaderLib.lambert.fragmentShader } as THREE.WebGLProgramParametersWithUniforms;
      material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      return shader;
    };
    const a = compile(first.material), b = compile(second.material);
    expect(a.uniforms.uPrairieSurfaceNormal).toBe(b.uniforms.uPrairieSurfaceNormal);
    const fragment = a.fragmentShader;
    expect(fragment.match(/texture2D\(uPrairieSurfaceNormal,/g)).toHaveLength(1);
    const densityRead = fragment.indexOf('vec4 swardTexel =');
    expect(densityRead).toBeGreaterThan(-1);
    expect(fragment.indexOf('swardTexel.a')).toBeGreaterThan(densityRead);
    expect(fragment.indexOf('swardTexel.rgb')).toBeGreaterThan(fragment.indexOf('#include <normal_fragment_maps>'));
    // The auxiliary texture is not an opacity map, even when its density is
    // zero. It must not punch holes in the floor or the connected canopy.
    expect(first.material.alphaMap).toBeNull();
    expect(fragment).not.toMatch(/(?:diffuseColor\.a|opacity)\s*[*+\-/]?=\s*[^;]*sward/);
    first.material.dispose(); second.material.dispose();
  });
});
