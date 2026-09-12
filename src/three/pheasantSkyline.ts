/** Decorative prairie country in metres above the horizon datum. These
 * contours are deliberately separate from the mountain ridge generator:
 * open cultivated swells alternate with short, recognisable shelterbelts.
 * Nothing in this backdrop is a traversable hill or a source of bird cover.
 */
type Contour = readonly (readonly [azimuth: number, height: number])[];
interface Grove { start: number; end: number; count: number; height: number }
interface Crown { center: number; halfWidth: number; height: number; shoulder: number }

const CONTOURS: readonly Contour[] = [
  [[-180, 2], [-153, 4], [-130, 2.5], [-111, 6], [-91, 4], [-70, 1], [-45, 2], [-20, 6], [3, 7], [25, 3], [52, 1], [80, 3], [105, 6], [133, 4], [154, 1], [180, 2]],
  [[-180, 12], [-159, 18], [-138, 20], [-118, 15], [-93, 9], [-69, 12], [-42, 18], [-18, 19], [12, 13], [39, 8], [63, 11], [88, 18], [109, 20], [134, 14], [158, 9], [180, 12]],
  [[-180, 26], [-157, 30], [-134, 24], [-110, 22], [-85, 32], [-59, 39], [-32, 35], [-6, 25], [22, 23], [49, 33], [77, 41], [101, 36], [126, 28], [153, 22], [180, 26]],
];

// Each belt has two quiet ends and a taller interior, with open country
// between belts. Stable positions help the player orient while turning.
const GROVES: readonly (readonly Grove[])[] = [
  [
    { start: -173, end: -158, count: 7, height: 15 },
    { start: -131, end: -115, count: 9, height: 18 },
    { start: -87, end: -75, count: 6, height: 16 },
    { start: -31, end: -8, count: 11, height: 20 },
    { start: 35, end: 43, count: 4, height: 14 },
    { start: 91, end: 113, count: 11, height: 21 },
    { start: 142, end: 151, count: 5, height: 15 },
  ],
  [
    { start: -155, end: -135, count: 15, height: 13 },
    { start: -104, end: -94, count: 7, height: 12 },
    { start: -59, end: -39, count: 14, height: 15 },
    { start: 5, end: 24, count: 13, height: 16 },
    { start: 62, end: 72, count: 7, height: 12 },
    { start: 124, end: 142, count: 12, height: 14 },
  ],
  [],
];

function noise(index: number, salt: number): number {
  let h = Math.imul(index + 1, 374761393) ^ salt;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const CROWNS: readonly Crown[][] = GROVES.map((groves, layer) => groves.flatMap((grove, group) => {
  const step = (grove.end - grove.start) / grove.count;
  return Array.from({ length: grove.count }, (_, i) => {
    const salt = layer * 173 + group * 79;
    const envelope = .6 + .4 * Math.sin(Math.PI * (i + .5) / grove.count);
    return {
      center: grove.start + step * (i + .5 + (noise(i, salt) - .5) * .5),
      halfWidth: step * (.52 + .38 * noise(i, salt + 1)),
      height: grove.height * envelope * (.65 + .35 * noise(i, salt + 2)),
      shoulder: .15 + .25 * noise(i, salt + 3),
    };
  });
}));

function contourHeight(contour: Contour, azimuth: number): number {
  for (let i = 1; i < contour.length; i++) {
    const [right, b] = contour[i];
    if (azimuth > right) continue;
    const [left, a] = contour[i - 1];
    const t = (azimuth - left) / (right - left);
    // Long cultivated shoulders, with no additive Gaussian peaks that can
    // accidentally join into a much taller, featureless surrounding wall.
    return a + (b - a) * t * t * (3 - 2 * t);
  }
  return contour[0][1];
}

export function samplePheasantSkyline(layer: number, theta: number): { ground: number; crest: number; crown: number } {
  const az = ((theta * 180 / Math.PI + 180) % 360 + 360) % 360 - 180;
  const ground = contourHeight(CONTOURS[layer], az);
  let crown = 0;
  for (const tree of CROWNS[layer]) {
    const offset = az - tree.center;
    const dx = Math.abs(offset) / (tree.halfWidth * (offset < 0 ? .9 : 1.1));
    if (dx >= 1) continue;
    // Broad angular crowns: a short uneven shoulder, then a steeper edge.
    // The ring samples make the skyline faceted, without conifer spikes.
    const shoulder = tree.shoulder;
    const top = dx < shoulder ? 1 - dx * .14
      : dx < .65 ? 1 - shoulder * .14 - (dx - shoulder) / (.65 - shoulder) * .22
      : dx < .85 ? .78 - shoulder * .14 - (dx - .65) * 1.25
      : (1 - dx) / .15 * (.53 - shoulder * .14);
    crown = Math.max(crown, tree.height * top);
  }
  return { ground, crest: ground + crown, crown };
}
