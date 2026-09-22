import { mulberry32 } from '../../game/math';
import { SHARPTAIL_SHOULDERS, sharptailGroundZones } from '../../game/sharptailLandscape';

/** Property-space pockets on shoulder lips, sheltered swales and the open
 * side of route bends. These are decorative, not new bird-cover rectangles.
 * Their long axes borrow the nearest authored shoulder's orientation. */
export const SHARPTAIL_ACCENT_POCKETS = [
  { id: 'south-reveal', x: 695, y: 571, rx: 10, ry: 5 },
  { id: 'south-lee', x: 725, y: 586, rx: 15, ry: 6 },
  { id: 'south-entry-shoulder', x: 670, y: 684, rx: 12, ry: 6 },
  { id: 'middle-swale', x: 715, y: 458, rx: 15, ry: 7 },
  { id: 'west-shoulder', x: 319, y: 459, rx: 14, ry: 7 },
  { id: 'west-crossing', x: 469, y: 439, rx: 11, ry: 6 },
  { id: 'windbreak-reveal', x: 919, y: 311, rx: 10, ry: 6 },
  { id: 'windbreak-upper-lip', x: 946, y: 264, rx: 12, ry: 5 },
  { id: 'east-return-reveal', x: 1165, y: 450, rx: 11, ry: 6 },
  { id: 'east-return-lee', x: 1128, y: 477, rx: 15, ry: 7 },
  { id: 'east-lower-shoulder', x: 1094, y: 568, rx: 14, ry: 7 },
  { id: 'north-lee', x: 1000, y: 266, rx: 14, ry: 7 },
] as const;

const pocketFrames = SHARPTAIL_ACCENT_POCKETS.map(pocket => {
  const shoulder = SHARPTAIL_SHOULDERS.reduce((nearest, current) =>
    Math.hypot(current.x - pocket.x, current.y - pocket.y) < Math.hypot(nearest.x - pocket.x, nearest.y - pocket.y)
      ? current : nearest);
  return { pocket, cos: Math.cos(shoulder.yaw), sin: Math.sin(shoulder.yaw) };
});

/** Allocation-free, property-space underplanting mask for baked ground tint.
 * Keep litter within the pockets, fading beyond the outermost satellites. */
export function sharptailAccentGroundAt(x: number, y: number): number {
  let strongest = 0;
  for (const { pocket, cos, sin } of pocketFrames) {
    const dx = x - pocket.x, dy = y - pocket.y;
    if (Math.abs(dx) > pocket.rx + 4 || Math.abs(dy) > pocket.rx + 4) continue;
    const u = (dx * cos + dy * sin) / (pocket.rx + 3);
    const v = (-dx * sin + dy * cos) / (pocket.ry + 3);
    const falloff = Math.max(0, 1 - u * u - v * v);
    strongest = Math.max(strongest, falloff * falloff * (3 - 2 * falloff));
  }
  return strongest;
}

export interface SharptailAccent {
  kind: 'shrub' | 'reed' | 'rock';
  pocket: string;
  x: number;
  y: number;
  scale: number;
  yaw: number;
  color: number;
}

/** Fixed budgets before normal route/set-piece clearance: 168/252 shrubs,
 * 36/60 dry-forb sprays and 36/60 low stone groups. Lite keeps the same main
 * roots and adds no new batches. The centers remain identical from either
 * parking place; only outer satellites are removed on Lite. */
export function sharptailAccentPlacements(lite: boolean): SharptailAccent[] {
  const placements: SharptailAccent[] = [];
  const zones = { swale: 0, stand: 0 };
  for (const [pocketIndex, { pocket, cos, sin }] of pocketFrames.entries()) {
    const rng = mulberry32(0x51a6e + pocketIndex * 0x9e3779b9);
    const place = (kind: SharptailAccent['kind'], index: number, count: number): SharptailAccent => {
      // An unequal core and a thinner trailing edge: no ring of identical
      // bushes and no equally spaced confetti across the whole property.
      const angle = index * 2.399963 + rng() * .7;
      const radius = index < 8 && kind === 'shrub' ? .17 + rng() * .40
        : .48 + rng() * .49;
      const u = Math.cos(angle) * pocket.rx * radius + (index % 3 === 0 ? pocket.rx * .15 : 0);
      const v = Math.sin(angle) * pocket.ry * radius;
      const x = pocket.x + u * cos - v * sin, y = pocket.y + u * sin + v * cos;
      sharptailGroundZones(x, y, zones);
      const palette = kind === 'shrub'
        ? zones.swale > .42 ? [0x96a58a, 0xa2ad92, 0x8f9f86] : [0xa4ae91, 0xb0b79c, 0x97a488]
        : kind === 'reed' ? [0xb0a47b, 0xc1af7e, 0xa79c75] : [0xa7a38d, 0x918f7f, 0xb0a994];
      const size = kind === 'shrub' ? .77 + rng() * .37 : kind === 'reed' ? .85 + rng() * .35 : .74 + rng() * .40;
      return { kind, pocket: pocket.id, x, y, scale: size * (index >= count - 4 && kind === 'shrub' ? .84 : 1),
        yaw: rng() * Math.PI * 2, color: palette[Math.floor(rng() * palette.length)] };
    };
    for (const [kind, count, liteCount] of [['shrub', 21, 14], ['reed', 5, 3], ['rock', 5, 3]] as const) {
      for (let i = 0; i < count; i++) {
        const item = place(kind, i, count);
        if (!lite || i < liteCount) placements.push(item);
      }
    }
  }
  return placements;
}
