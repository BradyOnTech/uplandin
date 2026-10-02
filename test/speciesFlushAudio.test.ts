import { afterEach, expect, it, vi } from 'vitest';
import { SPECIES } from '../src/game/species';
import { BIRD_FLUSH_AUDIO_RATE, synthesizeBirdLaunch } from '../src/three/speciesFlushAudio';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('gives every species finite, bounded, deterministic launch buffers without consuming simulation randomness', () => {
  const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('Shared RNG consumed'); });
  try {
    for (const species of SPECIES.filter(s => s.id !== 'ringneck')) {
      const voice = { seed: 41, flapRate: species.flight.flapRate, glideAfterMs: species.flight.glideAfterMs };
      const a = synthesizeBirdLaunch(species.id, voice), b = synthesizeBirdLaunch(species.id, voice);
      expect(a).toEqual(b);
      expect(a.cover.length).toBeLessThan(a.flight.length);
      for (const data of [a.cover, a.flight]) {
        expect(data[0]).toBe(0); expect(Math.abs(data.at(-1)!)).toBeLessThan(.0001);
        expect(data.some(x => Math.abs(x) > .01)).toBe(true);
        expect(data.every(x => Number.isFinite(x) && Math.abs(x) < .5)).toBe(true);
      }
    }
  } finally { random.mockRestore(); }
});

it('uses lighter rapid quail texture and heavier grouse texture, and quiets the wings on glide', () => {
  const voice = { seed: 11, flapRate: 15 };
  expect(synthesizeBirdLaunch('bobwhite', voice).flight).not.toEqual(synthesizeBirdLaunch('sharptail', voice).flight);
  const wing = synthesizeBirdLaunch('sharptail', voice).flight;
  const glide = synthesizeBirdLaunch('sharptail', { ...voice, glideAfterMs: 600 }).flight;
  const energy = (data: Float32Array, from: number, to: number) => {
    let value = 0; for (let n = Math.floor(from * BIRD_FLUSH_AUDIO_RATE); n < to * BIRD_FLUSH_AUDIO_RATE; n++) value += data[n] ** 2;
    return value;
  };
  expect(glide.slice(0, 12000)).toEqual(wing.slice(0, 12000));
  expect(energy(glide, .85, 1.2)).toBeLessThan(energy(wing, .85, 1.2) * .1);
});

it('bounds covey panners, favors nearer actual launches and releases voices on finish, hit or mute', async () => {
  const nodes: any[] = [];
  const param = () => ({ value: 0, setTargetAtTime: vi.fn() });
  const node = (kind: string) => {
    const n: any = { kind, gain: param(), positionX: param(), positionY: param(), positionZ: param(), onended: null,
      connect: vi.fn((destination: any) => destination), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    nodes.push(n); return n;
  };
  vi.stubGlobal('AudioContext', class {
    state = 'running'; currentTime = 0; destination = {};
    createGain() { return node('gain'); } createPanner() { return node('pan'); }
    createDynamicsCompressor() { return Object.assign(node('limiter'), { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
    createBufferSource() { return node('source'); }
    createBuffer(_channels: number, length: number, rate: number) {
      const data = new Float32Array(length); return { duration: length / rate, getChannelData: () => data };
    }
  });
  const audio = await import('../src/audio');
  const voices = [40, 30, 20, 10].map(distance => audio.playBirdFlush('sharptail', distance, { x: -distance, y: 0, z: 0 })!);
  expect(nodes.filter(n => n.kind === 'pan')).toHaveLength(8);
  expect(audio.playBirdFlush('sharptail', 50, { x: 50, y: 0, z: 0 })).toBeUndefined();
  expect(nodes.filter(n => n.kind === 'pan')).toHaveLength(8);
  const close = audio.playBirdFlush('bobwhite', 3, { x: 3, y: 0, z: 0 })!;
  expect(voices[0].active).toBe(false);
  expect(nodes.filter(n => n.kind === 'pan' && n.disconnect.mock.calls.length === 0)).toHaveLength(8);
  const pans = nodes.filter(n => n.kind === 'pan').slice(-2);
  expect(pans[0].positionX.value).toBe(1);
  close.updateSpatial(9, { x: -9, y: 0, z: 0 });
  expect(pans[0].positionX.setTargetAtTime).toHaveBeenLastCalledWith(-1, 0, .025);
  expect(pans[1].positionX.setTargetAtTime).not.toHaveBeenCalled();
  close.updateCoverSpatial!(3, { x: 0, y: 0, z: 3 });
  expect(pans[1].positionZ.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, .025);
  const flight = nodes.filter(n => n.kind === 'source').at(-1);
  flight.onended(); close.stop(); expect(close.active).toBe(false);
  for (const voice of voices) voice.stop();
  expect(nodes.filter(n => n.kind === 'pan').every(n => n.disconnect.mock.calls.length === 1)).toBe(true);
  const before = nodes.length;
  audio.setAudioEnabled(false);
  expect(audio.playBirdFlush('chukar', 4, { x: 0, y: 0, z: -4 })).toBeUndefined();
  expect(nodes).toHaveLength(before);
  audio.setAudioEnabled(true);
  const resumed = audio.playBirdFlush('chukar', 4, { x: 0, y: 0, z: -4 })!;
  expect(resumed.active).toBe(true); resumed.stop();
});
