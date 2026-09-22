import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { FieldAudioSystem } from '../src/three/subsystems/fieldAudio';
import { playDogMovement, playFieldSong, startFieldAmbience } from '../src/audio';
import type { Ctx } from '../src/three/engine';
vi.mock('../src/audio', () => ({ playDogMovement: vi.fn(), playFieldSong: vi.fn(), startFieldAmbience: vi.fn(() => null) }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });
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

it('keeps one regional bed across pause, mute-style unlock retries and hidden/resumed frames, then releases it on replay', () => {
  vi.stubGlobal('location', { search: '' });
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const win = new EventTarget(); vi.stubGlobal('document', doc); vi.stubGlobal('window', win);
  const bed = { setPaused: vi.fn(), stop: vi.fn() };
  vi.mocked(startFieldAmbience).mockReturnValueOnce(null).mockReturnValue(bed);
  const hunt = { dogCount: () => 0 };
  const ctx = { camera: new THREE.PerspectiveCamera(), events: new EventTarget(), time: 0, paused: false, get: () => hunt } as unknown as Ctx;
  const audio = new FieldAudioSystem('chukar-ridge'); audio.init(ctx);
  audio.update(ctx, 0); expect(startFieldAmbience).not.toHaveBeenCalled();
  audio.update(ctx, .016); audio.update(ctx, .016);
  for (let i = 0; i < 10; i++) audio.update(ctx, .016);
  expect(startFieldAmbience).toHaveBeenCalledTimes(2);
  expect(startFieldAmbience).toHaveBeenLastCalledWith('chukar-ridge');
  ctx.paused = true; ctx.events.dispatchEvent(new CustomEvent('pause', { detail: true }));
  expect(bed.setPaused).toHaveBeenLastCalledWith(true);
  audio.update(ctx, .016); expect(startFieldAmbience).toHaveBeenCalledTimes(2);
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
  ctx.paused = false; ctx.events.dispatchEvent(new CustomEvent('pause', { detail: false }));
  expect(bed.setPaused).toHaveBeenLastCalledWith(true);
  doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
  expect(bed.setPaused).toHaveBeenLastCalledWith(false);
  audio.update(ctx, .016); expect(startFieldAmbience).toHaveBeenCalledTimes(2);
  win.dispatchEvent(new Event('pagehide')); expect(bed.stop).toHaveBeenCalledOnce();
  audio.update(ctx, .016); expect(startFieldAmbience).toHaveBeenCalledTimes(3);
  audio.dispose(); audio.dispose(); audio.update(ctx, .016);
  expect(bed.stop).toHaveBeenCalledTimes(2);
  const pauseCount = bed.setPaused.mock.calls.length;
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
  expect(bed.setPaused).toHaveBeenCalledTimes(pauseCount);
  expect(startFieldAmbience).toHaveBeenCalledTimes(3);
});

it('omits birdlike ambience on exposed properties and suppresses zero-delta dog footfalls', () => {
  vi.stubGlobal('location', { search: '' });
  const dog = { x: 3, z: 0, gait: 'trot' };
  const hunt = { dogCount: () => 1, dog: () => dog,
    dogWorld: (out: {x:number;z:number}) => Object.assign(out, {x:dog.x,z:dog.z}), coverPatches: () => [] };
  const ctx = { camera: new THREE.PerspectiveCamera(), events: new EventTarget(), time: 120, paused: false, get: () => hunt } as unknown as Ctx;
  for (const area of ['chukar-ridge', 'sharptail-prairie']) {
    const audio = new FieldAudioSystem(area); audio.init(ctx); audio.update(ctx, .016);
    dog.x += 1; audio.update(ctx, 0); audio.dispose();
  }
  expect(playFieldSong).not.toHaveBeenCalled(); expect(playDogMovement).not.toHaveBeenCalled();
  const quail = new FieldAudioSystem('quail-fields'); quail.init(ctx); quail.update(ctx, .016); quail.dispose();
  expect(playFieldSong).toHaveBeenLastCalledWith(.65);
  const cattail = new FieldAudioSystem('pheasant-coverts'); cattail.init(ctx); cattail.update(ctx, .016); cattail.dispose();
  expect(playFieldSong).toHaveBeenLastCalledWith(1);
});
