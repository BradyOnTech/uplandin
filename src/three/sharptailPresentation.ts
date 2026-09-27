function smoothstep(value: number, low: number, high: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/** Presentation only: already-flushed birds retain their actual positions.
 * Most of the 3–6 bird group lifts inside 240ms. A seeded last bird sometimes
 * follows at 390–650ms; every group is not stretched into an easy long wave. */
export function sharptailLaunchDelay(index: number, count: number, rng: () => number): number {
  if (index === 0) return 0;
  if (count >= 4 && index === count - 1) {
    const choice = rng();
    // Match the old queue's random-draw count exactly, preserving subsequent
    // escape profiles and effects in an existing seeded replay. Four-bird
    // groups previously spent one draw; larger groups spent two.
    const jitter = count >= 5 ? rng() : choice < .30 ? choice / .30 : (choice - .30) / .70;
    return choice < .30 ? 390 + jitter * 260 : 190 + jitter * 45;
  }
  return index / Math.max(1, count - 1) * 190 + rng() * 45;
}

export interface SharptailWingPose { angle: number; recovery: number }

/** Shared by the visible wing and its short launch sound. */
export function sharptailWingPhase(seconds: number, hz: number, phaseOffset = 0): number {
  const time = Math.max(0, seconds), rate = Math.max(1, hz);
  const cycles = rate * (.72 * time + .28 * .28 * (1 - Math.exp(-time / .28)));
  return cycles * Math.PI * 2 + phaseOffset;
}

/** Art-tuned power/recovery phrasing, not a change to flight physics. The
 * absolute interpolated flight clock makes live 30/60/120Hz views and capture
 * agree. A fast initial drive settles into brief beat bouts and open glides,
 * replacing the old permanent rigid-wing pose after 800ms. */
export function sharptailWingbeat(seconds: number, hz: number, phaseOffset = 0, glideAt = .8): SharptailWingPose {
  const time = Math.max(0, seconds);
  // Integral of a decaying initial cadence: no phase reset at level-out.
  const phase = sharptailWingPhase(time, hz, phaseOffset);
  const drive = .04 + Math.sin(phase) * (.77 + Math.exp(-time / .36) * .18);
  let power = 1;
  if (time > glideAt) {
    const since = time - glideAt;
    const period = ((since / 1.55 + phaseOffset * .08) % 1 + 1) % 1;
    const bout = smoothstep(period, .23, .32) * (1 - smoothstep(period, .58, .70));
    power = 1 + (.82 * bout - 1) * smoothstep(since, 0, .22);
  }
  return { angle: .15 + (drive - .15) * power,
    recovery: smoothstep(Math.cos(phase), -.10, .80) * power };
}
