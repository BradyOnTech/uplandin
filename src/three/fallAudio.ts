import { mulberry32 } from '../game/math';

/**
 * A shot bird reaching the ground, synthesised: a dull thump on open ground
 * (bigger for a heavier bird), a dry swish and a soft thump into cattails or
 * heavy grass, a slap and a plop into water. Designed textures, not recorded
 * sounds. The caller delays it by the distance (sound takes about a third of
 * a second to come back from 100 m) and places it where the bird fell.
 */
export const FALL_AUDIO_RATE = 22050;
/** Metres a second: how late a fall is heard at range. */
export const SPEED_OF_SOUND = 343;

export type FallSurface = 'ground' | 'reeds' | 'water';

/** How long after it landed a fall `distanceM` off is heard, seconds. */
export function fallSoundDelay(distanceM: number): number {
  return Math.max(0, Number.isFinite(distanceM) ? distanceM : 0) / SPEED_OF_SOUND;
}

/** A fall's sound, mono. `weight` is the bird's heft, 0 (a quail) to 1 (a rooster). */
export function synthesizeFall(surface: FallSurface, weight: number, seed = 1): Float32Array {
  const rng = mulberry32((seed ^ 0x51f15e) >>> 0), rate = FALL_AUDIO_RATE;
  const heft = Math.max(0, Math.min(1, weight));
  const seconds = surface === 'reeds' ? .42 : surface === 'water' ? .5 : .3;
  const out = new Float32Array(Math.ceil(rate * seconds));
  let low = 0, mid = 0, phase = 0;
  // The thump: a falling low tone and a short dull knock of earth.
  const thump = surface === 'water' ? .35 : surface === 'reeds' ? .55 : 1;
  const from = 150 - heft * 55, to = 52 - heft * 14;
  for (let i = 0; i < out.length; i++) {
    const t = i / rate, white = rng() * 2 - 1;
    low += .06 * (white - low);
    mid += .32 * (white - mid);
    const freq = to + (from - to) * Math.exp(-t * 28);
    phase += 2 * Math.PI * freq / rate;
    const body = Math.sin(phase) * Math.exp(-t * (24 - heft * 8)) * Math.min(1, t / .003);
    const knock = low * Math.exp(-t * 60) * 2.2;
    let sample = (body * .55 + knock * .5) * thump * (.65 + heft * .35);
    if (surface === 'reeds') {
      // Stems giving way: a band of dry noise that swells and dies.
      const swish = (mid - low) * Math.exp(-(((t - .07) / .09) ** 2)) * .55;
      const rattle = (white - mid) * Math.exp(-t * 14) * .12;
      sample += swish + rattle;
    } else if (surface === 'water') {
      // The slap, then the plop as the water closes over the hole.
      const slap = (white - low) * Math.exp(-t * 38) * Math.min(1, t / .002) * .5;
      const plopT = t - .045;
      const plop = plopT > 0 ? Math.sin(2 * Math.PI * (420 - 230 * Math.min(1, plopT / .06)) * plopT) * Math.exp(-plopT * 30) * .35 : 0;
      const drops = (rng() < .0016 ? 1 : 0) * (rng() * .5 + .3) * Math.exp(-t * 4);
      sample += slap + plop + drops;
    }
    out[i] = sample * Math.min(1, (seconds - t) / .04);
  }
  return out;
}
