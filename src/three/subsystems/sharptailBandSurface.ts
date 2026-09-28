import * as THREE from 'three';
import { sampleSharptailVegetationBands, SHARPTAIL_VEGETATION_BAND_BOUNDS as BOUNDS } from '../../game/sharptailVegetationBands';

export const SHARPTAIL_BAND_TEXTURE_SIZE = 256;

/** One small linear data texture keeps the ground treatment attached to the
 * same vegetation as the instanced middle distance. Coarse horizon vertices
 * cannot resolve the narrower litter and root beds on their own. */
export function sharptailBandSurfaceTexture(): THREE.DataTexture {
  const size = SHARPTAIL_BAND_TEXTURE_SIZE;
  const data = new Uint8Array(size * size * 4), bands = { scrub: 0, grass: 0, litter: 0 };
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    const x = BOUNDS.minX + (col + .5) / size * (BOUNDS.maxX - BOUNDS.minX);
    const y = BOUNDS.minY + (row + .5) / size * (BOUNDS.maxY - BOUNDS.minY);
    sampleSharptailVegetationBands(x, y, bands);
    const i = (row * size + col) * 4;
    data[i] = Math.round(bands.scrub * 255);
    data[i + 1] = Math.round(bands.grass * 255);
    data[i + 2] = Math.round(bands.litter * 255);
    data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.name = 'Sharptail connected vegetation ground';
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const color = (hex: number) => new THREE.Color(hex).toArray().map(n => n.toFixed(6)).join(', ');

/** Apply before sunlight grading. Fine broken edges live inside the shared
 * band, so they cannot paint an unrelated decorative ellipse under a shrub. */
export const SHARPTAIL_BAND_SURFACE_FRAGMENT = /* glsl */ `
  vec2 prairieProperty = (vPropertyWorld.xz - uPropertyFloorOrigin) / .9144;
  vec2 prairieBandUV = (prairieProperty - vec2(${BOUNDS.minX.toFixed(1)}, ${BOUNDS.minY.toFixed(1)}))
    / vec2(${(BOUNDS.maxX - BOUNDS.minX).toFixed(1)}, ${(BOUNDS.maxY - BOUNDS.minY).toFixed(1)});
  vec3 prairieBand = texture2D(uPrairieBands, prairieBandUV).rgb;
  float prairieBandInside = step(0.0, prairieBandUV.x) * step(prairieBandUV.x, 1.0)
    * step(0.0, prairieBandUV.y) * step(prairieBandUV.y, 1.0);
  prairieBand *= prairieBandInside;
  float prairieRootGrain = mix(.5, propertyNoise(prairieProperty * .37), 1.0 - smoothstep(.6, 2.5, pSpan));
  float prairieBroken = smoothstep(.1, .7, pMeso * .65 + prairieRootGrain * .35);
  vec3 prairieUndergrass = mix(vec3(${color(0x8b8657)}), vec3(${color(0xb7a476)}), prairieBroken);
  vec3 prairieRootBed = mix(vec3(${color(0x4f5943)}), vec3(${color(0x7d805c)}), prairieBroken);
  vec3 prairieDryBank = mix(vec3(${color(0x8e7d5e)}), vec3(${color(0xb2a080)}), prairieRootGrain);
  diffuseColor.rgb = mix(diffuseColor.rgb, prairieUndergrass, prairieBand.g * .82);
  diffuseColor.rgb = mix(diffuseColor.rgb, prairieRootBed, prairieBand.r * .86);
  diffuseColor.rgb = mix(diffuseColor.rgb, prairieDryBank, prairieBand.b * .65);
`;
