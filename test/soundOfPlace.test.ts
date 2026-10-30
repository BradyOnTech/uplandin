import { describe, expect, it } from 'vitest';
import { COVER_WEATHER, COVER_WIND, coverSound, dryerLevel, FAR_RATE, FAR_SOUND_GAIN, farSoundSamples, fieldCoverSamples, fieldSoundscape,
  fieldWeatherSamples, fieldWindSamples, grainDryerSamples, GUST_BED, gustShare, insectShare, nextFarSound, WEATHER_BEDS,
  WORKING_LANDSCAPE, type FieldRegion } from '../src/three/fieldSoundscape';
import { GROUND_BIRDS, nextGroundBird, seasonActivity } from '../src/three/sound/fieldBirds';
import { Biquad, peak, rms } from '../src/three/sound/dsp';
import { bellPitch, DOG_SOUND_RATE, synthesizeBell } from '../src/three/sound/dogSounds';
import { dogCollarGain } from '../src/three/dogCollarAudio';
import { birdFalloff } from '../src/audio';
import { CONDITIONS, type Condition } from '../src/game/conditions';
import type { Month } from '../src/game/season';
import { mulberry32 } from '../src/game/math';
import type { WindStrength } from '../src/game/wind';

const GROUNDS: FieldRegion[] = ['pheasant-coverts', 'sharptail-prairie', 'quail-fields', 'chukar-ridge'];
const MONTHS: Month[] = ['September', 'October', 'November', 'December', 'January'];
const RATE = 22050;
const db = (x: number) => 20 * Math.log10(x);
/** Brightness: how often the wave crosses zero, per second. */
const crossings = (samples: Float32Array, rate: number) => {
  let count = 0;
  for (let i = 1; i < samples.length; i++) if ((samples[i - 1] < 0) !== (samples[i] < 0)) count++;
  return count / (samples.length / rate);
};

describe('the cover speaks in the wind', () => {
  const voices = Object.fromEntries(GROUNDS.map(area => {
    const cover = coverSound(area)!;
    return [area, fieldCoverSamples(RATE, cover.voice, cover.seed)];
  }));

  it('rattles in the cattails, hisses in bluestem and whispers in sage', () => {
    expect(GROUNDS.map(area => coverSound(area)!.voice)).toEqual(['rattle', 'hiss', 'hiss', 'whisper']);
    // Dry cattail leaves knock: sharp peaks over a quiet rustle.
    const crest = (s: Float32Array) => peak(s) / rms(s);
    expect(crest(voices['pheasant-coverts'])).toBeGreaterThan(crest(voices['sharptail-prairie']) * 1.5);
    // Bluestem is bright; sage is dark and breathy.
    expect(crossings(voices['sharptail-prairie'], RATE)).toBeGreaterThan(crossings(voices['chukar-ridge'], RATE) * 3);
    for (const samples of Object.values(voices)) {
      expect(samples.length).toBe(RATE * 8);
      expect(peak(samples)).toBeCloseTo(.9, 5);
      // The loop's seam is no bigger a step than the sound makes on its own.
      let step = 0;
      for (let i = 1; i < samples.length; i++) step = Math.max(step, Math.abs(samples[i] - samples[i - 1]));
      expect(Math.abs(samples[0] - samples[samples.length - 1])).toBeLessThan(step);
    }
    expect(coverSound('north-woods')).toBeUndefined();
  });

  it('only speaks when the wind is up, and goes quiet when the stems are wet', () => {
    expect(COVER_WIND.calm).toBeLessThan(COVER_WIND.breezy * .3);
    expect(COVER_WIND.strong).toBe(1);
    expect(COVER_WEATHER.rain).toBeLessThan(COVER_WEATHER.snow);
    expect(COVER_WEATHER.snow).toBeLessThan(COVER_WEATHER.mild);
  });
});

describe('the weather can be heard', () => {
  it('rains on the grass, ticks with sleet, and gusts under any wild day', () => {
    expect(WEATHER_BEDS.mild).toEqual([]); expect(WEATHER_BEDS.frost).toEqual([]);
    expect(WEATHER_BEDS.rain.map(bed => bed.kind)).toEqual(['rain']);
    expect(WEATHER_BEDS.snow.map(bed => bed.kind)).toEqual(['sleet']);
    const rain = fieldWeatherSamples(RATE, WEATHER_BEDS.rain[0]), sleet = fieldWeatherSamples(RATE, WEATHER_BEDS.snow[0]);
    const gust = fieldWeatherSamples(FAR_RATE, GUST_BED);
    expect(rain).toEqual(fieldWeatherSamples(RATE, WEATHER_BEDS.rain[0]));
    // Rain is a dense patter; sleet is sparse hard ticks; gusts are low and swell.
    expect(peak(sleet) / rms(sleet)).toBeGreaterThan(peak(rain) / rms(rain));
    expect(crossings(gust, FAR_RATE)).toBeLessThan(crossings(rain, RATE) / 4);
    const part = Math.floor(gust.length / 12), lulls = Array.from({ length: 12 }, (_, q) => rms(gust, q * part, (q + 1) * part));
    expect(Math.max(...lulls) / Math.min(...lulls)).toBeGreaterThan(1.8);
    expect(gustShare('mild', 'calm')).toBe(0);
    expect(gustShare('mild', 'strong')).toBe(1);
    expect(gustShare('snow', 'calm')).toBeGreaterThan(gustShare('rain', 'calm'));
    expect(gustShare('rain', 'breezy')).toBeGreaterThan(gustShare('mild', 'breezy'));
  });

  it('keeps the crickets to the warm months and stills them under frost and snow', () => {
    const months = MONTHS.map(month => insectShare(month, 'mild'));
    expect(months[0]).toBeGreaterThan(months[1]);
    expect(months[1]).toBeGreaterThan(months[2] * 3);
    expect([months[3], months[4]]).toEqual([0, 0]);
    expect(insectShare('September', 'frost')).toBe(0);
    expect(insectShare('September', 'snow')).toBe(0);
    expect(insectShare('October', 'rain')).toBeLessThan(insectShare('October', 'mild') * .5);
  });
});

describe('the bell is always on top', () => {
  // The bell's strike at working range, the quietest of the cues that must carry (the beeper and a flush are louder).
  const bell = synthesizeBell(bellPitch(0), 1), strike = rms(bell, 0, Math.round(DOG_SOUND_RATE * .12));
  /** Everything the field plays at once on a day, at the strongest hour (rates below the browser's are conservative for the band-passed wind). */
  const bedLevel = (area: FieldRegion, condition: Condition, wind: WindStrength) => {
    let power = 0;
    const windGain = wind === 'calm' ? .45 : wind === 'strong' ? 1 : .75;
    for (const layer of fieldSoundscape(area)!.layers) {
      const filter = new Biquad('bandpass', layer.frequency, layer.q, RATE);
      power += (rms(fieldWindSamples(RATE, layer).map(v => filter.run(v))) * layer.gain * windGain) ** 2;
    }
    const cover = coverSound(area)!;
    power += (rms(fieldCoverSamples(RATE, cover.voice, cover.seed)) * cover.gain * COVER_WIND[wind] * COVER_WEATHER[condition]) ** 2;
    power += (rms(fieldWeatherSamples(FAR_RATE, GUST_BED)) * GUST_BED.gain * gustShare(condition, wind)) ** 2;
    for (const bed of WEATHER_BEDS[condition]) power += (rms(fieldWeatherSamples(RATE, bed)) * bed.gain) ** 2;
    const dryer = dryerLevel(area, 'October');
    if (dryer) power += (rms(grainDryerSamples(FAR_RATE, 3301)) * dryer) ** 2;
    return Math.sqrt(power);
  };

  it.each(GROUNDS)('rings clear of the whole field on %s, on an ordinary day and the wildest', area => {
    const at40 = strike * dogCollarGain('bell', 40);
    expect(db(at40) - db(bedLevel(area, 'mild', 'breezy'))).toBeGreaterThan(9);
    for (const condition of CONDITIONS) expect(db(at40) - db(bedLevel(area, condition, 'strong')), condition).toBeGreaterThan(5);
  });

  it('keeps the working country faint: every far sound peaks under the bell at working range', () => {
    const bellPeak = peak(bell) * dogCollarGain('bell', 40);
    for (const area of GROUNDS) for (const sound of WORKING_LANDSCAPE[area].sounds) {
      const samples = farSoundSamples(sound.kind, 7919);
      expect(samples.length / FAR_RATE).toBeLessThan(20);
      expect(peak(samples) * sound.gain * FAR_SOUND_GAIN * birdFalloff(sound.distance[0]), `${area} ${sound.kind}`).toBeLessThan(bellPeak * .7);
      expect(sound.distance[0]).toBeGreaterThanOrEqual(300);
    }
  });
});

describe('the working country', () => {
  it('runs a far train only on the Dakota grounds, a grain dryer only on Cattail at harvest, and leaves the canyon quiet', () => {
    const kinds = (area: FieldRegion) => WORKING_LANDSCAPE[area].sounds.map(sound => sound.kind);
    expect(kinds('sharptail-prairie')).toContain('train');
    expect(kinds('pheasant-coverts')).toContain('train');
    expect(kinds('quail-fields')).not.toContain('train');
    expect(kinds('chukar-ridge')).toEqual(['cattle']);
    expect(Math.max(...GROUNDS.map(area => WORKING_LANDSCAPE[area].interval))).toBe(WORKING_LANDSCAPE['chukar-ridge'].interval);
    expect(dryerLevel('pheasant-coverts', 'October')).toBeGreaterThan(dryerLevel('pheasant-coverts', 'December'));
    expect(dryerLevel('pheasant-coverts', 'January')).toBe(0);
    for (const area of ['sharptail-prairie', 'quail-fields', 'chukar-ridge']) expect(dryerLevel(area, 'October')).toBe(0);
  });

  it('works the trucks by day and the cattle at chore time', () => {
    const tally = (hour: 'noon' | 'lastlight' | 'dawn') => {
      const random = mulberry32(5), seen: Record<string, number> = {};
      for (let i = 0; i < 2000; i++) { const pick = nextFarSound('sharptail-prairie', hour, 'October', random)!; seen[pick.sound.kind] = (seen[pick.sound.kind] ?? 0) + 1; }
      return seen;
    };
    const noon = tally('noon'), dusk = tally('lastlight'), dawn = tally('dawn');
    expect(noon['gravel-truck'] / 2000).toBeGreaterThan(dusk['gravel-truck'] / 2000 * 2);
    expect(dawn.cattle / 2000).toBeGreaterThan(noon.cattle / 2000);
    expect(nextFarSound('north-woods', 'noon', 'October', mulberry32(1))).toBeNull();
  });
});

describe('the land\'s birds through the season', () => {
  const share = (area: string, month: Month, id: string) => {
    const random = mulberry32(11);
    let hits = 0;
    for (let i = 0; i < 3000; i++) {
      const bird = nextGroundBird(area, 'morning', random, month)!.bird;
      if (('flock' in bird ? bird.flock : bird.call) === id) hits++;
    }
    return hits / 3000;
  };

  /** Calls an hour: the bird's share of a ground that is busier or quieter by the month. */
  const often = (area: string, month: Month, id: string) => share(area, month, id) * seasonActivity(area, month);

  it('brings cranes and geese over in October on Sharptail and Cattail', () => {
    for (const area of ['sharptail-prairie', 'pheasant-coverts']) for (const flock of ['cranes', 'geese']) {
      const october = often(area, 'October', flock);
      expect(october, `${area} ${flock}`).toBeGreaterThan(often(area, 'September', flock));
      expect(october, `${area} ${flock}`).toBeGreaterThan(often(area, 'December', flock));
    }
    // Winter is quieter on the northern grounds; September's slough is loud.
    expect(seasonActivity('sharptail-prairie', 'January')).toBeLessThan(1);
    expect(seasonActivity('pheasant-coverts', 'January')).toBeLessThan(.6);
    expect(seasonActivity('pheasant-coverts', 'September')).toBeGreaterThan(1);
    expect(seasonActivity('chukar-ridge', 'January')).toBe(1);
    expect(share('sharptail-prairie', 'January', 'cranes')).toBe(0);
  });

  it('crowds the cattails with blackbirds early, sends the meadowlarks south, keeps the larks all winter', () => {
    expect(share('pheasant-coverts', 'September', 'blackbirds')).toBeGreaterThan(share('pheasant-coverts', 'November', 'blackbirds') * 3);
    expect(share('sharptail-prairie', 'December', 'meadowlark')).toBe(0);
    expect(share('sharptail-prairie', 'December', 'horned-lark')).toBeGreaterThan(share('sharptail-prairie', 'October', 'horned-lark'));
    // Ducks leave once the slough freezes.
    expect(share('pheasant-coverts', 'January', 'mallard')).toBeLessThan(share('pheasant-coverts', 'October', 'mallard') * .2);
    // The canyon wren sings all year.
    expect(share('chukar-ridge', 'January', 'canyon-wren')).toBeGreaterThan(.3);
  });

  it('never leaves a ground silent in any month', () => {
    for (const area of Object.keys(GROUND_BIRDS)) for (const month of MONTHS) {
      expect(nextGroundBird(area, 'noon', mulberry32(3), month), `${area} ${month}`).not.toBeNull();
    }
  });
});
