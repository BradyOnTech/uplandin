import { mulberry32 } from '../../game/math';
import { SHARPTAIL_SHOULDERS, sharptailGroundZones } from '../../game/sharptailLandscape';

/** Property-space pockets on shoulder lips, sheltered swales and the open
 * side of route bends. These are decorative, not new bird-cover rectangles.
 * Their long axes borrow the nearest authored shoulder's orientation. */
export const SHARPTAIL_ACCENT_POCKETS = [
  { id: 'south-reveal', x: 720, y: 541, rx: 11, ry: 5 },
  { id: 'south-lee', x: 774, y: 635, rx: 17, ry: 5 },
  { id: 'south-entry-shoulder', x: 670, y: 684, rx: 12, ry: 6 },
  { id: 'middle-swale', x: 830, y: 447, rx: 17, ry: 10 },
  { id: 'west-shoulder', x: 335, y: 442, rx: 10, ry: 5 },
  { id: 'west-crossing', x: 469, y: 411, rx: 13, ry: 5 },
  { id: 'windbreak-reveal', x: 992, y: 345, rx: 9, ry: 4.5 },
  { id: 'windbreak-upper-lip', x: 946, y: 264, rx: 12, ry: 5 },
  { id: 'east-return-reveal', x: 1142, y: 383, rx: 12, ry: 5 },
  { id: 'east-return-lee', x: 1128, y: 477, rx: 15, ry: 7 },
  { id: 'east-lower-shoulder', x: 1094, y: 568, rx: 14, ry: 7 },
  { id: 'north-lee', x: 1026, y: 344, rx: 11, ry: 5 },
] as const;

// A broken low edge on the sheltered side of the Shack approach. The two
// existing pocket budgets gather into two full ends and a smaller joining
// lobe, leaving the access lane and the building visible to the north.
// These same frames drive roots and their ground contact; no separate oval
// clearing is painted around a few isolated plants.
const SHACK_THICKETS = [
  { x: 992, y: 345, rx: 9, ry: 4.5, yaw: .25, shrubs: 17 },
  { x: 1007, y: 349, rx: 7, ry: 3.3, yaw: -.16, shrubs: 9 },
  { x: 1026, y: 344, rx: 11, ry: 5, yaw: -.32, shrubs: 16 },
].map(lobe => ({ ...lobe, cos: Math.cos(lobe.yaw), sin: Math.sin(lobe.yaw) }));
const isShackPocket = (id: string): boolean => id === 'windbreak-reveal' || id === 'north-lee';

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
    if (isShackPocket(pocket.id)) continue;
    const dx = x - pocket.x, dy = y - pocket.y;
    const reach = (pocket.rx + 3) * 1.35;
    if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
    const u = (dx * cos + dy * sin) / (pocket.rx + 3);
    const v = (-dx * sin + dy * cos) / (pocket.ry + 3);
    // Broken grass fingers run into each group rather than drawing an oval
    // planting bed. Broad continuous variation survives terrain sampling.
    const fringe = 1 + .23 * Math.sin(x * .37 + y * .29) + .16 * Math.sin(x * .21 - y * .51);
    const falloff = Math.max(0, 1 - (u * u + v * v) * fringe);
    strongest = Math.max(strongest, falloff * falloff * (3 - 2 * falloff));
  }
  for (const lobe of SHACK_THICKETS) {
    const dx = x - lobe.x, dy = y - lobe.y;
    if (Math.abs(dx) > lobe.rx + 3 || Math.abs(dy) > lobe.rx + 3) continue;
    const u = (dx * lobe.cos + dy * lobe.sin) / (lobe.rx + 1.8);
    const v = (-dx * lobe.sin + dy * lobe.cos) / (lobe.ry + 1.6);
    const edge = 1 + .14 * Math.sin(x * .61 + y * .33) + .10 * Math.sin(x * .23 - y * .72);
    const falloff = Math.max(0, 1 - (u * u + v * v) * edge);
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
    if (isShackPocket(pocket.id)) {
      const west = pocket.id === 'windbreak-reveal';
      const localCounts = [0, 0, 0];
      for (const [kind, count, liteCount] of [['shrub', 21, 14], ['reed', 5, 3], ['rock', 5, 3]] as const) {
        localCounts.fill(0);
        for (let i = 0; i < count; i++) {
          // Interleave the joining lobe in the retained Lite prefix. High
          // adds fringe roots; it does not move or inflate the core plants.
          const joining = west ? i % 5 === 4 : i % 4 === 3;
          const lobeIndex = joining ? 1 : west ? 0 : 2;
          const lobe = SHACK_THICKETS[lobeIndex];
          const ordinal = localCounts[lobeIndex]++;
          const local = joining && !west ? ordinal + 4 : ordinal;
          const angle = local * 2.399963 + rng() * .52 + (west ? 0 : .9);
          const radius = kind === 'shrub'
            ? .10 + .85 * Math.pow((local + .4) / lobe.shrubs, .72)
            : .40 + rng() * .39;
          const u = Math.cos(angle) * lobe.rx * radius;
          const v = Math.sin(angle) * lobe.ry * radius;
          const x = lobe.x + u * lobe.cos - v * lobe.sin;
          const y = lobe.y + u * lobe.sin + v * lobe.cos;
          // Low outer growth gathers toward taller sheltered cores. Keep
          // the existing muted northern-prairie colors and existing meshes.
          const scale = kind === 'shrub'
            ? (1.55 + (1 - radius) * .95 + rng() * .25) * (lobeIndex === 1 ? .83 : 1)
            : kind === 'reed' ? .95 + rng() * .40 : .74 + rng() * .40;
          const palette = kind === 'shrub' ? [0x829a80, 0x91a58c, 0x789079]
            : kind === 'reed' ? [0xb0a47b, 0xc1af7e, 0xa79c75] : [0xa7a38d, 0x918f7f, 0xb0a994];
          const item = { kind, pocket: pocket.id, x, y, scale, yaw: rng() * Math.PI * 2,
            color: palette[Math.floor(rng() * palette.length)] };
          if (!lite || i < liteCount) placements.push(item);
        }
      }
      continue;
    }
    const place = (kind: SharptailAccent['kind'], index: number, count: number): SharptailAccent => {
      // An unequal core and a thinner trailing edge: no ring of identical
      // bushes and no equally spaced confetti across the whole property.
      const angle = index * 2.399963 + rng() * .7;
      const anchor = pocket.id === 'south-reveal' || pocket.id === 'middle-swale' || pocket.id === 'windbreak-reveal' || pocket.id === 'north-lee' || pocket.id === 'west-shoulder';
      const radius = index < 8 && kind === 'shrub' ? (anchor ? .12 + rng() * .27 : .17 + rng() * .40)
        : .48 + rng() * .49;
      const u = Math.cos(angle) * pocket.rx * radius + (index % 3 === 0 ? pocket.rx * .15 : 0);
      const v = Math.sin(angle) * pocket.ry * radius;
      const x = pocket.x + u * cos - v * sin, y = pocket.y + u * sin + v * cos;
      sharptailGroundZones(x, y, zones);
      const palette = kind === 'shrub'
        ? zones.swale > .42 ? anchor ? [0x829a80, 0x91a58c, 0x789079] : [0x96a58a, 0xa2ad92, 0x8f9f86] : [0xa4ae91, 0xb0b79c, 0x97a488]
        : kind === 'reed' ? [0xb0a47b, 0xc1af7e, 0xa79c75] : [0xa7a38d, 0x918f7f, 0xb0a994];
      // Three route anchors grow in unequal, sheltered cores. Existing
      // instance budgets form a legible brush mass; satellites stay low.
      const core = anchor && index < 9 ? (kind === 'shrub' ? 1.75 : kind === 'reed' ? 1.35 : 1) : 1;
      const size = kind === 'shrub' ? .77 + rng() * .37 : kind === 'reed' ? .85 + rng() * .35 : .74 + rng() * .40;
      return { kind, pocket: pocket.id, x, y, scale: size * core * (index >= count - 4 && kind === 'shrub' ? .84 : 1),
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
