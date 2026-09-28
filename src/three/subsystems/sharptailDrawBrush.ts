import { mulberry32 } from '../../game/math';

/** Property yards. Broken low colonies follow the west draw and the sheltered
 * sides of its exterior coulee. Wide gaps between them retain the open cast;
 * there is no continuous hedge, tree line, or new concealed bird habitat. */
export const SHARPTAIL_DRAW_BRUSH_COLONIES = [
  { id: 'west-boundary-lip', x: 18, y: 557, rx: 8.4, ry: 3.2, yaw: 1.27, exterior: false },
  { id: 'west-lower-lee', x: 60, y: 622, rx: 11.8, ry: 3.8, yaw: -.42, exterior: false },
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

/** 160 High /96 Lite roots, using the existing rooted sage geometry. Low,
 * broad overlapping crowns form a silhouette instead of isolated dots.
 * Lite keeps the same distributed roots, thinning density inside each mass.
 * Height remains independent of the modest extra horizontal crown spread. */
export function sharptailDrawBrushPlacements(lite: boolean): SharptailDrawBrush[] {
  const result: SharptailDrawBrush[] = [];
  for (const [index, colony] of SHARPTAIL_DRAW_BRUSH_COLONIES.entries()) {
    const random = mulberry32(0x5d6a17 + index * 0x9e3779b9);
    const cos = Math.cos(colony.yaw), sin = Math.sin(colony.yaw);
    const ordinals = [0, 0];
    for (let i = 0; i < 20; i++) {
      const secondary = i % 3 === 2;
      const ordinal = ordinals[secondary ? 1 : 0]++;
      const angle = ordinal * 2.399963 + random() * .38;
      // Interleaved outer and inner roots keep the same broken outline on
      // both tiers. The narrow joining gap splits the long colony into two
      // unequal masses, each with a lower ragged fringe.
      const radial = .16 + .77 * Math.sqrt(((ordinal * 5) % (secondary ? 6 : 14) + .6) / (secondary ? 6 : 14));
      const u = colony.rx * (secondary ? .57 : -.31)
        + Math.cos(angle) * colony.rx * (secondary ? .36 : .61) * radial;
      const v = colony.ry * (secondary ? -.29 : .10)
        + Math.sin(angle) * colony.ry * (secondary ? .74 : 1) * radial;
      const core = !secondary && radial < .48;
      const plant = {
        colony: colony.id,
        x: colony.x + u * cos - v * sin,
        y: colony.y + u * sin + v * cos,
        scale: core ? 1.65 + random() * .26 : 1.02 + random() * .49,
        spread: 1.35 + random() * .34,
        yaw: random() * Math.PI * 2,
        color: [0x929c8b, 0xaab19c, 0x879683][Math.floor(random() * 3)],
        exterior: colony.exterior,
      };
      if (!lite || i < 12) result.push(plant);
    }
  }
  return result;
}
