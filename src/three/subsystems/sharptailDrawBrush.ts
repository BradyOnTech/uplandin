import { mulberry32 } from '../../game/math';
import { SHARPTAIL_VEGETATION_BAND_ANCHORS, sampleSharptailVegetationBands } from '../../game/sharptailVegetationBands';

/** Property yards. Broken low colonies follow the west draw and the sheltered
 * sides of its exterior coulee. Wide gaps between them retain the open cast;
 * there is no continuous hedge, tree line, or new concealed bird habitat. */
export const SHARPTAIL_DRAW_BRUSH_COLONIES = [
  { id: 'west-stone-draw-lee', x: 86, y: 554, rx: 10.2, ry: 4.3, yaw: -.48, exterior: false },
  { id: 'west-lower-lee', x: 26, y: 599, rx: 11.8, ry: 4.6, yaw: -.58, exterior: false },
  { id: 'south-draw-turn', x: 87, y: 681, rx: 10.5, ry: 3.5, yaw: -.12, exterior: false },
  { id: 'outer-draw-mouth', x: -60, y: 590, rx: 12.2, ry: 3.8, yaw: -.44, exterior: true },
  { id: 'outer-draw-low-bank', x: -120, y: 647, rx: 13.2, ry: 4.1, yaw: -.52, exterior: true },
  { id: 'outer-draw-fork', x: -180, y: 620, rx: 11.6, ry: 3.5, yaw: -.35, exterior: true },
  { id: 'outer-draw-south-bank', x: -185, y: 682, rx: 13.6, ry: 4.2, yaw: -.48, exterior: true },
  { id: 'outer-fork-shoulder', x: -215, y: 574, rx: 12.6, ry: 3.7, yaw: -.61, exterior: true },
  { id: 'boundary-sage-apron', x: 4, y: 549, rx: 20, ry: 5.7, yaw: -.67, exterior: false, apron: true },
  { id: 'draw-mouth-sage-apron', x: -25, y: 572, rx: 22, ry: 5.4, yaw: -.55, exterior: true, apron: true },
] as const;

export interface SharptailDrawBrush {
  colony: string;
  x: number;
  y: number;
  scale: number;
  spread: number;
  yaw: number;
  color: number;
  exterior: boolean;
  /** Low drainage offshoot, below the taller established colony crowns. */
  fringe?: boolean;
  /** Approaching low cape, with crowns below the hunter's normal eye line. */
  apron?: boolean;
}

/** 200 High /120 Lite main roots plus at most160/96 short drainage offshoots
 * in the existing shrub batch. Two compact unequal
 * masses give each colony a readable crown, with a grass break between them.
 * The first roots anchor both masses so Lite preserves their silhouette.
 * Only these sheltered draw shrubs grow taller/broader; open prairie fill
 * and the other properties retain their existing scale and density. */
export function sharptailDrawBrushPlacements(lite: boolean): SharptailDrawBrush[] {
  const result: SharptailDrawBrush[] = [];
  for (const [index, colony] of SHARPTAIL_DRAW_BRUSH_COLONIES.entries()) {
    const apron = 'apron' in colony;
    const random = mulberry32(0x5d6a17 + index * 0x9e3779b9);
    const cos = Math.cos(colony.yaw), sin = Math.sin(colony.yaw);
    const ordinals = [0, 0];
    for (let i = 0; i < 20; i++) {
      const secondary = i % 3 === 2;
      const ordinal = ordinals[secondary ? 1 : 0]++;
      const angle = ordinal * 2.399963 + random() * .50;
      const radial = ordinal === 0 ? 0
        : .86 * Math.sqrt(((ordinal * 5) % (secondary ? 6 : 14) + .35) / (secondary ? 6 : 14));
      let u = colony.rx * (secondary ? .45 : -.28)
        + Math.cos(angle) * colony.rx * (secondary ? .25 : .38) * radial;
      let v = colony.ry * (secondary ? -.30 : .12)
        + Math.sin(angle) * colony.ry * (secondary ? .60 : .66) * radial;
      if (apron) {
        // Three overlapping unequal shoulders form a low cape along the
        // drainage rather than two isolated shrubs on the bare boundary.
        const lobe = i % 3, centers = [-.70, -.08, .55];
        u = colony.rx * (centers[lobe] + Math.cos(angle) * .11 * radial);
        v = colony.ry * ((lobe === 1 ? .10 : -.06) + Math.sin(angle) * .40 * radial);
      }
      const core = !secondary && radial < .45;
      const x = colony.x + u * cos - v * sin, y = colony.y + u * sin + v * cos;
      const plant = {
        colony: colony.id,
        x, y,
        scale: apron ? (core ? 1.67 + random() * .22 : 1.31 + random() * .30)
          : core ? 2.55 + random() * .32 : 1.88 + random() * .52,
        spread: apron ? 2.3 + random() * .30 : 1.65 + random() * .28,
        yaw: random() * Math.PI * 2,
        // Preserve the authored dark wood/silver leaf contrast instead of
        // multiplying the entire open crown by a dark green instance tint.
        color: [0xbac2ae, 0xcbd0be, 0xaebba6][Math.floor(random() * 3)],
        exterior: apron ? x < 0 || y < 0 || x > 1400 || y > 800 : colony.exterior,
        ...(apron ? { apron: true } : {}),
      };
      if (!lite || i < 12) result.push(plant);
    }
  }
  const bands = { scrub: 0, grass: 0, litter: 0 };
  const established = SHARPTAIL_DRAW_BRUSH_COLONIES.filter(colony => !('apron' in colony));
  for (const [colonyIndex, colony] of SHARPTAIL_DRAW_BRUSH_COLONIES.entries()) {
    if ('apron' in colony) continue;
    // A few contiguous stations grow out of each existing colony. The shared
    // scrub field has real gaps; do not bridge its zero-strength stations or
    // seed free-standing islands across the open prairie between branches.
    const anchors = SHARPTAIL_VEGETATION_BAND_ANCHORS.map((anchor, index) => ({ anchor, index,
      distance: Math.hypot(anchor.x - colony.x, anchor.y - colony.y) }))
      .filter(({ anchor, distance }) => {
        if (anchor.band === 'boundary-apron') return false;
        if (distance < 7 || distance > 27) return false;
        const nearest = established.reduce((best, other) =>
          Math.hypot(anchor.x - other.x, anchor.y - other.y) < Math.hypot(anchor.x - best.x, anchor.y - best.y) ? other : best);
        if (nearest !== colony) return false;
        sampleSharptailVegetationBands(anchor.x, anchor.y, bands);
        return bands.scrub > .12 && bands.grass > .55;
      }).sort((a, b) => a.distance - b.distance).slice(0, 4);
    for (const { anchor, index } of anchors) {
      const previous = SHARPTAIL_VEGETATION_BAND_ANCHORS[index - 1];
      const next = SHARPTAIL_VEGETATION_BAND_ANCHORS[index + 1];
      const a = previous?.band === anchor.band ? previous : anchor;
      const b = next?.band === anchor.band ? next : anchor;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const tx = (b.x - a.x) / length, ty = (b.y - a.y) / length;
      const random = mulberry32(0x47f61 + index * 0x9e3779b9 + colonyIndex * 113);
      for (const [i, [along, across]] of [[-1.7, -.35], [0, .55], [1.6, -.25], [-.9, 1.45], [1.0, -1.3]].entries()) {
        const u = along * .57 + (random() - .5) * .20, v = across * .57 + (random() - .5) * .25;
        const x = anchor.x + tx * u - ty * v, y = anchor.y + ty * u + tx * v;
        const plant: SharptailDrawBrush = {
          colony: colony.id, x, y, fringe: true,
          scale: i < 3 ? 1.03 + random() * .14 : .82 + random() * .16,
          spread: 2.2 + random() * .35, yaw: random() * Math.PI * 2,
          color: [0xb7c0aa, 0xc0c8b0, 0xabb99f][Math.floor(random() * 3)],
          exterior: x < 0 || y < 0 || x > 1400 || y > 800,
        };
        sampleSharptailVegetationBands(x, y, bands);
        if (bands.scrub > .08 && bands.grass > .5 && (!lite || i < 3)) result.push(plant);
      }
    }
  }
  return result;
}
