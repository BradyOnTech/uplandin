import * as THREE from 'three';
import { COVER_CLASS_COUNT, Cover, type CoverClass, type CoverMap } from './coverMap';

/**
 * Each ground's species palette for the shared kit: what each cover class
 * looks like as a colour mass, one swatch per plant community (the cover
 * map's variant). `a` and `b` are the two ends of a community's colony
 * variation (the cover map's tone); `floor` is its litter, seen between
 * near bunches before the masses close up. Colours are albedo; the scene's
 * light and grade do the rest.
 */
export interface CoverSwatch { a: number; b: number; floor: number }
export type CoverPalette = Readonly<Record<CoverClass, readonly CoverSwatch[]>>;

export const SHARPTAIL_PALETTE: CoverPalette = {
  [Cover.bare]: [{ a: 0x9d947e, b: 0x978e78, floor: 0x8d856f }],
  [Cover.short]: [
    // Needle-and-thread: silvered awns over pale straw.
    { a: 0xb2ad97, b: 0xa7a58f, floor: 0x857b62 },
    // Western wheatgrass: tawny to blue-grey.
    { a: 0x9f8a68, b: 0x8f9483, floor: 0x7a6e56 },
    // Little bluestem creeping down a dry knob: copper.
    { a: 0xa06f4f, b: 0xaa8059, floor: 0x7a5c46 },
    // Fringed sage and late forbs: green-grey with dull gold.
    { a: 0x8c967c, b: 0x9e9670, floor: 0x6e6c56 },
  ],
  [Cover.crown]: [
    { a: 0xa06c4b, b: 0xab7c56, floor: 0x7b5a44 },
    { a: 0xb2ac95, b: 0xa9a48c, floor: 0x847a60 },
    { a: 0x8c967c, b: 0x9e9670, floor: 0x6e6c56 },
  ],
  [Cover.swale]: [
    // Big bluestem: maroon and bronze.
    { a: 0x7a4f47, b: 0x86604e, floor: 0x54413a },
    // The wettest bottoms: olive-tan lowland grass.
    { a: 0x8a7c5c, b: 0x7f7a60, floor: 0x5a5342 },
  ],
  // Rank stands: the shoulder communities grown taller, a little deeper
  // in tone, so bird cover reads as denser prairie, not a painted block.
  [Cover.stand]: [
    { a: 0xa49f88, b: 0x9b9881, floor: 0x7a7058 },
    { a: 0x937e5f, b: 0x858a7a, floor: 0x6e634e },
    { a: 0x946649, b: 0x9d7553, floor: 0x6e533f },
    { a: 0x825a4a, b: 0x8e6a52, floor: 0x5a4538 },
  ],
  [Cover.shrub]: [
    // Thicket, buckbrush, rose: the far band's colour for each woody group.
    { a: 0x5a3c36, b: 0x64463c, floor: 0x45372e },
    { a: 0x6e4c46, b: 0x765446, floor: 0x55433a },
    { a: 0x86523a, b: 0x7c5a3e, floor: 0x5e4a3a },
  ],
  [Cover.tree]: [{ a: 0x5c5a44, b: 0x666049, floor: 0x55543f }],
  [Cover.water]: [{ a: 0x4d6a72, b: 0x4d6a72, floor: 0x4d6a72 }],
};

/** Cattail Coverts cover blocks: pale cured CRP and cattail brown. Classes
 * the kit does not draw there keep a neutral swatch (never sampled). */
export const CATTAIL_PALETTE: CoverPalette = {
  [Cover.bare]: [{ a: 0xa09479, b: 0xa09479, floor: 0x8d826a }],
  [Cover.short]: [{ a: 0xa69a7a, b: 0xa69a7a, floor: 0x847a60 }],
  [Cover.crown]: [{ a: 0xa69a7a, b: 0xa69a7a, floor: 0x847a60 }],
  // Cattail: brown heads over olive-tan leaves.
  [Cover.swale]: [{ a: 0x8f7c5c, b: 0x7f7055, floor: 0x5a5140 }],
  // CRP switchgrass and big bluestem, cured pale.
  [Cover.stand]: [{ a: 0xb6a47f, b: 0xa79370, floor: 0x6f644b }],
  [Cover.shrub]: [{ a: 0x5a4a3c, b: 0x5a4a3c, floor: 0x45392f }],
  [Cover.tree]: [{ a: 0x5c5a44, b: 0x5c5a44, floor: 0x55543f }],
  [Cover.water]: [{ a: 0x4d6a72, b: 0x4d6a72, floor: 0x4d6a72 }],
};

/**
 * Quail Fields, the Rolling Red Plains in late autumn: copper little
 * bluestem and tawny sideoats over red sandy loam, silvered where sand sage
 * grows through; dark plum thickets and olive-russet shinnery; the creek
 * timber gone gold. Floors are the soil a hunter sees between plants: red
 * sand under the bunches, leaf litter under the brush and timber.
 */
export const QUAIL_PALETTE: CoverPalette = {
  [Cover.bare]: [
    // Red sandy loam: two-tracks, blowouts, the truck yard.
    { a: 0xa67a5e, b: 0xae8466, floor: 0x9c7056 },
    // Gullied red clay on the cut banks.
    { a: 0x925440, b: 0x9a5e46, floor: 0x8a503c },
    // The creek's pale sand bed.
    { a: 0xc2ac88, b: 0xbaa480, floor: 0xb8a07e },
  ],
  [Cover.short]: [
    // Little bluestem: cured copper.
    { a: 0x9c6c4a, b: 0xa67c56, floor: 0x8e6a54 },
    // Sideoats grama and blue grama: tawny straw.
    { a: 0xa6916c, b: 0x9c8866, floor: 0x8c6c56 },
    // Sand sage through the bunches: silver-green over copper.
    { a: 0x96947c, b: 0x9e9880, floor: 0x927058 },
    // This spring's burn: black stubble, the first green.
    { a: 0x3c3530, b: 0x4c4a36, floor: 0x3a322c },
  ],
  [Cover.crown]: [
    // Sand bluestem thin on the sandy crowns.
    { a: 0xa07052, b: 0xaa7e5c, floor: 0x9e7258 },
    // A blowout: red sand with a few dropseed bunches.
    { a: 0xa87c60, b: 0xb08668, floor: 0xa2765a },
  ],
  [Cover.swale]: [
    // Indiangrass and switchgrass in the bottoms: gold and bronze.
    { a: 0xa6864e, b: 0x9a7e4e, floor: 0x7a5a3e },
    // Ragweed and wheatgrass in the wettest bottoms.
    { a: 0x8c8664, b: 0x86795a, floor: 0x6e5840 },
  ],
  [Cover.stand]: [
    // Rank little bluestem round the plum: deeper copper.
    { a: 0x9c6c4a, b: 0xa67a54, floor: 0x82604a },
    { a: 0x928e78, b: 0x968c74, floor: 0x846450 },
  ],
  [Cover.shrub]: [
    // Sand plum thickets in October: dark red-brown, a little orange.
    { a: 0x6a4430, b: 0x784e34, floor: 0x6a4834 },
    // Shinnery oak mottes: olive and russet.
    { a: 0x5e5634, b: 0x6c5836, floor: 0x6c5038 },
  ],
  [Cover.tree]: [
    // Creek timber from afar: gold over olive shade.
    { a: 0x7a6c3c, b: 0x847440, floor: 0x5e4a36 },
  ],
  [Cover.water]: [{ a: 0x5a6a62, b: 0x5a6a62, floor: 0x5a6a62 }],
};

/** How a ground's palette reads at a distance and between plants. */
export interface PaletteStyle {
  /** How far thin cover's far colour leans to its floor (soil showing
   * between bunches), 0..1 at zero density. */
  soilShow: number;
  /** Floors from the palette's floor swatches (a per-cell floor field)
   * rather than the canopy sunk into litter. */
  floors: boolean;
}

export const DEFAULT_PALETTE_STYLE: PaletteStyle = { soilShow: 0, floors: false };

/** Linear-space swatch colours, built once per palette. */
export class PaletteColors {
  private readonly swatches: { a: THREE.Color; b: THREE.Color; floor: THREE.Color }[][] = [];

  constructor(readonly palette: CoverPalette) {
    for (let i = 0; i < COVER_CLASS_COUNT; i++) {
      this.swatches.push(palette[i as CoverClass].map(swatch => ({ a: new THREE.Color(swatch.a), b: new THREE.Color(swatch.b), floor: new THREE.Color(swatch.floor) })));
    }
  }

  private swatch(cls: CoverClass, variant: number) {
    const list = this.swatches[cls];
    return list[Math.min(list.length - 1, Math.max(0, variant))];
  }

  /** Canopy colour of a class's community at a colony tone. */
  canopy(cls: CoverClass, tone: number, out: THREE.Color, variant = 0): THREE.Color {
    const swatch = this.swatch(cls, variant);
    return out.copy(swatch.a).lerp(swatch.b, tone);
  }

  floorOf(cls: CoverClass, out: THREE.Color, variant = 0): THREE.Color {
    return out.copy(this.swatch(cls, variant).floor);
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
  /** The colour mass as it reads from afar (linear): canopy, with soil
   * between thin cover where the palette style shows it. */
  readonly rgb: Float32Array;
  /** The plants' own canopy colour, where it differs from the far colour. */
  readonly plants?: Float32Array;
  /** The floor between plants (linear), when the palette style has floors. */
  readonly floor?: Float32Array;

  constructor(readonly map: CoverMap, palette: CoverPalette, style: PaletteStyle = DEFAULT_PALETTE_STYLE) {
    const colors = new PaletteColors(palette), color = new THREE.Color(), soil = new THREE.Color(), n = map.cols * map.rows;
    let rgb: Float32Array = new Float32Array(n * 3);
    let floor: Float32Array | undefined = style.floors ? new Float32Array(n * 3) : undefined;
    let plants: Float32Array | undefined = style.soilShow > 0 ? new Float32Array(n * 3) : undefined;
    for (let i = 0; i < n; i++) {
      const cls = map.cls[i] as CoverClass, density = map.density[i] / 255, variant = map.variant[i], tone = map.tone[i] / 255;
      colors.canopy(cls, tone, color, variant);
      colors.floorOf(cls, soil, variant);
      // A sward seen from afar mixes lit tops with the shade between
      // plants: thinner cover shows more of its own floor.
      if (cls !== Cover.water) {
        color.multiplyScalar(.86 + density * .14);
        if (plants) { plants[i * 3] = color.r; plants[i * 3 + 1] = color.g; plants[i * 3 + 2] = color.b; }
        if (style.soilShow > 0) color.lerp(soil, style.soilShow * (1 - density));
      } else if (plants) { plants[i * 3] = color.r; plants[i * 3 + 1] = color.g; plants[i * 3 + 2] = color.b; }
      rgb[i * 3] = color.r; rgb[i * 3 + 1] = color.g; rgb[i * 3 + 2] = color.b;
      if (floor) {
        // Colony tone breaks the floor a little too: a damper hollow, a
        // drift of litter.
        soil.multiplyScalar(.94 + tone * .1);
        floor[i * 3] = soil.r; floor[i * 3 + 1] = soil.g; floor[i * 3 + 2] = soil.b;
      }
    }
    for (let pass = 0; pass < 2; pass++) {
      rgb = blur(rgb, map.cols, map.rows, FEATHER_CELLS);
      if (floor) floor = blur(floor, map.cols, map.rows, FEATHER_CELLS);
      if (plants) plants = blur(plants, map.cols, map.rows, FEATHER_CELLS);
    }
    this.rgb = rgb;
    this.floor = floor;
    this.plants = plants;
  }

  /** Bilinear plant canopy colour at a property position (linear): the
   * colour field without the soil the far band shows between plants. */
  plantSample(x: number, y: number, out: THREE.Color): THREE.Color {
    return this.lookup(this.plants ?? this.rgb, x, y, out);
  }

  /** Bilinear canopy colour at a property position (linear). */
  sample(x: number, y: number, out: THREE.Color): THREE.Color {
    return this.lookup(this.rgb, x, y, out);
  }

  /** Bilinear floor colour at a property position (linear); the canopy
   * where the palette style has no floors. */
  floorSample(x: number, y: number, out: THREE.Color): THREE.Color {
    return this.lookup(this.floor ?? this.rgb, x, y, out);
  }

  private lookup(f: Float32Array, x: number, y: number, out: THREE.Color): THREE.Color {
    const { map } = this;
    const gx = Math.min(map.cols - 1.001, Math.max(0, (x - map.x0) / map.cell - .5));
    const gy = Math.min(map.rows - 1.001, Math.max(0, (y - map.y0) / map.cell - .5));
    const ix = Math.floor(gx), iy = Math.floor(gy), tx = gx - ix, ty = gy - iy;
    const i = (iy * map.cols + ix) * 3, c = map.cols * 3;
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
