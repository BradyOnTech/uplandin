import { describe, expect, it } from 'vitest';
import { coverSound, farSoundSamples, fieldCoverSamples, fieldInsectSamples, fieldSoundscape, fieldWeatherSamples, fieldWindSamples, FAR_RATE,
  grainDryerSamples, GUST_BED, WEATHER_BEDS } from '../src/three/fieldSoundscape';
import { runFieldSynth } from '../src/three/sound/fieldSynthJobs';
import { fieldSynth } from '../src/three/sound/fieldSynth';

describe('the field\'s sounds are made off the main thread', () => {
  it('makes each job exactly as the field\'s own synthesis would', () => {
    const layer = fieldSoundscape('chukar-ridge')!.layers[1], cover = coverSound('pheasant-coverts')!;
    expect(runFieldSynth({ kind: 'wind', rate: 22050, layer })).toEqual(fieldWindSamples(22050, layer));
    expect(runFieldSynth({ kind: 'insects', rate: 22050, seed: 7919 })).toEqual(fieldInsectSamples(22050, 7919));
    expect(runFieldSynth({ kind: 'cover', rate: 22050, voice: cover.voice, seed: cover.seed })).toEqual(fieldCoverSamples(22050, cover.voice, cover.seed));
    expect(runFieldSynth({ kind: 'weather', rate: 22050, bed: WEATHER_BEDS.rain[0] })).toEqual(fieldWeatherSamples(22050, WEATHER_BEDS.rain[0]));
    expect(runFieldSynth({ kind: 'weather', rate: FAR_RATE, bed: GUST_BED })).toEqual(fieldWeatherSamples(FAR_RATE, GUST_BED));
    expect(runFieldSynth({ kind: 'dryer', rate: FAR_RATE, seed: 3301 })).toEqual(grainDryerSamples(FAR_RATE, 3301));
    expect(runFieldSynth({ kind: 'far', rate: FAR_RATE, sound: 'cattle', seed: 7919 })).toEqual(farSoundSamples('cattle', 7919, FAR_RATE));
  });

  it('still makes a sound where there is no worker, in an idle moment of its own', async () => {
    const samples = await fieldSynth({ kind: 'dryer', rate: FAR_RATE, seed: 3301 });
    expect(samples).toEqual(grainDryerSamples(FAR_RATE, 3301));
  });
});
