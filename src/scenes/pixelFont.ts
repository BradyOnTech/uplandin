import Phaser from 'phaser';

/*
 * The production HUD font: a hand-authored 5×7 pixel face, generated into a
 * texture at boot and served as a Phaser RetroFont. Every screen renders
 * text through pixelText() so the whole game shares one look — the single
 * loudest "this is a prototype" signal (browser-ish canvas text) is gone.
 *
 * Uppercase-only, Duck Hunt era: pixelText() upper-cases whatever it is
 * given. The charset is ASCII 32–95 (space through underscore, covering
 * digits, caps, and punctuation) plus the game's special glyphs: the eight
 * wind arrows, stars, dashes, and friends. Anything outside the set renders
 * as space rather than crashing.
 */

export const PIXEL_FONT = 'pixel-font';

const GLYPH_W = 5;
const GLYPH_H = 7;
const CELL_W = 6; // 1px built-in letter gap
const CELL_H = 8; // 1px built-in line gap
const CHARS_PER_ROW = 16;

/** Everything past ASCII 95: wind arrows, degree family, dashes, markers. */
const EXTRA_CHARS = '°±²·×–—←↑→↓↖↗↘↙▲★☆';

/** Each glyph is 7 rows of 5 bits, MSB = leftmost pixel. */
const ROWS: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  '"': [0b01010, 0b01010, 0b01010, 0, 0, 0, 0],
  '#': [0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010],
  $: [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100],
  '%': [0b11000, 0b11001, 0b00010, 0b00100, 0b01000, 0b10011, 0b00011],
  '&': [0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101],
  "'": [0b00100, 0b00100, 0b00100, 0, 0, 0, 0],
  '(': [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  '*': [0, 0b00100, 0b10101, 0b01110, 0b10101, 0b00100, 0],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  ',': [0, 0, 0, 0, 0, 0b00100, 0b01000],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b01100, 0b01100],
  '/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  ':': [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0],
  ';': [0, 0b01100, 0b01100, 0, 0b01100, 0b00100, 0b01000],
  '<': [0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010],
  '=': [0, 0, 0b11111, 0, 0b11111, 0, 0],
  '>': [0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000],
  '?': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0, 0b00100],
  '@': [0b01110, 0b10001, 0b10111, 0b10101, 0b10110, 0b10000, 0b01111],
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '[': [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110],
  '\\': [0b10000, 0b01000, 0b01000, 0b00100, 0b00010, 0b00010, 0b00001],
  ']': [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110],
  '^': [0b00100, 0b01010, 0b10001, 0, 0, 0, 0],
  _: [0, 0, 0, 0, 0, 0, 0b11111],
  '°': [0b01100, 0b10010, 0b10010, 0b01100, 0, 0, 0],
  '±': [0b00100, 0b01110, 0b00100, 0, 0b01110, 0, 0],
  '²': [0b01100, 0b00010, 0b00100, 0b01110, 0, 0, 0],
  '·': [0, 0, 0b01100, 0b01100, 0, 0, 0],
  '×': [0, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0],
  '–': [0, 0, 0, 0b01110, 0, 0, 0],
  '—': [0, 0, 0, 0b11111, 0, 0, 0],
  '←': [0, 0b00100, 0b01000, 0b11111, 0b01000, 0b00100, 0],
  '↑': [0, 0b00100, 0b01110, 0b10101, 0b00100, 0b00100, 0],
  '→': [0, 0b00100, 0b00010, 0b11111, 0b00010, 0b00100, 0],
  '↓': [0, 0b00100, 0b00100, 0b10101, 0b01110, 0b00100, 0],
  '↖': [0, 0b11100, 0b11000, 0b10100, 0b00010, 0b00001, 0],
  '↗': [0, 0b00111, 0b00011, 0b00101, 0b01000, 0b10000, 0],
  '↘': [0, 0b10000, 0b01000, 0b00101, 0b00011, 0b00111, 0],
  '↙': [0, 0b00001, 0b00010, 0b10100, 0b11000, 0b11100, 0],
  '▲': [0, 0b00100, 0b00100, 0b01110, 0b01110, 0b11111, 0],
  '★': [0b00100, 0b00100, 0b11111, 0b01110, 0b01110, 0b11011, 0],
  '☆': [0b00100, 0b00100, 0b11111, 0b01010, 0b01010, 0b11011, 0],
};

/** The RetroFont charset: ASCII 32–95 in order, then the specials. */
const CHARSET =
  Array.from({ length: 64 }, (_, i) => String.fromCharCode(32 + i)).join('') + EXTRA_CHARS;

/**
 * Build the font texture (once per game) and register the RetroFont.
 * Idempotent and cheap after the first call — safe from any scene's create().
 */
export function ensurePixelFont(scene: Phaser.Scene): void {
  if (scene.cache.bitmapFont.exists(PIXEL_FONT)) return;
  const cols = CHARS_PER_ROW;
  const rowCount = Math.ceil(CHARSET.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL_W;
  canvas.height = rowCount * CELL_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; // white glyphs so setTint() carries the color
  for (let i = 0; i < CHARSET.length; i++) {
    const rows = ROWS[CHARSET[i]] ?? ROWS[' '];
    const ox = (i % cols) * CELL_W;
    const oy = Math.floor(i / cols) * CELL_H;
    for (let y = 0; y < GLYPH_H; y++) {
      for (let x = 0; x < GLYPH_W; x++) {
        if (rows[y] & (1 << (GLYPH_W - 1 - x))) ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
  scene.textures.addCanvas(PIXEL_FONT, canvas);
  const config: Phaser.Types.GameObjects.BitmapText.RetroFontConfig = {
    image: PIXEL_FONT,
    width: CELL_W,
    height: CELL_H,
    chars: CHARSET,
    charsPerRow: cols,
    'spacing.x': 0,
    'spacing.y': 0,
    'offset.x': 0,
    'offset.y': 0,
    lineSpacing: 2,
  };
  scene.cache.bitmapFont.add(
    PIXEL_FONT,
    Phaser.GameObjects.RetroFont.Parse(scene, config),
  );
}

/** Glyphs the charset lacks, folded to a near enough neighbor. */
const FOLD: Record<string, string> = { '`': "'", '{': '(', '}': ')', '|': '!', '~': '-' };

/**
 * The one way the game draws text. Scale 1 sits where 8px monospace used to;
 * 2 is a header, 4 the title. Color takes '#ffd23f' or 0xffd23f. Uppercases
 * everything — the retro face has no lowercase.
 */
export function pixelText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  scale = 1,
  color: string | number = 0xffffff,
): PixelText {
  ensurePixelFont(scene);
  const t = scene.add.bitmapText(x, y, PIXEL_FONT, toCharset(text)) as PixelText;
  t.setScale(scale);
  t.setTint(toTint(color));
  // Fold every later setText through the charset too, and stand in for the
  // Text API's setColor — so call sites don't care which face they got.
  const origSetText = t.setText.bind(t);
  t.setText = (value: string | string[]) => {
    const folded = Array.isArray(value) ? value.map(toCharset) : toCharset(String(value));
    return origSetText(folded) as PixelText;
  };
  t.setColor = (c: string | number) => {
    t.setTint(toTint(c));
    return t;
  };
  return t;
}

/** A BitmapText that also answers the Text API's setColor(). */
export type PixelText = Phaser.GameObjects.BitmapText & {
  setColor(color: string | number): PixelText;
};

/** Uppercase and fold a string into the charset (pair with .setText on updates). */
export function toCharset(text: string): string {
  return [...text.toUpperCase()].map((c) => FOLD[c] ?? c).join('');
}

function toTint(color: string | number): number {
  return typeof color === 'number' ? color : parseInt(color.replace('#', ''), 16);
}
