import * as THREE from 'three';

const ATLAS_SIZE = 1254;
const CELL = ATLAS_SIZE / 2;
type CloudCrop = readonly [number, number, number, number];

function bank(heading: number, elevation: number, maxWidth: number, maxHeight: number,
  column: number, row: number, crop: CloudCrop) {
  const [left, top, right, bottom] = crop;
  // Pixel bounds include a transparent guard around every painted fragment.
  // Fit the actual painting, not a square atlas cell stretched to a rectangle.
  const aspect = (right - left) / (bottom - top);
  const height = Math.min(maxHeight, maxWidth / aspect), width = height * aspect;
  return {
    heading, elevation, width, height,
    center: [THREE.MathUtils.degToRad(180 - heading), THREE.MathUtils.degToRad(elevation)] as const,
    span: [THREE.MathUtils.degToRad(width), THREE.MathUtils.degToRad(height)] as const,
    uv: [(column * CELL + left) / ATLAS_SIZE, 1 - (row * CELL + bottom) / ATLAS_SIZE,
      (right - left) / ATLAS_SIZE, (bottom - top) / ATLAS_SIZE] as const,
    crop, column, row,
  };
}

/** Image coordinates are top-down; Three's normal flipY upload makes these
 * bottom-up UV rectangles. All four original paintings retain their aspect. */
export const SHARPTAIL_CLOUD_BANKS = [
  bank(252, 20, 35, 22, 0, 0, [16, 142, 620, 542]),
  bank(212, 14, 28, 18, 1, 0, [7, 291, 616, 549]),
  bank(315, 19, 44, 20, 0, 1, [19, 84, 619, 482]),
  bank(52, 12, 44, 20, 1, 1, [24, 256, 612, 426]),
] as const;
const gl = (value: number) => value.toFixed(9);

/** Exactly one RGBA read inside a cloud rectangle, none in the open sky.
 * At these elevations the four angular rectangles have no overlap. */
export const SHARPTAIL_CLOUD_ATLAS_GLSL = /* glsl */ `
uniform sampler2D uSharptailCloudAtlas;
uniform float uSharptailCloudReady;
vec4 sharptailPaintedCloud(vec2 ae) {
  float elevation = asin(clamp(ae.y, -1.0, 1.0));
  float horizontalScale = cos(elevation);
  // Compute every gradient before any rectangle can return. A derivative
  // taken after an earlier divergent return is also undefined at that edge.
  ${SHARPTAIL_CLOUD_BANKS.map((cloud, index) => `
  vec2 local${index} = vec2(atan(sin(ae.x - ${gl(cloud.center[0])}), cos(ae.x - ${gl(cloud.center[0])})) * horizontalScale,
    elevation - ${gl(cloud.center[1])}) / vec2(${cloud.span.map(gl).join(', ')}) + .5;
  vec2 atlasUv${index} = vec2(${cloud.uv.slice(0, 2).map(gl).join(', ')}) + local${index} * vec2(${cloud.uv.slice(2).map(gl).join(', ')});
  vec2 atlasDx${index} = dFdx(atlasUv${index});
  vec2 atlasDy${index} = dFdy(atlasUv${index});`).join('\n')}
  ${SHARPTAIL_CLOUD_BANKS.map((_cloud, index) => `
  if (all(greaterThanEqual(local${index}, vec2(0.0))) && all(lessThanEqual(local${index}, vec2(1.0)))) {
    vec4 painted = textureGrad(uSharptailCloudAtlas, atlasUv${index}, atlasDx${index}, atlasDy${index});
    // Remove nearly transparent source noise before preserving the soft
    // painted edge. The boundary guard also excludes crop-margin mip alpha.
    vec2 lowerGuard = smoothstep(vec2(0.0), vec2(.012), local${index});
    vec2 upperGuard = smoothstep(vec2(0.0), vec2(.012), vec2(1.0) - local${index});
    painted.a = smoothstep(.015, .99, painted.a) * lowerGuard.x * lowerGuard.y * upperGuard.x * upperGuard.y;
    return painted;
  }`).join('\n')}
  return vec4(0.0);
}
`;

export function createSharptailCloudAtlas(baseUrl = import.meta.env.BASE_URL): {
  atlas: { value: THREE.Texture | null }; ready: { value: number }; dispose(): void;
} {
  const atlas = { value: null as THREE.Texture | null }, ready = { value: 0 };
  let disposed = false, failed = false, pending: THREE.Texture | null = null;
  const released = new Set<THREE.Texture>();
  const release = (texture: THREE.Texture | null) => {
    if (!texture || released.has(texture)) return;
    released.add(texture); texture.dispose();
  };
  if (typeof document !== 'undefined' && typeof document.createElementNS === 'function') {
    try {
      pending = new THREE.TextureLoader().load(`${baseUrl}textures/sky/sharptail-cloud-atlas-v1.webp`, loaded => {
        if (disposed || failed) { release(loaded); return; }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.wrapS = loaded.wrapT = THREE.ClampToEdgeWrapping;
        loaded.minFilter = THREE.LinearMipmapLinearFilter; loaded.magFilter = THREE.LinearFilter;
        loaded.generateMipmaps = true; loaded.flipY = true; loaded.premultiplyAlpha = false;
        loaded.needsUpdate = true; atlas.value = loaded; ready.value = 1;
      }, undefined, () => {
        failed = true; ready.value = 0; release(pending); atlas.value = null;
      });
      if (disposed || failed) release(pending);
      else if (ready.value === 0) atlas.value = pending;
    } catch {
      // Loading is optional. An unavailable image/DOM keeps the procedural
      // sky intact rather than delaying or failing entry into the field.
      failed = true; ready.value = 0; release(pending); atlas.value = null;
    }
  }
  return { atlas, ready, dispose() {
    if (disposed) return;
    disposed = true; ready.value = 0; release(atlas.value); release(pending); atlas.value = null;
  } };
}
