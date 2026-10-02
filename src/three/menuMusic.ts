import { audioReady, playReportSting, prepareMusic, startMenuTheme, unlockAudio, type MusicPlayer } from '../audio';
import type { StingKind } from './sound/score';

/** The menus' music, and the few bars at the end of a hunt (sound/score.ts). */
const SOUND_KEY = 'uplandin.3d.sound';
function soundOn(): boolean {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}

export interface MenuMusic { stop(fadeSeconds?: number): void }

/**
 * The theme begins with the first touch, click or key on a menu page (the
 * browser holds sound back until then), unless sound is turned off. It goes
 * on from where it was on the last page, so moving through the menus never
 * starts it over.
 */
export function menuMusicOnFirstGesture(target: EventTarget = window): MenuMusic {
  let player: MusicPlayer | null = null, stopped = false;
  const listening = new AbortController();
  const begin = async () => {
    listening.abort();
    if (stopped || !soundOn()) return;
    unlockAudio();
    if (!(await audioReady()) || stopped) return;
    player = startMenuTheme();
  };
  prepareMusic();
  for (const type of ['pointerdown', 'keydown', 'touchstart']) target.addEventListener(type, () => { void begin(); }, { signal: listening.signal });
  return {
    stop(fadeSeconds = 1.5) {
      stopped = true; listening.abort();
      player?.stop(fadeSeconds); player = null;
    },
  };
}

/** The hunt is over: a few warm bars for a day with birds in the bag, gentler ones for a quiet day. */
export function huntSting(kind: StingKind): void {
  if (soundOn()) playReportSting(kind);
}
