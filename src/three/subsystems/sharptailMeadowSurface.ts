import * as THREE from 'three';

export const SHARPTAIL_SURFACE_SIZE = 512;
export const SHARPTAIL_SURFACE_METRES = 192;

/** A bounded, periodic normal field for connected bent-sward masses. This is
 * canopy shading, not added terrain elevation: player and dog contact remain
 * on the authoritative landscape. Bake once; no canvas, network or frame work.
 * R/G encode property-space X/Z slopes and B the upward component. */
export function sharptailMeadowNormalData(): Uint8Array {
  const size = SHARPTAIL_SURFACE_SIZE, metres = SHARPTAIL_SURFACE_METRES;
  const dx = new Float32Array(size * size), dz = new Float32Array(size * size);
  const density = new Float32Array(size * size);
  let seed = 0x5a17c34;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const cell = metres / 8, scale = size / metres;
  // Each broad wind-laid stand contains three narrower folds. They share a
  // direction and footprint instead of repeating isolated round hummocks.
  // Alpha carries this same stand density for the albedo; the original RGBA
  // texture and sampler budget are unchanged.
  const fold = (x: number, z: number, angle: number, length: number, width: number,
    height: number, phase: number, weight: number) => {
    const c = Math.cos(angle), s = Math.sin(angle);
    const boundX = (Math.abs(c) * length + Math.abs(s) * width) * 2.7;
    const boundZ = (Math.abs(s) * length + Math.abs(c) * width) * 2.7;
    for (let iz = Math.floor((z - boundZ) * scale); iz <= Math.ceil((z + boundZ) * scale); iz++) {
      for (let ix = Math.floor((x - boundX) * scale); ix <= Math.ceil((x + boundX) * scale); ix++) {
        const px = (ix + .5) / scale - x, pz = (iz + .5) / scale - z;
        const u = (px * c + pz * s) / length, v = (-px * s + pz * c) / width;
        const bend = Math.sin(u * 2.1 + phase) * .20;
        const across = v - bend;
        const mass = Math.exp(-(.9 * u * u + across * across));
        const value = height * mass;
        const alongSlope = value * (-1.8 * u + 2 * across * Math.cos(u * 2.1 + phase) * .42);
        const acrossSlope = value * -2 * across;
        const index = ((iz % size + size) % size) * size + (ix % size + size) % size;
        dx[index] += alongSlope * c / length - acrossSlope * s / width;
        dz[index] += alongSlope * s / length + acrossSlope * c / width;
        density[index] += mass * weight;
      }
    }
  };
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const x = (col + .15 + random() * .7) * cell;
    const z = (row + .15 + random() * .7) * cell;
    const angle = .65 + Math.sin(x * .018 + z * .009) * .50 + (random() - .5) * 1.2;
    const c = Math.cos(angle), s = Math.sin(angle);
    const length = 10 + random() * 9, width = 3 + random() * 2.3;
    const phase = random() * Math.PI * 2;
    fold(x, z, angle, length, width, .65 + random() * .5, phase, .7);
    for (let n = 0; n < 3; n++) {
      const along = (random() - .5) * length;
      const across = (n - 1) * width * .55;
      fold(x + along * c - across * s, z + along * s + across * c,
        angle + (random() - .5) * .24, 3 + random() * 3.5, .8 + random() * .65,
        .14 + random() * .13, phase, .13);
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < dx.length; i++) {
    const inv = 1 / Math.hypot(dx[i], dz[i], 1);
    data[i * 4] = Math.round((-.5 * dx[i] * inv + .5) * 255);
    data[i * 4 + 1] = Math.round((-.5 * dz[i] * inv + .5) * 255);
    data[i * 4 + 2] = Math.round((.5 * inv + .5) * 255);
    data[i * 4 + 3] = Math.round(Math.min(1, density[i] / 1.15) * 255);
  }
  return data;
}

export function sharptailMeadowNormalTexture(): THREE.DataTexture {
  const texture = new THREE.DataTexture(sharptailMeadowNormalData(), SHARPTAIL_SURFACE_SIZE, SHARPTAIL_SURFACE_SIZE);
  texture.name = 'Sharptail connected meadow surface normals';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Shared by ground and the connected canopy, so blade fade never exposes
 * an unrelated surface. Density and lighting use one filtered texture read. */
export const SHARPTAIL_SURFACE_COLOR_FRAGMENT = /* glsl */ `
  vec2 swardUV = (vPropertyWorld.xz - uPropertyFloorOrigin) / ${SHARPTAIL_SURFACE_METRES.toFixed(1)};
  vec4 swardTexel = texture2D(uPrairieSurfaceNormal, swardUV);
  vec2 swardFootprint = fwidth(swardUV);
  float swardResolved = 1.0 - smoothstep(.012, .09, max(swardFootprint.x, swardFootprint.y));
  float swardRange = smoothstep(12.0, 36.0, pDistance) * (1.0 - smoothstep(170.0, 320.0, pDistance));
  float swardMass = smoothstep(.08, .78, swardTexel.a);
  diffuseColor.rgb *= mix(1.0, mix(1.055, .925, swardMass), swardRange * swardResolved);
  // The resolved bunches shade their litter; transition to the lit canopy
  // at the same range where individual leaves hand over to the middle sward.
  diffuseColor.rgb *= mix(.72, 1.0, smoothstep(12.0, 48.0, pDistance));
`;

export const SHARPTAIL_SURFACE_NORMAL_FRAGMENT = /* glsl */ `
  vec3 swardNormal = swardTexel.rgb * 2.0 - 1.0;
  // Project the property X/Z directions onto the actual slope's tangent
  // plane, then perturb the lighting normal. Relief follows daylight rather
  // than adding a fixed layer of painted dark dots or another grass batch.
  vec3 swardX = mat3(viewMatrix) * vec3(1.0, 0.0, 0.0);
  vec3 swardZ = mat3(viewMatrix) * vec3(0.0, 0.0, 1.0);
  swardX -= normal * dot(normal, swardX);
  swardZ -= normal * dot(normal, swardZ);
  normal = normalize(normal + (swardX * swardNormal.x + swardZ * swardNormal.y) * swardRange * swardResolved * .35);
`;
