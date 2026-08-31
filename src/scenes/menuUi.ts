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
): Phaser.GameObjects.Container {
  const visuals = DOG_PORTRAITS[breed.id] ?? DOG_PORTRAITS.gsp;
  const container = scene.add.container(x, y).setScale(scale);
  const g = scene.add.graphics();
  container.add(g);

  // One shared pointing pose, with breed identity carried by proportions,
  // coat, markings, furnishings, ears, and tail. The generated art-direction
  // board in public/art/reference is the silhouette and palette reference.
  const bodyW = 25 * visuals.length;
  const bodyH = 10 * visuals.build;
  const bodyX = -5;
  const bodyY = -2;
  const headX = 13 + (visuals.length - 1) * 5;

  g.fillStyle(0x000000, 0.32);
  g.fillEllipse(-1, 12, 37, 4);

  // Tail is drawn first so long setter feathering sits behind the body.
  g.fillStyle(visuals.coat, 1);
  const tailY = visuals.tailHigh ? -5 : -1;
  g.fillTriangle(-17, tailY, -9, -4, -10, 1);
  if (visuals.feathered) {
    g.fillStyle(visuals.secondary, 0.92);
    g.fillTriangle(-18, tailY + 2, -9, -1, -12, 4);
  }

  g.fillStyle(visuals.coat, 1);
  g.fillEllipse(bodyX, bodyY, bodyW, bodyH);
  g.fillTriangle(5, -7, 13, -13, 12, 1);
  g.fillEllipse(headX, -11, 11 * visuals.headSize, 9 * visuals.headSize);
  g.fillRect(headX + 4, -12, 7, 4);

  // Hind leg, planted foreleg, and the raised pointing foreleg.
  g.fillRect(-12, 2, 4, 11);
  g.fillRect(-13, 11, 7, 3);
  g.fillRect(7, 1, 4, 12);
  g.fillRect(7, 11, 7, 3);
  g.fillRect(10, 0, 4, 7);
  g.fillRect(12, 6, 7, 3);

  g.fillStyle(visuals.secondary, 1);
  if (visuals.pattern === 'patched' || visuals.pattern === 'ticked') {
    g.fillEllipse(-8, -3, 9, bodyH - 2);
    g.fillEllipse(5, -2, 7, bodyH - 3);
    g.fillCircle(headX + 1, -12, 4);
    g.fillRect(-12, 4, 3, 7);
  } else if (visuals.pattern === 'roan') {
    g.fillEllipse(-4, -2, bodyW - 6, bodyH - 3);
    g.fillCircle(headX - 1, -11, 3);
  } else if (visuals.pattern === 'saddle') {
    g.fillEllipse(-3, -4, 14, bodyH - 2);
    g.fillCircle(headX, -12, 4);
  }

  if (visuals.pattern === 'ticked' || visuals.pattern === 'roan') {
    g.fillStyle(visuals.coat, 0.9);
    const spots = [[-12, -4], [-7, 0], [-1, -5], [4, 1], [0, 2], [8, -3]];
    spots.forEach(([sx, sy], i) => g.fillRect(sx, sy, i % 2 === 0 ? 2 : 1, 1));
  }

  // Ears and breed furnishings do most of the work at portrait scale.
  g.fillStyle(visuals.ear, 1);
  g.fillTriangle(headX - 3, -13, headX + 2, -8, headX - 2, -4 - visuals.earLength);
  if (visuals.feathered) {
    g.fillStyle(visuals.secondary, 0.95);
    g.fillTriangle(headX - 2, -8, headX + 2, -6, headX - 2, 0);
    g.fillTriangle(-8, 2, 4, 3, -2, 7);
  }
  if (visuals.wire) {
    g.fillStyle(visuals.secondary, 1);
    g.fillRect(headX + 5, -8, 5, 2);
    g.fillRect(headX + 7, -6, 3, 2);
    g.fillRect(headX - 1, -15, 2, 2);
    g.fillRect(-9, -8, 2, 2);
    g.fillRect(-1, 2, 2, 2);
  }

  g.fillStyle(0x16100d, 1);
  g.fillRect(headX + 10, -12, 2, 2);
  g.fillRect(headX + 2, -13, 1, 1);
  g.lineStyle(1, 0xe9dfc2, 0.34);
  g.strokeEllipse(bodyX, bodyY, bodyW, bodyH);
  return container;
}

type CoatPattern = 'solid' | 'patched' | 'ticked' | 'roan' | 'saddle';

interface DogPortraitVisuals {
  coat: number;
  secondary: number;
  ear: number;
  pattern: CoatPattern;
  build: number;
  length: number;
  headSize: number;
  earLength: number;
  tailHigh: boolean;
  feathered: boolean;
  wire: boolean;
}

export const DOG_PORTRAITS: Record<string, DogPortraitVisuals> = {
  gsp: { coat: 0x5b2f22, secondary: 0xe8dfc7, ear: 0x422118, pattern: 'ticked', build: 1, length: 1, headSize: 1, earLength: 2, tailHigh: true, feathered: false, wire: false },
  'english-pointer': { coat: 0xe9e5d3, secondary: 0x242521, ear: 0x171815, pattern: 'patched', build: 0.9, length: 1.08, headSize: 0.92, earLength: 2, tailHigh: true, feathered: false, wire: false },
  'english-setter': { coat: 0xeee7d1, secondary: 0xa56d44, ear: 0x825136, pattern: 'ticked', build: 0.96, length: 1.04, headSize: 0.96, earLength: 4, tailHigh: false, feathered: true, wire: false },
  gwp: { coat: 0x6b5745, secondary: 0xb9b1a0, ear: 0x4d3628, pattern: 'roan', build: 1.08, length: 1, headSize: 1.05, earLength: 2, tailHigh: true, feathered: false, wire: true },
  vizsla: { coat: 0xa9532d, secondary: 0xc97542, ear: 0x8d4227, pattern: 'solid', build: 0.88, length: 1.05, headSize: 0.9, earLength: 3, tailHigh: true, feathered: false, wire: false },
  pudelpointer: { coat: 0x39271f, secondary: 0x665043, ear: 0x241915, pattern: 'solid', build: 1.02, length: 1.02, headSize: 1.04, earLength: 3, tailHigh: true, feathered: false, wire: true },
  'american-brittany': { coat: 0xe6ded0, secondary: 0xb95b28, ear: 0x98451f, pattern: 'patched', build: 0.9, length: 0.9, headSize: 0.98, earLength: 4, tailHigh: true, feathered: true, wire: false },
  'french-brittany': { coat: 0xe5ddd0, secondary: 0x3a302a, ear: 0x24201d, pattern: 'saddle', build: 0.92, length: 0.88, headSize: 1, earLength: 4, tailHigh: true, feathered: true, wire: false },
  'deutsch-drahthaar': { coat: 0x40352d, secondary: 0x84786b, ear: 0x2d241f, pattern: 'roan', build: 1.12, length: 1.02, headSize: 1.08, earLength: 2, tailHigh: true, feathered: false, wire: true },
  griffon: { coat: 0x82766a, secondary: 0xb6aa94, ear: 0x5f4b3c, pattern: 'roan', build: 1.08, length: 0.96, headSize: 1.12, earLength: 3, tailHigh: false, feathered: false, wire: true },
  'irish-setter': { coat: 0x8f351f, secondary: 0xc35a2d, ear: 0x712417, pattern: 'solid', build: 0.94, length: 1.08, headSize: 0.94, earLength: 5, tailHigh: false, feathered: true, wire: false },
};

export function learningPace(breed: BreedConfig): string {
  if (breed.xpRate > 1) return 'FAST LEARNING PACE';
  if (breed.xpRate < 1) return 'DELIBERATE LEARNING PACE';
  return 'STANDARD LEARNING PACE';
}

export function addFooterHint(scene: Phaser.Scene, text: string): PixelText {
  return pixelText(scene, 240, 260, text, 1, MENU.muted).setOrigin(0.5);
}
