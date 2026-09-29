import Phaser from 'phaser';
import { resolveClassicLaunch } from './game/classicLaunch';
import { FieldScene } from './scenes/FieldScene';
import { FlushScene } from './scenes/FlushScene';
import { TitleScene } from './scenes/TitleScene';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, RENDER_HEIGHT, RENDER_WIDTH } from './scenes/logicalViewport';

export const GAME_WIDTH = LOGICAL_WIDTH;
export const GAME_HEIGHT = LOGICAL_HEIGHT;

// This module is the classic gameplay entry only. Shared DOM preparation
// validates/saves the draft; this boundary rechecks the current save before play.
const launch = resolveClassicLaunch(location.search);
class ClassicEntryScene extends Phaser.Scene {
  constructor() { super('ClassicEntryScene'); }
  create(): void {
    if (launch.kind !== 'field') return;
    this.scene.get('FieldScene').events.once(Phaser.Scenes.Events.CREATE, () => {
      const loading = document.getElementById('classic-loading');
      if (loading) loading.hidden = true;
    });
    this.scene.start('FieldScene', launch.data);
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: RENDER_WIDTH,
  height: RENDER_HEIGHT,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#101410',
  render: { clearBeforeRender: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  // FlushScene returns its existing live hunt/dogs/simulation to FieldScene.
  // TitleScene is retained only as a compatibility redirect, never an old menu.
  scene: [ClassicEntryScene, FieldScene, FlushScene, TitleScene],
};

const w = window as unknown as Record<string, unknown>;
const prev = w.__uplandin as Phaser.Game | undefined;
if (prev && typeof prev.destroy === 'function') prev.destroy(true);
let game: Phaser.Game | undefined;
if (launch.kind === 'redirect') {
  location.replace(launch.href);
} else {
  game = new Phaser.Game(config);
  w.__uplandin = game;
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* Online play remains available. */ });
  });
}

export default game;
