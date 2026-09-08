import Phaser from 'phaser';
import { BREEDS, type BreedConfig } from '../game/breeds';
import { REGIONS } from '../game/regions';

export type MenuText = Phaser.GameObjects.Text;

// Fallbacks live only in this Phaser instance; they never enter the offline art
// cache or replace a successfully loaded image.
const unavailableArt = new WeakMap<Phaser.Textures.TextureManager, Set<string>>();

const menuArt = [
  ['menu-bg', 'art/menu/menu-backdrop.png'],
  ...BREEDS.flatMap((breed) => [
    [`menu-dog-${breed.id}`, `art/menu/dogs/${breed.id}.png`],
    [`menu-dog-thumb-${breed.id}`, `art/menu/dog-thumbs/${breed.id}.png`],
  ]),
  ...REGIONS.map((region) => [`menu-region-${region.id}`, `art/menu/regions/${region.id}.png`]),
  ['menu-home-map', 'art/menu/home-map.png'],
  ['menu-shotgun', 'art/shotgun-side.png'],
  ['menu-bird', 'art/ringneck-rooster-flush.png'],
];

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
  const unavailable = unavailableArt.get(scene.textures);
  for (const [key, url] of menuArt) {
    if (unavailable?.has(key)) {
      // Revisit the real image after reconnecting. Staying offline should not
      // retry every failed image each time the player changes menus.
      if (!navigator.onLine) continue;
      if (scene.textures.exists(key)) scene.textures.remove(key);
      unavailable.delete(key);
    }
    if (!scene.textures.exists(key)) scene.load.image(key, url);
  }
}

export function addMenuBackdrop(scene: Phaser.Scene, shade = 0.34): void {
  const artworkUnavailable = prepareMenuArtFallbacks(scene);
  setMenuArtFiltering(scene);
  if (scene.textures.exists('menu-bg')) {
    scene.add.image(240, 135, 'menu-bg').setDisplaySize(480, 270);
  } else {
    scene.add.rectangle(240, 135, 480, 270, 0x263b45);
  }
  scene.add.rectangle(240, 135, 480, 270, 0x07100d, shade);
  // The dusk veil ties the generated plate back to the cooler mockup palette
  // and keeps the cream display type legible over the sunset.
  scene.add.rectangle(240, 44, 480, 88, 0x1b3247, 0.24);
  if (artworkUnavailable) {
    menuCopy(scene, 6, 4, 'Artwork unavailable', MENU.sage, 7).setDepth(1000);
  }
}

function prepareMenuArtFallbacks(scene: Phaser.Scene): boolean {
  let unavailable = unavailableArt.get(scene.textures);
  if (!unavailable) {
    unavailable = new Set<string>();
    unavailableArt.set(scene.textures, unavailable);
  }
  for (const [key] of menuArt) {
    if (scene.textures.exists(key)) continue;
    unavailable.add(key);
    // The backdrop already has a solid-color fallback below. Other callers can
    // keep their image dimensions and selection layouts without missing-texture
    // graphics leaking into the menu.
    if (key === 'menu-bg') continue;
    const texture = scene.textures.createCanvas(key, 32, 32);
    if (!texture) continue;
    const context = texture.getContext();
    context.fillStyle = '#1a2119';
    context.fillRect(0, 0, 32, 32);
    context.strokeStyle = '#3f443b';
    context.strokeRect(0.5, 0.5, 31, 31);
    texture.refresh();
  }
  return unavailable.size > 0;
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
): MenuText {
  const labelWidth = label.length * 5 + 18;
  const side = Math.max(8, (width - labelWidth) / 2);
  const g = scene.add.graphics();
  g.lineStyle(1, MENU.lineSoft, 1);
  g.lineBetween(x - width / 2, y, x - width / 2 + side, y);
  g.lineBetween(x + width / 2 - side, y, x + width / 2, y);
  g.fillStyle(MENU.line, 1);
  g.fillRect(x - width / 2 - 1, y - 1, 3, 3);
  g.fillRect(x + width / 2 - 1, y - 1, 3, 3);
  return menuCopy(scene, x, y, label, color, 7).setOrigin(0.5);
}

export function addStepHeader(
  scene: Phaser.Scene,
  step: 1 | 2 | 3,
  completeBefore = step - 1,
): void {
  menuCopy(scene, 240, 7, `— STEP ${step} OF 3 —`, MENU.cream, 7).setOrigin(0.5);
  scene.add.rectangle(240, 23, 262, 18, MENU.ink, 0.88).setStrokeStyle(1, MENU.lineSoft);
  const labels = ['BREED', 'NAME', 'HOME GROUND'];
  const xs = [165, 240, 323];
  labels.forEach((label, i) => {
    const done = i < completeBefore;
    const active = i === step - 1;
    menuCopy(scene, xs[i], 23, `${label}${done ? '  ✓' : ''}`, active ? MENU.amberText : MENU.sage, 8)
      .setOrigin(0.5);
  });
}

/** The mockups use a substantial slab-serif display face above the pixel UI. */
export function menuTitle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  fontSize: number,
  maxWidth = 450,
): Phaser.GameObjects.Text {
  const title = scene.add.text(x, y, text.toUpperCase(), {
    fontFamily: 'Georgia, Times New Roman, serif',
    fontSize: `${fontSize}px`,
    fontStyle: 'bold',
    color: MENU.cream,
    stroke: '#30291f',
    strokeThickness: 2,
    shadow: { offsetX: 1, offsetY: 2, color: '#000000', blur: 0, fill: true },
    align: 'center',
    resolution: 3,
  }).setOrigin(0.5);
  title.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  if (title.width > maxWidth) title.setScale(maxWidth / title.width);
  return title;
}

/** Crisp, high-DPI front-end copy; gameplay keeps the bitmap face. */
export function menuCopy(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: string | number = MENU.sage,
  fontSize = 7,
): MenuText {
  const cssColor = typeof color === 'number'
    ? `#${color.toString(16).padStart(6, '0')}`
    : color;
  const copy = scene.add.text(x, y, text.toUpperCase(), {
    fontFamily: 'Trebuchet MS, Avenir Next, Arial, sans-serif',
    fontSize: `${fontSize}px`,
    fontStyle: 'bold',
    color: cssColor,
    letterSpacing: 0.15,
    resolution: 3,
    shadow: { offsetX: 0.5, offsetY: 0.5, color: '#000000', blur: 0, fill: true },
  });
  const originalSetText = copy.setText.bind(copy);
  copy.setText = (value: string | string[]) => originalSetText(
    Array.isArray(value) ? value.map((line) => line.toUpperCase()) : String(value).toUpperCase(),
  );
  copy.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return copy;
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
  size: number,
  height = size,
): Phaser.GameObjects.Image {
  return scene.add.image(x, y, `menu-dog-${breed.id}`)
    .setDisplaySize(size, height)
    .setOrigin(0.5);
}

export function addImageFrame(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number = MENU.line,
): Phaser.GameObjects.Rectangle {
  scene.add.rectangle(x + 2, y + 2, width, height, 0x000000, 0.55);
  return scene.add.rectangle(x, y, width, height, 0x000000, 0)
    .setStrokeStyle(1, color, 1);
}

export function learningPace(breed: BreedConfig): string {
  if (breed.xpRate > 1) return 'FAST LEARNING PACE';
  if (breed.xpRate < 1) return 'DELIBERATE LEARNING PACE';
  return 'STANDARD LEARNING PACE';
}

export function addFooterHint(scene: Phaser.Scene, text: string): MenuText {
  return menuCopy(scene, 240, 260, text, MENU.muted, 7).setOrigin(0.5);
}

function setMenuArtFiltering(scene: Phaser.Scene): void {
  for (const [key] of menuArt) {
    if (scene.textures.exists(key)) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}
