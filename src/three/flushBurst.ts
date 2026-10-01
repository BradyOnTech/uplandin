import { mulberry32 } from '../game/math';

/**
 * The first instant of a close flush: a hard, papery wing clap over a low
 * thump felt in the chest, mixed into the launch's cover buffer. `burst` is
 * the close-flush intensity (0..1); at zero the buffer is untouched.
 * Synthesized, like the rest of the launch, so no sample assets are needed.
 */
export function addLaunchBurst(buffer: Float32Array, rate: number, burst: number, seed: number): void {
  if (!(burst > 0)) return;
  const rng = mulberry32(seed ^ 0x2c1b3c6d);
  const amount = Math.min(1, burst);
  let phase = 0, bright = 0, body = 0;
  const length = Math.min(buffer.length, Math.ceil(rate * .22));
  for (let i = 0; i < length; i++) {
    const t = i / rate, white = rng() * 2 - 1;
    // The thump: a falling 58→36 Hz push, gone in about a tenth of a second.
    phase += Math.PI * 2 * (36 + 22 * Math.exp(-t * 30)) / rate;
    const thump = Math.sin(phase) * Math.exp(-t / .07) * Math.min(1, t / .004);
    // The clap: three fast overlapping wing strikes on the cover, broad and bright.
    bright += .55 * (white - bright);
    body += .12 * (white - body);
    const strikes = Math.exp(-(((t - .006) / .004) ** 2)) + Math.exp(-(((t - .028) / .006) ** 2)) * .8
      + Math.exp(-(((t - .055) / .008) ** 2)) * .55;
    const clap = ((white - bright * .4) * .6 + body * 1.6) * strikes;
    const value = buffer[i] + (thump * .48 + clap * .4) * amount;
    // Soft knee: the eruption is loud, never clipped.
    const size = Math.abs(value);
    buffer[i] = size <= .82 ? value : Math.sign(value) * Math.min(.98, .82 + (size - .82) * .35);
  }
}
