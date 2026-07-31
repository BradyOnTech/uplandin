/**
 * Hand-authored field layouts for areas that use a fixed "one covert" look.
 * Sim patches stay on AreaConfig; birds still randomize among patches each hunt.
 * Art is placed here so Quail Fields looks designed, not stamp-scattered.
 *
 * HOW TO TWEAK (you are the director):
 * 1. Play Quail Fields, note what feels wrong (tree too left, bed too dense…).
 * 2. Edit numbers in AUTHORED_LAYOUTS['quail-fields'] below — x/y/scale.
 * 3. Reload. No art regen required unless you replace PNGs in public/art/.
 * 4. Prop frames (mockup-field-props 72×72): 0–1 oak, 2 russet, 3 olive, 4–5 cattail.
 * 5. Cover frames (mockup-cover-beds 80×64): 0–3 cattail beds from the mockup.
 */

export interface AuthoredProp {
  /** Frame index on the prop spritesheet. */
  frame: number;
  x: number;
  y: number;
  scale?: number;
  flipX?: boolean;
}

export interface AuthoredCoverBed {
  x: number;
  y: number;
  frame?: number;
  scale?: number;
}

export interface AuthoredFieldLayout {
  propKey: string;
  propCell: number;
  coverKey: string;
  coverCell: { w: number; h: number };
  props: AuthoredProp[];
  coverBeds: AuthoredCoverBed[];
}

export const AUTHORED_LAYOUTS: Record<string, AuthoredFieldLayout> = {
  'quail-fields': {
    propKey: 'mockup-field-props',
    propCell: 72,
    coverKey: 'mockup-cover-beds',
    coverCell: { w: 80, h: 64 },
    props: [
    { frame: 0, x: 180, y: 120, scale: 1.35 },
    { frame: 1, x: 420, y: 100, scale: 1.4 },
    { frame: 0, x: 680, y: 110, scale: 1.3 },
    { frame: 1, x: 920, y: 130, scale: 1.45 },
    { frame: 1, x: 150, y: 380, scale: 1.2 },
    { frame: 0, x: 1050, y: 400, scale: 1.35 },
    { frame: 0, x: 500, y: 520, scale: 1.25 },
    { frame: 1, x: 800, y: 560, scale: 1.3 },
    { frame: 1, x: 300, y: 620, scale: 1.15 },
    { frame: 2, x: 90, y: 200, scale: 0.9 },
    { frame: 2, x: 1100, y: 250, scale: 0.85 },
    { frame: 3, x: 250, y: 480, scale: 0.9 },
    { frame: 2, x: 600, y: 300, scale: 0.8 },
    { frame: 3, x: 950, y: 600, scale: 0.85 },
    { frame: 3, x: 400, y: 200, scale: 0.75 },
    ],
    coverBeds: [
    { x: 717, y: 411, frame: 0, scale: 0.95 },
    { x: 155, y: 374, frame: 1, scale: 1.03 },
    { x: 579, y: 569, frame: 2, scale: 1.11 },
    { x: 797, y: 147, frame: 3, scale: 0.95 },
    { x: 486, y: 277, frame: 0, scale: 1.03 },
    { x: 704, y: 403, frame: 1, scale: 1.11 },
    { x: 931, y: 521, frame: 2, scale: 0.95 },
    { x: 329, y: 82, frame: 3, scale: 1.03 },
    { x: 384, y: 143, frame: 0, scale: 1.11 },
    { x: 401, y: 129, frame: 1, scale: 0.85 },
    { x: 657, y: 403, frame: 1, scale: 0.95 },
    { x: 970, y: 557, frame: 2, scale: 1.03 },
    { x: 140, y: 572, frame: 3, scale: 1.11 },
    { x: 352, y: 356, frame: 0, scale: 0.95 },
    { x: 754, y: 64, frame: 1, scale: 1.03 },
    { x: 1125, y: 312, frame: 2, scale: 1.11 },
    { x: 111, y: 501, frame: 3, scale: 0.95 },
    { x: 383, y: 390, frame: 0, scale: 1.03 },
    { x: 230, y: 123, frame: 1, scale: 1.11 },
    { x: 198, y: 275, frame: 2, scale: 0.95 },
    { x: 984, y: 436, frame: 3, scale: 1.03 },
    { x: 695, y: 317, frame: 0, scale: 1.11 },
    { x: 64, y: 592, frame: 1, scale: 0.95 },
    { x: 189, y: 92, frame: 2, scale: 1.03 },
    { x: 615, y: 109, frame: 3, scale: 1.11 },
    { x: 1014, y: 641, frame: 0, scale: 0.95 },
    { x: 679, y: 348, frame: 1, scale: 1.03 },
    ],
  },
};

export function authoredLayoutFor(areaId: string): AuthoredFieldLayout | undefined {
  return AUTHORED_LAYOUTS[areaId];
}
