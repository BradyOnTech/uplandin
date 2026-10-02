import { afterEach, expect, it, vi } from 'vitest';
import { DogCollarCadence, dogCollarGain, dogCollarMode } from '../src/three/dogCollarAudio';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('honors selected gear and movement, without inventing sound from scent or an honoring dog', () => {
  for (const gear of [0, 1, 2, 3]) {
    expect(dogCollarMode('quartering', 'run', gear, true)).toBe('bell');
    expect(dogCollarMode('tracking', 'track', gear, true)).toBe('bell');
    expect(dogCollarMode('tracking', 'track', gear, false)).toBeNull();
    expect(dogCollarMode('tracking', 'still', gear, true)).toBeNull();
    expect(dogCollarMode('honoring', 'still', gear, false)).toBeNull();
    expect(dogCollarMode('pointing', 'still', gear, false)).toBe(gear >= 1 ? 'beeper' : null);
  }
});

it('begins a true point immediately, repeats sparsely and resumes an existing point without a burst', () => {
  const clock = new DogCollarCadence();
  expect(clock.advance(0, 'beeper')).toBeNull();
  expect(clock.advance(.016, 'beeper')).toBe('beeper');
  for (let frame = 0; frame < 80; frame++) expect(clock.advance(1 / 60, 'beeper')).toBeNull();
  clock.suspend();
  for (let frame = 0; frame < 80; frame++) expect(clock.advance(1 / 60, 'beeper')).toBeNull();
  expect(clock.advance(120, 'beeper')).toBe('beeper');
  expect(clock.advance(.016, 'beeper')).toBeNull();
  clock.advance(.016, null);
  expect(clock.advance(.016, 'beeper')).toBe('beeper');
});

it('fades real distance continuously, retaining a useful long-cast beeper with no unlimited locator', () => {
  expect(dogCollarGain('beeper', 60)).toBeGreaterThan(.1);
  expect(dogCollarGain('bell', 60)).toBeGreaterThan(.01);
  for (const kind of ['bell', 'beeper'] as const) {
    for (let distance = 1; distance < 200; distance++) {
      expect(dogCollarGain(kind, distance)).toBeLessThanOrEqual(dogCollarGain(kind, distance - 1));
    }
    expect(dogCollarGain(kind, 500)).toBe(0);
    expect(dogCollarGain(kind, NaN)).toBe(0);
  }
});

it('follows listener-relative direction and releases both beeps on stop, mute and natural completion', async () => {
  const nodes: any[] = [];
  const param = () => ({ value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = (kind: string) => {
    const n: any = { kind, gain: param(), frequency: param(), positionX: param(), positionY: param(), positionZ: param(),
      connect: vi.fn((destination: any) => destination), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    nodes.push(n); return n;
  };
  vi.stubGlobal('AudioContext', class {
    state = 'running'; currentTime = 2; destination = {};
    createGain() { return node('gain'); }
    createDynamicsCompressor() { return Object.assign(node('limiter'), { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
    createPanner() { return node('pan'); }
    createOscillator() { return node('osc'); }
  });
  const audio = await import('../src/audio');
  const first = audio.playDogCollar('beeper', .3, { x: 60, y: 0, z: 0 })!;
  const pan = nodes.find(n => n.kind === 'pan');
  expect(pan.positionX.value).toBe(1); expect(pan.panningModel).toBe('HRTF');
  const oscillators = nodes.filter(n => n.kind === 'osc');
  expect(oscillators.map(n => n.start.mock.calls[0][0])).toEqual([2, 2.16]);
  first.updateSpatial(.4, { x: -60, y: 0, z: 0 });
  expect(pan.positionX.setTargetAtTime).toHaveBeenLastCalledWith(-1, 2, .02);
  first.stop(); first.stop();
  expect(first.active).toBe(false); expect(pan.disconnect).toHaveBeenCalledOnce();
  for (const oscillator of oscillators) {
    expect(oscillator.stop).toHaveBeenLastCalledWith(2);
    expect(oscillator.disconnect).toHaveBeenCalledOnce();
  }
  const bell = audio.playDogCollar('bell', .1, { x: 0, y: 0, z: -1 })!;
  audio.setAudioEnabled(false); expect(bell.active).toBe(false);
  expect(audio.playDogCollar('bell', .1, { x: 0, y: 0, z: 1 })).toBeUndefined();
  audio.setAudioEnabled(true);
  const end = audio.playDogCollar('bell', .1, { x: 0, y: 0, z: -1 })!;
  for (const oscillator of nodes.filter(n => n.kind === 'osc').slice(-2)) oscillator.onended();
  expect(end.active).toBe(false);
  expect(nodes.filter(n => n.kind === 'pan').every(n => n.disconnect.mock.calls.length === 1)).toBe(true);
});
