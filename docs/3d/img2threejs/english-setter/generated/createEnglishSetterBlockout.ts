import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type SculptMaterialSpec = Record<string, any>;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((part) => part + part).join('')
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized.slice(1), 16) : 0x8a7a5f;
  return [clampAlbedoChannel((value >> 16) & 255), clampAlbedoChannel((value >> 8) & 255), clampAlbedoChannel(value & 255)];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0) return palette.filter((value) => typeof value === 'string');
  const secondary = spec.albedo?.secondary;
  const colors = [spec.baseColor ?? spec.color ?? spec.albedo?.dominant, ...(Array.isArray(secondary) ? secondary : [])];
  return colors.filter((value): value is string => typeof value === 'string' && value.startsWith('#'));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampAlbedoChannel(value: number): number {
  return Math.max(30, Math.min(240, Math.round(value)));
}

function clampPbrF0(value: number): number {
  return Math.max(0.02, Math.min(1, value));
}

function clampPbrIor(value: number): number {
  return Math.max(1, Math.min(2.5, value));
}

function clampPbrMetalness(value: number): number {
  return value >= 0.5 ? 1 : 0;
}

function clampedAlbedoColor(spec: SculptMaterialSpec): THREE.Color {
  const source = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  // setStyle with an explicit SRGBColorSpace, NOT the numeric constructor.
  //
  // `new THREE.Color(r, g, b)` treats its arguments as LINEAR working-space components,
  // while an authored `baseColor` hex is sRGB. Feeding one to the other skipped the
  // transfer function and lifted every dark albedo: #2e2a28, authored as a near-black
  // vinyl, rendered at roughly sRGB 0.46 — a mid grey. The error is largest exactly where
  // it matters most, because the transfer curve is steepest near black.
  return new THREE.Color().setStyle(source, THREE.SRGBColorSpace);
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(x: number, y: number, seed: number, periodX: number, periodY: number): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value = Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, seed: number, periodX: number, periodY: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === 'number' ? band.frequency : 0;
    const amplitude = typeof band.amplitude === 'number' ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description = `${String(band.pattern ?? '')} ${String(band.role ?? '')}`.toLowerCase();
    return [{
      frequency,
      amplitude,
      stretchX: typeof stretch[0] === 'number' ? Math.max(0.1, stretch[0]) : 1,
      stretchY: typeof stretch[1] === 'number' ? Math.max(0.1, stretch[1]) : 1,
      ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
    }];
  });
  return parsed.length > 0 ? parsed : [
    { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
  ];
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY);
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

type ColorGradientStop = { offset: number; color: string };
type ColorGradientSpec = {
  type: 'linear' | 'radial';
  axis: [number, number];
  stops: ColorGradientStop[];
};

function parseRgba(value: string): [number, number, number] {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!match) return [138, 122, 95];
  return [clampAlbedoChannel(Number(match[1])), clampAlbedoChannel(Number(match[2])), clampAlbedoChannel(Number(match[3]))];
}

// Analytical per-pixel gradient sample. The extraction schema's colorGradient carries
// exact rgba(...) stop colors (see extract_part_color_recipe.py), so this samples the
// same trend directly in JS math rather than round-tripping through a Canvas 2D
// createLinearGradient/createRadialGradient object — same visual result, and it composes
// directly with the existing noise/height-correlated colorVariation blend below.
function sampleColorGradient(gradient: ColorGradientSpec, u: number, v: number): [number, number, number] {
  const stops = gradient.stops.length >= 2 ? gradient.stops : [{ offset: 0, color: 'rgba(138,122,95,1)' }, { offset: 1, color: 'rgba(138,122,95,1)' }];
  let t: number;
  if (gradient.type === 'radial') {
    const [cx, cy] = gradient.axis;
    const dx = u - cx;
    const dy = v - cy;
    const maxRadius = Math.max(0.001, Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy)));
    t = clamp01(Math.hypot(dx, dy) / maxRadius);
  } else {
    const [ax, ay] = gradient.axis;
    const projection = (u - 0.5) * ax + (v - 0.5) * ay;
    const maxProjection = 0.5 * (Math.abs(ax) + Math.abs(ay)) || 0.5;
    t = clamp01(projection / maxProjection + 0.5);
  }
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)));
  const mix = scaled - index;
  const a = parseRgba(stops[index].color);
  const b = parseRgba(stops[index + 1].color);
  return [
    THREE.MathUtils.lerp(a[0], b[0], mix),
    THREE.MathUtils.lerp(a[1], b[1], mix),
    THREE.MathUtils.lerp(a[2], b[2], mix),
  ];
}

function writePixel(data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 2,
    typeof repeat[1] === 'number' ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: 'reference-pixel-extraction' | 'procedural';
};

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== 'object') return null;
  if (reference.usable === false) return null;
  const confidence = typeof reference.confidence === 'number'
    ? reference.confidence
    : (typeof reference.estimatedFidelity === 'number' ? reference.estimatedFidelity : 0);
  const threshold = typeof reference.targetThreshold === 'number' ? reference.targetThreshold : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== 'object') return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== 'object') return null;
  const record = map as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : record.path;
  return typeof url === 'string' && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 1,
    typeof repeat[1] === 'number' ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

function makeReferenceTextureSet(spec: SculptMaterialSpec, options: ProceduralModelOptions): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, 'albedo');
  const roughness = referenceMapUrl(spec, 'roughness');
  const height = referenceMapUrl(spec, 'height');
  const normal = referenceMapUrl(spec, 'normal');
  const ao = referenceMapUrl(spec, 'ao');
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: 'reference-pixel-extraction',
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === 'undefined') return null;
  const qualityFirst = (options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity';
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : (qualityFirst ? 1024 : 512);
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))));
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext('2d'),
    roughness: canvases.roughness.getContext('2d'),
    height: canvases.height.getContext('2d'),
    normal: canvases.normal.getContext('2d'),
    ao: canvases.ao.getContext('2d'),
  };
  if (!contexts.albedo || !contexts.roughness || !contexts.height || !contexts.normal || !contexts.ao) return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  const colors = (palette.length >= 2 ? palette : [fallback, '#6E614B', '#A08F70']).map(hexToRgb);
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ['base'], 0.76));
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ['variation'], 0.18));
  const colorAmplitude = clamp01(readLayerNumber(spec.colorVariation, ['amplitude', 'variation'], 0.18));
  const heightCorrelation = clamp01(readLayerNumber(spec.colorVariation, ['heightCorrelation'], 0.3));
  const colorGradient: ColorGradientSpec | undefined = spec.colorGradient;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2);
      let color: [number, number, number];
      if (colorGradient) {
        // Evidence-derived spatial gradient (Plan 1.3 Workstream C) takes priority
        // over the noise-based palette blend below — it is a measured trend, not a guess.
        color = sampleColorGradient(colorGradient, u, v);
      } else {
        const paletteValue = clamp01(
          0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation
        );
        color = mixPalette(colors, paletteValue);
      }
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35));
  const aoStrength = clamp01(readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35));
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6;
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage = (
        heightField[y * size + left] + heightField[y * size + right]
        + heightField[up + x] + heightField[down + x]
      ) * 0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte);
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte);
      writePixel(
        images.normal.data, offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: 'procedural',
  };
}

function createSculptMaterial(id: string, spec: SculptMaterialSpec, options: ProceduralModelOptions, denseComponent = false): THREE.MeshPhysicalMaterial {
  // A material that declares -- with evidence -- that its subject carries no texture
  // detail gets NO texture set. Synthesising one anyway is not a harmless default: the
  // branch below then forces color to white and roughness to 1 and reads both from the
  // generated maps, so the authored albedo and the reference-derived roughness are both
  // discarded, and the model gains mottling the reference does not have. Measured on the
  // tuxedo cat, whose black fur rendered as speckled grey-and-white from a palette that
  // only ever described two flat regions.
  const textureless = (spec.textureless as { declared?: boolean } | undefined)?.declared === true;
  const textures = textureless
    ? null
    : makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options);
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : clampedAlbedoColor(spec),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ['base'], 0.76)),
    metalness: clampPbrMetalness(readLayerNumber(spec.metalness, ['base'], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ['base', 'amount'], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ['base'], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ['base', 'amount'], 0)),
    ior: clampPbrIor(readLayerNumber(spec.ior, ['base', 'value'], 1.5)),
    thickness: Math.max(0, readLayerNumber(spec.thickness, ['base', 'amount'], 0)),
    attenuationDistance: Math.max(0.001, readLayerNumber(spec.attenuationDistance, ['base', 'value'], Infinity)),
    attenuationColor: new THREE.Color(typeof spec.attenuationColor === 'string' ? spec.attenuationColor : '#ffffff'),
    sheen: clamp01(readLayerNumber(spec.sheen, ['base', 'amount'], 0)),
    sheenColor: new THREE.Color(typeof spec.sheenColor === 'string' ? spec.sheenColor : '#ffffff'),
    sheenRoughness: clamp01(readLayerNumber(spec.sheenRoughness, ['base'], 1.0)),
    iridescence: clamp01(readLayerNumber(spec.iridescence, ['base', 'amount'], 0)),
    iridescenceIOR: clampPbrIor(readLayerNumber(spec.iridescenceIOR, ['base', 'value'], 1.3)),
    anisotropy: clamp01(readLayerNumber(spec.anisotropy, ['base', 'amount'], 0)),
    anisotropyRotation: readLayerNumber(spec.anisotropy, ['rotation'], 0),
    specularIntensity: clampPbrF0(readLayerNumber(spec.specularF0 ?? spec.f0 ?? spec.specularIntensity, ['base', 'value'], 1.0)),
    specularColor: new THREE.Color(typeof spec.specularColor === 'string' ? spec.specularColor : '#ffffff'),
    emissive: new THREE.Color(typeof spec.emissive === 'string' ? spec.emissive : '#000000'),
    emissiveIntensity: Math.max(0, readLayerNumber(spec.emissiveIntensity, ['base'], 1.0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ['base'], 1)),
    transparent: readLayerNumber(spec.transmission, ['base', 'amount'], 0) > 0 || readLayerNumber(spec.opacity, ['base'], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ['cutoff', 'alphaTest'], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
    flatShading: spec.flatShading === true,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35)));
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35);
    const denseMesh = denseComponent || spec.denseMesh === true || spec.geometryDensity === 'dense' || spec.topologyClass === 'dense';
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ['amplitude', 'strength'], 0));
    const effectiveBumpScale = denseMesh ? Math.max(0.05, bumpScale) : bumpScale;
    if (effectiveBumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = effectiveBumpScale;
    }
    const displacementScale = Math.max(0, readLayerNumber(spec.displacement, ['amplitude', 'strength'], 0));
    const effectiveDisplacementScale = denseMesh ? Math.max(0.005, displacementScale) : displacementScale;
    if (effectiveDisplacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = effectiveDisplacementScale;
      material.displacementBias = -effectiveDisplacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ['envMapIntensity'], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrConstraints = { albedoRange: [30, 240], binaryMetalness: true, f0Range: [0.02, 1], iorRange: [1, 2.5] };
  material.userData.pbrTextureSource = textures?.source ?? 'flat-fallback';
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.userData.referenceMaterialId = spec.referenceMaterialId ?? spec.materialReference?.profileId ?? null;
  material.userData.materialEvidence = spec.materialEvidence ?? null;
  material.userData.validationViews = spec.materialReference?.validationViews ?? [];
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number')) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55));
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: Blue-belton English Setter
// Sculpt build pass: blockout
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createBlueBeltonEnglishSetterModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "Blue-belton English Setter";
  root.userData.reconstructionEvidence = {"itemFamily": null, "subtype": null, "componentAdapter": null, "route": null, "exactnessTier": null, "referenceCamera": null, "approximationNotes": []};
  root.userData.materialPipeline = {};
  root.userData.materialReferenceRegistry = null;

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["coat"] = createSculptMaterial(
    "coat",
    {"id": "coat", "name": "Warm pale ground coat", "type": "standard", "shaderModel": "Shared Uplandin dog vertex shader", "flatShading": true, "baseColor": "#EBE2CC", "albedo": {"dominant": "#EBE2CC", "secondary": ["#D3C9B4", "#352F2A"]}, "colorVariation": {"palette": ["#EBE2CC", "#D3C9B4", "#352F2A"], "pattern": "authored vertex-color regions", "amplitude": 0.18}, "roughness": {"base": 0.82, "variation": 0.08}, "metalness": 0, "ambientOcclusion": {"contactShadowBias": 0.3, "notes": "geometry intersections only"}, "localOverrides": [{"id": "belton-markings", "where": "head, ears, one hip saddle and eleven deterministic flank flecks", "change": "charcoal/oxblood palette role", "strength": 0.88, "evidenceRefs": ["working-three-quarter", "head-three-quarter"]}], "textureless": {"declared": true, "evidence": ["ARCHITECTURE-3D.md requires zero photo textures and palette-only flat shading"]}},
    options
  );
  materialMap["coat-shadow"] = createSculptMaterial(
    "coat-shadow",
    {"id": "coat-shadow", "name": "Lower coat value step", "type": "standard", "shaderModel": "Shared Uplandin dog vertex shader", "flatShading": true, "baseColor": "#B7AC99", "albedo": {"dominant": "#B7AC99", "secondary": ["#D3C9B4"]}, "colorVariation": {"palette": ["#B7AC99", "#D3C9B4"], "pattern": "anatomical value zoning", "amplitude": 0.1}, "roughness": {"base": 0.86, "variation": 0.05}, "metalness": 0, "localOverrides": [{"id": "lower-limb-step", "where": "lower legs, paws and feather undersides", "change": "darker warm value for articulation", "strength": 0.22, "evidenceRefs": ["profile"]}], "textureless": {"declared": true, "evidence": ["Lower-leg separation is a vertex-color value role, not surface texture"]}},
    options
  );
  materialMap["patch"] = createSculptMaterial(
    "patch",
    {"id": "patch", "name": "Charcoal blue-belton patch", "type": "standard", "shaderModel": "Shared Uplandin dog vertex shader", "flatShading": true, "baseColor": "#352F2A", "albedo": {"dominant": "#352F2A", "secondary": ["#584B42"]}, "colorVariation": {"palette": ["#352F2A", "#584B42"], "pattern": "authored region boundaries", "amplitude": 0.12}, "roughness": {"base": 0.8, "variation": 0.06}, "metalness": 0, "localOverrides": [{"id": "ear-cheek-patches", "where": "both ears and eye/cheek zones", "change": "dark blue-belton mass", "strength": 0.9, "evidenceRefs": ["head-three-quarter"]}], "textureless": {"declared": true, "evidence": ["Blue-belton identity is expressed with authored geometry and vertex colors"]}},
    options
  );
  materialMap["nose-eye"] = createSculptMaterial(
    "nose-eye",
    {"id": "nose-eye", "name": "Nose and eye accent", "type": "standard", "shaderModel": "Shared Uplandin dog vertex shader", "flatShading": true, "baseColor": "#181817", "albedo": {"dominant": "#181817", "secondary": ["#52402D"]}, "colorVariation": {"palette": ["#181817", "#52402D"], "pattern": "semantic accent zones", "amplitude": 0.08}, "roughness": {"base": 0.3, "variation": 0.08}, "metalness": 0, "localOverrides": [{"id": "nose-soft-gloss", "where": "nose crown and eye beads", "change": "slightly lower roughness through lighting response", "strength": 0.18, "evidenceRefs": ["head-three-quarter"]}], "textureless": {"declared": true, "evidence": ["At game scale the accent reads through geometry and shared lighting, not a texture map"]}},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const endpoint_torso_0 = makeAttachmentEndpoint(null);
  const node_torso_0 = new THREE.Group();
  node_torso_0.name = "Ribcage and loin torso__pivot";
  node_torso_0.scale.set(1, 1, 1);
  if (endpoint_torso_0) {
    node_torso_0.position.copy(endpoint_torso_0.start);
    node_torso_0.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_torso_0.position.set(0.0, 0.45, 0.0);
    node_torso_0.rotation.set(0.0, 0.0, 0.0);
  }
  node_torso_0.userData.sculptComponent = {"id": "torso", "name": "Ribcage and loin torso", "level": "macro", "role": "root", "importance": 1, "confidence": 0.96, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The profile shows one uninterrupted ribcage-to-loin volume with a deep keel and rising abdomen.", "geometryDescriptor": {"topologyIntent": "seven-ring asymmetric loft with deep front section and narrowed loin"}, "parent": null, "attachment": null, "dimensions": {"width": 0.28, "height": 0.3, "depth": 0.65, "units": "m", "confidence": 0.9}, "transform": {"position": [0, 0.45, 0], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center-of-mass", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.95}, "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [0.28, 0.3, 0.62], "isTrigger": false}}, "material": "coat", "materialLayers": ["coat", "coat-shadow", "patch"], "localFeatures": [{"id": "brisket", "type": "contour", "geometryEffect": "front keel reaches elbow depth"}, {"id": "tuck", "type": "contour", "geometryEffect": "abdomen rises behind ribcage"}], "evidenceRefs": ["profile", "working-three-quarter"], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(53, 48, 43, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_torso_0.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center-of-mass", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.95}, "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [0.28, 0.3, 0.62], "isTrigger": false}};
  (nodes["root"] ?? root).add(node_torso_0);
  nodes["torso"] = node_torso_0;
  const mesh_torso_0Geometry = endpoint_torso_0
    ? new THREE.CylinderGeometry(endpoint_torso_0.endRadius, endpoint_torso_0.baseRadius, endpoint_torso_0.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_torso_0) {
    mesh_torso_0Geometry.scale(0.28, 0.3, 0.65);
  }
  const mesh_torso_0 = new THREE.Mesh(
    mesh_torso_0Geometry,
    materialMap["coat"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_torso_0.name = "Ribcage and loin torso";
  if (endpoint_torso_0) {
    mesh_torso_0.position.copy(endpoint_torso_0.midpoint);
    mesh_torso_0.quaternion.copy(endpoint_torso_0.quaternion);
  }
  mesh_torso_0.castShadow = options.castShadow ?? true;
  mesh_torso_0.receiveShadow = options.receiveShadow ?? true;
  mesh_torso_0.userData.sculptComponent = {"id": "torso", "name": "Ribcage and loin torso", "level": "macro", "role": "root", "importance": 1, "confidence": 0.96, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The profile shows one uninterrupted ribcage-to-loin volume with a deep keel and rising abdomen.", "geometryDescriptor": {"topologyIntent": "seven-ring asymmetric loft with deep front section and narrowed loin"}, "parent": null, "attachment": null, "dimensions": {"width": 0.28, "height": 0.3, "depth": 0.65, "units": "m", "confidence": 0.9}, "transform": {"position": [0, 0.45, 0], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center-of-mass", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.95}, "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [0.28, 0.3, 0.62], "isTrigger": false}}, "material": "coat", "materialLayers": ["coat", "coat-shadow", "patch"], "localFeatures": [{"id": "brisket", "type": "contour", "geometryEffect": "front keel reaches elbow depth"}, {"id": "tuck", "type": "contour", "geometryEffect": "abdomen rises behind ribcage"}], "evidenceRefs": ["profile", "working-three-quarter"], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(53, 48, 43, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_torso_0.add(mesh_torso_0);
  meshes["torso"] = mesh_torso_0;
  colliders["torso"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [0.28, 0.3, 0.62], "isTrigger": false};

  const endpoint_neck_1 = makeAttachmentEndpoint(null);
  const node_neck_1 = new THREE.Group();
  node_neck_1.name = "Laid-back neck__pivot";
  node_neck_1.scale.set(1, 1, 1);
  if (endpoint_neck_1) {
    node_neck_1.position.copy(endpoint_neck_1.start);
    node_neck_1.rotation.set(-0.55, 0.0, 0.0);
  } else {
    node_neck_1.position.set(0.0, 0.16, 0.25);
    node_neck_1.rotation.set(-0.55, 0.0, 0.0);
  }
  node_neck_1.userData.sculptComponent = {"id": "neck", "name": "Laid-back neck", "level": "macro", "role": "neck-mass", "importance": 0.9, "confidence": 0.9, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "A long tapered neck broadens into the withers without a visible seam.", "geometryDescriptor": {"topologyIntent": "tapered forward-raked loft"}, "parent": "torso", "attachment": {"parentId": "torso", "parentSocket": "withers", "localStart": [0, 0, 0], "localEnd": [0, 0.27, 0.14], "contactType": "embedded organic joint", "overlap": 0.05, "gapTolerance": 0.005, "evidenceRefs": ["profile"]}, "dimensions": {"width": 0.18, "height": 0.34, "depth": 0.23, "units": "m", "confidence": 0.88}, "transform": {"position": [0, 0.16, 0.25], "rotation": [-0.55, 0, 0]}, "actionProfile": {"animationRole": "neck", "pivot": {"mode": "socket", "localPosition": [0, -0.14, -0.06], "axis": [1, 0, 0], "confidence": 0.9}}, "material": "coat", "localFeatures": [{"id": "shoulder-flow", "type": "contour", "geometryEffect": "wide buried neck root"}], "evidenceRefs": ["profile"], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_neck_1.userData.actionProfile = {"animationRole": "neck", "pivot": {"mode": "socket", "localPosition": [0, -0.14, -0.06], "axis": [1, 0, 0], "confidence": 0.9}};
  (nodes["torso"] ?? root).add(node_neck_1);
  nodes["neck"] = node_neck_1;
  const mesh_neck_1Geometry = endpoint_neck_1
    ? new THREE.CylinderGeometry(endpoint_neck_1.endRadius, endpoint_neck_1.baseRadius, endpoint_neck_1.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_neck_1) {
    mesh_neck_1Geometry.scale(0.18, 0.34, 0.23);
  }
  const mesh_neck_1 = new THREE.Mesh(
    mesh_neck_1Geometry,
    materialMap["coat"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_neck_1.name = "Laid-back neck";
  if (endpoint_neck_1) {
    mesh_neck_1.position.copy(endpoint_neck_1.midpoint);
    mesh_neck_1.quaternion.copy(endpoint_neck_1.quaternion);
  }
  mesh_neck_1.castShadow = options.castShadow ?? true;
  mesh_neck_1.receiveShadow = options.receiveShadow ?? true;
  mesh_neck_1.userData.sculptComponent = {"id": "neck", "name": "Laid-back neck", "level": "macro", "role": "neck-mass", "importance": 0.9, "confidence": 0.9, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "A long tapered neck broadens into the withers without a visible seam.", "geometryDescriptor": {"topologyIntent": "tapered forward-raked loft"}, "parent": "torso", "attachment": {"parentId": "torso", "parentSocket": "withers", "localStart": [0, 0, 0], "localEnd": [0, 0.27, 0.14], "contactType": "embedded organic joint", "overlap": 0.05, "gapTolerance": 0.005, "evidenceRefs": ["profile"]}, "dimensions": {"width": 0.18, "height": 0.34, "depth": 0.23, "units": "m", "confidence": 0.88}, "transform": {"position": [0, 0.16, 0.25], "rotation": [-0.55, 0, 0]}, "actionProfile": {"animationRole": "neck", "pivot": {"mode": "socket", "localPosition": [0, -0.14, -0.06], "axis": [1, 0, 0], "confidence": 0.9}}, "material": "coat", "localFeatures": [{"id": "shoulder-flow", "type": "contour", "geometryEffect": "wide buried neck root"}], "evidenceRefs": ["profile"], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_neck_1.add(mesh_neck_1);
  meshes["neck"] = mesh_neck_1;
  colliders["neck"] = {};

  const endpoint_head_2 = makeAttachmentEndpoint(null);
  const node_head_2 = new THREE.Group();
  node_head_2.name = "Long lean setter skull__pivot";
  node_head_2.scale.set(1, 1, 1);
  if (endpoint_head_2) {
    node_head_2.position.copy(endpoint_head_2.start);
    node_head_2.rotation.set(0.48, 0.0, 0.0);
  } else {
    node_head_2.position.set(0.0, 0.19, 0.08);
    node_head_2.rotation.set(0.48, 0.0, 0.0);
  }
  node_head_2.userData.sculptComponent = {"id": "head", "name": "Long lean setter skull", "level": "macro", "role": "skull", "importance": 1, "confidence": 0.95, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The skull is a long narrow organic volume with near-parallel roof and jaw planes.", "geometryDescriptor": {"topologyIntent": "faceted long-skull loft with restrained stop"}, "parent": "neck", "attachment": {"parentId": "neck", "parentSocket": "poll", "localStart": [0, 0, 0], "localEnd": [0, 0, 0.18], "contactType": "embedded organic joint", "overlap": 0.035, "gapTolerance": 0.004, "evidenceRefs": ["profile", "head-three-quarter"]}, "dimensions": {"width": 0.15, "height": 0.14, "depth": 0.27, "units": "m", "confidence": 0.93}, "transform": {"position": [0, 0.19, 0.08], "rotation": [0.48, 0, 0]}, "actionProfile": {"animationRole": "head", "pivot": {"mode": "poll", "localPosition": [0, 0, -0.11], "axis": [1, 0, 0], "confidence": 0.92}}, "material": "coat", "materialLayers": ["coat", "patch"], "localFeatures": [{"id": "head-planes", "type": "contour", "geometryEffect": "parallel skull and muzzle planes"}, {"id": "flews", "type": "contour", "geometryEffect": "square pendant lower lip step"}], "evidenceRefs": ["profile", "head-three-quarter"], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(53, 48, 43, 1)", "materialClass": "fabric", "materialClassConfidence": 0.8}};
  node_head_2.userData.actionProfile = {"animationRole": "head", "pivot": {"mode": "poll", "localPosition": [0, 0, -0.11], "axis": [1, 0, 0], "confidence": 0.92}};
  (nodes["neck"] ?? root).add(node_head_2);
  nodes["head"] = node_head_2;
  const mesh_head_2Geometry = endpoint_head_2
    ? new THREE.CylinderGeometry(endpoint_head_2.endRadius, endpoint_head_2.baseRadius, endpoint_head_2.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_head_2) {
    mesh_head_2Geometry.scale(0.15, 0.14, 0.27);
  }
  const mesh_head_2 = new THREE.Mesh(
    mesh_head_2Geometry,
    materialMap["coat"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_head_2.name = "Long lean setter skull";
  if (endpoint_head_2) {
    mesh_head_2.position.copy(endpoint_head_2.midpoint);
    mesh_head_2.quaternion.copy(endpoint_head_2.quaternion);
  }
  mesh_head_2.castShadow = options.castShadow ?? true;
  mesh_head_2.receiveShadow = options.receiveShadow ?? true;
  mesh_head_2.userData.sculptComponent = {"id": "head", "name": "Long lean setter skull", "level": "macro", "role": "skull", "importance": 1, "confidence": 0.95, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The skull is a long narrow organic volume with near-parallel roof and jaw planes.", "geometryDescriptor": {"topologyIntent": "faceted long-skull loft with restrained stop"}, "parent": "neck", "attachment": {"parentId": "neck", "parentSocket": "poll", "localStart": [0, 0, 0], "localEnd": [0, 0, 0.18], "contactType": "embedded organic joint", "overlap": 0.035, "gapTolerance": 0.004, "evidenceRefs": ["profile", "head-three-quarter"]}, "dimensions": {"width": 0.15, "height": 0.14, "depth": 0.27, "units": "m", "confidence": 0.93}, "transform": {"position": [0, 0.19, 0.08], "rotation": [0.48, 0, 0]}, "actionProfile": {"animationRole": "head", "pivot": {"mode": "poll", "localPosition": [0, 0, -0.11], "axis": [1, 0, 0], "confidence": 0.92}}, "material": "coat", "materialLayers": ["coat", "patch"], "localFeatures": [{"id": "head-planes", "type": "contour", "geometryEffect": "parallel skull and muzzle planes"}, {"id": "flews", "type": "contour", "geometryEffect": "square pendant lower lip step"}], "evidenceRefs": ["profile", "head-three-quarter"], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(53, 48, 43, 1)", "materialClass": "fabric", "materialClassConfidence": 0.8}};
  node_head_2.add(mesh_head_2);
  meshes["head"] = mesh_head_2;
  colliders["head"] = {};

  const endpoint_shoulder_girdle_3 = makeAttachmentEndpoint(null);
  const node_shoulder_girdle_3 = new THREE.Group();
  node_shoulder_girdle_3.name = "Forechest and shoulder girdle__pivot";
  node_shoulder_girdle_3.scale.set(1, 1, 1);
  if (endpoint_shoulder_girdle_3) {
    node_shoulder_girdle_3.position.copy(endpoint_shoulder_girdle_3.start);
    node_shoulder_girdle_3.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_shoulder_girdle_3.position.set(0.0, -0.01, 0.23);
    node_shoulder_girdle_3.rotation.set(0.0, 0.0, 0.0);
  }
  node_shoulder_girdle_3.userData.sculptComponent = {"id": "shoulder-girdle", "name": "Forechest and shoulder girdle", "level": "macro", "role": "body-mass", "importance": 0.88, "confidence": 0.88, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The forequarters project ahead of the legs and carry the deepest body section.", "geometryDescriptor": {"topologyIntent": "broad chest volume embedded in torso"}, "parent": "torso", "attachment": {"parentId": "torso", "parentSocket": "forechest", "localStart": [0, 0, -0.1], "localEnd": [0, 0, 0.12], "contactType": "embedded organic joint", "overlap": 0.06, "gapTolerance": 0.004}, "dimensions": {"width": 0.31, "height": 0.31, "depth": 0.25, "units": "m", "confidence": 0.86}, "transform": {"position": [0, -0.01, 0.23], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "body-part", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.85}}, "material": "coat", "evidenceRefs": ["profile", "working-three-quarter"], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_shoulder_girdle_3.userData.actionProfile = {"animationRole": "body-part", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.85}};
  (nodes["torso"] ?? root).add(node_shoulder_girdle_3);
  nodes["shoulder-girdle"] = node_shoulder_girdle_3;
  const mesh_shoulder_girdle_3Geometry = endpoint_shoulder_girdle_3
    ? new THREE.CylinderGeometry(endpoint_shoulder_girdle_3.endRadius, endpoint_shoulder_girdle_3.baseRadius, endpoint_shoulder_girdle_3.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_shoulder_girdle_3) {
    mesh_shoulder_girdle_3Geometry.scale(0.31, 0.31, 0.25);
  }
  const mesh_shoulder_girdle_3 = new THREE.Mesh(
    mesh_shoulder_girdle_3Geometry,
    materialMap["coat"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_shoulder_girdle_3.name = "Forechest and shoulder girdle";
  if (endpoint_shoulder_girdle_3) {
    mesh_shoulder_girdle_3.position.copy(endpoint_shoulder_girdle_3.midpoint);
    mesh_shoulder_girdle_3.quaternion.copy(endpoint_shoulder_girdle_3.quaternion);
  }
  mesh_shoulder_girdle_3.castShadow = options.castShadow ?? true;
  mesh_shoulder_girdle_3.receiveShadow = options.receiveShadow ?? true;
  mesh_shoulder_girdle_3.userData.sculptComponent = {"id": "shoulder-girdle", "name": "Forechest and shoulder girdle", "level": "macro", "role": "body-mass", "importance": 0.88, "confidence": 0.88, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The forequarters project ahead of the legs and carry the deepest body section.", "geometryDescriptor": {"topologyIntent": "broad chest volume embedded in torso"}, "parent": "torso", "attachment": {"parentId": "torso", "parentSocket": "forechest", "localStart": [0, 0, -0.1], "localEnd": [0, 0, 0.12], "contactType": "embedded organic joint", "overlap": 0.06, "gapTolerance": 0.004}, "dimensions": {"width": 0.31, "height": 0.31, "depth": 0.25, "units": "m", "confidence": 0.86}, "transform": {"position": [0, -0.01, 0.23], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "body-part", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.85}}, "material": "coat", "evidenceRefs": ["profile", "working-three-quarter"], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_shoulder_girdle_3.add(mesh_shoulder_girdle_3);
  meshes["shoulder-girdle"] = mesh_shoulder_girdle_3;
  colliders["shoulder-girdle"] = {};

  const endpoint_pelvis_4 = makeAttachmentEndpoint(null);
  const node_pelvis_4 = new THREE.Group();
  node_pelvis_4.name = "Rounded pelvis and rump__pivot";
  node_pelvis_4.scale.set(1, 1, 1);
  if (endpoint_pelvis_4) {
    node_pelvis_4.position.copy(endpoint_pelvis_4.start);
    node_pelvis_4.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pelvis_4.position.set(0.0, 0.02, -0.25);
    node_pelvis_4.rotation.set(0.0, 0.0, 0.0);
  }
  node_pelvis_4.userData.sculptComponent = {"id": "pelvis", "name": "Rounded pelvis and rump", "level": "macro", "role": "body-mass", "importance": 0.86, "confidence": 0.88, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The loin widens into a rounded rump that anchors both thigh sockets and tail root.", "geometryDescriptor": {"topologyIntent": "compact pelvis loft embedded in rear torso"}, "parent": "torso", "attachment": {"parentId": "torso", "parentSocket": "loin", "localStart": [0, 0, 0.08], "localEnd": [0, 0, -0.12], "contactType": "embedded organic joint", "overlap": 0.06, "gapTolerance": 0.004}, "dimensions": {"width": 0.29, "height": 0.26, "depth": 0.28, "units": "m", "confidence": 0.88}, "transform": {"position": [0, 0.02, -0.25], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "body-part", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.85}}, "material": "coat", "evidenceRefs": ["profile", "resting-three-quarter"], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(53, 48, 43, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_pelvis_4.userData.actionProfile = {"animationRole": "body-part", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.85}};
  (nodes["torso"] ?? root).add(node_pelvis_4);
  nodes["pelvis"] = node_pelvis_4;
  const mesh_pelvis_4Geometry = endpoint_pelvis_4
    ? new THREE.CylinderGeometry(endpoint_pelvis_4.endRadius, endpoint_pelvis_4.baseRadius, endpoint_pelvis_4.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_pelvis_4) {
    mesh_pelvis_4Geometry.scale(0.29, 0.26, 0.28);
  }
  const mesh_pelvis_4 = new THREE.Mesh(
    mesh_pelvis_4Geometry,
    materialMap["coat"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pelvis_4.name = "Rounded pelvis and rump";
  if (endpoint_pelvis_4) {
    mesh_pelvis_4.position.copy(endpoint_pelvis_4.midpoint);
    mesh_pelvis_4.quaternion.copy(endpoint_pelvis_4.quaternion);
  }
  mesh_pelvis_4.castShadow = options.castShadow ?? true;
  mesh_pelvis_4.receiveShadow = options.receiveShadow ?? true;
  mesh_pelvis_4.userData.sculptComponent = {"id": "pelvis", "name": "Rounded pelvis and rump", "level": "macro", "role": "body-mass", "importance": 0.86, "confidence": 0.88, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The loin widens into a rounded rump that anchors both thigh sockets and tail root.", "geometryDescriptor": {"topologyIntent": "compact pelvis loft embedded in rear torso"}, "parent": "torso", "attachment": {"parentId": "torso", "parentSocket": "loin", "localStart": [0, 0, 0.08], "localEnd": [0, 0, -0.12], "contactType": "embedded organic joint", "overlap": 0.06, "gapTolerance": 0.004}, "dimensions": {"width": 0.29, "height": 0.26, "depth": 0.28, "units": "m", "confidence": 0.88}, "transform": {"position": [0, 0.02, -0.25], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "body-part", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.85}}, "material": "coat", "evidenceRefs": ["profile", "resting-three-quarter"], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(53, 48, 43, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_pelvis_4.add(mesh_pelvis_4);
  meshes["pelvis"] = mesh_pelvis_4;
  colliders["pelvis"] = {};

  const endpoint_tail_root_5 = makeAttachmentEndpoint(null);
  const node_tail_root_5 = new THREE.Group();
  node_tail_root_5.name = "Tail root__pivot";
  node_tail_root_5.scale.set(1, 1, 1);
  if (endpoint_tail_root_5) {
    node_tail_root_5.position.copy(endpoint_tail_root_5.start);
    node_tail_root_5.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_tail_root_5.position.set(0.0, 0.08, -0.16);
    node_tail_root_5.rotation.set(0.0, 0.0, 0.0);
  }
  node_tail_root_5.userData.sculptComponent = {"id": "tail-root", "name": "Tail root", "level": "macro", "role": "tail", "importance": 0.8, "confidence": 0.92, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The proximal tail is rump-thick and curves smoothly out of the topline.", "geometryDescriptor": {"topologyIntent": "short tapered root mass"}, "parent": "pelvis", "attachment": {"parentId": "pelvis", "parentSocket": "tail-base", "localStart": [0, 0, 0], "localEnd": [0, 0, -0.15], "contactType": "embedded ball joint", "overlap": 0.035, "gapTolerance": 0.003, "evidenceRefs": ["profile"]}, "dimensions": {"width": 0.075, "height": 0.085, "depth": 0.22, "units": "m", "confidence": 0.9}, "transform": {"position": [0, 0.08, -0.16], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "tail-root", "pivot": {"mode": "socket", "localPosition": [0, 0, 0.09], "axis": [1, 0, 0], "confidence": 0.94}}, "material": "coat", "evidenceRefs": ["profile"], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_tail_root_5.userData.actionProfile = {"animationRole": "tail-root", "pivot": {"mode": "socket", "localPosition": [0, 0, 0.09], "axis": [1, 0, 0], "confidence": 0.94}};
  (nodes["pelvis"] ?? root).add(node_tail_root_5);
  nodes["tail-root"] = node_tail_root_5;
  const mesh_tail_root_5Geometry = endpoint_tail_root_5
    ? new THREE.CylinderGeometry(endpoint_tail_root_5.endRadius, endpoint_tail_root_5.baseRadius, endpoint_tail_root_5.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_tail_root_5) {
    mesh_tail_root_5Geometry.scale(0.075, 0.085, 0.22);
  }
  const mesh_tail_root_5 = new THREE.Mesh(
    mesh_tail_root_5Geometry,
    materialMap["coat"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_tail_root_5.name = "Tail root";
  if (endpoint_tail_root_5) {
    mesh_tail_root_5.position.copy(endpoint_tail_root_5.midpoint);
    mesh_tail_root_5.quaternion.copy(endpoint_tail_root_5.quaternion);
  }
  mesh_tail_root_5.castShadow = options.castShadow ?? true;
  mesh_tail_root_5.receiveShadow = options.receiveShadow ?? true;
  mesh_tail_root_5.userData.sculptComponent = {"id": "tail-root", "name": "Tail root", "level": "macro", "role": "tail", "importance": 0.8, "confidence": 0.92, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The proximal tail is rump-thick and curves smoothly out of the topline.", "geometryDescriptor": {"topologyIntent": "short tapered root mass"}, "parent": "pelvis", "attachment": {"parentId": "pelvis", "parentSocket": "tail-base", "localStart": [0, 0, 0], "localEnd": [0, 0, -0.15], "contactType": "embedded ball joint", "overlap": 0.035, "gapTolerance": 0.003, "evidenceRefs": ["profile"]}, "dimensions": {"width": 0.075, "height": 0.085, "depth": 0.22, "units": "m", "confidence": 0.9}, "transform": {"position": [0, 0.08, -0.16], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "tail-root", "pivot": {"mode": "socket", "localPosition": [0, 0, 0.09], "axis": [1, 0, 0], "confidence": 0.94}}, "material": "coat", "evidenceRefs": ["profile"], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_tail_root_5.add(mesh_tail_root_5);
  meshes["tail-root"] = mesh_tail_root_5;
  colliders["tail-root"] = {};

  const endpoint_tail_flag_6 = makeAttachmentEndpoint(null);
  const node_tail_flag_6 = new THREE.Group();
  node_tail_flag_6.name = "Straight feathered tail flag__pivot";
  node_tail_flag_6.scale.set(1, 1, 1);
  if (endpoint_tail_flag_6) {
    node_tail_flag_6.position.copy(endpoint_tail_flag_6.start);
    node_tail_flag_6.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_tail_flag_6.position.set(0.0, 0.0, -0.18);
    node_tail_flag_6.rotation.set(0.0, 0.0, 0.0);
  }
  node_tail_flag_6.userData.sculptComponent = {"id": "tail-flag", "name": "Straight feathered tail flag", "level": "macro", "role": "tail", "importance": 0.9, "confidence": 0.95, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "A straight tapered bone with a deep notched underside fringe defines the rear silhouette.", "geometryDescriptor": {"topologyIntent": "tapered shaft plus paired rigid feather facets"}, "parent": "tail-root", "attachment": {"parentId": "tail-root", "parentSocket": "tail-mid", "localStart": [0, 0, 0], "localEnd": [0, 0, -0.34], "contactType": "hinged organic joint", "overlap": 0.03, "gapTolerance": 0.003, "evidenceRefs": ["profile"]}, "dimensions": {"width": 0.065, "height": 0.09, "depth": 0.37, "units": "m", "confidence": 0.93}, "transform": {"position": [0, 0, -0.18], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "tail-flag", "pivot": {"mode": "root", "localPosition": [0, 0, 0.17], "axis": [1, 0, 0], "confidence": 0.94}}, "material": "coat", "localFeatures": [{"id": "tail-fringe", "type": "contour", "geometryEffect": "three descending notched underside locks"}], "evidenceRefs": ["profile"], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_tail_flag_6.userData.actionProfile = {"animationRole": "tail-flag", "pivot": {"mode": "root", "localPosition": [0, 0, 0.17], "axis": [1, 0, 0], "confidence": 0.94}};
  (nodes["tail-root"] ?? root).add(node_tail_flag_6);
  nodes["tail-flag"] = node_tail_flag_6;
  const mesh_tail_flag_6Geometry = endpoint_tail_flag_6
    ? new THREE.CylinderGeometry(endpoint_tail_flag_6.endRadius, endpoint_tail_flag_6.baseRadius, endpoint_tail_flag_6.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_tail_flag_6) {
    mesh_tail_flag_6Geometry.scale(0.065, 0.09, 0.37);
  }
  const mesh_tail_flag_6 = new THREE.Mesh(
    mesh_tail_flag_6Geometry,
    materialMap["coat"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_tail_flag_6.name = "Straight feathered tail flag";
  if (endpoint_tail_flag_6) {
    mesh_tail_flag_6.position.copy(endpoint_tail_flag_6.midpoint);
    mesh_tail_flag_6.quaternion.copy(endpoint_tail_flag_6.quaternion);
  }
  mesh_tail_flag_6.castShadow = options.castShadow ?? true;
  mesh_tail_flag_6.receiveShadow = options.receiveShadow ?? true;
  mesh_tail_flag_6.userData.sculptComponent = {"id": "tail-flag", "name": "Straight feathered tail flag", "level": "macro", "role": "tail", "importance": 0.9, "confidence": 0.95, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "A straight tapered bone with a deep notched underside fringe defines the rear silhouette.", "geometryDescriptor": {"topologyIntent": "tapered shaft plus paired rigid feather facets"}, "parent": "tail-root", "attachment": {"parentId": "tail-root", "parentSocket": "tail-mid", "localStart": [0, 0, 0], "localEnd": [0, 0, -0.34], "contactType": "hinged organic joint", "overlap": 0.03, "gapTolerance": 0.003, "evidenceRefs": ["profile"]}, "dimensions": {"width": 0.065, "height": 0.09, "depth": 0.37, "units": "m", "confidence": 0.93}, "transform": {"position": [0, 0, -0.18], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "tail-flag", "pivot": {"mode": "root", "localPosition": [0, 0, 0.17], "axis": [1, 0, 0], "confidence": 0.94}}, "material": "coat", "localFeatures": [{"id": "tail-fringe", "type": "contour", "geometryEffect": "three descending notched underside locks"}], "evidenceRefs": ["profile"], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_tail_flag_6.add(mesh_tail_flag_6);
  meshes["tail-flag"] = mesh_tail_flag_6;
  colliders["tail-flag"] = {};

  const endpoint_muzzle_7 = makeAttachmentEndpoint(null);
  const node_muzzle_7 = new THREE.Group();
  node_muzzle_7.name = "Long square muzzle__pivot";
  node_muzzle_7.scale.set(1, 1, 1);
  if (endpoint_muzzle_7) {
    node_muzzle_7.position.copy(endpoint_muzzle_7.start);
    node_muzzle_7.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_muzzle_7.position.set(0.0, -0.02, 0.18);
    node_muzzle_7.rotation.set(0.0, 0.0, 0.0);
  }
  node_muzzle_7.userData.sculptComponent = {"id": "muzzle", "name": "Long square muzzle", "level": "meso", "role": "facial-volume", "importance": 0.95, "confidence": 0.94, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The muzzle is long, deep and only slightly tapered, with a squared end rather than a pointed snout.", "geometryDescriptor": {"topologyIntent": "four-section squared organic loft"}, "parent": "head", "attachment": {"parentId": "head", "parentSocket": "stop", "localStart": [0, 0, 0], "localEnd": [0, 0, 0.18], "contactType": "embedded organic joint", "overlap": 0.035, "gapTolerance": 0.003}, "dimensions": {"width": 0.105, "height": 0.09, "depth": 0.21, "units": "m", "confidence": 0.92}, "transform": {"position": [0, -0.02, 0.18], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "face-part", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.85}}, "material": "coat", "evidenceRefs": ["profile", "head-three-quarter"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_muzzle_7.userData.actionProfile = {"animationRole": "face-part", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.85}};
  (nodes["head"] ?? root).add(node_muzzle_7);
  nodes["muzzle"] = node_muzzle_7;
  const mesh_muzzle_7Geometry = endpoint_muzzle_7
    ? new THREE.CylinderGeometry(endpoint_muzzle_7.endRadius, endpoint_muzzle_7.baseRadius, endpoint_muzzle_7.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_muzzle_7) {
    mesh_muzzle_7Geometry.scale(0.105, 0.09, 0.21);
  }
  const mesh_muzzle_7 = new THREE.Mesh(
    mesh_muzzle_7Geometry,
    materialMap["coat"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_muzzle_7.name = "Long square muzzle";
  if (endpoint_muzzle_7) {
    mesh_muzzle_7.position.copy(endpoint_muzzle_7.midpoint);
    mesh_muzzle_7.quaternion.copy(endpoint_muzzle_7.quaternion);
  }
  mesh_muzzle_7.castShadow = options.castShadow ?? true;
  mesh_muzzle_7.receiveShadow = options.receiveShadow ?? true;
  mesh_muzzle_7.userData.sculptComponent = {"id": "muzzle", "name": "Long square muzzle", "level": "meso", "role": "facial-volume", "importance": 0.95, "confidence": 0.94, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The muzzle is long, deep and only slightly tapered, with a squared end rather than a pointed snout.", "geometryDescriptor": {"topologyIntent": "four-section squared organic loft"}, "parent": "head", "attachment": {"parentId": "head", "parentSocket": "stop", "localStart": [0, 0, 0], "localEnd": [0, 0, 0.18], "contactType": "embedded organic joint", "overlap": 0.035, "gapTolerance": 0.003}, "dimensions": {"width": 0.105, "height": 0.09, "depth": 0.21, "units": "m", "confidence": 0.92}, "transform": {"position": [0, -0.02, 0.18], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "face-part", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.85}}, "material": "coat", "evidenceRefs": ["profile", "head-three-quarter"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_muzzle_7.add(mesh_muzzle_7);
  meshes["muzzle"] = mesh_muzzle_7;
  colliders["muzzle"] = {};

  const endpoint_ear_l_8 = makeAttachmentEndpoint(null);
  const node_ear_l_8 = new THREE.Group();
  node_ear_l_8.name = "Left dropped ear appendage__pivot";
  node_ear_l_8.scale.set(1, 1, 1);
  if (endpoint_ear_l_8) {
    node_ear_l_8.position.copy(endpoint_ear_l_8.start);
    node_ear_l_8.rotation.set(0.12, -0.18, 0.22);
  } else {
    node_ear_l_8.position.set(0.09, -0.035, -0.01);
    node_ear_l_8.rotation.set(0.12, -0.18, 0.22);
  }
  node_ear_l_8.userData.sculptComponent = {"id": "ear-l", "name": "Left dropped ear appendage", "level": "meso", "role": "appendage", "importance": 0.92, "confidence": 0.91, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The low-set ear is a thin but volumetric folded flap with a rounded feathered tip.", "geometryDescriptor": {"topologyIntent": "two-lobe flattened organic loft"}, "parent": "head", "attachment": {"parentId": "head", "parentSocket": "ear-left", "localStart": [0, 0.02, 0.03], "localEnd": [0.02, -0.14, 0], "contactType": "folded soft-tissue joint", "overlap": 0.025, "gapTolerance": 0.003, "evidenceRefs": ["head-three-quarter"]}, "dimensions": {"width": 0.065, "height": 0.18, "depth": 0.11, "units": "m", "confidence": 0.9}, "transform": {"position": [0.09, -0.035, -0.01], "rotation": [0.12, -0.18, 0.22]}, "actionProfile": {"animationRole": "ear", "pivot": {"mode": "root", "localPosition": [0, 0.08, 0], "axis": [0, 0, 1], "confidence": 0.9}}, "material": "patch", "localFeatures": [{"id": "ear-drop", "type": "contour", "geometryEffect": "low root and blunt hanging tip"}], "evidenceRefs": ["profile", "head-three-quarter"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(53, 48, 43, 1)", "secondaryAlbedo": "rgba(88, 75, 66, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_ear_l_8.userData.actionProfile = {"animationRole": "ear", "pivot": {"mode": "root", "localPosition": [0, 0.08, 0], "axis": [0, 0, 1], "confidence": 0.9}};
  (nodes["head"] ?? root).add(node_ear_l_8);
  nodes["ear-l"] = node_ear_l_8;
  const mesh_ear_l_8Geometry = endpoint_ear_l_8
    ? new THREE.CylinderGeometry(endpoint_ear_l_8.endRadius, endpoint_ear_l_8.baseRadius, endpoint_ear_l_8.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_ear_l_8) {
    mesh_ear_l_8Geometry.scale(0.065, 0.18, 0.11);
  }
  const mesh_ear_l_8 = new THREE.Mesh(
    mesh_ear_l_8Geometry,
    materialMap["patch"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_ear_l_8.name = "Left dropped ear appendage";
  if (endpoint_ear_l_8) {
    mesh_ear_l_8.position.copy(endpoint_ear_l_8.midpoint);
    mesh_ear_l_8.quaternion.copy(endpoint_ear_l_8.quaternion);
  }
  mesh_ear_l_8.castShadow = options.castShadow ?? true;
  mesh_ear_l_8.receiveShadow = options.receiveShadow ?? true;
  mesh_ear_l_8.userData.sculptComponent = {"id": "ear-l", "name": "Left dropped ear appendage", "level": "meso", "role": "appendage", "importance": 0.92, "confidence": 0.91, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The low-set ear is a thin but volumetric folded flap with a rounded feathered tip.", "geometryDescriptor": {"topologyIntent": "two-lobe flattened organic loft"}, "parent": "head", "attachment": {"parentId": "head", "parentSocket": "ear-left", "localStart": [0, 0.02, 0.03], "localEnd": [0.02, -0.14, 0], "contactType": "folded soft-tissue joint", "overlap": 0.025, "gapTolerance": 0.003, "evidenceRefs": ["head-three-quarter"]}, "dimensions": {"width": 0.065, "height": 0.18, "depth": 0.11, "units": "m", "confidence": 0.9}, "transform": {"position": [0.09, -0.035, -0.01], "rotation": [0.12, -0.18, 0.22]}, "actionProfile": {"animationRole": "ear", "pivot": {"mode": "root", "localPosition": [0, 0.08, 0], "axis": [0, 0, 1], "confidence": 0.9}}, "material": "patch", "localFeatures": [{"id": "ear-drop", "type": "contour", "geometryEffect": "low root and blunt hanging tip"}], "evidenceRefs": ["profile", "head-three-quarter"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(53, 48, 43, 1)", "secondaryAlbedo": "rgba(88, 75, 66, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_ear_l_8.add(mesh_ear_l_8);
  meshes["ear-l"] = mesh_ear_l_8;
  colliders["ear-l"] = {};

  const endpoint_ear_r_9 = makeAttachmentEndpoint(null);
  const node_ear_r_9 = new THREE.Group();
  node_ear_r_9.name = "Right dropped ear appendage__pivot";
  node_ear_r_9.scale.set(1, 1, 1);
  if (endpoint_ear_r_9) {
    node_ear_r_9.position.copy(endpoint_ear_r_9.start);
    node_ear_r_9.rotation.set(0.12, 0.18, -0.22);
  } else {
    node_ear_r_9.position.set(-0.09, -0.035, -0.01);
    node_ear_r_9.rotation.set(0.12, 0.18, -0.22);
  }
  node_ear_r_9.userData.sculptComponent = {"id": "ear-r", "name": "Right dropped ear appendage", "level": "meso", "role": "appendage", "importance": 0.92, "confidence": 0.84, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Bilateral evidence supports a mirrored low-set folded ear with controlled asymmetry in pose.", "geometryDescriptor": {"topologyIntent": "mirrored two-lobe flattened organic loft"}, "parent": "head", "attachment": {"parentId": "head", "parentSocket": "ear-right", "localStart": [0, 0.02, 0.03], "localEnd": [-0.02, -0.14, 0], "contactType": "folded soft-tissue joint", "overlap": 0.025, "gapTolerance": 0.003, "evidenceRefs": ["working-three-quarter"]}, "dimensions": {"width": 0.065, "height": 0.18, "depth": 0.11, "units": "m", "confidence": 0.84}, "transform": {"position": [-0.09, -0.035, -0.01], "rotation": [0.12, 0.18, -0.22]}, "actionProfile": {"animationRole": "ear", "pivot": {"mode": "root", "localPosition": [0, 0.08, 0], "axis": [0, 0, 1], "confidence": 0.84}}, "material": "patch", "evidenceRefs": ["working-three-quarter", "head-three-quarter"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(53, 48, 43, 1)", "secondaryAlbedo": "rgba(88, 75, 66, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_ear_r_9.userData.actionProfile = {"animationRole": "ear", "pivot": {"mode": "root", "localPosition": [0, 0.08, 0], "axis": [0, 0, 1], "confidence": 0.84}};
  (nodes["head"] ?? root).add(node_ear_r_9);
  nodes["ear-r"] = node_ear_r_9;
  const mesh_ear_r_9Geometry = endpoint_ear_r_9
    ? new THREE.CylinderGeometry(endpoint_ear_r_9.endRadius, endpoint_ear_r_9.baseRadius, endpoint_ear_r_9.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_ear_r_9) {
    mesh_ear_r_9Geometry.scale(0.065, 0.18, 0.11);
  }
  const mesh_ear_r_9 = new THREE.Mesh(
    mesh_ear_r_9Geometry,
    materialMap["patch"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_ear_r_9.name = "Right dropped ear appendage";
  if (endpoint_ear_r_9) {
    mesh_ear_r_9.position.copy(endpoint_ear_r_9.midpoint);
    mesh_ear_r_9.quaternion.copy(endpoint_ear_r_9.quaternion);
  }
  mesh_ear_r_9.castShadow = options.castShadow ?? true;
  mesh_ear_r_9.receiveShadow = options.receiveShadow ?? true;
  mesh_ear_r_9.userData.sculptComponent = {"id": "ear-r", "name": "Right dropped ear appendage", "level": "meso", "role": "appendage", "importance": 0.92, "confidence": 0.84, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Bilateral evidence supports a mirrored low-set folded ear with controlled asymmetry in pose.", "geometryDescriptor": {"topologyIntent": "mirrored two-lobe flattened organic loft"}, "parent": "head", "attachment": {"parentId": "head", "parentSocket": "ear-right", "localStart": [0, 0.02, 0.03], "localEnd": [-0.02, -0.14, 0], "contactType": "folded soft-tissue joint", "overlap": 0.025, "gapTolerance": 0.003, "evidenceRefs": ["working-three-quarter"]}, "dimensions": {"width": 0.065, "height": 0.18, "depth": 0.11, "units": "m", "confidence": 0.84}, "transform": {"position": [-0.09, -0.035, -0.01], "rotation": [0.12, 0.18, -0.22]}, "actionProfile": {"animationRole": "ear", "pivot": {"mode": "root", "localPosition": [0, 0.08, 0], "axis": [0, 0, 1], "confidence": 0.84}}, "material": "patch", "evidenceRefs": ["working-three-quarter", "head-three-quarter"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(53, 48, 43, 1)", "secondaryAlbedo": "rgba(88, 75, 66, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_ear_r_9.add(mesh_ear_r_9);
  meshes["ear-r"] = mesh_ear_r_9;
  colliders["ear-r"] = {};

  const endpoint_fore_leg_l_10 = makeAttachmentEndpoint(null);
  const node_fore_leg_l_10 = new THREE.Group();
  node_fore_leg_l_10.name = "Left fore leg upper limb__pivot";
  node_fore_leg_l_10.scale.set(1, 1, 1);
  if (endpoint_fore_leg_l_10) {
    node_fore_leg_l_10.position.copy(endpoint_fore_leg_l_10.start);
    node_fore_leg_l_10.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_fore_leg_l_10.position.set(0.1, -0.23, 0.03);
    node_fore_leg_l_10.rotation.set(0.0, 0.0, 0.0);
  }
  node_fore_leg_l_10.userData.sculptComponent = {"id": "fore-leg-l", "name": "Left fore leg upper limb", "level": "meso", "role": "limb", "importance": 0.88, "confidence": 0.93, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "A straight load-bearing upper foreleg descends from the deep shoulder mass.", "geometryDescriptor": {"topologyIntent": "vertical tapered limb loft"}, "parent": "shoulder-girdle", "attachment": {"parentId": "shoulder-girdle", "parentSocket": "fore-left", "localStart": [0, 0.1, 0], "localEnd": [0, -0.22, 0], "contactType": "embedded shoulder joint", "overlap": 0.05, "gapTolerance": 0.003, "evidenceRefs": ["profile"]}, "dimensions": {"width": 0.09, "height": 0.31, "depth": 0.11, "units": "m", "confidence": 0.9}, "transform": {"position": [0.1, -0.23, 0.03], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "fore-upper", "pivot": {"mode": "root", "localPosition": [0, 0.14, 0], "axis": [1, 0, 0], "confidence": 0.94}}, "material": "coat", "localFeatures": [{"id": "straight-fore", "type": "contour", "geometryEffect": "near-vertical shoulder-to-wrist column"}], "evidenceRefs": ["profile"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_fore_leg_l_10.userData.actionProfile = {"animationRole": "fore-upper", "pivot": {"mode": "root", "localPosition": [0, 0.14, 0], "axis": [1, 0, 0], "confidence": 0.94}};
  (nodes["shoulder-girdle"] ?? root).add(node_fore_leg_l_10);
  nodes["fore-leg-l"] = node_fore_leg_l_10;
  const mesh_fore_leg_l_10Geometry = endpoint_fore_leg_l_10
    ? new THREE.CylinderGeometry(endpoint_fore_leg_l_10.endRadius, endpoint_fore_leg_l_10.baseRadius, endpoint_fore_leg_l_10.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_fore_leg_l_10) {
    mesh_fore_leg_l_10Geometry.scale(0.09, 0.31, 0.11);
  }
  const mesh_fore_leg_l_10 = new THREE.Mesh(
    mesh_fore_leg_l_10Geometry,
    materialMap["coat"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_fore_leg_l_10.name = "Left fore leg upper limb";
  if (endpoint_fore_leg_l_10) {
    mesh_fore_leg_l_10.position.copy(endpoint_fore_leg_l_10.midpoint);
    mesh_fore_leg_l_10.quaternion.copy(endpoint_fore_leg_l_10.quaternion);
  }
  mesh_fore_leg_l_10.castShadow = options.castShadow ?? true;
  mesh_fore_leg_l_10.receiveShadow = options.receiveShadow ?? true;
  mesh_fore_leg_l_10.userData.sculptComponent = {"id": "fore-leg-l", "name": "Left fore leg upper limb", "level": "meso", "role": "limb", "importance": 0.88, "confidence": 0.93, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "A straight load-bearing upper foreleg descends from the deep shoulder mass.", "geometryDescriptor": {"topologyIntent": "vertical tapered limb loft"}, "parent": "shoulder-girdle", "attachment": {"parentId": "shoulder-girdle", "parentSocket": "fore-left", "localStart": [0, 0.1, 0], "localEnd": [0, -0.22, 0], "contactType": "embedded shoulder joint", "overlap": 0.05, "gapTolerance": 0.003, "evidenceRefs": ["profile"]}, "dimensions": {"width": 0.09, "height": 0.31, "depth": 0.11, "units": "m", "confidence": 0.9}, "transform": {"position": [0.1, -0.23, 0.03], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "fore-upper", "pivot": {"mode": "root", "localPosition": [0, 0.14, 0], "axis": [1, 0, 0], "confidence": 0.94}}, "material": "coat", "localFeatures": [{"id": "straight-fore", "type": "contour", "geometryEffect": "near-vertical shoulder-to-wrist column"}], "evidenceRefs": ["profile"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_fore_leg_l_10.add(mesh_fore_leg_l_10);
  meshes["fore-leg-l"] = mesh_fore_leg_l_10;
  colliders["fore-leg-l"] = {};

  const endpoint_fore_leg_r_11 = makeAttachmentEndpoint(null);
  const node_fore_leg_r_11 = new THREE.Group();
  node_fore_leg_r_11.name = "Right fore leg upper limb__pivot";
  node_fore_leg_r_11.scale.set(1, 1, 1);
  if (endpoint_fore_leg_r_11) {
    node_fore_leg_r_11.position.copy(endpoint_fore_leg_r_11.start);
    node_fore_leg_r_11.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_fore_leg_r_11.position.set(-0.1, -0.23, 0.03);
    node_fore_leg_r_11.rotation.set(0.0, 0.0, 0.0);
  }
  node_fore_leg_r_11.userData.sculptComponent = {"id": "fore-leg-r", "name": "Right fore leg upper limb", "level": "meso", "role": "limb", "importance": 0.88, "confidence": 0.84, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Bilateral anatomy supports a matching straight foreleg with slight stance offset.", "geometryDescriptor": {"topologyIntent": "mirrored vertical tapered limb loft"}, "parent": "shoulder-girdle", "attachment": {"parentId": "shoulder-girdle", "parentSocket": "fore-right", "localStart": [0, 0.1, 0], "localEnd": [0, -0.22, 0], "contactType": "embedded shoulder joint", "overlap": 0.05, "gapTolerance": 0.003, "evidenceRefs": ["working-three-quarter"]}, "dimensions": {"width": 0.09, "height": 0.31, "depth": 0.11, "units": "m", "confidence": 0.84}, "transform": {"position": [-0.1, -0.23, 0.03], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "fore-upper", "pivot": {"mode": "root", "localPosition": [0, 0.14, 0], "axis": [1, 0, 0], "confidence": 0.86}}, "material": "coat", "evidenceRefs": ["working-three-quarter"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_fore_leg_r_11.userData.actionProfile = {"animationRole": "fore-upper", "pivot": {"mode": "root", "localPosition": [0, 0.14, 0], "axis": [1, 0, 0], "confidence": 0.86}};
  (nodes["shoulder-girdle"] ?? root).add(node_fore_leg_r_11);
  nodes["fore-leg-r"] = node_fore_leg_r_11;
  const mesh_fore_leg_r_11Geometry = endpoint_fore_leg_r_11
    ? new THREE.CylinderGeometry(endpoint_fore_leg_r_11.endRadius, endpoint_fore_leg_r_11.baseRadius, endpoint_fore_leg_r_11.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_fore_leg_r_11) {
    mesh_fore_leg_r_11Geometry.scale(0.09, 0.31, 0.11);
  }
  const mesh_fore_leg_r_11 = new THREE.Mesh(
    mesh_fore_leg_r_11Geometry,
    materialMap["coat"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_fore_leg_r_11.name = "Right fore leg upper limb";
  if (endpoint_fore_leg_r_11) {
    mesh_fore_leg_r_11.position.copy(endpoint_fore_leg_r_11.midpoint);
    mesh_fore_leg_r_11.quaternion.copy(endpoint_fore_leg_r_11.quaternion);
  }
  mesh_fore_leg_r_11.castShadow = options.castShadow ?? true;
  mesh_fore_leg_r_11.receiveShadow = options.receiveShadow ?? true;
  mesh_fore_leg_r_11.userData.sculptComponent = {"id": "fore-leg-r", "name": "Right fore leg upper limb", "level": "meso", "role": "limb", "importance": 0.88, "confidence": 0.84, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Bilateral anatomy supports a matching straight foreleg with slight stance offset.", "geometryDescriptor": {"topologyIntent": "mirrored vertical tapered limb loft"}, "parent": "shoulder-girdle", "attachment": {"parentId": "shoulder-girdle", "parentSocket": "fore-right", "localStart": [0, 0.1, 0], "localEnd": [0, -0.22, 0], "contactType": "embedded shoulder joint", "overlap": 0.05, "gapTolerance": 0.003, "evidenceRefs": ["working-three-quarter"]}, "dimensions": {"width": 0.09, "height": 0.31, "depth": 0.11, "units": "m", "confidence": 0.84}, "transform": {"position": [-0.1, -0.23, 0.03], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "fore-upper", "pivot": {"mode": "root", "localPosition": [0, 0.14, 0], "axis": [1, 0, 0], "confidence": 0.86}}, "material": "coat", "evidenceRefs": ["working-three-quarter"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_fore_leg_r_11.add(mesh_fore_leg_r_11);
  meshes["fore-leg-r"] = mesh_fore_leg_r_11;
  colliders["fore-leg-r"] = {};

  const endpoint_fore_lower_l_12 = makeAttachmentEndpoint(null);
  const node_fore_lower_l_12 = new THREE.Group();
  node_fore_lower_l_12.name = "Left fore lower limb__pivot";
  node_fore_lower_l_12.scale.set(1, 1, 1);
  if (endpoint_fore_lower_l_12) {
    node_fore_lower_l_12.position.copy(endpoint_fore_lower_l_12.start);
    node_fore_lower_l_12.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_fore_lower_l_12.position.set(0.0, -0.24, 0.0);
    node_fore_lower_l_12.rotation.set(0.0, 0.0, 0.0);
  }
  node_fore_lower_l_12.userData.sculptComponent = {"id": "fore-lower-l", "name": "Left fore lower limb", "level": "meso", "role": "limb", "importance": 0.82, "confidence": 0.92, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The lower foreleg stays lean and nearly vertical with a short sloped pastern.", "geometryDescriptor": {"topologyIntent": "lean tapered limb loft"}, "parent": "fore-leg-l", "attachment": {"parentId": "fore-leg-l", "parentSocket": "fore-knee-left", "localStart": [0, 0.04, 0], "localEnd": [0, -0.2, 0], "contactType": "hinged knee joint", "overlap": 0.025, "gapTolerance": 0.002}, "dimensions": {"width": 0.065, "height": 0.23, "depth": 0.075, "units": "m", "confidence": 0.9}, "transform": {"position": [0, -0.24, 0], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "fore-lower", "pivot": {"mode": "root", "localPosition": [0, 0.1, 0], "axis": [1, 0, 0], "confidence": 0.94}}, "material": "coat-shadow", "evidenceRefs": ["profile"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(211, 201, 180, 1)", "secondaryAlbedo": "rgba(183, 172, 153, 1)", "materialClass": "fabric", "materialClassConfidence": 0.76}};
  node_fore_lower_l_12.userData.actionProfile = {"animationRole": "fore-lower", "pivot": {"mode": "root", "localPosition": [0, 0.1, 0], "axis": [1, 0, 0], "confidence": 0.94}};
  (nodes["fore-leg-l"] ?? root).add(node_fore_lower_l_12);
  nodes["fore-lower-l"] = node_fore_lower_l_12;
  const mesh_fore_lower_l_12Geometry = endpoint_fore_lower_l_12
    ? new THREE.CylinderGeometry(endpoint_fore_lower_l_12.endRadius, endpoint_fore_lower_l_12.baseRadius, endpoint_fore_lower_l_12.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_fore_lower_l_12) {
    mesh_fore_lower_l_12Geometry.scale(0.065, 0.23, 0.075);
  }
  const mesh_fore_lower_l_12 = new THREE.Mesh(
    mesh_fore_lower_l_12Geometry,
    materialMap["coat-shadow"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_fore_lower_l_12.name = "Left fore lower limb";
  if (endpoint_fore_lower_l_12) {
    mesh_fore_lower_l_12.position.copy(endpoint_fore_lower_l_12.midpoint);
    mesh_fore_lower_l_12.quaternion.copy(endpoint_fore_lower_l_12.quaternion);
  }
  mesh_fore_lower_l_12.castShadow = options.castShadow ?? true;
  mesh_fore_lower_l_12.receiveShadow = options.receiveShadow ?? true;
  mesh_fore_lower_l_12.userData.sculptComponent = {"id": "fore-lower-l", "name": "Left fore lower limb", "level": "meso", "role": "limb", "importance": 0.82, "confidence": 0.92, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The lower foreleg stays lean and nearly vertical with a short sloped pastern.", "geometryDescriptor": {"topologyIntent": "lean tapered limb loft"}, "parent": "fore-leg-l", "attachment": {"parentId": "fore-leg-l", "parentSocket": "fore-knee-left", "localStart": [0, 0.04, 0], "localEnd": [0, -0.2, 0], "contactType": "hinged knee joint", "overlap": 0.025, "gapTolerance": 0.002}, "dimensions": {"width": 0.065, "height": 0.23, "depth": 0.075, "units": "m", "confidence": 0.9}, "transform": {"position": [0, -0.24, 0], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "fore-lower", "pivot": {"mode": "root", "localPosition": [0, 0.1, 0], "axis": [1, 0, 0], "confidence": 0.94}}, "material": "coat-shadow", "evidenceRefs": ["profile"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(211, 201, 180, 1)", "secondaryAlbedo": "rgba(183, 172, 153, 1)", "materialClass": "fabric", "materialClassConfidence": 0.76}};
  node_fore_lower_l_12.add(mesh_fore_lower_l_12);
  meshes["fore-lower-l"] = mesh_fore_lower_l_12;
  colliders["fore-lower-l"] = {};

  const endpoint_fore_lower_r_13 = makeAttachmentEndpoint(null);
  const node_fore_lower_r_13 = new THREE.Group();
  node_fore_lower_r_13.name = "Right fore lower limb__pivot";
  node_fore_lower_r_13.scale.set(1, 1, 1);
  if (endpoint_fore_lower_r_13) {
    node_fore_lower_r_13.position.copy(endpoint_fore_lower_r_13.start);
    node_fore_lower_r_13.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_fore_lower_r_13.position.set(0.0, -0.24, 0.0);
    node_fore_lower_r_13.rotation.set(0.0, 0.0, 0.0);
  }
  node_fore_lower_r_13.userData.sculptComponent = {"id": "fore-lower-r", "name": "Right fore lower limb", "level": "meso", "role": "limb", "importance": 0.82, "confidence": 0.82, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The far lower foreleg mirrors the same lean column with a controlled stance offset.", "geometryDescriptor": {"topologyIntent": "mirrored lean tapered limb loft"}, "parent": "fore-leg-r", "attachment": {"parentId": "fore-leg-r", "parentSocket": "fore-knee-right", "localStart": [0, 0.04, 0], "localEnd": [0, -0.2, 0], "contactType": "hinged knee joint", "overlap": 0.025, "gapTolerance": 0.002}, "dimensions": {"width": 0.065, "height": 0.23, "depth": 0.075, "units": "m", "confidence": 0.82}, "transform": {"position": [0, -0.24, 0], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "fore-lower", "pivot": {"mode": "root", "localPosition": [0, 0.1, 0], "axis": [1, 0, 0], "confidence": 0.84}}, "material": "coat-shadow", "evidenceRefs": ["working-three-quarter"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(211, 201, 180, 1)", "secondaryAlbedo": "rgba(183, 172, 153, 1)", "materialClass": "fabric", "materialClassConfidence": 0.76}};
  node_fore_lower_r_13.userData.actionProfile = {"animationRole": "fore-lower", "pivot": {"mode": "root", "localPosition": [0, 0.1, 0], "axis": [1, 0, 0], "confidence": 0.84}};
  (nodes["fore-leg-r"] ?? root).add(node_fore_lower_r_13);
  nodes["fore-lower-r"] = node_fore_lower_r_13;
  const mesh_fore_lower_r_13Geometry = endpoint_fore_lower_r_13
    ? new THREE.CylinderGeometry(endpoint_fore_lower_r_13.endRadius, endpoint_fore_lower_r_13.baseRadius, endpoint_fore_lower_r_13.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_fore_lower_r_13) {
    mesh_fore_lower_r_13Geometry.scale(0.065, 0.23, 0.075);
  }
  const mesh_fore_lower_r_13 = new THREE.Mesh(
    mesh_fore_lower_r_13Geometry,
    materialMap["coat-shadow"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_fore_lower_r_13.name = "Right fore lower limb";
  if (endpoint_fore_lower_r_13) {
    mesh_fore_lower_r_13.position.copy(endpoint_fore_lower_r_13.midpoint);
    mesh_fore_lower_r_13.quaternion.copy(endpoint_fore_lower_r_13.quaternion);
  }
  mesh_fore_lower_r_13.castShadow = options.castShadow ?? true;
  mesh_fore_lower_r_13.receiveShadow = options.receiveShadow ?? true;
  mesh_fore_lower_r_13.userData.sculptComponent = {"id": "fore-lower-r", "name": "Right fore lower limb", "level": "meso", "role": "limb", "importance": 0.82, "confidence": 0.82, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The far lower foreleg mirrors the same lean column with a controlled stance offset.", "geometryDescriptor": {"topologyIntent": "mirrored lean tapered limb loft"}, "parent": "fore-leg-r", "attachment": {"parentId": "fore-leg-r", "parentSocket": "fore-knee-right", "localStart": [0, 0.04, 0], "localEnd": [0, -0.2, 0], "contactType": "hinged knee joint", "overlap": 0.025, "gapTolerance": 0.002}, "dimensions": {"width": 0.065, "height": 0.23, "depth": 0.075, "units": "m", "confidence": 0.82}, "transform": {"position": [0, -0.24, 0], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "fore-lower", "pivot": {"mode": "root", "localPosition": [0, 0.1, 0], "axis": [1, 0, 0], "confidence": 0.84}}, "material": "coat-shadow", "evidenceRefs": ["working-three-quarter"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(211, 201, 180, 1)", "secondaryAlbedo": "rgba(183, 172, 153, 1)", "materialClass": "fabric", "materialClassConfidence": 0.76}};
  node_fore_lower_r_13.add(mesh_fore_lower_r_13);
  meshes["fore-lower-r"] = mesh_fore_lower_r_13;
  colliders["fore-lower-r"] = {};

  const endpoint_fore_paw_l_14 = makeAttachmentEndpoint(null);
  const node_fore_paw_l_14 = new THREE.Group();
  node_fore_paw_l_14.name = "Left fore paw__pivot";
  node_fore_paw_l_14.scale.set(1, 1, 1);
  if (endpoint_fore_paw_l_14) {
    node_fore_paw_l_14.position.copy(endpoint_fore_paw_l_14.start);
    node_fore_paw_l_14.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_fore_paw_l_14.position.set(0.0, -0.135, 0.04);
    node_fore_paw_l_14.rotation.set(0.0, 0.0, 0.0);
  }
  node_fore_paw_l_14.userData.sculptComponent = {"id": "fore-paw-l", "name": "Left fore paw", "level": "meso", "role": "paw", "importance": 0.7, "confidence": 0.9, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "A compact forward-extended paw block anchors the exact sole marker.", "geometryDescriptor": {"topologyIntent": "flattened forward oval"}, "parent": "fore-lower-l", "attachment": {"parentId": "fore-lower-l", "parentSocket": "fore-wrist-left", "localStart": [0, 0.02, -0.02], "localEnd": [0, -0.03, 0.06], "contactType": "embedded pastern joint", "overlap": 0.02, "gapTolerance": 0.001}, "dimensions": {"width": 0.08, "height": 0.05, "depth": 0.13, "units": "m", "confidence": 0.88}, "transform": {"position": [0, -0.135, 0.04], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "paw-tip", "pivot": {"mode": "sole", "localPosition": [0, -0.025, 0.02], "axis": [0, 1, 0], "confidence": 0.95}}, "material": "coat-shadow", "evidenceRefs": ["profile"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 172, 153, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.76}};
  node_fore_paw_l_14.userData.actionProfile = {"animationRole": "paw-tip", "pivot": {"mode": "sole", "localPosition": [0, -0.025, 0.02], "axis": [0, 1, 0], "confidence": 0.95}};
  (nodes["fore-lower-l"] ?? root).add(node_fore_paw_l_14);
  nodes["fore-paw-l"] = node_fore_paw_l_14;
  const mesh_fore_paw_l_14Geometry = endpoint_fore_paw_l_14
    ? new THREE.CylinderGeometry(endpoint_fore_paw_l_14.endRadius, endpoint_fore_paw_l_14.baseRadius, endpoint_fore_paw_l_14.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_fore_paw_l_14) {
    mesh_fore_paw_l_14Geometry.scale(0.08, 0.05, 0.13);
  }
  const mesh_fore_paw_l_14 = new THREE.Mesh(
    mesh_fore_paw_l_14Geometry,
    materialMap["coat-shadow"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_fore_paw_l_14.name = "Left fore paw";
  if (endpoint_fore_paw_l_14) {
    mesh_fore_paw_l_14.position.copy(endpoint_fore_paw_l_14.midpoint);
    mesh_fore_paw_l_14.quaternion.copy(endpoint_fore_paw_l_14.quaternion);
  }
  mesh_fore_paw_l_14.castShadow = options.castShadow ?? true;
  mesh_fore_paw_l_14.receiveShadow = options.receiveShadow ?? true;
  mesh_fore_paw_l_14.userData.sculptComponent = {"id": "fore-paw-l", "name": "Left fore paw", "level": "meso", "role": "paw", "importance": 0.7, "confidence": 0.9, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "A compact forward-extended paw block anchors the exact sole marker.", "geometryDescriptor": {"topologyIntent": "flattened forward oval"}, "parent": "fore-lower-l", "attachment": {"parentId": "fore-lower-l", "parentSocket": "fore-wrist-left", "localStart": [0, 0.02, -0.02], "localEnd": [0, -0.03, 0.06], "contactType": "embedded pastern joint", "overlap": 0.02, "gapTolerance": 0.001}, "dimensions": {"width": 0.08, "height": 0.05, "depth": 0.13, "units": "m", "confidence": 0.88}, "transform": {"position": [0, -0.135, 0.04], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "paw-tip", "pivot": {"mode": "sole", "localPosition": [0, -0.025, 0.02], "axis": [0, 1, 0], "confidence": 0.95}}, "material": "coat-shadow", "evidenceRefs": ["profile"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 172, 153, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.76}};
  node_fore_paw_l_14.add(mesh_fore_paw_l_14);
  meshes["fore-paw-l"] = mesh_fore_paw_l_14;
  colliders["fore-paw-l"] = {};

  const endpoint_fore_paw_r_15 = makeAttachmentEndpoint(null);
  const node_fore_paw_r_15 = new THREE.Group();
  node_fore_paw_r_15.name = "Right fore paw__pivot";
  node_fore_paw_r_15.scale.set(1, 1, 1);
  if (endpoint_fore_paw_r_15) {
    node_fore_paw_r_15.position.copy(endpoint_fore_paw_r_15.start);
    node_fore_paw_r_15.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_fore_paw_r_15.position.set(0.0, -0.135, 0.04);
    node_fore_paw_r_15.rotation.set(0.0, 0.0, 0.0);
  }
  node_fore_paw_r_15.userData.sculptComponent = {"id": "fore-paw-r", "name": "Right fore paw", "level": "meso", "role": "paw", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The far paw mirrors the compact forward sole while retaining an independent marker.", "geometryDescriptor": {"topologyIntent": "mirrored flattened forward oval"}, "parent": "fore-lower-r", "attachment": {"parentId": "fore-lower-r", "parentSocket": "fore-wrist-right", "localStart": [0, 0.02, -0.02], "localEnd": [0, -0.03, 0.06], "contactType": "embedded pastern joint", "overlap": 0.02, "gapTolerance": 0.001}, "dimensions": {"width": 0.08, "height": 0.05, "depth": 0.13, "units": "m", "confidence": 0.8}, "transform": {"position": [0, -0.135, 0.04], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "paw-tip", "pivot": {"mode": "sole", "localPosition": [0, -0.025, 0.02], "axis": [0, 1, 0], "confidence": 0.84}}, "material": "coat-shadow", "evidenceRefs": ["working-three-quarter"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 172, 153, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.76}};
  node_fore_paw_r_15.userData.actionProfile = {"animationRole": "paw-tip", "pivot": {"mode": "sole", "localPosition": [0, -0.025, 0.02], "axis": [0, 1, 0], "confidence": 0.84}};
  (nodes["fore-lower-r"] ?? root).add(node_fore_paw_r_15);
  nodes["fore-paw-r"] = node_fore_paw_r_15;
  const mesh_fore_paw_r_15Geometry = endpoint_fore_paw_r_15
    ? new THREE.CylinderGeometry(endpoint_fore_paw_r_15.endRadius, endpoint_fore_paw_r_15.baseRadius, endpoint_fore_paw_r_15.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_fore_paw_r_15) {
    mesh_fore_paw_r_15Geometry.scale(0.08, 0.05, 0.13);
  }
  const mesh_fore_paw_r_15 = new THREE.Mesh(
    mesh_fore_paw_r_15Geometry,
    materialMap["coat-shadow"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_fore_paw_r_15.name = "Right fore paw";
  if (endpoint_fore_paw_r_15) {
    mesh_fore_paw_r_15.position.copy(endpoint_fore_paw_r_15.midpoint);
    mesh_fore_paw_r_15.quaternion.copy(endpoint_fore_paw_r_15.quaternion);
  }
  mesh_fore_paw_r_15.castShadow = options.castShadow ?? true;
  mesh_fore_paw_r_15.receiveShadow = options.receiveShadow ?? true;
  mesh_fore_paw_r_15.userData.sculptComponent = {"id": "fore-paw-r", "name": "Right fore paw", "level": "meso", "role": "paw", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The far paw mirrors the compact forward sole while retaining an independent marker.", "geometryDescriptor": {"topologyIntent": "mirrored flattened forward oval"}, "parent": "fore-lower-r", "attachment": {"parentId": "fore-lower-r", "parentSocket": "fore-wrist-right", "localStart": [0, 0.02, -0.02], "localEnd": [0, -0.03, 0.06], "contactType": "embedded pastern joint", "overlap": 0.02, "gapTolerance": 0.001}, "dimensions": {"width": 0.08, "height": 0.05, "depth": 0.13, "units": "m", "confidence": 0.8}, "transform": {"position": [0, -0.135, 0.04], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "paw-tip", "pivot": {"mode": "sole", "localPosition": [0, -0.025, 0.02], "axis": [0, 1, 0], "confidence": 0.84}}, "material": "coat-shadow", "evidenceRefs": ["working-three-quarter"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 172, 153, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.76}};
  node_fore_paw_r_15.add(mesh_fore_paw_r_15);
  meshes["fore-paw-r"] = mesh_fore_paw_r_15;
  colliders["fore-paw-r"] = {};

  const endpoint_hind_leg_l_16 = makeAttachmentEndpoint(null);
  const node_hind_leg_l_16 = new THREE.Group();
  node_hind_leg_l_16.name = "Left hind upper limb__pivot";
  node_hind_leg_l_16.scale.set(1, 1, 1);
  if (endpoint_hind_leg_l_16) {
    node_hind_leg_l_16.position.copy(endpoint_hind_leg_l_16.start);
    node_hind_leg_l_16.rotation.set(0.28, 0.0, 0.0);
  } else {
    node_hind_leg_l_16.position.set(0.1, -0.22, -0.01);
    node_hind_leg_l_16.rotation.set(0.28, 0.0, 0.0);
  }
  node_hind_leg_l_16.userData.sculptComponent = {"id": "hind-leg-l", "name": "Left hind upper limb", "level": "meso", "role": "limb", "importance": 0.9, "confidence": 0.93, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "A broad thigh turns forward toward the stifle instead of dropping as a straight rear column.", "geometryDescriptor": {"topologyIntent": "broad tapered thigh loft"}, "parent": "pelvis", "attachment": {"parentId": "pelvis", "parentSocket": "hip-left", "localStart": [0, 0.1, 0], "localEnd": [0, -0.23, 0.06], "contactType": "embedded hip joint", "overlap": 0.055, "gapTolerance": 0.003, "evidenceRefs": ["profile"]}, "dimensions": {"width": 0.105, "height": 0.33, "depth": 0.16, "units": "m", "confidence": 0.9}, "transform": {"position": [0.1, -0.22, -0.01], "rotation": [0.28, 0, 0]}, "actionProfile": {"animationRole": "hind-upper", "pivot": {"mode": "root", "localPosition": [0, 0.14, -0.03], "axis": [1, 0, 0], "confidence": 0.94}}, "material": "coat", "localFeatures": [{"id": "hock-angle", "type": "contour", "geometryEffect": "forward stifle then rearward hock chain"}], "evidenceRefs": ["profile"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_hind_leg_l_16.userData.actionProfile = {"animationRole": "hind-upper", "pivot": {"mode": "root", "localPosition": [0, 0.14, -0.03], "axis": [1, 0, 0], "confidence": 0.94}};
  (nodes["pelvis"] ?? root).add(node_hind_leg_l_16);
  nodes["hind-leg-l"] = node_hind_leg_l_16;
  const mesh_hind_leg_l_16Geometry = endpoint_hind_leg_l_16
    ? new THREE.CylinderGeometry(endpoint_hind_leg_l_16.endRadius, endpoint_hind_leg_l_16.baseRadius, endpoint_hind_leg_l_16.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_hind_leg_l_16) {
    mesh_hind_leg_l_16Geometry.scale(0.105, 0.33, 0.16);
  }
  const mesh_hind_leg_l_16 = new THREE.Mesh(
    mesh_hind_leg_l_16Geometry,
    materialMap["coat"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hind_leg_l_16.name = "Left hind upper limb";
  if (endpoint_hind_leg_l_16) {
    mesh_hind_leg_l_16.position.copy(endpoint_hind_leg_l_16.midpoint);
    mesh_hind_leg_l_16.quaternion.copy(endpoint_hind_leg_l_16.quaternion);
  }
  mesh_hind_leg_l_16.castShadow = options.castShadow ?? true;
  mesh_hind_leg_l_16.receiveShadow = options.receiveShadow ?? true;
  mesh_hind_leg_l_16.userData.sculptComponent = {"id": "hind-leg-l", "name": "Left hind upper limb", "level": "meso", "role": "limb", "importance": 0.9, "confidence": 0.93, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "A broad thigh turns forward toward the stifle instead of dropping as a straight rear column.", "geometryDescriptor": {"topologyIntent": "broad tapered thigh loft"}, "parent": "pelvis", "attachment": {"parentId": "pelvis", "parentSocket": "hip-left", "localStart": [0, 0.1, 0], "localEnd": [0, -0.23, 0.06], "contactType": "embedded hip joint", "overlap": 0.055, "gapTolerance": 0.003, "evidenceRefs": ["profile"]}, "dimensions": {"width": 0.105, "height": 0.33, "depth": 0.16, "units": "m", "confidence": 0.9}, "transform": {"position": [0.1, -0.22, -0.01], "rotation": [0.28, 0, 0]}, "actionProfile": {"animationRole": "hind-upper", "pivot": {"mode": "root", "localPosition": [0, 0.14, -0.03], "axis": [1, 0, 0], "confidence": 0.94}}, "material": "coat", "localFeatures": [{"id": "hock-angle", "type": "contour", "geometryEffect": "forward stifle then rearward hock chain"}], "evidenceRefs": ["profile"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_hind_leg_l_16.add(mesh_hind_leg_l_16);
  meshes["hind-leg-l"] = mesh_hind_leg_l_16;
  colliders["hind-leg-l"] = {};

  const endpoint_hind_leg_r_17 = makeAttachmentEndpoint(null);
  const node_hind_leg_r_17 = new THREE.Group();
  node_hind_leg_r_17.name = "Right hind upper limb__pivot";
  node_hind_leg_r_17.scale.set(1, 1, 1);
  if (endpoint_hind_leg_r_17) {
    node_hind_leg_r_17.position.copy(endpoint_hind_leg_r_17.start);
    node_hind_leg_r_17.rotation.set(0.28, 0.0, 0.0);
  } else {
    node_hind_leg_r_17.position.set(-0.1, -0.22, -0.01);
    node_hind_leg_r_17.rotation.set(0.28, 0.0, 0.0);
  }
  node_hind_leg_r_17.userData.sculptComponent = {"id": "hind-leg-r", "name": "Right hind upper limb", "level": "meso", "role": "limb", "importance": 0.9, "confidence": 0.82, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Bilateral anatomy supports the same broad thigh and forward stifle on the far side.", "geometryDescriptor": {"topologyIntent": "mirrored broad tapered thigh loft"}, "parent": "pelvis", "attachment": {"parentId": "pelvis", "parentSocket": "hip-right", "localStart": [0, 0.1, 0], "localEnd": [0, -0.23, 0.06], "contactType": "embedded hip joint", "overlap": 0.055, "gapTolerance": 0.003, "evidenceRefs": ["resting-three-quarter"]}, "dimensions": {"width": 0.105, "height": 0.33, "depth": 0.16, "units": "m", "confidence": 0.82}, "transform": {"position": [-0.1, -0.22, -0.01], "rotation": [0.28, 0, 0]}, "actionProfile": {"animationRole": "hind-upper", "pivot": {"mode": "root", "localPosition": [0, 0.14, -0.03], "axis": [1, 0, 0], "confidence": 0.84}}, "material": "coat", "evidenceRefs": ["resting-three-quarter"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_hind_leg_r_17.userData.actionProfile = {"animationRole": "hind-upper", "pivot": {"mode": "root", "localPosition": [0, 0.14, -0.03], "axis": [1, 0, 0], "confidence": 0.84}};
  (nodes["pelvis"] ?? root).add(node_hind_leg_r_17);
  nodes["hind-leg-r"] = node_hind_leg_r_17;
  const mesh_hind_leg_r_17Geometry = endpoint_hind_leg_r_17
    ? new THREE.CylinderGeometry(endpoint_hind_leg_r_17.endRadius, endpoint_hind_leg_r_17.baseRadius, endpoint_hind_leg_r_17.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_hind_leg_r_17) {
    mesh_hind_leg_r_17Geometry.scale(0.105, 0.33, 0.16);
  }
  const mesh_hind_leg_r_17 = new THREE.Mesh(
    mesh_hind_leg_r_17Geometry,
    materialMap["coat"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hind_leg_r_17.name = "Right hind upper limb";
  if (endpoint_hind_leg_r_17) {
    mesh_hind_leg_r_17.position.copy(endpoint_hind_leg_r_17.midpoint);
    mesh_hind_leg_r_17.quaternion.copy(endpoint_hind_leg_r_17.quaternion);
  }
  mesh_hind_leg_r_17.castShadow = options.castShadow ?? true;
  mesh_hind_leg_r_17.receiveShadow = options.receiveShadow ?? true;
  mesh_hind_leg_r_17.userData.sculptComponent = {"id": "hind-leg-r", "name": "Right hind upper limb", "level": "meso", "role": "limb", "importance": 0.9, "confidence": 0.82, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Bilateral anatomy supports the same broad thigh and forward stifle on the far side.", "geometryDescriptor": {"topologyIntent": "mirrored broad tapered thigh loft"}, "parent": "pelvis", "attachment": {"parentId": "pelvis", "parentSocket": "hip-right", "localStart": [0, 0.1, 0], "localEnd": [0, -0.23, 0.06], "contactType": "embedded hip joint", "overlap": 0.055, "gapTolerance": 0.003, "evidenceRefs": ["resting-three-quarter"]}, "dimensions": {"width": 0.105, "height": 0.33, "depth": 0.16, "units": "m", "confidence": 0.82}, "transform": {"position": [-0.1, -0.22, -0.01], "rotation": [0.28, 0, 0]}, "actionProfile": {"animationRole": "hind-upper", "pivot": {"mode": "root", "localPosition": [0, 0.14, -0.03], "axis": [1, 0, 0], "confidence": 0.84}}, "material": "coat", "evidenceRefs": ["resting-three-quarter"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(235, 226, 204, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.78}};
  node_hind_leg_r_17.add(mesh_hind_leg_r_17);
  meshes["hind-leg-r"] = mesh_hind_leg_r_17;
  colliders["hind-leg-r"] = {};

  const endpoint_hind_lower_l_18 = makeAttachmentEndpoint(null);
  const node_hind_lower_l_18 = new THREE.Group();
  node_hind_lower_l_18.name = "Left hind lower limb__pivot";
  node_hind_lower_l_18.scale.set(1, 1, 1);
  if (endpoint_hind_lower_l_18) {
    node_hind_lower_l_18.position.copy(endpoint_hind_lower_l_18.start);
    node_hind_lower_l_18.rotation.set(-0.22, 0.0, 0.0);
  } else {
    node_hind_lower_l_18.position.set(0.0, -0.26, 0.06);
    node_hind_lower_l_18.rotation.set(-0.22, 0.0, 0.0);
  }
  node_hind_lower_l_18.userData.sculptComponent = {"id": "hind-lower-l", "name": "Left hind lower limb", "level": "meso", "role": "limb", "importance": 0.85, "confidence": 0.92, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The long lean rear cannon returns from the hock to a near-vertical pastern.", "geometryDescriptor": {"topologyIntent": "long tapered cannon loft"}, "parent": "hind-leg-l", "attachment": {"parentId": "hind-leg-l", "parentSocket": "hock-left", "localStart": [0, 0.04, 0.04], "localEnd": [0, -0.27, 0], "contactType": "hinged hock joint", "overlap": 0.025, "gapTolerance": 0.002}, "dimensions": {"width": 0.065, "height": 0.3, "depth": 0.075, "units": "m", "confidence": 0.9}, "transform": {"position": [0, -0.26, 0.06], "rotation": [-0.22, 0, 0]}, "actionProfile": {"animationRole": "hind-lower", "pivot": {"mode": "root", "localPosition": [0, 0.13, -0.02], "axis": [1, 0, 0], "confidence": 0.94}}, "material": "coat-shadow", "evidenceRefs": ["profile"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(211, 201, 180, 1)", "secondaryAlbedo": "rgba(183, 172, 153, 1)", "materialClass": "fabric", "materialClassConfidence": 0.76}};
  node_hind_lower_l_18.userData.actionProfile = {"animationRole": "hind-lower", "pivot": {"mode": "root", "localPosition": [0, 0.13, -0.02], "axis": [1, 0, 0], "confidence": 0.94}};
  (nodes["hind-leg-l"] ?? root).add(node_hind_lower_l_18);
  nodes["hind-lower-l"] = node_hind_lower_l_18;
  const mesh_hind_lower_l_18Geometry = endpoint_hind_lower_l_18
    ? new THREE.CylinderGeometry(endpoint_hind_lower_l_18.endRadius, endpoint_hind_lower_l_18.baseRadius, endpoint_hind_lower_l_18.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_hind_lower_l_18) {
    mesh_hind_lower_l_18Geometry.scale(0.065, 0.3, 0.075);
  }
  const mesh_hind_lower_l_18 = new THREE.Mesh(
    mesh_hind_lower_l_18Geometry,
    materialMap["coat-shadow"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hind_lower_l_18.name = "Left hind lower limb";
  if (endpoint_hind_lower_l_18) {
    mesh_hind_lower_l_18.position.copy(endpoint_hind_lower_l_18.midpoint);
    mesh_hind_lower_l_18.quaternion.copy(endpoint_hind_lower_l_18.quaternion);
  }
  mesh_hind_lower_l_18.castShadow = options.castShadow ?? true;
  mesh_hind_lower_l_18.receiveShadow = options.receiveShadow ?? true;
  mesh_hind_lower_l_18.userData.sculptComponent = {"id": "hind-lower-l", "name": "Left hind lower limb", "level": "meso", "role": "limb", "importance": 0.85, "confidence": 0.92, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The long lean rear cannon returns from the hock to a near-vertical pastern.", "geometryDescriptor": {"topologyIntent": "long tapered cannon loft"}, "parent": "hind-leg-l", "attachment": {"parentId": "hind-leg-l", "parentSocket": "hock-left", "localStart": [0, 0.04, 0.04], "localEnd": [0, -0.27, 0], "contactType": "hinged hock joint", "overlap": 0.025, "gapTolerance": 0.002}, "dimensions": {"width": 0.065, "height": 0.3, "depth": 0.075, "units": "m", "confidence": 0.9}, "transform": {"position": [0, -0.26, 0.06], "rotation": [-0.22, 0, 0]}, "actionProfile": {"animationRole": "hind-lower", "pivot": {"mode": "root", "localPosition": [0, 0.13, -0.02], "axis": [1, 0, 0], "confidence": 0.94}}, "material": "coat-shadow", "evidenceRefs": ["profile"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(211, 201, 180, 1)", "secondaryAlbedo": "rgba(183, 172, 153, 1)", "materialClass": "fabric", "materialClassConfidence": 0.76}};
  node_hind_lower_l_18.add(mesh_hind_lower_l_18);
  meshes["hind-lower-l"] = mesh_hind_lower_l_18;
  colliders["hind-lower-l"] = {};

  const endpoint_hind_lower_r_19 = makeAttachmentEndpoint(null);
  const node_hind_lower_r_19 = new THREE.Group();
  node_hind_lower_r_19.name = "Right hind lower limb__pivot";
  node_hind_lower_r_19.scale.set(1, 1, 1);
  if (endpoint_hind_lower_r_19) {
    node_hind_lower_r_19.position.copy(endpoint_hind_lower_r_19.start);
    node_hind_lower_r_19.rotation.set(-0.22, 0.0, 0.0);
  } else {
    node_hind_lower_r_19.position.set(0.0, -0.26, 0.06);
    node_hind_lower_r_19.rotation.set(-0.22, 0.0, 0.0);
  }
  node_hind_lower_r_19.userData.sculptComponent = {"id": "hind-lower-r", "name": "Right hind lower limb", "level": "meso", "role": "limb", "importance": 0.85, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The far rear cannon mirrors the hock return and remains independently plantable.", "geometryDescriptor": {"topologyIntent": "mirrored long tapered cannon loft"}, "parent": "hind-leg-r", "attachment": {"parentId": "hind-leg-r", "parentSocket": "hock-right", "localStart": [0, 0.04, 0.04], "localEnd": [0, -0.27, 0], "contactType": "hinged hock joint", "overlap": 0.025, "gapTolerance": 0.002}, "dimensions": {"width": 0.065, "height": 0.3, "depth": 0.075, "units": "m", "confidence": 0.8}, "transform": {"position": [0, -0.26, 0.06], "rotation": [-0.22, 0, 0]}, "actionProfile": {"animationRole": "hind-lower", "pivot": {"mode": "root", "localPosition": [0, 0.13, -0.02], "axis": [1, 0, 0], "confidence": 0.82}}, "material": "coat-shadow", "evidenceRefs": ["resting-three-quarter"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(211, 201, 180, 1)", "secondaryAlbedo": "rgba(183, 172, 153, 1)", "materialClass": "fabric", "materialClassConfidence": 0.76}};
  node_hind_lower_r_19.userData.actionProfile = {"animationRole": "hind-lower", "pivot": {"mode": "root", "localPosition": [0, 0.13, -0.02], "axis": [1, 0, 0], "confidence": 0.82}};
  (nodes["hind-leg-r"] ?? root).add(node_hind_lower_r_19);
  nodes["hind-lower-r"] = node_hind_lower_r_19;
  const mesh_hind_lower_r_19Geometry = endpoint_hind_lower_r_19
    ? new THREE.CylinderGeometry(endpoint_hind_lower_r_19.endRadius, endpoint_hind_lower_r_19.baseRadius, endpoint_hind_lower_r_19.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_hind_lower_r_19) {
    mesh_hind_lower_r_19Geometry.scale(0.065, 0.3, 0.075);
  }
  const mesh_hind_lower_r_19 = new THREE.Mesh(
    mesh_hind_lower_r_19Geometry,
    materialMap["coat-shadow"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hind_lower_r_19.name = "Right hind lower limb";
  if (endpoint_hind_lower_r_19) {
    mesh_hind_lower_r_19.position.copy(endpoint_hind_lower_r_19.midpoint);
    mesh_hind_lower_r_19.quaternion.copy(endpoint_hind_lower_r_19.quaternion);
  }
  mesh_hind_lower_r_19.castShadow = options.castShadow ?? true;
  mesh_hind_lower_r_19.receiveShadow = options.receiveShadow ?? true;
  mesh_hind_lower_r_19.userData.sculptComponent = {"id": "hind-lower-r", "name": "Right hind lower limb", "level": "meso", "role": "limb", "importance": 0.85, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The far rear cannon mirrors the hock return and remains independently plantable.", "geometryDescriptor": {"topologyIntent": "mirrored long tapered cannon loft"}, "parent": "hind-leg-r", "attachment": {"parentId": "hind-leg-r", "parentSocket": "hock-right", "localStart": [0, 0.04, 0.04], "localEnd": [0, -0.27, 0], "contactType": "hinged hock joint", "overlap": 0.025, "gapTolerance": 0.002}, "dimensions": {"width": 0.065, "height": 0.3, "depth": 0.075, "units": "m", "confidence": 0.8}, "transform": {"position": [0, -0.26, 0.06], "rotation": [-0.22, 0, 0]}, "actionProfile": {"animationRole": "hind-lower", "pivot": {"mode": "root", "localPosition": [0, 0.13, -0.02], "axis": [1, 0, 0], "confidence": 0.82}}, "material": "coat-shadow", "evidenceRefs": ["resting-three-quarter"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(211, 201, 180, 1)", "secondaryAlbedo": "rgba(183, 172, 153, 1)", "materialClass": "fabric", "materialClassConfidence": 0.76}};
  node_hind_lower_r_19.add(mesh_hind_lower_r_19);
  meshes["hind-lower-r"] = mesh_hind_lower_r_19;
  colliders["hind-lower-r"] = {};

  const endpoint_hind_paw_l_20 = makeAttachmentEndpoint(null);
  const node_hind_paw_l_20 = new THREE.Group();
  node_hind_paw_l_20.name = "Left hind paw__pivot";
  node_hind_paw_l_20.scale.set(1, 1, 1);
  if (endpoint_hind_paw_l_20) {
    node_hind_paw_l_20.position.copy(endpoint_hind_paw_l_20.start);
    node_hind_paw_l_20.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_hind_paw_l_20.position.set(0.0, -0.17, 0.05);
    node_hind_paw_l_20.rotation.set(0.0, 0.0, 0.0);
  }
  node_hind_paw_l_20.userData.sculptComponent = {"id": "hind-paw-l", "name": "Left hind paw", "level": "meso", "role": "paw", "importance": 0.72, "confidence": 0.9, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "A compact forward paw ends the longer rear chain and anchors its sole marker.", "geometryDescriptor": {"topologyIntent": "flattened forward oval"}, "parent": "hind-lower-l", "attachment": {"parentId": "hind-lower-l", "parentSocket": "hind-wrist-left", "localStart": [0, 0.02, -0.02], "localEnd": [0, -0.03, 0.06], "contactType": "embedded pastern joint", "overlap": 0.02, "gapTolerance": 0.001}, "dimensions": {"width": 0.082, "height": 0.05, "depth": 0.14, "units": "m", "confidence": 0.88}, "transform": {"position": [0, -0.17, 0.05], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "paw-tip", "pivot": {"mode": "sole", "localPosition": [0, -0.025, 0.02], "axis": [0, 1, 0], "confidence": 0.95}}, "material": "coat-shadow", "evidenceRefs": ["profile"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 172, 153, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.76}};
  node_hind_paw_l_20.userData.actionProfile = {"animationRole": "paw-tip", "pivot": {"mode": "sole", "localPosition": [0, -0.025, 0.02], "axis": [0, 1, 0], "confidence": 0.95}};
  (nodes["hind-lower-l"] ?? root).add(node_hind_paw_l_20);
  nodes["hind-paw-l"] = node_hind_paw_l_20;
  const mesh_hind_paw_l_20Geometry = endpoint_hind_paw_l_20
    ? new THREE.CylinderGeometry(endpoint_hind_paw_l_20.endRadius, endpoint_hind_paw_l_20.baseRadius, endpoint_hind_paw_l_20.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_hind_paw_l_20) {
    mesh_hind_paw_l_20Geometry.scale(0.082, 0.05, 0.14);
  }
  const mesh_hind_paw_l_20 = new THREE.Mesh(
    mesh_hind_paw_l_20Geometry,
    materialMap["coat-shadow"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hind_paw_l_20.name = "Left hind paw";
  if (endpoint_hind_paw_l_20) {
    mesh_hind_paw_l_20.position.copy(endpoint_hind_paw_l_20.midpoint);
    mesh_hind_paw_l_20.quaternion.copy(endpoint_hind_paw_l_20.quaternion);
  }
  mesh_hind_paw_l_20.castShadow = options.castShadow ?? true;
  mesh_hind_paw_l_20.receiveShadow = options.receiveShadow ?? true;
  mesh_hind_paw_l_20.userData.sculptComponent = {"id": "hind-paw-l", "name": "Left hind paw", "level": "meso", "role": "paw", "importance": 0.72, "confidence": 0.9, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "A compact forward paw ends the longer rear chain and anchors its sole marker.", "geometryDescriptor": {"topologyIntent": "flattened forward oval"}, "parent": "hind-lower-l", "attachment": {"parentId": "hind-lower-l", "parentSocket": "hind-wrist-left", "localStart": [0, 0.02, -0.02], "localEnd": [0, -0.03, 0.06], "contactType": "embedded pastern joint", "overlap": 0.02, "gapTolerance": 0.001}, "dimensions": {"width": 0.082, "height": 0.05, "depth": 0.14, "units": "m", "confidence": 0.88}, "transform": {"position": [0, -0.17, 0.05], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "paw-tip", "pivot": {"mode": "sole", "localPosition": [0, -0.025, 0.02], "axis": [0, 1, 0], "confidence": 0.95}}, "material": "coat-shadow", "evidenceRefs": ["profile"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 172, 153, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.76}};
  node_hind_paw_l_20.add(mesh_hind_paw_l_20);
  meshes["hind-paw-l"] = mesh_hind_paw_l_20;
  colliders["hind-paw-l"] = {};

  const endpoint_hind_paw_r_21 = makeAttachmentEndpoint(null);
  const node_hind_paw_r_21 = new THREE.Group();
  node_hind_paw_r_21.name = "Right hind paw__pivot";
  node_hind_paw_r_21.scale.set(1, 1, 1);
  if (endpoint_hind_paw_r_21) {
    node_hind_paw_r_21.position.copy(endpoint_hind_paw_r_21.start);
    node_hind_paw_r_21.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_hind_paw_r_21.position.set(0.0, -0.17, 0.05);
    node_hind_paw_r_21.rotation.set(0.0, 0.0, 0.0);
  }
  node_hind_paw_r_21.userData.sculptComponent = {"id": "hind-paw-r", "name": "Right hind paw", "level": "meso", "role": "paw", "importance": 0.72, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The far rear paw preserves the same forward footprint and independent sole marker.", "geometryDescriptor": {"topologyIntent": "mirrored flattened forward oval"}, "parent": "hind-lower-r", "attachment": {"parentId": "hind-lower-r", "parentSocket": "hind-wrist-right", "localStart": [0, 0.02, -0.02], "localEnd": [0, -0.03, 0.06], "contactType": "embedded pastern joint", "overlap": 0.02, "gapTolerance": 0.001}, "dimensions": {"width": 0.082, "height": 0.05, "depth": 0.14, "units": "m", "confidence": 0.8}, "transform": {"position": [0, -0.17, 0.05], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "paw-tip", "pivot": {"mode": "sole", "localPosition": [0, -0.025, 0.02], "axis": [0, 1, 0], "confidence": 0.84}}, "material": "coat-shadow", "evidenceRefs": ["resting-three-quarter"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 172, 153, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.76}};
  node_hind_paw_r_21.userData.actionProfile = {"animationRole": "paw-tip", "pivot": {"mode": "sole", "localPosition": [0, -0.025, 0.02], "axis": [0, 1, 0], "confidence": 0.84}};
  (nodes["hind-lower-r"] ?? root).add(node_hind_paw_r_21);
  nodes["hind-paw-r"] = node_hind_paw_r_21;
  const mesh_hind_paw_r_21Geometry = endpoint_hind_paw_r_21
    ? new THREE.CylinderGeometry(endpoint_hind_paw_r_21.endRadius, endpoint_hind_paw_r_21.baseRadius, endpoint_hind_paw_r_21.length, 8, 4)
    : new THREE.SphereGeometry(0.5, 16, 10);
  if (!endpoint_hind_paw_r_21) {
    mesh_hind_paw_r_21Geometry.scale(0.082, 0.05, 0.14);
  }
  const mesh_hind_paw_r_21 = new THREE.Mesh(
    mesh_hind_paw_r_21Geometry,
    materialMap["coat-shadow"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hind_paw_r_21.name = "Right hind paw";
  if (endpoint_hind_paw_r_21) {
    mesh_hind_paw_r_21.position.copy(endpoint_hind_paw_r_21.midpoint);
    mesh_hind_paw_r_21.quaternion.copy(endpoint_hind_paw_r_21.quaternion);
  }
  mesh_hind_paw_r_21.castShadow = options.castShadow ?? true;
  mesh_hind_paw_r_21.receiveShadow = options.receiveShadow ?? true;
  mesh_hind_paw_r_21.userData.sculptComponent = {"id": "hind-paw-r", "name": "Right hind paw", "level": "meso", "role": "paw", "importance": 0.72, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The far rear paw preserves the same forward footprint and independent sole marker.", "geometryDescriptor": {"topologyIntent": "mirrored flattened forward oval"}, "parent": "hind-lower-r", "attachment": {"parentId": "hind-lower-r", "parentSocket": "hind-wrist-right", "localStart": [0, 0.02, -0.02], "localEnd": [0, -0.03, 0.06], "contactType": "embedded pastern joint", "overlap": 0.02, "gapTolerance": 0.001}, "dimensions": {"width": 0.082, "height": 0.05, "depth": 0.14, "units": "m", "confidence": 0.8}, "transform": {"position": [0, -0.17, 0.05], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "paw-tip", "pivot": {"mode": "sole", "localPosition": [0, -0.025, 0.02], "axis": [0, 1, 0], "confidence": 0.84}}, "material": "coat-shadow", "evidenceRefs": ["resting-three-quarter"], "fidelityTier": "structural-pass", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 172, 153, 1)", "secondaryAlbedo": "rgba(211, 201, 180, 1)", "materialClass": "fabric", "materialClassConfidence": 0.76}};
  node_hind_paw_r_21.add(mesh_hind_paw_r_21);
  meshes["hind-paw-r"] = mesh_hind_paw_r_21;
  colliders["hind-paw-r"] = {};

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "runtime-stylized-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": false, "localOverridesRequired": true, "texturePolicy": "textureless palette-only vertex color", "mustAvoid": ["photo projection", "uniform random spotting", "per-run variation", "non-palette colors"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "white clipping", "flat lee-side value"]}, "screenshotReview": ["Compare profile silhouette.", "Compare front and rear width.", "Compare blue-belton region placement.", "Run the deterministic eight-angle light audit."]};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createBlueBeltonEnglishSetterLookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "Blue-belton English Setter look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === 'reference' ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === 'grazing' ? 0.28 : mode === 'reference' ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === 'reference' ? 0xffcf8a : 0xfff4e8,
    mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15,
  );
  if (mode === 'grazing') key.position.set(7.5, 1.1, 4.0);
  else if (mode === 'reference') key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 7;
  key.shadow.blurSamples = 24;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.updateProjectionMatrix();
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === 'grazing' ? 0.12 : 0.42);
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === 'grazing' ? 0.28 : 0.85);
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = ["Key light: retain the existing directional sun-paint response; inspect pale coat clipping under the brightest ring angle.", "Fill and rim light: retain Uplandin hemisphere/sky fill and shader rim so the lee-side ear, tail and hocks remain legible.", "Exposure and ACES tone mapping stay owned by the current scene; the procedural contact shadow remains the grounding authority."];
  lights.userData.lookDevTargets = {"qualityPriority": "runtime-stylized-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": false, "localOverridesRequired": true, "texturePolicy": "textureless palette-only vertex color", "mustAvoid": ["photo projection", "uniform random spotting", "per-run variation", "non-palette colors"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "white clipping", "flat lee-side value"]}, "screenshotReview": ["Compare profile silhouette.", "Compare front and rear width.", "Compare blue-belton region placement.", "Run the deterministic eight-angle light audit."]};
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createBlueBeltonEnglishSetterEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

// Plan 1.3 §3.2 — auto-framing by bounding box. The Divine Eye can only compare a
// render to the reference if the object is FRAMED consistently (an object framed
// differently scores as wrong even when its shape is right). This positions the camera
// deterministically from the object's bounding box so it fills the frame at a stable
// margin, and sets near/far to the object scale. Call after adding the model to the
// scene, and again on resize (after updating camera.aspect).
export function frameBlueBeltonEnglishSetterCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  options: { margin?: number; azimuthDeg?: number; elevationDeg?: number } = {},
): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const margin = options.margin ?? 1.15;
  const maxDim = Math.max(size.x, size.y, size.z) * margin;
  const fov = (camera.fov * Math.PI) / 180;
  // distance so the largest object dimension fits vertically in the frame
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  const az = ((options.azimuthDeg ?? 0) * Math.PI) / 180;
  const el = ((options.elevationDeg ?? 0) * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(0.01, distance - maxDim);
  camera.far = distance + maxDim * 2;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

// Plan 1.3 §3.2c — PRESENTATION composer (DOF + bloom). CRITICAL (R-POSTFX): this is
// for the showcase/hero render ONLY. The Divine Eye's EVALUATION render MUST use a
// plain renderer with NO composer — bloom blows highlights and DOF blurs edges, which
// would corrupt the deterministic IoU/DCD/edge/blowout signals. Enable dof/bloom ONLY
// when the reference photo actually exhibits them (detect_reference_effects.py authorizes).
export function createBlueBeltonEnglishSetterPresentationComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: { dof?: boolean; bloom?: boolean; bloomStrength?: number; dofFocus?: number; dofAperture?: number } = {},
): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (options.dof) {
    composer.addPass(new BokehPass(scene, camera, {
      focus: options.dofFocus ?? 10.0,
      aperture: options.dofAperture ?? 0.0002,
      maxblur: 0.01,
    }));
  }
  if (options.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer.addPass(new UnrealBloomPass(size, options.bloomStrength ?? 0.4, 0.4, 0.85));
  }
  return composer;
}

export function configureBlueBeltonEnglishSetterRenderer(renderer: THREE.WebGLRenderer): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createBlueBeltonEnglishSetterInspectControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  // View-dependent finishes only read correctly once the user orbits — their color
  // comes from the environment reflection, not albedo, so free rotation matters here.
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 8.0;
  controls.autoRotate = false;
  return controls;
}
