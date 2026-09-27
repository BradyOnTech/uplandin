import type { LandscapeModel } from '../../game/landscape';
import { sharptailGroundZones, type SharptailGroundZones } from '../../game/sharptailLandscape';
import { sharptailMeadowAt, type SharptailMeadowSample } from './sharptailMeadow';

/** The full property replaces the legacy entry-centered terrain plate only
 * for Sharptail Prairie. A coarse immutable field keeps per-tuft sampling
 * cheap when the roaming grass ring crosses a tile on a mobile device. */
export class SharptailSwardField {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  private readonly columns: number;
  private readonly rows: number;
  private readonly swales: Float32Array;
  private readonly stands: Float32Array;
  private readonly crowns: Float32Array;
  private readonly hollows: Float32Array;
  private readonly cured: Float32Array;

  constructor(landscape: LandscapeModel) {
    const area = landscape.area.world;
    const near = landscape.propertyToWorld(area.x, area.y, { x: 0, z: 0 });
    const far = landscape.propertyToWorld(area.x + area.w, area.y + area.h, { x: 0, z: 0 });
    this.minX = near.x; this.maxX = far.x; this.minZ = near.z; this.maxZ = far.z;
    // Twelve-yard cells retain the curved crown/lee transition. Five scalar
    // fields total about 160 KB for the full property, created once.
    this.columns = Math.ceil(area.w / 12) + 1;
    this.rows = Math.ceil(area.h / 12) + 1;
    this.swales = new Float32Array(this.columns * this.rows);
    this.stands = new Float32Array(this.columns * this.rows);
    this.crowns = new Float32Array(this.columns * this.rows);
    this.hollows = new Float32Array(this.columns * this.rows);
    this.cured = new Float32Array(this.columns * this.rows);
    const zones = { swale: 0, stand: 0 };
    const meadow = { crown: 0, hollow: 0, cured: 0 };
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const x = area.x + column / (this.columns - 1) * area.w;
        const y = area.y + row / (this.rows - 1) * area.h;
        sharptailGroundZones(x, y, zones);
        sharptailMeadowAt(x, y, zones.swale, meadow);
        const index = row * this.columns + column;
        this.swales[index] = zones.swale;
        this.stands[index] = zones.stand;
        this.crowns[index] = meadow.crown;
        this.hollows[index] = meadow.hollow;
        this.cured[index] = meadow.cured;
      }
    }
  }

  edgeDistance(x: number, z: number): number {
    return Math.min(x - this.minX, this.maxX - x, z - this.minZ, this.maxZ - z);
  }

  private interpolate(values: Float32Array, index: number, tx: number, tz: number): number {
    const a = values[index], b = values[index + 1];
    const c = values[index + this.columns], d = values[index + this.columns + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }

  sample(x: number, z: number, out: SharptailGroundZones): SharptailGroundZones {
    const gx = Math.max(0, Math.min(this.columns - 1.000001, (x - this.minX) / (this.maxX - this.minX) * (this.columns - 1)));
    const gz = Math.max(0, Math.min(this.rows - 1.000001, (z - this.minZ) / (this.maxZ - this.minZ) * (this.rows - 1)));
    const ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz;
    const index = iz * this.columns + ix;
    out.swale = this.interpolate(this.swales, index, tx, tz);
    out.stand = this.interpolate(this.stands, index, tx, tz);
    return out;
  }

  /** Cached art-only relief fields; no per-blade trigonometry or allocation. */
  sampleMeadow(x: number, z: number, out: SharptailMeadowSample): SharptailMeadowSample {
    const gx = Math.max(0, Math.min(this.columns - 1.000001, (x - this.minX) / (this.maxX - this.minX) * (this.columns - 1)));
    const gz = Math.max(0, Math.min(this.rows - 1.000001, (z - this.minZ) / (this.maxZ - this.minZ) * (this.rows - 1)));
    const ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz;
    const index = iz * this.columns + ix;
    out.crown = this.interpolate(this.crowns, index, tx, tz);
    out.hollow = this.interpolate(this.hollows, index, tx, tz);
    out.cured = this.interpolate(this.cured, index, tx, tz);
    return out;
  }
}
