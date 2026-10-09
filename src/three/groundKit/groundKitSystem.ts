import * as THREE from 'three';
import type { LandscapeModel } from '../../game/landscape';
import type { Ctx, Quality, Subsystem } from '../engine';
import { VegetationWind } from '../subsystems/vegetationWind';
import { quailGroundTileAt, sampleQuailGroundHeights } from '../subsystems/quailGroundGeometry';
import { Cover, coverHash, coverNoise, coverSmooth, type CoverClass, type CoverMap } from './coverMap';
import { coverCell, coverMapFor } from './coverRecipes';
import type { CoverColorField } from './coverPalette';
import { groundKitColors, groundKitStyle, groundKitSurface, groundKitTallCoverOpen, groundKitWoody, type CoverStyle, type WoodyGroup } from './groundKit';
import { InstanceSink, KitLayer, MergedSink, kitVegetationMaterial, type KitBand } from './kitLayer';
import { kitCulmGeometry, kitMassGeometry, kitMatGeometry, kitStandGeometry, kitTuftGeometry } from './kitGeometry';
import { loadWoodyKit, woodyKey, type WoodyDetail, type WoodyKit, type WoodySpecies } from './woodyKit';

/*
 * The kit's vegetation bands on a ground. Every layer is filled from the
 * cover map alone, chunk by chunk as the hunter approaches, so a rebuilt or
 * larger ground dresses itself.
 */

interface LayerTuning {
  band: KitBand;
  /** Lattice step between candidate sites, yards. */
  step: number;
  chunk: number;
  /** World footprint radius range of one instance, metres. */
  radius: readonly [number, number];
  /** Height multiplier on the cover map's crown height. */
  height: readonly [number, number];
  /** Share of candidate sites kept at full density. */
  keep: number;
  /** Absolute height range (m) instead of a share of crown height. */
  fixedHeight?: readonly [number, number];
}

const TERRAIN_DIVISIONS: Record<Quality, { near: number; far: number }> = { high: { near: 48, far: 14 }, lite: { near: 24, far: 14 } };

/** Garnish blades round the hunter and dog. Lightweight reaches a little
 * further so the masses grow out of blades rather than bare litter. */
const GARNISH: Record<Quality, LayerTuning> = {
  high: { band: { in: [0, 0], out: [12, 16] }, step: .5, chunk: 12, radius: [.38, .58], height: [.75, 1.15], keep: .97 },
  lite: { band: { in: [0, 0], out: [10, 13] }, step: .72, chunk: 16, radius: [.44, .64], height: [.75, 1.15], keep: .95 },
};

/** Seed culms over the near bunches: pale heads that catch the light. */
const CULMS: Record<'high', LayerTuning> = {
  high: { band: { in: [0, 0], out: [12, 16] }, step: 1.5, chunk: 12, radius: [.3, .4], height: [1.15, 1.45], keep: .55 },
};

/** The low mat at the boots, under the bunches. */
const MAT: Record<Quality, LayerTuning> = {
  high: { band: { in: [0, 0], out: [10, 13] }, step: .4, chunk: 8, radius: [.4, .55], height: [1, 1], keep: .98, fixedHeight: [.07, .15] },
  lite: { band: { in: [0, 0], out: [7, 10] }, step: .52, chunk: 12, radius: [.44, .6], height: [1, 1], keep: .96, fixedHeight: [.07, .15] },
};

/** Faceted sward masses through the middle distance, in two layers so
 * short shoulder grass and tall swale grass keep their own proportions
 * (radius follows crown height, within these bounds). Short masses are
 * bunch-sized and gathered into tussocks with litter between them. */
const MASSES_SHORT: Record<Quality, LayerTuning> = {
  high: { band: { in: [6, 9], out: [65, 90] }, step: 1.45, chunk: 24, radius: [.5, .95], height: [.85, 1.1], keep: 1 },
  lite: { band: { in: [7, 11], out: [42, 58] }, step: 1.85, chunk: 40, radius: [.6, 1.1], height: [.85, 1.1], keep: 1 },
};
const MASSES_TALL: Record<Quality, LayerTuning> = {
  high: { band: { in: [8, 12], out: [125, 165] }, step: 2.5, chunk: 40, radius: [1.15, 1.55], height: [.85, 1.08], keep: 1 },
  lite: { band: { in: [10, 14], out: [80, 105] }, step: 3.1, chunk: 56, radius: [1.4, 1.85], height: [.85, 1.08], keep: 1 },
};
const SHORT_CLASSES: readonly CoverClass[] = [Cover.short, Cover.crown, Cover.bare];
const TALL_CLASSES: readonly CoverClass[] = [Cover.swale, Cover.stand];

/** Woody plants from the shared kit: near detail to ~100 m (High) or ~70 m
 * (Lightweight), then the far detail, dithering across, to the horizon
 * band. All species merge into one mesh per chunk. */
const WOODY_NEAR: Record<Quality, { band: KitBand; chunk: number; step: number }> = {
  high: { band: { in: [0, 0], out: [92, 96] }, chunk: 64, step: 2.1 },
  lite: { band: { in: [0, 0], out: [46, 50] }, chunk: 64, step: 2.5 },
};
const WOODY_FAR: Record<Quality, { band: KitBand; chunk: number; step: number }> = {
  high: { band: { in: [92, 96], out: [340, 420] }, chunk: 256, step: 2.1 },
  lite: { band: { in: [46, 50], out: [210, 260] }, chunk: 256, step: 2.5 },
};
/** Each plant hands from its near to its far detail at its own distance,
 * within this many metres of the band edge. */
const WOODY_HANDOVER_JITTER = 10;

/** Tussocks: the size (yards) of the bunch field that gathers grass into
 * clumps with gaps of litter between them, at 10-40 m. */
const BUNCH_YARDS = 3.6;

/** Lattice sites owned by one chunk: an exact partition, so neighbouring
 * chunks never double a row or leave one out. */
export function* lattice(x0: number, y0: number, size: number, step: number): Generator<readonly [number, number]> {
  const ix0 = Math.ceil(x0 / step), ix1 = Math.ceil((x0 + size) / step);
  const iy0 = Math.ceil(y0 / step), iy1 = Math.ceil((y0 + size) / step);
  for (let iy = iy0; iy < iy1; iy++) for (let ix = ix0; ix < ix1; ix++) yield [ix, iy];
}

/** Classes the grass layers grow on (woody and water have their own). */
function grassy(cls: CoverClass): boolean {
  return cls === Cover.short || cls === Cover.crown || cls === Cover.swale || cls === Cover.stand || cls === Cover.bare;
}

/** How much of a cell's ground the bunch field puts under grass: denser
 * cover closes the gaps, thin cover leaves litter showing between tussocks.
 * Shared by the garnish and the masses so they agree on where bunches are. */
export function bunchAt(x: number, y: number, density: number): { keep: number; bunch: number } {
  const bunch = coverNoise(x / BUNCH_YARDS, y / BUNCH_YARDS, 91) * .72 + coverNoise(x / (BUNCH_YARDS * .38), y / (BUNCH_YARDS * .38), 92) * .28;
  return { keep: coverSmooth(.62 - density * .32, .82 - density * .25, bunch), bunch };
}

export class GroundKitSystem implements Subsystem {
  /** The ground's grass: the dog and the birds ask it for cover height. */
  readonly id = 'grass';
  private readonly wind = new VegetationWind();
  private readonly clock = { value: 0 };
  private readonly layers: KitLayer[] = [];
  private readonly owned: { dispose(): void }[] = [];
  private map!: CoverMap;
  private field!: CoverColorField;
  private style!: CoverStyle;
  private quality: Quality = 'high';
  private woody?: WoodyKit;

  constructor(private readonly landscape: LandscapeModel) {}

  async init(ctx: Ctx): Promise<void> {
    this.quality = ctx.quality;
    this.style = groundKitStyle(this.landscape.area.id) ?? 'masses';
    this.map = coverMapFor(this.landscape)!;
    this.field = groundKitColors(this.landscape)!;
    this.wind.connect(ctx);
    const q = ctx.quality;
    const add = (name: string, tuning: LayerTuning, geometry: THREE.BufferGeometry, upNormals: boolean, sway: number, sheen: number,
      fill: (x0: number, y0: number, size: number, sink: InstanceSink, tuning: LayerTuning) => void) => {
      const material = kitVegetationMaterial({ band: tuning.band, wind: this.wind, clock: this.clock, sway, sheen, upNormals,
        jitter: Math.max(2, (tuning.band.out[1] - tuning.band.out[0]) * .5) });
      this.owned.push(geometry, material);
      this.layers.push(new KitLayer(this.landscape, { name, chunkYards: tuning.chunk, range: tuning.band.out[1] + 4, geometry, material,
        fill: (x0, y0, size, sink) => fill(x0, y0, size, sink, tuning) }));
    };
    // 'bare' is the cost baseline: far band and woody plants only.
    if (this.style === 'masses') {
      // Blue grama and buffalograss: a continuous short turf the bunches
      // stand in, so the near ground reads as sward, not bare litter.
      add('Kit basal mat', MAT[q], kitMatGeometry(q === 'lite' ? 4 : 6), true, .1, .1, (...a) => this.fillGrass(...a));
      // Near blades lean into the tussocks but still fill the gaps; masses
      // gather fully, so the shoulder reads as bunches at 10-40 m.
      add('Kit garnish', GARNISH[q], kitTuftGeometry(q === 'lite' ? 6 : 11), true, .18, .22, (...a) => this.fillGrass(...a, undefined, false, .15));
      // Seed culms are a High-tier grace note; phones spend the draw elsewhere.
      if (q === 'high') add('Kit seed culms', CULMS.high, kitCulmGeometry(3), true, .3, .25, (...a) => this.fillGrass(...a, undefined, true, 1));
      add('Kit short masses', MASSES_SHORT[q], kitMassGeometry(q === 'lite' ? 5 : 6), true, .06, .18, (...a) => this.fillGrass(...a, SHORT_CLASSES, false, 1));
      const open = groundKitTallCoverOpen(this.landscape.area.id);
      add('Kit tall masses', MASSES_TALL[q], open ? kitStandGeometry(q === 'lite' ? 9 : 14, q === 'lite' ? 11 : 16) : kitMassGeometry(q === 'lite' ? 6 : 7, 0x3a56),
        true, .06, .18, (...a) => this.fillGrass(...a, TALL_CLASSES));
    }
    await this.addWoody(ctx);
    this.update(ctx);
  }

  /** The ground's woody groups from the shared kit, near and far. A ground
   * whose kit cannot load still hunts; it simply has no brush. */
  private async addWoody(ctx: Ctx): Promise<void> {
    const groups = groundKitWoody(this.landscape.area.id);
    if (!groups) return;
    const species = [...new Set(Object.values(groups).flatMap(group => group.map(entry => entry.species)))];
    const near: WoodyDetail = ctx.quality === 'lite' ? 'lite' : 'high';
    try {
      this.woody = await loadWoodyKit(species, [near, 'far']);
    } catch (error) {
      console.warn(`${this.landscape.area.name} woody kit unavailable; brush omitted.`, error);
      return;
    }
    for (const asset of this.woody.values()) this.owned.push(asset.geometry);
    for (const [label, tuning, detail] of [['near', WOODY_NEAR[ctx.quality], near], ['far', WOODY_FAR[ctx.quality], 'far']] as const) {
      const material = kitVegetationMaterial({ band: tuning.band, wind: this.wind, clock: this.clock, sway: .02, sheen: .05, upNormals: true,
        merged: true, nearDither: label === 'far', handoverJitter: WOODY_HANDOVER_JITTER,
        jitter: label === 'near' ? WOODY_HANDOVER_JITTER : (tuning.band.out[1] - tuning.band.out[0]) * .5 });
      this.owned.push(material);
      this.layers.push(new KitLayer(this.landscape, { name: `Kit woody ${label}`, chunkYards: tuning.chunk, range: tuning.band.out[1] + 4, material,
        fillMerged: (x0, y0, size, sink) => this.fillWoody(x0, y0, size, sink, groups, detail, tuning.step) }));
    }
  }

  update(ctx: Ctx): void {
    this.clock.value = ctx.time;
    this.wind.update();
    const surface = groundKitSurface(this.landscape, this.quality);
    if (surface) {
      surface.uniforms.uKitTime.value = ctx.time;
      surface.uniforms.uKitWind.value.copy(this.wind.direction.value);
      surface.uniforms.uKitWindStrength.value = this.wind.strength.value;
    }
    for (const layer of this.layers) layer.update(ctx);
  }

  /** Crown height of the cover at a world point (the dog's bound and the
   * birds' launch read it), from the same map the plants grow from. */
  launchHeightAt(x: number, z: number): number {
    const p = this.landscape.worldToProperty(x, z, { x: 0, y: 0 });
    this.map.sample(p.x, p.y, this.cell);
    return this.cell.density > .05 ? this.cell.height : .15;
  }

  /** Drawn layer numbers, for review tools. */
  stats(): ReturnType<KitLayer['stats']>[] {
    return this.layers.map(layer => layer.stats());
  }

  dispose(ctx: Ctx): void {
    for (const layer of this.layers) layer.dispose(ctx);
    for (const item of this.owned) item.dispose();
    this.layers.length = 0; this.owned.length = 0;
  }

  /** Rendered ground under property points in one chunk: the lower of the
   * analytic surface and both terrain LODs, on a 4-yard grid, so a root
   * never floats over a coarse far tile. */
  private chunkGround(x0: number, y0: number, size: number): (x: number, y: number) => number {
    const step = 4, n = Math.ceil(size / step) + 1, grid = new Float32Array(n * n), area = this.landscape.area.world;
    const divisions = TERRAIN_DIVISIONS[this.quality];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const px = Math.min(area.x + area.w, Math.max(area.x, x0 + i * step)), py = Math.min(area.y + area.h, Math.max(area.y, y0 + j * step));
      const tile = quailGroundTileAt(this.landscape, px, py);
      const g = sampleQuailGroundHeights(this.landscape, px, py, tile, divisions);
      grid[j * n + i] = Math.min(this.landscape.heightAtProperty(px, py), g.nearY, g.farY);
    }
    return (x, y) => {
      const gx = Math.min(n - 1.001, Math.max(0, (x - x0) / step)), gy = Math.min(n - 1.001, Math.max(0, (y - y0) / step));
      const ix = Math.floor(gx), iy = Math.floor(gy), tx = gx - ix, ty = gy - iy, k = iy * n + ix;
      return (grid[k] + (grid[k + 1] - grid[k]) * tx) * (1 - ty) + (grid[k + n] + (grid[k + n + 1] - grid[k + n]) * tx) * ty;
    };
  }

  private inside(x: number, y: number): boolean {
    const w = this.landscape.area.world;
    return x >= w.x && y >= w.y && x <= w.x + w.w && y <= w.y + w.h;
  }

  private readonly cell = coverCell();
  private readonly color = new THREE.Color();
  private readonly paleHead = new THREE.Color(0xcfc6aa);
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly tilt = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly normal = new THREE.Vector3();
  private readonly world = { x: 0, z: 0 };

  /** Grass on a jittered lattice: kept by density (gathered into tussocks
   * by the bunch field, by `bunching` from 0 to 1), sized by crown height,
   * coloured from the feathered community colour field. */
  private fillGrass(x0: number, y0: number, size: number, sink: InstanceSink, tuning: LayerTuning, classes?: readonly CoverClass[],
    culms = false, bunching = 0): void {
    const ground = this.chunkGround(x0, y0, size), step = tuning.step, masses = !!classes;
    const salt = Math.round(step * 100) + (masses ? 7 : 0);
    for (const [ix, iy] of lattice(x0, y0, size, step)) {
      const r1 = coverHash(ix, iy, salt), r2 = coverHash(ix, iy, salt + 1), r3 = coverHash(ix, iy, salt + 2), r4 = coverHash(ix, iy, salt + 3);
      const x = (ix + .1 + r1 * .8) * step, y = (iy + .1 + r2 * .8) * step;
      if (!this.inside(x, y)) continue;
      this.map.sample(x, y, this.cell);
      const cls = this.cell.cls;
      if (!grassy(cls) || (classes && !classes.includes(cls))) continue;
      const density = cls === Cover.bare ? this.cell.density * .5 : this.cell.density;
      // Tall cover stays continuous; short sward gathers into tussocks.
      const tussock = bunching > 0 && (cls === Cover.short || cls === Cover.crown || cls === Cover.bare) ? bunchAt(x, y, density) : undefined;
      const keep = tussock ? density + (tussock.keep - density) * bunching : density;
      if (r3 > keep * tuning.keep) continue;
      let h = tuning.fixedHeight ? tuning.fixedHeight[0] + r4 * (tuning.fixedHeight[1] - tuning.fixedHeight[0]) * (.6 + this.cell.height)
        : this.cell.height * (tuning.height[0] + r4 * (tuning.height[1] - tuning.height[0]));
      if (tussock && !tuning.fixedHeight) h *= 1 + (tussock.bunch - .5) * .45 * bunching;
      const spread = coverHash(ix, iy, salt + 4);
      // Masses keep a grass proportion: footprint follows crown height.
      const radius = masses ? Math.min(tuning.radius[1], Math.max(tuning.radius[0], h * 1.7)) * (.88 + spread * .24)
        : tuning.radius[0] + spread * (tuning.radius[1] - tuning.radius[0]);
      this.landscape.propertyToWorld(x, y, this.world);
      this.position.set(this.world.x, ground(x, y) - (masses ? .04 : .02), this.world.z);
      this.rotation.setFromAxisAngle(this.up, coverHash(ix, iy, salt + 5) * Math.PI * 2);
      if (masses) {
        // Masses lean with the slope a little, so a hillside sward does not
        // stand in steps.
        const e = 1.5;
        this.normal.set(-(ground(x + e, y) - ground(x - e, y)) / (2 * e * .9144), 1, -(ground(x, y + e) - ground(x, y - e)) / (2 * e * .9144)).normalize();
        this.normal.lerp(this.up, .5).normalize();
        this.tilt.setFromUnitVectors(this.up, this.normal);
        this.rotation.premultiply(this.tilt);
      }
      this.scale.set(radius, Math.max(.06, h), radius * (.8 + coverHash(ix, iy, salt + 6) * .35));
      this.matrix.compose(this.position, this.rotation, this.scale);
      // Colour from the feathered field, sampled a few yards off so
      // community edges break up plant by plant instead of on a line.
      this.field.sample(x + (coverHash(ix, iy, salt + 8) - .5) * 7, y + (coverHash(ix, iy, salt + 9) - .5) * 7, this.color);
      this.color.multiplyScalar(.88 + coverHash(ix, iy, salt + 7) * .22);
      // Ripe heads bleach toward pale straw and silver.
      if (culms) this.color.lerp(this.paleHead, .35);
      sink.push(this.matrix, this.color);
    }
  }

  /** Woody plants where the map says shrub, the species drawn from the
   * cell's woody group (thicket, buckbrush, rose...), merged per chunk. */
  private fillWoody(x0: number, y0: number, size: number, sink: MergedSink, groups: Readonly<Record<number, readonly WoodyGroup[]>>,
    detail: WoodyDetail, step: number): void {
    if (!this.woody) return;
    const ground = this.chunkGround(x0, y0, size);
    for (const [ix, iy] of lattice(x0, y0, size, step)) {
      const x = (ix + .15 + coverHash(ix, iy, 61) * .7) * step, y = (iy + .15 + coverHash(ix, iy, 62) * .7) * step;
      if (!this.inside(x, y)) continue;
      this.map.sample(x, y, this.cell);
      if (this.cell.cls !== Cover.shrub || coverHash(ix, iy, 63) > this.cell.density) continue;
      const group = groups[this.cell.variant] ?? groups[0];
      if (!group) continue;
      let pick = coverHash(ix, iy, 64) * group.reduce((sum, entry) => sum + entry.weight, 0), entry = group[0];
      for (const candidate of group) { pick -= candidate.weight; if (pick <= 0) { entry = candidate; break; } }
      const asset = this.woody.get(woodyKey(entry.species as WoodySpecies, detail));
      if (!asset) continue;
      const h = entry.height[0] + coverHash(ix, iy, 65) * (entry.height[1] - entry.height[0]);
      this.landscape.propertyToWorld(x, y, this.world);
      this.position.set(this.world.x, ground(x, y) - .06, this.world.z);
      this.rotation.setFromAxisAngle(this.up, coverHash(ix, iy, 66) * Math.PI * 2);
      const aspect = .85 + coverHash(ix, iy, 67) * .35;
      this.scale.set(h * aspect, h, h * (.85 + coverHash(ix, iy, 68) * .35));
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.color.setRGB(1, 1, 1).multiplyScalar(.88 + coverHash(ix, iy, 69) * .22);
      sink.push(asset.geometry, this.matrix, this.color, h);
    }
  }
}
