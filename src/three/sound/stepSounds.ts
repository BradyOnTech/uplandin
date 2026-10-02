import { Biquad, fadeTail, modes, noiseSource, normalize, OnePole, type Mode } from './dsp';

/**
 * The hunter's boots on each kind of ground: a heel coming down and the roll
 * to the toe, then what the ground does under them. Dry dirt crunches, prairie
 * grass and stubble crackle and swish, tall cover hisses against the legs and
 * snaps, rimrock clicks hard, scree slides and rattles, slough mud sucks,
 * shallow water splashes. Synthesized once into a few variants each.
 */
export const STEP_RATE = 22050;
export type StepSurface = 'dirt' | 'grass' | 'cover' | 'rock' | 'scree' | 'wet' | 'water';
export const STEP_SURFACES: readonly StepSurface[] = ['dirt', 'grass', 'cover', 'rock', 'scree', 'wet', 'water'];

/** What the ground is under a boot, from the land's own classification. A
 * farm lane or canyon track is bare dirt; a prairie two-track stays grass. */
export function stepSurface(ground: { rockiness: number; vegetation: number; moisture: number }, inCover: boolean, waterDepth: number,
  onLane = false): StepSurface {
  if (waterDepth > .05) return 'water';
  if (ground.moisture > .6) return 'wet';
  if (ground.rockiness > .55) return 'rock';
  if (ground.rockiness > .3) return 'scree';
  if (inCover) return 'cover';
  if (onLane) return 'dirt';
  return ground.vegetation > .35 ? 'grass' : 'dirt';
}

/** Whether a point lies on one of the property's routes, within a half-width (all in property units). */
export function onRoute(routes: readonly { points: readonly { x: number; y: number }[] }[], x: number, y: number, halfWidth: number): boolean {
  for (const route of routes) {
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1], b = route.points[i], dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
      const t = length > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length)) : 0;
      if (Math.hypot(x - a.x - dx * t, y - a.y - dy * t) <= halfWidth) return true;
    }
  }
  return false;
}

type Rand = () => number;

/** A burst of filtered noise with a shaped envelope, added in. */
function hiss(out: Float32Array, rate: number, at: number, length: number, low: number, high: number, gain: number, r: Rand,
  shape: (x: number) => number = x => Math.exp(-x * 5)): void {
  const noise = noiseSource(Math.floor(r() * 1e9)), lo = new Biquad('highpass', low, .7, rate), hi = new Biquad('lowpass', high, .7, rate);
  const first = Math.round(at * rate), count = Math.round(length * rate);
  for (let n = 0; n < count && first + n < out.length; n++) out[first + n] += hi.run(lo.run(noise())) * gain * shape(n / count) * Math.min(1, n / (rate * .0015));
}

/** Small hard contacts scattered over a stretch: grit, stems snapping, pebbles. */
function crackle(out: Float32Array, rate: number, at: number, length: number, count: number, frequency: [number, number], decay: number,
  gain: number, r: Rand): void {
  for (let i = 0; i < count; i++) {
    const when = at + length * Math.pow(r(), 1.6), f = frequency[0] + (frequency[1] - frequency[0]) * r();
    modes(out, rate, when, [{ frequency: Math.min(rate * .45, f), decay: decay * (.6 + r() * .8), gain: gain * (.4 + r() * .6) },
      { frequency: Math.min(rate * .45, f * 1.7), decay: decay * .5, gain: gain * .3 * r() }]);
  }
}

/** The boot itself: a soft thump for the heel and a lighter one for the toe. */
function boot(out: Float32Array, rate: number, at: number, force: number, softness: number, r: Rand): void {
  // Felt more than heard on small speakers; the ground's own sound carries it.
  const thump: Mode[] = [{ frequency: 85 + r() * 25, decay: .02, gain: .26 * force }, { frequency: 170 + r() * 40, decay: .012, gain: .13 * force }];
  modes(out, rate, at, thump);
  // The sole slapping down: dull on soft ground, sharper on hard.
  hiss(out, rate, at, .02, 150, 1500 - softness * 900, .5 * force, r);
}

export function synthesizeStep(surface: StepSurface, seed: number, running = false): Float32Array {
  const rate = STEP_RATE, out = new Float32Array(Math.ceil(.42 * rate)), r0 = noiseSource(seed ^ 0x7a3f9c11), r: Rand = () => r0() * .5 + .5;
  const force = running ? 1.3 : 1, roll = (running ? .045 : .085) * (.85 + r() * .3), heel = .004, toe = heel + roll;
  switch (surface) {
    case 'dirt':
      boot(out, rate, heel, force, .4, r); boot(out, rate, toe, force * .5, .4, r);
      hiss(out, rate, heel, .07, 1200, 3600, .34 * force, r);
      hiss(out, rate, toe, .05, 1400, 3600, .18 * force, r);
      crackle(out, rate, heel, .1, 10, [1800, 4200], .004, .1 * force, r);
      break;
    case 'grass':
      boot(out, rate, heel, force * .8, .8, r); boot(out, rate, toe, force * .4, .8, r);
      hiss(out, rate, heel, .14, 2000, 7500, .2 * force, r, x => Math.sin(Math.PI * Math.min(1, x * 3)) * Math.exp(-x * 3));
      crackle(out, rate, heel, .13, 14, [2500, 6500], .003, .07 * force, r);
      break;
    case 'cover':
      boot(out, rate, heel, force * .7, .9, r); boot(out, rate, toe, force * .35, .9, r);
      // Stems dragging against the legs, before and after the boot lands.
      hiss(out, rate, 0, .3, 1100, 5200, .3 * force, r, x => Math.sin(Math.PI * x) ** 1.5);
      crackle(out, rate, .02, .22, 9, [1800, 5200], .006, .12 * force, r);
      break;
    case 'rock':
      boot(out, rate, heel, force, 0, r); boot(out, rate, toe, force * .6, 0, r);
      // Hard heel on stone: a short bright clack, the sole scuffing.
      modes(out, rate, heel, [{ frequency: 2200 + r() * 500, decay: .007, gain: .5 * force }, { frequency: 4100 + r() * 700, decay: .004, gain: .3 * force }]);
      hiss(out, rate, heel, .004, 3000, 9000, .9 * force, r, x => 1 - x);
      hiss(out, rate, toe, .05, 2200, 7000, .12 * force, r);
      crackle(out, rate, heel + .01, .12, 3, [2600, 5500], .005, .12 * force, r);
      break;
    case 'scree':
      boot(out, rate, heel, force, .2, r); boot(out, rate, toe, force * .5, .2, r);
      // Loose stones slide and rattle against one another.
      crackle(out, rate, heel, .28, 30, [1800, 6000], .006, .24 * force, r);
      hiss(out, rate, heel, .22, 1500, 5000, .1 * force, r, x => Math.exp(-x * 2.5));
      break;
    case 'wet': {
      boot(out, rate, heel, force * .9, .9, r); boot(out, rate, toe, force * .3, .9, r);
      // Mud taking the boot and letting it go: a resonance that rises as it sucks.
      const noise = noiseSource(Math.floor(r() * 1e9)), suck = new Biquad('bandpass', 300, 6, rate), first = Math.round((toe + .02) * rate), count = Math.round(.13 * rate);
      for (let n = 0; n < count && first + n < out.length; n++) {
        const x = n / count;
        if (n % 16 === 0) suck.tune(300 + 700 * x * x, 6);
        out[first + n] += suck.run(noise()) * .9 * force * Math.sin(Math.PI * x) ** 2;
      }
      crackle(out, rate, toe + .1, .2, 3, [1200, 2600], .012, .05, r);
      break;
    }
    case 'water': {
      boot(out, rate, heel, force * .5, 1, r);
      hiss(out, rate, heel, .16, 800, 7000, .35 * force, r, x => Math.exp(-x * 4));
      // Bubbles: little rising chirps as the water closes behind the leg.
      for (let i = 0; i < 7; i++) {
        const at = heel + .02 + r() * .25, f = 500 + r() * 900, length = .02 + r() * .03;
        const first = Math.round(at * rate), count = Math.round(length * rate);
        let phase = 0;
        for (let n = 0; n < count && first + n < out.length; n++) {
          phase += 2 * Math.PI * f * (1 + 1.5 * n / count) / rate;
          out[first + n] += Math.sin(phase) * .08 * Math.exp(-n / count * 4) * force;
        }
      }
      // The slosh of the water moved aside.
      const slosh = new OnePole(600, rate), noise = noiseSource(Math.floor(r() * 1e9));
      for (let n = Math.round((heel + .05) * rate), end = n + Math.round(.25 * rate); n < end && n < out.length; n++) {
        out[n] += slosh.low(noise()) * .9 * force * Math.sin(Math.PI * (n / rate - heel - .05) / .25);
      }
      break;
    }
  }
  return normalize(fadeTail(out, rate, .03), .9);
}
