import type { LandscapeModel } from './landscape';
import { wetPondLayout, wetPondRadius } from './wetPonds';

/** Water levels are fixed; depth follows the same bed used by movement. */
export class ShallowWater {
  private readonly pools;
  private readonly property = { x: 0, y: 0 };
  constructor(private readonly landscape: LandscapeModel) {
    this.pools = landscape.area.id === 'woodcock-bottoms'
      ? wetPondLayout(landscape.area).map(pond => ({ ...pond,
        level: landscape.heightAtProperty(pond.px, pond.py) + .75 })) : [];
  }
  depthAtWorld(x: number, z: number): number {
    if (!this.pools.length) return 0;
    this.landscape.worldToProperty(x, z, this.property);
    let depth = 0;
    for (const pond of this.pools) {
      // Water's irregular edge lies near this radius. The bed rises above
      // its level at radius one, so the outside band has zero depth.
      if (wetPondRadius(pond, this.property.x, this.property.y) > 1.12) continue;
      depth = Math.max(depth, pond.level - this.landscape.heightAtWorld(x, z));
    }
    return depth;
  }
}

export function wadingSpeedMultiplier(depth: number): number {
  const t = Math.max(0, Math.min(1, depth / .65));
  return 1 - .45 * t * t * (3 - 2 * t);
}
