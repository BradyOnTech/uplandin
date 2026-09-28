/** Exterior prairie, in property yards with heights in metres. The joined
 * horizon strips resolve these forms at intervals of at most 25 yards. */
interface Ridge {
  x: number; y: number; rx: number; ry: number; yaw: number; height: number;
  bend: number; face: number; rise: number;
}
const frame = (shape: Ridge) => ({ ...shape, cos: Math.cos(shape.yaw), sin: Math.sin(shape.yaw) });

// Preserve the accepted northern/eastern backdrop. The western skyline is
// composed separately rather than raising every direction around the field.
const retained = [
  { x: 1750, y: -100, rx: 710, ry: 205, yaw: .36, height: 43, bend: -.32, face: .22, rise: .28 },
  { x: 1580, y: 495, rx: 520, ry: 190, yaw: 1.06, height: 28, bend: .30, face: -.22, rise: -.26 },
  { x: 820, y: -290, rx: 880, ry: 240, yaw: -.12, height: 36, bend: .24, face: .28, rise: -.20 },
  { x: 580, y: 1350, rx: 820, ry: 240, yaw: .15, height: 16, bend: .31, face: .20, rise: .25 },
].map(frame);

/** Authored ridgelines give the west view separate overlapping landforms.
 * Each station is [north/south yard, east/west yard, height, half-width].
 * The intervening valley remains low; adding broad overlapping Gaussian
 * hills here previously filled it and produced one unbroken smooth ramp. */
const westSpines = [
  { side: .82, points: [
    [-140, -380, 4, 170], [180, -250, 24, 145], [390, -160, 31, 140],
    [535, -205, 26, 145], [705, -155, 9, 120], [875, -250, 30, 155],
    [1080, -370, 24, 180], [1380, -400, 3, 190],
  ] },
  { side: 1.16, points: [
    [-280, -950, 8, 270], [80, -830, 72, 250], [340, -780, 84, 260],
    [590, -830, 72, 250], [790, -780, 58, 250], [980, -850, 80, 270],
    [1220, -910, 55, 280], [1660, -950, 4, 290],
  ] },
] as const;
const smooth = (amount: number) => {
  const t = Math.max(0, Math.min(1, amount));
  return t * t * (3 - 2 * t);
};
const spineSample = { center: 0, height: 0, width: 0, across: 0, section: 0 };
function spineAt(x: number, y: number, spine: typeof westSpines[number]): void {
  const points = spine.points;
  spineSample.height = 0; spineSample.section = 0;
  if (y <= points[0][0] || y >= points[points.length - 1][0]) return;
  let i = 0;
  while (i < points.length - 2 && y > points[i + 1][0]) i++;
  const a = points[i], b = points[i + 1], before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 2)];
  const span = b[0] - a[0], t = (y - a[0]) / span;
  const h00 = 2 * t ** 3 - 3 * t * t + 1, h10 = t ** 3 - 2 * t * t + t;
  const h01 = -2 * t ** 3 + 3 * t * t, h11 = t ** 3 - t * t;
  const component = (channel: 1 | 2 | 3) => h00 * a[channel] + h01 * b[channel]
    + h10 * span * (b[channel] - before[channel]) / (b[0] - before[0])
    + h11 * span * (after[channel] - a[channel]) / (after[0] - a[0]);
  spineSample.center = component(1); spineSample.width = component(3);
  const u = (x - spineSample.center) / (spineSample.width * (x > spineSample.center ? spine.side : 1));
  const cross = Math.abs(u);
  // A broad crown, a steeper middle face and a tapering foot. Compact
  // support leaves real low ground between the two independent ridgelines.
  const section = cross >= 1 ? 0 : 1 - smooth(cross);
  const endFade = smooth((y - points[0][0]) / 110) * smooth((points[points.length - 1][0] - y) / 130);
  spineSample.height = Math.max(0, component(2)) * section * endFade;
  spineSample.across = u; spineSample.section = section * endFade;
}

const drainage = { depth: 0, bed: 0, bank: 0 };
function drainageAt(x: number, y: number): void {
  // Three unequal tributaries articulate the near shoulder. Their heads
  // taper before the crown instead of cutting identical notches in every hill.
  const reach = smooth((-x - 22) / 65) * (1 - smooth((-x - 310) / 100));
  let bed = 0, bank = 0, depth = 0;
  for (const [mouth, bend, width, incision] of [[512, -.26, 37, 7], [667, -.12, 55, 9], [913, .32, 43, 8]]) {
    const center = mouth + bend * (-x - 55) + Math.sin((-x - 30) / 120) * 15;
    const v = (y - center) / width;
    const profile = Math.abs(v) < 1 ? (1 - v * v) ** 2 * reach : 0;
    bed = Math.max(bed, profile);
    bank = Math.max(bank, Math.exp(-(((Math.abs(v) - .83) / .3) ** 2)) * reach);
    depth = Math.max(depth, profile * incision);
  }
  drainage.depth = depth; drainage.bed = bed; drainage.bank = bank;
}

/** Keep the complete playable surface and its normal-sampling collar exact.
 * The smoothstep begins only beyond 24 yards and joins with zero derivative. */
function exteriorFade(x: number, y: number, transition = 230): number {
  const outside = Math.hypot(Math.max(-x, 0, x - 1400), Math.max(-y, 0, y - 800));
  if (outside <= 24) return 0;
  const t = Math.min(1, (outside - 24) / transition);
  return t * t * (3 - 2 * t);
}

const sample = { u: 0, v: 0, along: 0, height: 0 };
function ridgeAt(x: number, y: number, ridge: ReturnType<typeof frame>, rhythm = 0, phase = 0): void {
  const dx = x - ridge.x, dy = y - ridge.y;
  const u = (dx * ridge.cos + dy * ridge.sin) / ridge.rx;
  // A few broad bends and unequal end heights create an irregular skyline.
  // Their wavelength is several coarse grid cells, never fine terrain noise.
  const crest = ridge.bend * (u * u - .25) / (1 + .5 * u * u)
    + rhythm * Math.sin(u * 2.7 + phase);
  const v = (-dx * ridge.sin + dy * ridge.cos) / ridge.ry - crest;
  const face = v * (1 + ridge.face * v / Math.sqrt(v * v + .36));
  const endRise = 1 + ridge.rise * u / Math.sqrt(1 + u * u);
  const along = Math.exp(-(.55 * u ** 4 + .32 * u * u));
  sample.u = u; sample.v = v; sample.along = along;
  sample.height = ridge.height * endRise * along * Math.exp(-face * face)
    * (1 + rhythm * Math.sin(u * 3.4 + phase * 1.7));
}

export function sharptailHorizonHeight(x: number, y: number): number {
  const fade = exteriorFade(x, y);
  if (fade === 0) return 0;
  let height = 0, westHeight = 0;
  for (const ridge of retained) { ridgeAt(x, y, ridge); height += sample.height; }
  for (const spine of westSpines) { spineAt(x, y, spine); westHeight += spineSample.height; }
  drainageAt(x, y);
  const incision = drainage.depth * (1 - Math.exp(-westHeight / 12));
  return height * exteriorFade(x, y, 150) + Math.max(0, westHeight - incision) * fade;
}

/** Broad paint/vegetation fields from the same ridge and coulee coordinates.
 * No allocations, added habitat or interior recoloring. Values remain 0..1. */
export function sharptailHorizonGrowth(x: number, y: number, out: { crown: number; hollow: number; exposed: number }): void {
  out.crown = 0; out.hollow = 0; out.exposed = 0;
  const fade = exteriorFade(x, y);
  if (fade === 0) return;
  for (const spine of westSpines) {
    spineAt(x, y, spine);
    if (spineSample.section <= 0) continue;
    const v = spineSample.across;
    out.crown = Math.max(out.crown, Math.exp(-v * v * 12) * spineSample.section);
    // Dry weathered lips sit above narrow sheltered green feet. Keep most
    // of the long view vegetated; pale till is a local seam, not a whole hill.
    out.exposed = Math.max(out.exposed, Math.exp(-(((v - .52) / .15) ** 2)) * spineSample.section * .55);
    out.hollow = Math.max(out.hollow, Math.exp(-(((v - .78) / .30) ** 2)) * .72 * smooth(spineSample.section * 7));
  }
  drainageAt(x, y);
  out.hollow = Math.max(out.hollow, drainage.bed);
  out.exposed = Math.max(out.exposed, drainage.bank * .55);
  out.crown *= fade * (1 - out.hollow * .6);
  out.exposed *= fade * (1 - out.hollow * .5);
  out.hollow *= fade;
}
