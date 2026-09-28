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

// Three unequal, oblique shoulders overlap from the west access and its
// southwest outlook. The nearer ridge is lower and interrupted; the farther
// ridges rise behind its gaps. Their long axes continue beyond the view rather
// than making a row of separate round hills along the boundary.
const western = [
  { x: -245, y: 680, rx: 540, ry: 180, yaw: 1.13, height: 36, bend: -.38, face: -.24, rise: .24, rhythm: .13, phase: .8 },
  { x: -690, y: 560, rx: 650, ry: 250, yaw: 1.29, height: 94, bend: .32, face: .20, rise: -.32, rhythm: .16, phase: 2.1 },
  { x: -180, y: 1335, rx: 810, ry: 230, yaw: .18, height: 44, bend: -.29, face: .22, rise: .20, rhythm: .12, phase: -.7 },
].map(shape => ({ ...frame(shape), rhythm: shape.rhythm, phase: shape.phase }));
// A broad saddle interrupts only the nearest shoulder. Its lower opening
// reveals the taller oblique western backdrop instead of raising one uniform
// skyline across the whole southwest-facing view.
const nearSaddle = frame({ x: -230, y: 715, rx: 145, ry: 240, yaw: 1.13, height: .64, bend: .2, face: 0, rise: 0 });

const smooth = (amount: number) => {
  const t = Math.max(0, Math.min(1, amount));
  return t * t * (3 - 2 * t);
};

const drainage = { depth: 0, bed: 0, bank: 0 };
function drainageAt(x: number, y: number): void {
  // Continue the west access draw through the first shoulder, then turn
  // southwest into the distant coulee. A compact cross-section gives it two
  // visible banks rather than another broad depression between round hills.
  const u = Math.max(0, Math.min(1, (-x - 20) / 980));
  const center = 610 + 475 * u - 40 * Math.sin(Math.PI * u);
  const v = (y - center) / (85 + 40 * u);
  const support = smooth((-x - 24) / 120) * (1 - smooth((-x - 1000) / 250));
  const profile = Math.abs(v) < 1 ? (1 - v * v) ** 2 : 0;
  const bank = support * Math.exp(-(((Math.abs(v) - .84) / .25) ** 2));

  // One shorter fork meets the main draw obliquely. It divides the near brow
  // into unequal attached shoulders, without creating isolated round mounds.
  const t = Math.max(0, Math.min(1, (-x - 100) / 460));
  const fingerCenter = 560 + 300 * t;
  const fingerV = (y - fingerCenter) / (60 + 20 * t);
  const fingerSupport = smooth((-x - 100) / 100) * (1 - smooth((-x - 460) / 160));
  const fingerProfile = Math.abs(fingerV) < 1 ? (1 - fingerV * fingerV) ** 2 : 0;
  const finger = fingerSupport * fingerProfile;
  const bed = support * profile;
  // Taking the larger incision avoids doubling depth where the fork joins.
  drainage.depth = Math.max((24 + 14 * u) * bed, 18 * finger);
  drainage.bed = Math.max(bed, finger);
  drainage.bank = Math.max(bank, fingerSupport * Math.exp(-(((Math.abs(fingerV) - .84) / .25) ** 2)));
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
  ridgeAt(x, y, nearSaddle); const cut = sample.height;
  for (let index = 0; index < western.length; index++) {
    const ridge = western[index];
    ridgeAt(x, y, ridge, ridge.rhythm, ridge.phase); westHeight += sample.height * (index === 0 ? 1 - cut : 1);
  }
  drainageAt(x, y);
  // A shallow tapering ridge cannot be cut below its original plain. The
  // depth limit remains smooth and only acts on the western landform mass.
  const incision = drainage.depth * (1 - Math.exp(-westHeight / 40));
  return height * exteriorFade(x, y, 150) + (westHeight - incision) * fade;
}

/** Broad paint/vegetation fields from the same ridge and coulee coordinates.
 * No allocations, added habitat or interior recoloring. Values remain 0..1. */
export function sharptailHorizonGrowth(x: number, y: number, out: { crown: number; hollow: number; exposed: number }): void {
  out.crown = 0; out.hollow = 0; out.exposed = 0;
  const fade = exteriorFade(x, y);
  if (fade === 0) return;
  ridgeAt(x, y, nearSaddle); const cut = sample.height;
  for (let index = 0; index < western.length; index++) {
    const ridge = western[index];
    ridgeAt(x, y, ridge, ridge.rhythm, ridge.phase);
    const crown = sample.along * Math.exp(-sample.v * sample.v * 4) * (index === 0 ? 1 - cut : 1);
    const face = sample.along * Math.exp(-(((sample.v + .68) / .52) ** 2));
    out.crown = Math.max(out.crown, crown);
    out.exposed = Math.max(out.exposed, face * .78);
    if (index === 0) out.hollow = Math.max(out.hollow, cut * sample.along * Math.exp(-sample.v * sample.v));
  }
  drainageAt(x, y);
  out.hollow = Math.max(out.hollow, drainage.bed);
  out.exposed = Math.max(out.exposed, drainage.bank * .9);
  out.crown *= fade * (1 - out.hollow * .6);
  out.exposed *= fade * (1 - out.hollow * .5);
  out.hollow *= fade;
}
