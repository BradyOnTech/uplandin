import * as THREE from 'three';
import { COVER_CLASS_COUNT, Cover, type CoverClass, type CoverMap } from './coverMap';

/**
 * Each ground's species palette for the shared kit: what each cover class
 * looks like as a colour mass. `a` and `b` are the two ends of a class's
 * colony variation (the cover map's tone); `floor` is the litter beneath
 * the plants, seen between near bunches before the masses close up.
 * Colours are albedo; the scene's light and grade do the rest.
 */
export interface CoverSwatch { a: number; b: number; floor: number }
export type CoverPalette = Readonly<Record<CoverClass, CoverSwatch>>;

export const SHARPTAIL_PALETTE: CoverPalette = {
  [Cover.bare]: { a: 0x9d947e, b: 0x978e78, floor: 0x8d856f },
  // Tawny western wheatgrass to silvered needle-and-thread.
  [Cover.short]: { a: 0x9f9079, b: 0x9a998b, floor: 0x7f7656 },
  // Copper little bluestem.
  [Cover.crown]: { a: 0x9c7a60, b: 0xa48a70, floor: 0x7d6046 },
  // Maroon big bluestem.
  [Cover.swale]: { a: 0x7a5a50, b: 0x86705e, floor: 0x55433a },
  // Rank mixed stand, bronze.
  [Cover.stand]: { a: 0x947f68, b: 0x9a8c76, floor: 0x665441 },
  // Buckbrush purple-brown to chokecherry red; buffaloberry greys the edge.
  [Cover.shrub]: { a: 0x5f4b46, b: 0x6c4139, floor: 0x45372e },
  [Cover.tree]: { a: 0x5c5a44, b: 0x666049, floor: 0x55543f },
  [Cover.water]: { a: 0x4d6a72, b: 0x4d6a72, floor: 0x4d6a72 },
};

/** Cattail Coverts cover blocks: pale cured CRP and cattail brown. Classes
 * the kit does not draw there keep a neutral swatch (never sampled). */
export const CATTAIL_PALETTE: CoverPalette = {
  [Cover.bare]: { a: 0xa09479, b: 0xa09479, floor: 0x8d826a },
  [Cover.short]: { a: 0xa69a7a, b: 0xa69a7a, floor: 0x847a60 },
  [Cover.crown]: { a: 0xa69a7a, b: 0xa69a7a, floor: 0x847a60 },
  // Cattail: brown heads over olive-tan leaves.
  [Cover.swale]: { a: 0x8f7c5c, b: 0x7f7055, floor: 0x5a5140 },
  // CRP switchgrass and big bluestem, cured pale.
  [Cover.stand]: { a: 0xb6a47f, b: 0xa79370, floor: 0x6f644b },
  [Cover.shrub]: { a: 0x5a4a3c, b: 0x5a4a3c, floor: 0x45392f },
  [Cover.tree]: { a: 0x5c5a44, b: 0x5c5a44, floor: 0x55543f },
  [Cover.water]: { a: 0x4d6a72, b: 0x4d6a72, floor: 0x4d6a72 },
};

/** Linear-space swatch colours, built once per palette. */
export class PaletteColors {
  private readonly a: THREE.Color[] = [];
  private readonly b: THREE.Color[] = [];
  private readonly floor: THREE.Color[] = [];

  constructor(readonly palette: CoverPalette) {
    for (let i = 0; i < COVER_CLASS_COUNT; i++) {
      const swatch = palette[i as CoverClass];
      this.a.push(new THREE.Color(swatch.a)); this.b.push(new THREE.Color(swatch.b)); this.floor.push(new THREE.Color(swatch.floor));
    }
  }

  /** Canopy colour of a class at a colony tone. */
  canopy(cls: CoverClass, tone: number, out: THREE.Color): THREE.Color {
    return out.copy(this.a[cls]).lerp(this.b[cls], tone);
  }

  floorOf(cls: CoverClass, out: THREE.Color): THREE.Color {
    return out.copy(this.floor[cls]);
  }
}

/** Cells a colour boundary is feathered over (each side, box passes). */
const FEATHER_CELLS = 2;

/**
 * The cover map as colour: each cell's canopy colour (linear RGB), softened
 * across class boundaries so communities meet in a feathered edge rather
 * than a surveyed line. The terrain's far band and every plant instance
 * sample this one field, so a mass dissolving into the terrain lands on
 * exactly the colour already painted beneath it.
 */
export class CoverColorField {
  readonly rgb: Float32Array;

  constructor(readonly map: CoverMap, palette: CoverPalette) {
    const colors = new PaletteColors(palette), color = new THREE.Color(), n = map.cols * map.rows;
    let rgb: Float32Array = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const cls = map.cls[i] as CoverClass, density = map.density[i] / 255;
      colors.canopy(cls, map.tone[i] / 255, color);
      // A sward seen from afar mixes lit tops with the shade between
      // plants: thinner cover shows more of its own floor.
      if (cls !== Cover.water) color.multiplyScalar(.86 + density * .14);
      rgb[i * 3] = color.r; rgb[i * 3 + 1] = color.g; rgb[i * 3 + 2] = color.b;
    }
    for (let pass = 0; pass < 2; pass++) rgb = blur(rgb, map.cols, map.rows, FEATHER_CELLS);
    this.rgb = rgb;
  }

  /** Bilinear canopy colour at a property position (linear). */
  sample(x: number, y: number, out: THREE.Color): THREE.Color {
    const { map } = this;
    const gx = Math.min(map.cols - 1.001, Math.max(0, (x - map.x0) / map.cell - .5));
    const gy = Math.min(map.rows - 1.001, Math.max(0, (y - map.y0) / map.cell - .5));
    const ix = Math.floor(gx), iy = Math.floor(gy), tx = gx - ix, ty = gy - iy;
    const i = (iy * map.cols + ix) * 3, c = map.cols * 3, f = this.rgb;
    const at = (k: number) => (f[i + k] + (f[i + 3 + k] - f[i + k]) * tx) * (1 - ty) + (f[i + c + k] + (f[i + c + 3 + k] - f[i + c + k]) * tx) * ty;
    return out.setRGB(at(0), at(1), at(2));
  }
}

/** Separable box blur with running sums, edge-clamped averages. */
function blur(src: Float32Array, cols: number, rows: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const pass = (from: Float32Array, to: Float32Array, length: number, lines: number, stride: number, step: number) => {
    for (let line = 0; line < lines; line++) for (let k = 0; k < 3; k++) {
      const base = line * stride + k;
      let sum = 0, count = 0;
      for (let d = 0; d <= Math.min(r, length - 1); d++) { sum += from[base + d * step]; count++; }
      for (let i = 0; i < length; i++) {
        to[base + i * step] = sum / count;
        const enter = i + r + 1, leave = i - r;
        if (enter < length) { sum += from[base + enter * step]; count++; }
        if (leave >= 0) { sum -= from[base + leave * step]; count--; }
      }
    }
  };
  pass(src, tmp, cols, rows, cols * 3, 3);
  pass(tmp, out, rows, cols, 3, cols * 3);
  return out;
}
