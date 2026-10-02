/** Cosmetic timing shared by the visible mechanism and its sound cues.
 * Ammunition, reload duration and shot readiness remain in GunSystem. */
export type ShotgunMechanism = 'pump' | 'semi-auto' | 'over-under' | 'side-by-side';
export type ShotgunActionCue = 'latch' | 'eject' | 'shell' | 'rack' | 'lock';

const MECHANISMS: Readonly<Record<string, ShotgunMechanism>> = {
  'remington-870': 'pump', 'semi-auto': 'semi-auto', 'over-under': 'over-under', 'side-by-side': 'side-by-side',
};
/** The action a gun works by. */
export function gunMechanism(gunId: string): ShotgunMechanism {
  return MECHANISMS[gunId] ?? 'pump';
}

export const SHOTGUN_CYCLE = {
  pumpStart: .08, pumpBack: .22, pumpClosed: .44,
  semiBack: .035, semiClosed: .10,
} as const;
export const TUBE_LOADING = { start: .55, perShell: .38, inserted: .66, withdraw: .78 } as const;
/** A double's ejectors throw the fired hulls this far into opening it. */
export const DOUBLE_EJECT_S = .27;
/** A double's shell clicks home this far into its loading beat. */
export const DOUBLE_SEATED = .68;

/**
 * How far the gun is brought down into the loading position: it comes down
 * over a third of a second and back up in the last quarter second, by time
 * rather than by share of the reload, so a reload cut short keeps its pace.
 */
export function reloadPose(elapsed: number, duration: number): number {
  if (duration <= 0) return 0;
  const t = Math.min(1, Math.max(0, Math.min(elapsed / .3, (duration - elapsed) / .25)));
  return t * t * (3 - 2 * t);
}
export function doubleLoading(duration: number, missing: number) {
  const count = Math.min(2, Math.max(0, Math.ceil(missing)));
  const closeStart = Math.max(.4, duration - .24), loadStart = .34;
  return { count, closeStart, loadStart, perShell: Math.max(.01, (closeStart - loadStart) / Math.max(1, count)) };
}

type Emit = (cue: ShotgunActionCue) => void;
function crossed(previous: number, current: number, time: number): boolean {
  return current > previous && previous < time && current >= time;
}

/** Call with the real animation interval, never wall-clock timers. Pausing,
 * scrubbing a rack preview or replacing the gun cannot leave queued sounds. */
export function shotgunCycleCues(action: ShotgunMechanism, previous: number, current: number, emit: Emit): void {
  if (action === 'pump') {
    if (crossed(previous, current, SHOTGUN_CYCLE.pumpStart)) emit('rack');
    if (crossed(previous, current, SHOTGUN_CYCLE.pumpBack)) emit('eject');
    if (crossed(previous, current, SHOTGUN_CYCLE.pumpClosed)) emit('lock');
  } else if (action === 'semi-auto') {
    if (crossed(previous, current, SHOTGUN_CYCLE.semiBack)) emit('eject');
    if (crossed(previous, current, SHOTGUN_CYCLE.semiClosed)) emit('lock');
  }
}

export function shotgunReloadCues(action: ShotgunMechanism, previous: number, current: number,
  duration: number, missing: number, emit: Emit): void {
  if (duration <= 0) return;
  if (action === 'over-under' || action === 'side-by-side') {
    // A double opened and closed again without a shell still clicks and ejects.
    const { count, closeStart, loadStart, perShell } = doubleLoading(duration, missing);
    if (crossed(previous, current, .09)) emit('latch');
    if (crossed(previous, current, DOUBLE_EJECT_S)) emit('eject');
    for (let i = 0; i < count; i++) if (crossed(previous, current, loadStart + (i + DOUBLE_SEATED) * perShell)) emit('shell');
    if (crossed(previous, current, closeStart + (duration - closeStart) * .9)) emit('lock');
  } else {
    if (missing <= 0) return;
    for (let i = 0; i < missing; i++) if (crossed(previous, current,
      TUBE_LOADING.start + (i + TUBE_LOADING.inserted) * TUBE_LOADING.perShell)) emit('shell');
  }
}
