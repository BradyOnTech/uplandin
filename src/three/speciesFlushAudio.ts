import { mulberry32 } from '../game/math';
import { sharptailWingPhase } from './sharptailPresentation';
import { addLaunchBurst } from './flushBurst';

export const BIRD_FLUSH_AUDIO_RATE = 22050;

export interface BirdLaunchVoice {
  seed?: number;
  flapRate?: number;
  phaseOffset?: number;
  glideAfterMs?: number;
  /** Close-flush intensity, 0..1 (see flushBurst.ts). */
  burst?: number;
}

/** Designed feather/air textures, not recorded animal calls. The actual
 * species wing clock supplies the rhythm; these choices supply its weight. */
function launchTimbre(species: string) {
  if (species === 'woodcock') return { low: .045, air: .6, weight: .38, width: .010, release: 2.0 };
  if (species === 'sharptail' || species === 'prairie-chicken' || species === 'blue-grouse' || species === 'ruffed-grouse') {
    return { low: .025, air: .24, weight: 1.7, width: .022, release: 1.5 };
  }
  if (species === 'chukar' || species === 'hun') return { low: .04, air: .42, weight: .9, width: .015, release: 1.65 };
  return { low: .065, air: .58, weight: .4, width: .009, release: 2.1 };
}

/** Separate the short grass/stem release left on the ground from the
 * receding wing wash. Independent seeds never consume hunting randomness. */
export function synthesizeBirdLaunch(species: string, voice: BirdLaunchVoice = {}): {
  cover: Float32Array; flight: Float32Array;
} {
  const rng = mulberry32((voice.seed ?? 1) ^ 0x7b192d51);
  const timbre = launchTimbre(species);
  const rate = BIRD_FLUSH_AUDIO_RATE;
  const duration = 1.25;
  const hz = Math.min(24, Math.max(6, Number.isFinite(voice.flapRate) ? voice.flapRate! : 15));
  const phase = Number.isFinite(voice.phaseOffset) ? voice.phaseOffset! : 0;
  const glide = Number.isFinite(voice.glideAfterMs) ? Math.max(0, voice.glideAfterMs! / 1000) : duration;
  const cover = new Float32Array(Math.ceil(rate * .24));
  const flight = new Float32Array(Math.ceil(rate * duration));
  let low = 0, air = 0, litter = 0;
  for (let i = 0; i < flight.length; i++) {
    const t = i / rate, white = rng() * 2 - 1;
    low += timbre.low * (white - low);
    air += timbre.air * (white - air);
    // A narrow soft drive, then quiet recovery. Beat rate follows the
    // rendered non-pheasant sin clock; no global chirp masks the bearing.
    const beatPhase = species === 'sharptail' ? sharptailWingPhase(t, hz, phase) : t * hz * Math.PI * 2 + phase;
    const wave = Math.cos(beatPhase);
    const width = timbre.width * hz * Math.PI * 2;
    const drive = Math.exp(-(((wave + 1) / width) ** 2));
    const gliding = Math.min(1, Math.max(0, (t - glide) / .15));
    const attack = Math.min(1, t / .006), end = Math.min(1, (duration - t) / .10);
    const envelope = Math.exp(-t * timbre.release) * attack * end;
    flight[i] = ((air - low) * .65 + low * timbre.weight) *
      (drive * (1 - gliding) + .035) * envelope * .30;
    if (i < cover.length) {
      litter += .18 * (white - litter);
      const release = (1 - Math.exp(-t * 450)) * Math.exp(-t * 25);
      cover[i] = ((white - litter) * .14 + litter * .55) * release * Math.min(1, (.24 - t) / .035) * .55;
    }
  }
  const burst = Math.max(0, Math.min(1, voice.burst ?? 0));
  if (burst > 0) for (let i = 0; i < flight.length; i++) flight[i] *= 1 + burst * .7 * Math.exp(-i / rate * 3);
  addLaunchBurst(cover, rate, burst, voice.seed ?? 1);
  return { cover, flight };
}
