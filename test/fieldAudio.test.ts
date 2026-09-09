import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { FieldAudioSystem } from '../src/three/subsystems/fieldAudio';
import { playDogMovement } from '../src/audio';
import type { Ctx } from '../src/three/engine';
vi.mock('../src/audio', () => ({ playDogMovement: vi.fn(), playFieldSong: vi.fn(), startFieldAmbience: () => null }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('locates nearby moving paws, with no stationary, distant, paused, or teleport cues', () => {
  vi.stubGlobal('location', { search: '' });
  const dog = { x: 3, z: 0, gait: 'trot' };
  const hunt = { dogCount: () => 1, dog: () => dog,
    dogWorld: (out: {x:number;z:number}) => Object.assign(out, {x:dog.x,z:dog.z}),
    coverPatches: () => [{cx:0,cz:0,hx:30,hz:30}] };
  const ctx = { camera: new THREE.PerspectiveCamera(), events: new EventTarget(), time: 0, paused: false, get: () => hunt } as unknown as Ctx;
  const audio = new FieldAudioSystem(); audio.init(ctx); audio.update(ctx);
  dog.x += 1; audio.update(ctx);
  expect(playDogMovement).toHaveBeenLastCalledWith(true, expect.any(Number), 1);
  const volume = vi.mocked(playDogMovement).mock.calls[0][1];
  for (let n = 0; n < 20; n++) audio.update(ctx);
  expect(playDogMovement).toHaveBeenCalledTimes(1);
  dog.gait = 'still'; dog.x += 1; audio.update(ctx);
  expect(playDogMovement).toHaveBeenCalledTimes(1);
  dog.gait = 'trot'; ctx.paused = true; dog.x += 1; audio.update(ctx);
  expect(playDogMovement).toHaveBeenCalledTimes(1);
  ctx.paused = false; dog.x = 25; audio.update(ctx); dog.x++; audio.update(ctx);
  expect(playDogMovement).toHaveBeenCalledTimes(1);
  dog.x = -7; audio.update(ctx); dog.x--; audio.update(ctx);
  expect(playDogMovement).toHaveBeenLastCalledWith(true, expect.any(Number), -1);
  expect(vi.mocked(playDogMovement).mock.calls[1][1]).toBeLessThan(volume);
  audio.dispose();
});
