import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { PropertyTerrain } from '../src/three/subsystems/propertyTerrain';
import type { Ctx } from '../src/three/engine';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture(areaId: string) {
  const area = { ...getArea(areaId), world: { x: 0, y: 0, w: 120, h: 120 } };
  const terrain = new PropertyTerrain(new LandscapeModel(area));
  const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality: 'lite',
    events: new EventTarget(), timeOfDay: 'noon', time: 0 } as Ctx;
  return { terrain, ctx };
}

it.each(['pheasant-coverts', 'woodcock-bottoms', 'sharptail-prairie'])('still constructs and disposes the field when optional soil detail cannot load', async (areaId) => {
  vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockRejectedValue(new Error('offline'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { terrain, ctx } = fixture(areaId);
  await terrain.init(ctx);
  expect(ctx.scene.children.length).toBeGreaterThan(4);
  terrain.dispose(ctx);
  expect(ctx.scene.children).toHaveLength(0);
});

it.each(['pheasant-coverts', 'woodcock-bottoms', 'sharptail-prairie'])('releases a late texture without rebuilding a field that was already disposed', async (areaId) => {
  let resolve!: (texture: THREE.Texture<HTMLImageElement>) => void;
  vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockReturnValue(new Promise(r => { resolve = r; }));
  const { terrain, ctx } = fixture(areaId);
  const pending = terrain.init(ctx);
  terrain.dispose(ctx);
  const texture = new THREE.Texture<HTMLImageElement>(), dispose = vi.spyOn(texture, 'dispose');
  resolve(texture);
  await pending;
  expect(dispose).toHaveBeenCalledOnce();
  expect(ctx.scene.children).toHaveLength(0);
});

it('owns and releases the bounded Sharptail surface and vegetation textures with the field (legacy stack)', async () => {
  vi.stubGlobal('location', { search: '?cover=legacy' });
  vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockResolvedValue(new THREE.Texture());
  const disposed = vi.spyOn(THREE.DataTexture.prototype, 'dispose');
  const { terrain, ctx } = fixture('sharptail-prairie');
  await terrain.init(ctx);
  expect(disposed).not.toHaveBeenCalled();
  terrain.dispose(ctx);
  expect(disposed).toHaveBeenCalledTimes(2);
  expect(ctx.scene.children).toHaveLength(0);
});

it('paints Sharptail from the ground kit cover map and releases its texture with the field', async () => {
  vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockResolvedValue(new THREE.Texture());
  const disposed = vi.spyOn(THREE.DataTexture.prototype, 'dispose');
  const { terrain, ctx } = fixture('sharptail-prairie');
  await terrain.init(ctx);
  const ground = ctx.scene.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader,
    fragmentShader: THREE.ShaderLib.lambert.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
  ground.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  // The cover mosaic replaces the bespoke prairie bands and sward normals.
  expect(shader.fragmentShader).toContain('texture2D(uCoverMap, coverUV)');
  expect(shader.fragmentShader).not.toContain('uPrairieBands');
  expect(shader.uniforms.uCoverMap.value).toBeInstanceOf(THREE.DataTexture);
  expect(terrain.prairieCanopySurface()).toBeDefined();
  terrain.dispose(ctx);
  expect(disposed).toHaveBeenCalledTimes(1);
  expect(ctx.scene.children).toHaveLength(0);
});
