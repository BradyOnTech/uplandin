import { afterEach, expect, it, vi } from 'vitest';
import { fieldSoundscape, fieldWindSamples } from '../src/three/fieldSoundscape';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });

it('builds quiet distinct regional beds without consuming gameplay randomness or unbounded buffers', () => {
  vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('No shared randomness'); });
  const signatures: number[] = [];
  for (const area of ['chukar-ridge', 'quail-fields', 'sharptail-prairie']) {
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
  expect(new Set(signatures).size).toBe(3);
  expect(fieldSoundscape('pheasant-coverts')).toBeUndefined();
  expect(fieldSoundscape()).toBeUndefined();
});

function fakeAudio() {
  const nodes: any[] = [];
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = (kind: string) => {
    const n: any = { kind, gain: param(), frequency: param(), Q: param(), onended: null,
      connect: vi.fn((to: any) => to), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    nodes.push(n); return n;
  };
  vi.stubGlobal('AudioContext', class {
    state = 'running'; currentTime = 0; sampleRate = 8000; destination = {};
    createGain() { return node('gain'); }
    createBiquadFilter() { return node('filter'); }
    createBufferSource() { return node('source'); }
    createOscillator() { return node('oscillator'); }
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
  expect(sources).toHaveLength(2); expect(nodes).toHaveLength(7);
  expect(sources.every(source => source.loop)).toBe(true);
  const layerGain = nodes.find(n => n.kind === 'gain');
  bed.setWind!('calm'); expect(layerGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.019 * .45, 0, 1.2);
  const windChanges = layerGain.gain.setTargetAtTime.mock.calls.length;
  bed.setWind!('calm'); expect(layerGain.gain.setTargetAtTime).toHaveBeenCalledTimes(windChanges);
  bed.setPaused(true); bed.setWind!('strong');
  expect(layerGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, .08);
  bed.setPaused(false); expect(layerGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.019, 0, .5);
  for (let i = 0; i < 5; i++) { bed.setPaused(true); bed.setPaused(false); }
  expect(nodes).toHaveLength(7);
  audio.setAudioEnabled(false); expect(audio.startFieldAmbience('quail-fields')).toBeNull();
  expect(nodes).toHaveLength(7);
  audio.setAudioEnabled(true); bed.stop(); bed.stop(); bed.setPaused(false);
  for (const source of sources) { expect(source.stop).toHaveBeenCalledOnce(); expect(source.disconnect).toHaveBeenCalledOnce(); }
  for (const filter of nodes.filter(n => n.kind === 'filter')) expect(filter.disconnect).toHaveBeenCalledOnce();
  const next = audio.startFieldAmbience('sharptail-prairie')!; next.stop();
  expect(nodes.filter(n => n.kind === 'source' && n.stop.mock.calls.length === 0)).toHaveLength(0);
});

it('preserves the legacy Cattail bed and footfall while regional footsteps clean short-lived nodes', async () => {
  const nodes = fakeAudio(), audio = await import('../src/audio');
  const legacy = audio.startFieldAmbience('pheasant-coverts')!;
  expect(nodes.filter(n => n.kind === 'source')).toHaveLength(1);
  expect(nodes.find(n => n.kind === 'filter').frequency.value).toBe(650);
  expect(nodes.find(n => n.kind === 'gain').gain.value).toBe(.018);
  legacy.stop();
  nodes.length = 0; audio.playFootstep(false, .1);
  expect(nodes.filter(n => n.kind === 'source')).toHaveLength(1);
  expect(nodes.find(n => n.kind === 'oscillator').type).toBe('square');
  for (const area of ['chukar-ridge', 'quail-fields', 'sharptail-prairie']) {
    nodes.length = 0; audio.playFootstep(true, .1, area);
    expect(nodes.filter(n => n.kind === 'source')).toHaveLength(2);
    expect(nodes.find(n => n.kind === 'oscillator').type).toBe('triangle');
    for (const node of nodes) node.onended?.();
    expect(nodes.every(n => n.disconnect.mock.calls.length === 1)).toBe(true);
  }
});
