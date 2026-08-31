import Phaser from 'phaser';
import type { BreedConfig } from '../game/breeds';
import { pixelText, type PixelText } from './pixelFont';

/** Shared visual language for the front-end screens. */
export const MENU = {
  ink: 0x0b100e,
  panel: 0x111713,
  panelAlt: 0x1a2119,
  olive: 0x46562d,
  oliveBright: 0x667a43,
  line: 0x6f705f,
  lineSoft: 0x3f443b,
  cream: '#f2e5c5',
  sage: '#a9b982',
  muted: '#777e68',
  amber: 0xf4b536,
  amberText: '#f4b536',
} as const;

export function preloadMenuArt(scene: Phaser.Scene): void {
  if (!scene.textures.exists('menu-bg')) scene.load.image('menu-bg', 'art/title-screen.png');
  if (!scene.textures.exists('menu-dog-gsp')) {
    scene.load.spritesheet('menu-dog-gsp', 'art/gsp-sheet-alpha.png', { frameWidth: 32, frameHeight: 20 });
  }
  if (!scene.textures.exists('menu-dog-setter')) {
    scene.load.spritesheet('menu-dog-setter', 'art/english-setter-sheet-alpha.png', {
      frameWidth: 32,
      frameHeight: 20,
    });
  }
}

export function addMenuBackdrop(scene: Phaser.Scene, shade = 0.34): void {
  if (scene.textures.exists('menu-bg')) {
    scene.add.image(240, 135, 'menu-bg').setDisplaySize(480, 270);
  } else {
    scene.add.rectangle(240, 135, 480, 270, 0x263b45);
  }
  scene.add.rectangle(240, 135, 480, 270, 0x07100d, shade);
  // The mockups use a faint blue dusk veil above warm grass. This keeps the
  // existing painted title plate legible under dense menu panels.
  scene.add.rectangle(240, 44, 480, 88, 0x1b3247, 0.24);
}

export function addMenuPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha = 0.94,
): Phaser.GameObjects.Rectangle {
  scene.add.rectangle(x + 2, y + 3, width, height, 0x000000, 0.48);
  const panel = scene.add
    .rectangle(x, y, width, height, MENU.panel, alpha)
    .setStrokeStyle(1, MENU.line);
  scene.add.rectangle(x, y, width - 6, height - 6, 0x000000, 0).setStrokeStyle(1, MENU.lineSoft, 0.85);
  const g = scene.add.graphics();
  g.fillStyle(MENU.line, 1);
  const left = x - width / 2;
  const right = x + width / 2;
  const top = y - height / 2;
  const bottom = y + height / 2;
  for (const [cx, cy] of [[left, top], [right, top], [left, bottom], [right, bottom]] as const) {
    g.fillRect(cx - 2, cy - 2, 4, 1);
    g.fillRect(cx - 2, cy - 2, 1, 4);
  }
  return panel;
}

export function addRuleHeading(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  width: number,
  color: string | number = MENU.sage,
): PixelText {
  const labelWidth = label.length * 6 + 18;
  const side = Math.max(8, (width - labelWidth) / 2);
  const g = scene.add.graphics();
  g.lineStyle(1, MENU.lineSoft, 1);
  g.lineBetween(x - width / 2, y, x - width / 2 + side, y);
  g.lineBetween(x + width / 2 - side, y, x + width / 2, y);
  g.fillStyle(MENU.line, 1);
  g.fillRect(x - width / 2 - 1, y - 1, 3, 3);
  g.fillRect(x + width / 2 - 1, y - 1, 3, 3);
  return pixelText(scene, x, y, label, 1, color).setOrigin(0.5);
}

export function addStepHeader(
  scene: Phaser.Scene,
  step: 1 | 2 | 3,
  completeBefore = step - 1,
): void {
  pixelText(scene, 240, 7, `— STEP ${step} OF 3 —`, 1, MENU.cream).setOrigin(0.5);
  scene.add.rectangle(240, 23, 262, 18, MENU.ink, 0.88).setStrokeStyle(1, MENU.lineSoft);
  const labels = ['BREED', 'NAME', 'HOME GROUND'];
  const xs = [165, 240, 323];
  labels.forEach((label, i) => {
    const done = i < completeBefore;
    const active = i === step - 1;
    pixelText(scene, xs[i], 23, `${label}${done ? ' ★' : ''}`, 1, active ? MENU.amberText : MENU.sage)
      .setOrigin(0.5);
  });
}

export function setMenuFocus(
  box: Phaser.GameObjects.Rectangle,
  focused: boolean,
  selected = false,
): void {
  box.setFillStyle(selected ? MENU.olive : MENU.panelAlt, selected ? 0.98 : 0.96);
  box.setStrokeStyle(focused || selected ? 2 : 1, focused || selected ? MENU.amber : MENU.lineSoft);
}

export function addDogPreview(
  scene: Phaser.Scene,
  breed: BreedConfig,
  x: number,
  y: number,
  scale: number,
): Phaser.GameObjects.Image {
  const setter = breed.id === 'english-setter' || breed.id === 'irish-setter';
  // The point frame reads as one clean silhouette at menu scale. The heel
  // frame is authored for in-field animation and separates visually when
  // enlarged into a portrait.
  return scene.add.image(x, y, setter ? 'menu-dog-setter' : 'menu-dog-gsp', 4)
    .setScale(scale)
    .setOrigin(0.5, 0.65);
}

export function learningPace(breed: BreedConfig): string {
  if (breed.xpRate > 1) return 'FAST LEARNING PACE';
  if (breed.xpRate < 1) return 'DELIBERATE LEARNING PACE';
  return 'STANDARD LEARNING PACE';
}

export function addFooterHint(scene: Phaser.Scene, text: string): PixelText {
  return pixelText(scene, 240, 260, text, 1, MENU.muted).setOrigin(0.5);
}
