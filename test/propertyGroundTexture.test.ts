import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { PropertyTerrain } from '../src/three/subsystems/propertyTerrain';
import type { Ctx } from '../src/three/engine';

afterEach(() => vi.restoreAllMocks());

function fixture() {
  const area = { ...getArea('pheasant-coverts'), world: { x: 0, y: 0, w: 120, h: 120 } };
  const terrain = new PropertyTerrain(new LandscapeModel(area));
  const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality: 'lite',
    events: new EventTarget(), timeOfDay: 'noon', time: 0 } as Ctx;
  return { terrain, ctx };
}

it('still constructs and disposes the field when optional soil detail cannot load', async () => {
  vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockRejectedValue(new Error('offline'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { terrain, ctx } = fixture();
  await terrain.init(ctx);
  expect(ctx.scene.children.length).toBeGreaterThan(4);
  terrain.dispose(ctx);
  expect(ctx.scene.children).toHaveLength(0);
});

it('releases a late texture without rebuilding a field that was already disposed', async () => {
  let resolve!: (texture: THREE.Texture<HTMLImageElement>) => void;
  vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockReturnValue(new Promise(r => { resolve = r; }));
  const { terrain, ctx } = fixture();
  const pending = terrain.init(ctx);
  terrain.dispose(ctx);
  const texture = new THREE.Texture<HTMLImageElement>(), dispose = vi.spyOn(texture, 'dispose');
  resolve(texture);
  await pending;
  expect(dispose).toHaveBeenCalledOnce();
  expect(ctx.scene.children).toHaveLength(0);
});
