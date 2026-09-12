import { mulberry32 } from '../game/math';
import { pheasantPowerStrokes } from './pheasantWingMotion';

export interface PheasantLaunchVoice {
  seed?: number;
  flapRate?: number;
  phaseOffset?: number;
}

export const PHEASANT_LAUNCH_SECONDS = 1.55;
export const PHEASANT_AUDIO_RATE = 22050;

/** An authored sound variant, independent of encounter RNG and detail tier.
 * The small silence fraction applies only to rooster calls, never wing noise. */
export function pheasantLaunchVoice(seed: number, rooster: boolean): { calls: number; pitch: number } {
  const rng = mulberry32(seed ^ 0xa573da9);
  return { calls: rooster && rng() > .22 ? 2 + Number(rng() > .7) : 0, pitch: .9 + rng() * .2 };
}

/** Two short mono buffers replace dozens of per-beat WebAudio nodes. Cover
 * stays at the departure point while wings/call travel with the visible bird.
 * Smooth sample envelopes avoid clicks; the loudest wing pulses use the same
 * accelerating launch phase as the model, rather than a second metronome. */
export function synthesizePheasantLaunch(rooster: boolean, voice: PheasantLaunchVoice = {}): {
  cover: Float32Array; flight: Float32Array; calls: number;
} {
  const seed = voice.seed ?? 1;
  const rng = mulberry32(seed ^ 0x31f65bc);
  const { calls, pitch } = pheasantLaunchVoice(seed, rooster);
  const strokes = pheasantPowerStrokes(voice.flapRate ?? 9, voice.phaseOffset ?? 0, 1.45);
  const cover = new Float32Array(Math.ceil(PHEASANT_AUDIO_RATE * .34));
  const flight = new Float32Array(Math.ceil(PHEASANT_AUDIO_RATE * PHEASANT_LAUNCH_SECONDS));
  const rate = PHEASANT_AUDIO_RATE;
  let low = 0, air = 0, coverLow = 0, callPhase = 0;
  let stroke = 0;
  for (let i = 0; i < flight.length; i++) {
    const t = i / rate, white = rng() * 2 - 1;
    low += .026 * (white - low);
    air += .34 * (white - air);
    while (stroke < strokes.length - 1 && t > (strokes[stroke] + strokes[stroke + 1]) * .5) stroke++;
    const offset = t - strokes[stroke];
    const width = offset < 0 ? .012 : .023;
    const beat = Math.exp(-.5 * (offset / width) ** 2) * Math.exp(-t * 1.55);
    const tail = Math.min(1, (PHEASANT_LAUNCH_SECONDS - t) / .12);
    // Papery air over a deep chesty push; no pitched oscillator thump.
    let sample = ((air - low) * .75 + low * 1.8) * beat;
    for (let call = 0; call < calls; call++) {
      const age = t - (.15 + call * .155);
      if (age < 0 || age > .125) continue;
      const envelope = Math.sin(Math.PI * age / .125) ** 1.3;
      const frequency = (760 - age * 2600 - call * 65) * pitch;
      callPhase += Math.PI * 2 * frequency / rate;
      // A noisy, irregular harmonic throat sound, rather than four square
      // notes. Envelope and breath give each syllable a rasping release.
      const throat = (Math.sin(callPhase) + Math.sin(callPhase * 2.01) * .35) * .12;
      sample += (throat * (.72 + white * .28) + (air - low) * .20) * envelope;
    }
    flight[i] = sample * tail * Math.min(1, t / .006);
    if (i < cover.length) {
      coverLow += .15 * (white - coverLow);
      const release = (1 - Math.exp(-t * 650)) * Math.exp(-t * 22);
      const stems = Math.exp(-(((t - .024) / .005) ** 2)) + Math.exp(-(((t - .059) / .008) ** 2)) * .65;
      const settle = Math.min(1, (.34 - t) / .035);
      cover[i] = ((white - coverLow) * .27 * release + coverLow * .9 * release + white * stems * .11) * settle;
    }
  }
  return { cover, flight, calls };
}
