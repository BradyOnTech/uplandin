import { afterEach, expect, it, vi } from 'vitest';
import { fieldInsectSamples, fieldSoundscape, fieldWindSamples, HOUR_INSECTS, HOUR_WIND } from '../src/three/fieldSoundscape';
import { STEP_SURFACES } from '../src/three/sound/stepSounds';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });

it('builds quiet distinct regional beds without consuming gameplay randomness or unbounded buffers', () => {
  vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('No shared randomness'); });
  const signatures: number[] = [];
  for (const area of ['chukar-ridge', 'quail-fields', 'sharptail-prairie', 'pheasant-coverts']) {
    const profile = fieldSoundscape(area)!;
    expect(profile.layers).toHaveLength(2);
    expect(profile.layers.reduce((sum, layer) => sum + layer.gain, 0)).toBeLessThan(.027);
    expect(profile.layers.reduce((sum, layer) => sum + layer.seconds, 0)).toBeLessThanOrEqual(28);
    for (const layer of profile.layers) {
      const a = fieldWindSamples(8000, layer), b = fieldWindSamples(8000, layer);
      expect(a).toEqual(b); expect(a.length).toBe(8000 * layer.seconds);
      let mean = 0, energy = 0, finite = true;
      for (const value of a) { finite &&= Number.isFinite(value); mean += value; energy += value * value; }
      expect(finite).toBe(true);
      expect(Math.abs(mean / a.length)).toBeLessThan(.01);
      expect(Math.sqrt(energy / a.length)).toBeGreaterThan(.1);
    }
    signatures.push(profile.layers[0].frequency);
  }
  expect(new Set(signatures).size).toBe(4);
  expect(fieldSoundscape('north-woods')).toBeUndefined();
  expect(fieldSoundscape()).toBeUndefined();
});

it('lays the wind down at the ends of the day and brings the crickets out in the evening', () => {
  expect(HOUR_WIND.dawn).toBeLessThan(HOUR_WIND.morning);
  expect(HOUR_WIND.noon).toBeGreaterThan(HOUR_WIND.morning);
  expect(HOUR_WIND.lastlight).toBeLessThan(HOUR_WIND.evening);
  expect([HOUR_INSECTS.dawn, HOUR_INSECTS.morning, HOUR_INSECTS.noon]).toEqual([0, 0, 0]);
  expect(HOUR_INSECTS.lastlight).toBeGreaterThan(HOUR_INSECTS.evening);
  // Every cricket's chirp falls on the loop exactly, so it repeats without a seam.
  const rate = 8000, loop = fieldInsectSamples(rate, 3, 12);
  expect(loop).toEqual(fieldInsectSamples(rate, 3, 12));
  expect(loop.length).toBe(rate * 12);
  expect(Math.max(...loop.map(Math.abs))).toBeCloseTo(1, 5);
  const level = (from: number, to: number) => Math.sqrt(loop.slice(from, to).reduce((sum, value) => sum + value * value, 0) / (to - from));
  expect(level(0, rate)).toBeGreaterThan(.05);
  // Pulses, not a steady tone: many quiet stretches between chirps.
  let quiet = 0;
  for (let i = 0; i < loop.length; i += rate / 100) if (level(i, i + rate / 100) < .03) quiet++;
  expect(quiet).toBeGreaterThan(200);
});

function fakeAudio() {
  const nodes: any[] = [];
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = (kind: string) => {
    const n: any = { kind, gain: param(), frequency: param(), Q: param(), pan: param(), onended: null,
      connect: vi.fn((to: any) => to), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    nodes.push(n); return n;
  };
  vi.stubGlobal('AudioContext', class {
    state = 'running'; currentTime = 0; sampleRate = 8000; destination = {};
    createGain() { return node('gain'); }
    createDynamicsCompressor() { return Object.assign(node('limiter'), { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
    createBiquadFilter() { return node('filter'); }
    createBufferSource() { return node('source'); }
    createOscillator() { return node('oscillator'); }
    createStereoPanner() { return node('stereo'); }
    createBuffer(_channels: number, length: number, rate: number) {
      const data = new Float32Array(length); return { duration: length / rate, getChannelData: () => data };
    }
  });
  return nodes;
}

it('bounds regional audio nodes, pauses without new loops and cleans each source once through mute and replay', async () => {
  const nodes = fakeAudio();
  const audio = await import('../src/audio');
  const bed = audio.startFieldAmbience('chukar-ridge')!;
  const sources = nodes.filter(n => n.kind === 'source');
  // Two looping layers with their filters and gains, then the master, world bus and limiter.
  expect(sources).toHaveLength(2); expect(nodes).toHaveLength(9);
  expect(sources.every(source => source.loop)).toBe(true);
  const layerGain = nodes.find(n => n.kind === 'gain');
  bed.setWind!('calm'); expect(layerGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.019 * .45, 0, 1.2);
  const windChanges = layerGain.gain.setTargetAtTime.mock.calls.length;
  bed.setWind!('calm'); expect(layerGain.gain.setTargetAtTime).toHaveBeenCalledTimes(windChanges);
  bed.setPaused(true); bed.setWind!('strong');
  expect(layerGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, .08);
  bed.setPaused(false); expect(layerGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.019, 0, .5);
  for (let i = 0; i < 5; i++) { bed.setPaused(true); bed.setPaused(false); }
  expect(nodes).toHaveLength(9);
  audio.setAudioEnabled(false); expect(audio.startFieldAmbience('quail-fields')).toBeNull();
  expect(nodes).toHaveLength(9);
  audio.setAudioEnabled(true); bed.stop(); bed.stop(); bed.setPaused(false);
  for (const source of sources) { expect(source.stop).toHaveBeenCalledOnce(); expect(source.disconnect).toHaveBeenCalledOnce(); }
  for (const filter of nodes.filter(n => n.kind === 'filter')) expect(filter.disconnect).toHaveBeenCalledOnce();
  const next = audio.startFieldAmbience('sharptail-prairie')!; next.stop();
  expect(nodes.filter(n => n.kind === 'source' && n.stop.mock.calls.length === 0)).toHaveLength(0);
});

it('gives Cattail Coverts its own bed, and every footfall one short-lived source', async () => {
  const nodes = fakeAudio(), audio = await import('../src/audio');
  const coverts = audio.startFieldAmbience('pheasant-coverts')!;
  expect(nodes.filter(n => n.kind === 'source')).toHaveLength(2);
  expect(nodes.filter(n => n.kind === 'filter').map(n => n.frequency.value)).toEqual([290, 2300]);
  coverts.stop();
  for (const surface of STEP_SURFACES) {
    nodes.length = 0; audio.playFootstep(surface, .1, surface === 'rock');
    const sources = nodes.filter(n => n.kind === 'source');
    expect(sources, surface).toHaveLength(1);
    expect(sources[0].buffer.duration).toBeLessThan(.5);
    for (const node of nodes) node.onended?.();
    expect(nodes.every(n => n.disconnect.mock.calls.length === 1)).toBe(true);
  }
  // The retired two-dimensional hunt still asks by cover or not.
  nodes.length = 0; audio.playFootstep(true, .1);
  expect(nodes.filter(n => n.kind === 'source')).toHaveLength(1);
});

it('follows the hour: the wind lays down at dusk, and the crickets start, made only when they are wanted', async () => {
  const nodes = fakeAudio(), audio = await import('../src/audio');
  const bed = audio.startFieldAmbience('quail-fields')!;
  const windGains = nodes.filter(n => n.kind === 'gain');
  bed.setHour!('morning');
  expect(nodes.filter(n => n.kind === 'source')).toHaveLength(2);
  const morning = windGains[0].gain.setTargetAtTime.mock.lastCall[0];
  bed.setHour!('lastlight');
  expect(windGains[0].gain.setTargetAtTime.mock.lastCall[0]).toBeCloseTo(morning * HOUR_WIND.lastlight / HOUR_WIND.morning);
  const crickets = nodes.filter(n => n.kind === 'source').slice(2);
  expect(crickets).toHaveLength(2);
  expect(crickets.every(source => source.loop)).toBe(true);
  expect(nodes.filter(n => n.kind === 'stereo').map(n => n.pan.value)).toEqual([-.6, .6]);
  const cricketGain = crickets[0].connect.mock.results[0].value;
  expect(cricketGain.gain.setTargetAtTime.mock.lastCall[0]).toBeGreaterThan(0);
  bed.setPaused(true); expect(cricketGain.gain.setTargetAtTime.mock.lastCall[0]).toBe(0);
  bed.setPaused(false); bed.setHour!('evening'); bed.setHour!('evening');
  expect(nodes.filter(n => n.kind === 'source')).toHaveLength(4);
  bed.stop(); bed.stop();
  for (const source of nodes.filter(n => n.kind === 'source')) expect(source.stop).toHaveBeenCalledOnce();
});
