import Phaser from 'phaser';
import { AreaScene } from './scenes/AreaScene';
import { BreedScene } from './scenes/BreedScene';
import { FieldScene } from './scenes/FieldScene';
import { FlushScene } from './scenes/FlushScene';
import { MapScene } from './scenes/MapScene';
import { QuickScene } from './scenes/QuickScene';
import { TitleScene } from './scenes/TitleScene';

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
  scene: [TitleScene, BreedScene, MapScene, QuickScene, AreaScene, FieldScene, FlushScene],
};

const game = new Phaser.Game(config);

// Handle for poking at the running game from devtools / browser automation.
(window as unknown as Record<string, unknown>).__uplandin = game;

export default game;
