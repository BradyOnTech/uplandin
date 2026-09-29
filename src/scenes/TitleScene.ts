import Phaser from 'phaser';

/** Compatibility for old scene links. All player menus now belong to the shared home. */
export class TitleScene extends Phaser.Scene {
  constructor() { super('TitleScene'); }
  create(): void { location.replace('./home3d.html'); }
}
