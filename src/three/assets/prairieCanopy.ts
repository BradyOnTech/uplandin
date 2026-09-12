import * as THREE from 'three';

/** Broad, layered deciduous foliage. Closed polygonal shoulders hold their
 * silhouette at a distance; irregular gaps between masses expose branches. */
export function buildPrairieCanopy(kind: 'cottonwood' | 'windbreak'): THREE.BufferGeometry {
  const masses = kind === 'windbreak' ? [
    [-.40, -.13, .10, .75, .63, .72],
    [.37, .02, -.14, .79, .65, .69],
    [.01, .50, .06, .56, .49, .52],
  ] : [
    [-.57, -.12, .08, .76, .49, .67],
    [.23, .04, -.21, .86, .51, .72],
    [.76, -.22, .24, .49, .39, .56],
    [-.14, .39, .04, .63, .40, .55],
    [-.24, -.39, -.44, .58, .35, .47],
  ];
  const positions: number[] = [], colors: number[] = [];
  const tone = new THREE.Color();
  const underside = new THREE.Color(0xaaa994), sunward = new THREE.Color(0xfff5d7);
  const triangle = (a: number[], b: number[], c: number[], variation: number) => {
    for (const p of [a, b, c]) {
      positions.push(...p);
      tone.copy(underside).lerp(sunward, THREE.MathUtils.smoothstep(p[1], -.7, .8)).multiplyScalar(variation);
      colors.push(tone.r, tone.g, tone.b);
    }
  };
  masses.forEach(([cx, cy, cz, sx, sy, sz], mass) => {
    const rings = [[-.65, .34], [-.20, 1], [.37, .84], [.70, .29]].map(([height, radius], level) =>
      Array.from({ length: 6 }, (_, i) => {
        const angle = i / 6 * Math.PI * 2 + mass * .61;
        // The same offsets at each shoulder keep faces broad and coherent.
        const spread = radius * (1 + Math.sin(i * 2.3 + mass) * .09);
        return [cx + Math.cos(angle) * sx * spread + height * .10,
          cy + sy * (height + Math.sin(i * 1.7 + mass * .9) * (level === 0 ? .025 : .055)),
          cz + Math.sin(angle) * sz * spread];
      }));
    const bottom = [cx - .05, cy - sy * .79, cz], top = [cx + .09, cy + sy * .80, cz + .03];
    for (let i = 0; i < 6; i++) {
      const next = (i + 1) % 6, variation = .96 + Math.sin(i * 2.4 + mass * 4.1) * .035;
      triangle(bottom, rings[0][i], rings[0][next], variation);
      for (let level = 0; level < rings.length - 1; level++) {
        triangle(rings[level][i], rings[level + 1][i], rings[level + 1][next], variation);
        triangle(rings[level][i], rings[level + 1][next], rings[level][next], variation);
      }
      triangle(rings.at(-1)![i], top, rings.at(-1)![next], variation);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
