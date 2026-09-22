/** Presentation only. These beds describe the land, never nearby quarry. */
export type FieldRegion = 'chukar-ridge' | 'quail-fields' | 'sharptail-prairie';
export interface FieldSoundLayer {
  readonly seconds: number;
  readonly frequency: number;
  readonly q: number;
  readonly gain: number;
  readonly swell: number;
  readonly seed: number;
}
export interface FieldSoundscape {
  readonly layers: readonly FieldSoundLayer[];
  /** Existing non-spatial song only, well below action cues. Zero omits it. */
  readonly songGain: number;
  readonly songInterval: number;
}

const soundscapes: Record<FieldRegion, FieldSoundscape> = {
  'chukar-ridge': { layers: [
    { seconds: 11, frequency: 330, q: .48, gain: .019, swell: .62, seed: 391 },
    { seconds: 7, frequency: 2100, q: .55, gain: .0038, swell: .85, seed: 907 },
  ], songGain: 0, songInterval: 0 },
  'quail-fields': { layers: [
    { seconds: 13, frequency: 480, q: .42, gain: .010, swell: .30, seed: 661 },
    { seconds: 9, frequency: 1250, q: .68, gain: .0048, swell: .62, seed: 2027 },
  ], songGain: .65, songInterval: 39 },
  'sharptail-prairie': { layers: [
    { seconds: 17, frequency: 230, q: .42, gain: .018, swell: .48, seed: 817 },
    { seconds: 11, frequency: 970, q: .48, gain: .007, swell: .72, seed: 3011 },
  ], songGain: 0, songInterval: 0 },
};

export function fieldSoundscape(areaId?: string): FieldSoundscape | undefined {
  return areaId === 'chukar-ridge' || areaId === 'quail-fields' || areaId === 'sharptail-prairie'
    ? soundscapes[areaId] : undefined;
}

/** Local deterministic noise, with slow periodic gusts baked once. Native
 * bandpass filtering smooths the waveform; loop endpoints share an envelope.
 * Does not consume hunt randomness or schedule per-frame WebAudio nodes. */
export function fieldWindSamples(rate: number, layer: FieldSoundLayer): Float32Array {
  const samples = new Float32Array(Math.ceil(rate * layer.seconds));
  let seed = layer.seed >>> 0;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const phase = i / samples.length * Math.PI * 2;
    const gust = .55 + .29 * Math.sin(phase) + .16 * Math.sin(phase * 3 + 1.7);
    samples[i] = (seed / 0x100000000 * 2 - 1) * (1 - layer.swell + layer.swell * gust);
  }
  return samples;
}
