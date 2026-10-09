import * as THREE from 'three';
import type { LandscapeModel } from '../../game/landscape';
import type { Ctx, Quality, Subsystem } from '../engine';
import { VegetationWind } from '../subsystems/vegetationWind';
import { quailGroundTileAt, sampleQuailGroundHeights } from '../subsystems/quailGroundGeometry';
import { Cover, coverHash, type CoverClass, type CoverMap } from './coverMap';
import { coverCell, coverMapFor } from './coverRecipes';
import { PaletteColors, type CoverColorField } from './coverPalette';
import { groundKitColors, groundKitPalette, groundKitStyle, groundKitSurface, groundKitTallCoverOpen, type CoverStyle } from './groundKit';
import { InstanceSink, KitLayer, kitVegetationMaterial, type KitBand } from './kitLayer';
import { kitCulmGeometry, kitMassGeometry, kitMatGeometry, kitShrubGeometry, kitStandGeometry, kitTuftGeometry } from './kitGeometry';

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

/** Garnish blades round the hunter and dog. */
const GARNISH: Record<Quality, LayerTuning> = {
  high: { band: { in: [0, 0], out: [11, 15] }, step: .62, chunk: 12, radius: [.26, .38], height: [.75, 1.15], keep: .92 },
  lite: { band: { in: [0, 0], out: [7, 10] }, step: .8, chunk: 16, radius: [.3, .44], height: [.75, 1.15], keep: .88 },
};

/** Seed culms over the near bunches: pale heads that catch the light. */
const CULMS: Record<Quality, LayerTuning> = {
  high: { band: { in: [0, 0], out: [12, 16] }, step: 1.5, chunk: 12, radius: [.3, .4], height: [1.15, 1.45], keep: .55 },
  lite: { band: { in: [0, 0], out: [8, 11] }, step: 1.9, chunk: 16, radius: [.34, .44], height: [1.15, 1.45], keep: .5 },
};

/** The low mat at the boots, under the bunches. */
const MAT: Record<Quality, LayerTuning> = {
  high: { band: { in: [0, 0], out: [6, 9] }, step: .42, chunk: 8, radius: [.26, .36], height: [1, 1], keep: .95, fixedHeight: [.08, .16] },
  lite: { band: { in: [0, 0], out: [4, 6] }, step: .55, chunk: 12, radius: [.3, .4], height: [1, 1], keep: .9, fixedHeight: [.08, .16] },
};

/** Faceted sward masses through the middle distance, in two layers so
 * short shoulder grass and tall swale grass keep their own proportions
 * (radius follows crown height, within these bounds). */
const MASSES_SHORT: Record<Quality, LayerTuning> = {
  high: { band: { in: [7, 11], out: [65, 90] }, step: 1.75, chunk: 24, radius: [.8, 1.15], height: [.85, 1.08], keep: 1 },
  lite: { band: { in: [5, 8], out: [42, 58] }, step: 2.2, chunk: 32, radius: [.85, 1.3], height: [.85, 1.08], keep: 1 },
};
const MASSES_TALL: Record<Quality, LayerTuning> = {
  high: { band: { in: [7, 11], out: [125, 165] }, step: 2.5, chunk: 40, radius: [1.15, 1.55], height: [.85, 1.08], keep: 1 },
  lite: { band: { in: [5, 8], out: [80, 105] }, step: 3.1, chunk: 56, radius: [1.4, 1.85], height: [.85, 1.08], keep: 1 },
};
const SHORT_CLASSES: readonly CoverClass[] = [Cover.short, Cover.crown, Cover.bare];
const TALL_CLASSES: readonly CoverClass[] = [Cover.swale, Cover.stand];

/** Woody clumps (also in the bare baseline): the coulee-head thickets. */
const SHRUBS: Record<Quality, LayerTuning> = {
  high: { band: { in: [0, 0], out: [330, 400] }, step: 3, chunk: 128, radius: [.8, 2.0], height: [.8, 1.25], keep: 1 },
  lite: { band: { in: [0, 0], out: [230, 280] }, step: 3.6, chunk: 128, radius: [1.0, 2.2], height: [.8, 1.25], keep: 1 },
};

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

export class GroundKitSystem implements Subsystem {
  /** The ground's grass: the dog and the birds ask it for cover height. */
  readonly id = 'grass';
  private readonly wind = new VegetationWind();
  private readonly clock = { value: 0 };
  private readonly layers: KitLayer[] = [];
  private readonly owned: { dispose(): void }[] = [];
  private map!: CoverMap;
  private colors!: PaletteColors;
  private field!: CoverColorField;
  private style!: CoverStyle;
  private quality: Quality = 'high';

  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    this.quality = ctx.quality;
    this.style = groundKitStyle(this.landscape.area.id) ?? 'masses';
    this.map = coverMapFor(this.landscape)!;
    this.colors = new PaletteColors(groundKitPalette(this.landscape.area.id)!);
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
    // 'bare' is the cost baseline: far band and woody clumps only.
    if (this.style === 'masses') {
      add('Kit basal mat', MAT[q], kitMatGeometry(q === 'lite' ? 2 : 3), true, .1, .1, (...a) => this.fillGrass(...a));
      add('Kit garnish', GARNISH[q], kitTuftGeometry(q === 'lite' ? 5 : 7), true, .18, .22, (...a) => this.fillGrass(...a));
      add('Kit seed culms', CULMS[q], kitCulmGeometry(q === 'lite' ? 2 : 3), true, .3, .25, (...a) => this.fillGrass(...a, undefined, true));
      add('Kit short masses', MASSES_SHORT[q], kitMassGeometry(q === 'lite' ? 5 : 6), true, .06, .18, (...a) => this.fillGrass(...a, SHORT_CLASSES));
      const open = groundKitTallCoverOpen(this.landscape.area.id);
      add('Kit tall masses', MASSES_TALL[q], open ? kitStandGeometry(q === 'lite' ? 9 : 14, q === 'lite' ? 11 : 16) : kitMassGeometry(q === 'lite' ? 6 : 7, 0x3a56),
        true, .06, .18, (...a) => this.fillGrass(...a, TALL_CLASSES));
    }
    add('Kit woody clumps', SHRUBS[q], q === 'lite' ? kitShrubGeometry(6, 28) : kitShrubGeometry(), true, .04, .05, (...a) => this.fillShrubs(...a));
    this.update(ctx);
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

  /** Grass on a jittered lattice: kept by density, sized by crown height,
   * coloured by the class swatch at its colony tone. */
  private fillGrass(x0: number, y0: number, size: number, sink: InstanceSink, tuning: LayerTuning, classes?: readonly CoverClass[], culms = false): void {
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
      if (r3 > density * tuning.keep) continue;
      const h = tuning.fixedHeight ? tuning.fixedHeight[0] + r4 * (tuning.fixedHeight[1] - tuning.fixedHeight[0]) * (.6 + this.cell.height)
        : this.cell.height * (tuning.height[0] + r4 * (tuning.height[1] - tuning.height[0]));
      const spread = coverHash(ix, iy, salt + 4);
      // Masses keep a grass proportion: footprint follows crown height.
      const radius = masses ? Math.min(tuning.radius[1], Math.max(tuning.radius[0], h * 2.4)) * (.88 + spread * .24)
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
      // Colour from the feathered field, sampled a few yards off so class
      // edges break up plant by plant instead of on a line.
      this.field.sample(x + (coverHash(ix, iy, salt + 8) - .5) * 7, y + (coverHash(ix, iy, salt + 9) - .5) * 7, this.color);
      this.color.multiplyScalar(.9 + coverHash(ix, iy, salt + 7) * .18);
      // Ripe heads bleach toward pale straw and silver.
      if (culms) this.color.lerp(this.paleHead, .35);
      sink.push(this.matrix, this.color);
    }
  }

  /** Woody clumps where the map says shrub; buffaloberry greys a few. */
  private fillShrubs(x0: number, y0: number, size: number, sink: InstanceSink, tuning: LayerTuning): void {
    const ground = this.chunkGround(x0, y0, size), step = tuning.step;
    const silver = new THREE.Color(0x8a897a);
    for (const [ix, iy] of lattice(x0, y0, size, step)) {
      const x = (ix + .15 + coverHash(ix, iy, 61) * .7) * step, y = (iy + .15 + coverHash(ix, iy, 62) * .7) * step;
      if (!this.inside(x, y)) continue;
      this.map.sample(x, y, this.cell);
      if (this.cell.cls !== Cover.shrub || coverHash(ix, iy, 63) > this.cell.density) continue;
      this.landscape.propertyToWorld(x, y, this.world);
      this.position.set(this.world.x, ground(x, y) - .08, this.world.z);
      this.rotation.setFromAxisAngle(this.up, coverHash(ix, iy, 64) * Math.PI * 2);
      const radius = tuning.radius[0] + coverHash(ix, iy, 65) * (tuning.radius[1] - tuning.radius[0]);
      const h = this.cell.height * (tuning.height[0] + coverHash(ix, iy, 66) * (tuning.height[1] - tuning.height[0]));
      this.scale.set(radius, h, radius * (.75 + coverHash(ix, iy, 67) * .4));
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.colors.canopy(Cover.shrub, coverHash(ix, iy, 68), this.color);
      if (coverHash(ix, iy, 69) < .16) this.color.lerp(silver, .55);
      this.color.multiplyScalar(.9 + coverHash(ix, iy, 70) * .2);
      sink.push(this.matrix, this.color);
    }
  }
}
