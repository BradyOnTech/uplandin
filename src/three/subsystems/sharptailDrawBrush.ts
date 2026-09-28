import { mulberry32 } from '../../game/math';

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
}

/** 160 High /96 Lite roots in the existing shrub batch. Two compact unequal
 * masses give each colony a readable crown, with a grass break between them.
 * The first roots anchor both masses so Lite preserves their silhouette.
 * Only these sheltered draw shrubs grow taller/broader; open prairie fill
 * and the other properties retain their existing scale and density. */
export function sharptailDrawBrushPlacements(lite: boolean): SharptailDrawBrush[] {
  const result: SharptailDrawBrush[] = [];
  for (const [index, colony] of SHARPTAIL_DRAW_BRUSH_COLONIES.entries()) {
    const random = mulberry32(0x5d6a17 + index * 0x9e3779b9);
    const cos = Math.cos(colony.yaw), sin = Math.sin(colony.yaw);
    const ordinals = [0, 0];
    for (let i = 0; i < 20; i++) {
      const secondary = i % 3 === 2;
      const ordinal = ordinals[secondary ? 1 : 0]++;
      const angle = ordinal * 2.399963 + random() * .50;
      const radial = ordinal === 0 ? 0
        : .86 * Math.sqrt(((ordinal * 5) % (secondary ? 6 : 14) + .35) / (secondary ? 6 : 14));
      const u = colony.rx * (secondary ? .65 : -.35)
        + Math.cos(angle) * colony.rx * (secondary ? .20 : .34) * radial;
      const v = colony.ry * (secondary ? -.30 : .12)
        + Math.sin(angle) * colony.ry * (secondary ? .60 : .66) * radial;
      const core = !secondary && radial < .45;
      const plant = {
        colony: colony.id,
        x: colony.x + u * cos - v * sin,
        y: colony.y + u * sin + v * cos,
        scale: core ? 2.55 + random() * .32 : 1.88 + random() * .52,
        spread: 1.65 + random() * .28,
        yaw: random() * Math.PI * 2,
        // Preserve the authored dark wood/silver leaf contrast instead of
        // multiplying the entire open crown by a dark green instance tint.
        color: [0xbac2ae, 0xcbd0be, 0xaebba6][Math.floor(random() * 3)],
        exterior: colony.exterior,
      };
      if (!lite || i < 12) result.push(plant);
    }
  }
  return result;
}
