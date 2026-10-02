import { afterEach, expect, it, vi } from 'vitest';
import { audioReady, playReportSting, prepareMusic, startMenuTheme, unlockAudio } from '../src/audio';
import { huntSting, menuMusicOnFirstGesture } from '../src/three/menuMusic';

vi.mock('../src/audio', () => ({
  audioReady: vi.fn(async () => true), playReportSting: vi.fn(), prepareMusic: vi.fn(), unlockAudio: vi.fn(),
  startMenuTheme: vi.fn(() => ({ playing: true, stop: vi.fn() })),
}));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const sound = (value: string | null) => vi.stubGlobal('localStorage', { getItem: () => value, setItem: () => undefined });

it('starts the theme on the first touch or key, once, and lets it fade when the hunter walks out', async () => {
  sound(null);
  const page = new EventTarget(), music = menuMusicOnFirstGesture(page);
  expect(prepareMusic).toHaveBeenCalledOnce();
  expect(startMenuTheme).not.toHaveBeenCalled();
  page.dispatchEvent(new Event('pointerdown')); await settle();
  expect(unlockAudio).toHaveBeenCalledOnce(); expect(startMenuTheme).toHaveBeenCalledOnce();
  page.dispatchEvent(new Event('keydown')); page.dispatchEvent(new Event('touchstart')); await settle();
  expect(startMenuTheme).toHaveBeenCalledOnce();
  const player = vi.mocked(startMenuTheme).mock.results[0].value!;
  music.stop(2.5);
  expect(player.stop).toHaveBeenCalledWith(2.5);
});

it('keeps quiet with sound off, without a running context, or once the hunter has walked out', async () => {
  sound('off');
  const off = new EventTarget(); menuMusicOnFirstGesture(off);
  off.dispatchEvent(new Event('keydown')); await settle();
  expect(startMenuTheme).not.toHaveBeenCalled();
  sound('on');
  vi.mocked(audioReady).mockResolvedValueOnce(false);
  const blocked = new EventTarget(); menuMusicOnFirstGesture(blocked);
  blocked.dispatchEvent(new Event('pointerdown')); await settle();
  expect(startMenuTheme).not.toHaveBeenCalled();
  // The first touch is the one that walks out: the theme never begins.
  const page = new EventTarget(), music = menuMusicOnFirstGesture(page);
  page.dispatchEvent(new Event('pointerdown')); music.stop(); await settle();
  expect(startMenuTheme).not.toHaveBeenCalled();
});

it("plays the hunt's last bars, unless sound is off", () => {
  sound(null); huntSting('full');
  expect(playReportSting).toHaveBeenCalledWith('full');
  sound('off'); huntSting('quiet');
  expect(playReportSting).toHaveBeenCalledOnce();
});
