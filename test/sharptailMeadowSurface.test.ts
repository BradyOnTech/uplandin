import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { sharptailMeadowNormalTexture, SHARPTAIL_SURFACE_SIZE } from '../src/three/subsystems/sharptailMeadowSurface';

describe('Sharptail distant meadow normal field', () => {
  it('has continuous bounded slopes across its periodic seam, without a per-frame resource', () => {
    const texture = sharptailMeadowNormalTexture();
    const size = SHARPTAIL_SURFACE_SIZE, data = texture.image.data as Uint8Array;
    expect(data.byteLength).toBe(512 * 512 * 4);
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(texture.wrapT).toBe(THREE.RepeatWrapping);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(texture.generateMipmaps).toBe(true);
    let lengthError = 0, minimumUp = 1, maximumSeamStep = 0, slopeSum = 0;
    const normal = (pixel: number, channel: number) => data[pixel * 4 + channel] / 127.5 - 1;
    for (let i = 0; i < size * size; i++) {
      const x = normal(i, 0), z = normal(i, 1), up = normal(i, 2);
      lengthError = Math.max(lengthError, Math.abs(Math.hypot(x, z, up) - 1));
      minimumUp = Math.min(minimumUp, up);
      slopeSum += Math.hypot(x, z);
    }
    for (let i = 0; i < size; i++) for (let c = 0; c < 3; c++) {
      maximumSeamStep = Math.max(maximumSeamStep,
        Math.abs(normal(i * size, c) - normal(i * size + size - 1, c)),
        Math.abs(normal(i, c) - normal((size - 1) * size + i, c)));
    }
    expect(lengthError).toBeLessThan(.012);
    expect(minimumUp).toBeGreaterThan(.8);
    expect(maximumSeamStep).toBeLessThan(.09);
    // The field must carry visible connected relief, not a flat normal map.
    expect(slopeSum / (size * size)).toBeGreaterThan(.04);
    texture.dispose();
  });
});
