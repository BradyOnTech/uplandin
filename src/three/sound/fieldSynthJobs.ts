import { farSoundSamples, fieldCoverSamples, fieldInsectSamples, fieldWeatherSamples, fieldWindSamples, grainDryerSamples,
  type CoverVoice, type FarSoundKind, type FieldSoundLayer, type WeatherBed } from '../fieldSoundscape';

/** One of the field's sounds to make, as plain data a worker can take. */
export type FieldSynthJob =
  | { kind: 'wind'; rate: number; layer: FieldSoundLayer }
  | { kind: 'insects'; rate: number; seed: number }
  | { kind: 'cover'; rate: number; voice: CoverVoice; seed: number }
  | { kind: 'weather'; rate: number; bed: WeatherBed }
  | { kind: 'dryer'; rate: number; seed: number }
  | { kind: 'far'; rate: number; sound: FarSoundKind; seed: number };

export function runFieldSynth(job: FieldSynthJob): Float32Array {
  switch (job.kind) {
    case 'wind': return fieldWindSamples(job.rate, job.layer);
    case 'insects': return fieldInsectSamples(job.rate, job.seed);
    case 'cover': return fieldCoverSamples(job.rate, job.voice, job.seed);
    case 'weather': return fieldWeatherSamples(job.rate, job.bed);
    case 'dryer': return grainDryerSamples(job.rate, job.seed);
    case 'far': return farSoundSamples(job.sound, job.seed, job.rate);
  }
}
