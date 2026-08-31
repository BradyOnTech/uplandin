import Phaser from 'phaser';
import { AreaScene } from './scenes/AreaScene';
import { BreedScene } from './scenes/BreedScene';
import { FieldScene } from './scenes/FieldScene';
import { FlushScene } from './scenes/FlushScene';
import { KennelScene } from './scenes/KennelScene';
import { MapScene } from './scenes/MapScene';
import { QuickScene } from './scenes/QuickScene';
import { TitleScene } from './scenes/TitleScene';
import { DropScene } from './scenes/DropScene';

/** Internal resolution — deliberately tiny, scaled up with nearest-neighbor for the retro look. */
export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#101410',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TitleScene, BreedScene, MapScene, KennelScene, QuickScene, AreaScene, DropScene, FieldScene, FlushScene],
};

// Vite HMR can re-evaluate this module (any update it can't accept in place
// falls through to here). Never let two Phaser games race one page: the old
// loop keeps ticking under the new canvas and both crawl.
const w = window as unknown as Record<string, unknown>;
const prev = w.__uplandin as Phaser.Game | undefined;
if (prev && typeof prev.destroy === 'function') prev.destroy(true);

const game = new Phaser.Game(config);

// Handle for poking at the running game from devtools / browser automation.
w.__uplandin = game;

// PWA: register the service worker in production builds only, so dev never
// fights a cache. Installed to a phone's home screen, the game runs
// fullscreen and offline; updates land on the next launch.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // No SW support or a blocked context — the game still runs normally.
    });
  });
}

export default game;
