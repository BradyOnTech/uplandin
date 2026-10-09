import * as THREE from 'three';
import { mulberry32 } from '../../game/math';

/*
 * Unit-height geometry for the kit's vegetation. Every piece is authored at
 * height 1 and footprint radius ~1 so instances scale to the cover map's
 * crown height and spacing, and position.y doubles as the wind bend weight.
 * Vertex colour carries only light and shade (root dark, tops lit); the
 * instance colour carries the species.
 */

function finish(positions: number[], normals: number[], colors: number[], kind: string): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  geometry.userData = { kind, triangles: positions.length / 9 };
  return geometry;
}

/**
 * A chunky grass tuft: broad tapered blades fanned from one crown, tips
 * arcing out. Blade-level garnish near the hunter and dog; normals point up
 * so the tuft shades like the ground beneath it.
 */
export function kitTuftGeometry(blades = 9, seed = 0x7af7): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const vertex = (x: number, y: number, z: number, shade: number) => {
    positions.push(x, y, z); normals.push(0, 1, 0); colors.push(shade, shade, shade * .96);
  };
  for (let i = 0; i < blades; i++) {
    // Inner blades stand, outer blades fountain out and droop: a bunch, not
    // a rosette of spikes.
    const outer = i / Math.max(1, blades - 1);
    const yaw = i * 2.39996 + rng() * .5;
    const ox = Math.cos(yaw), oz = Math.sin(yaw), sx = -oz, sz = ox;
    const root = .04 + rng() * .1, height = .72 + rng() * .3 - outer * .22;
    const width = .05 + rng() * .025, arc = .2 + outer * .55 + rng() * .2;
    // Three nodes along an arc: stiff at the root, bending through the top.
    const nodes = [0, .5, .82, 1].map(t => {
      const bend = arc * t * t;
      return { x: ox * (root + bend), y: height * (t - bend * .35 * t), z: oz * (root + bend), w: width * (1 - t * .78) };
    });
    // Roots match the sward floor beneath, so the field reads as one
    // continuous grass with lit tips, not tufts on bare ground.
    const dark = .74 + rng() * .06, tip = 1.02 + rng() * .1;
    const shade = (t: number) => dark + (tip - dark) * t;
    const levels = [0, .5, .82, 1];
    for (let k = 0; k < 3; k++) {
      const a = nodes[k], b = nodes[k + 1];
      const sa = shade(levels[k]), sb = shade(levels[k + 1]);
      if (k < 2) {
        vertex(a.x - sx * a.w, a.y, a.z - sz * a.w, sa); vertex(a.x + sx * a.w, a.y, a.z + sz * a.w, sa); vertex(b.x + sx * b.w, b.y, b.z + sz * b.w, sb);
        vertex(a.x - sx * a.w, a.y, a.z - sz * a.w, sa); vertex(b.x + sx * b.w, b.y, b.z + sz * b.w, sb); vertex(b.x - sx * b.w, b.y, b.z - sz * b.w, sb);
      } else {
        vertex(a.x - sx * a.w, a.y, a.z - sz * a.w, sa); vertex(a.x + sx * a.w, a.y, a.z + sz * a.w, sa); vertex(b.x, b.y, b.z, sb);
      }
    }
  }
  return finish(positions, normals, colors, 'kit-tuft');
}

/**
 * The low basal mat between bunches: blue grama and buffalograss curls,
 * short leaning blades spread over the footprint. Garnish at the boots.
 */
export function kitMatGeometry(blades = 10, seed = 0x3a7e): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  for (let i = 0; i < blades; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * .9, lean = rng() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, reach = .18 + rng() * .3, w = .06 + rng() * .04;
    const px = -Math.sin(lean) * w, pz = Math.cos(lean) * w, h = .55 + rng() * .45;
    const base = .76 + rng() * .06, tip = 1.0 + rng() * .1;
    positions.push(x - px, 0, z - pz, x + px, 0, z + pz, x + Math.cos(lean) * reach, h, z + Math.sin(lean) * reach);
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    colors.push(base, base, base * .96, base, base, base * .96, tip, tip, tip * .96);
  }
  return finish(positions, normals, colors, 'kit-mat');
}

/**
 * A faceted sward mass: a low tussock body whose crown breaks into a ring
 * of broad points. Overlapping masses close into a continuous sward with a
 * serrated top edge; facets catch the sun on one side and fall to shade on
 * the other. `sides` sets the facet count (fewer far away).
 */
export function kitMassGeometry(sides = 7, seed = 0x3a55): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  // Shade is light and shade only, by height: dark roots, lit points. The
  // whole mass takes the sky's normal, like the ground it covers, so it
  // reads as a soft sward volume and never as a faceted stone.
  const push = (p: THREE.Vector3, shade: number) => { positions.push(p.x, p.y, p.z); normals.push(0, 1, 0); colors.push(shade, shade, shade * .97); };
  const tri = (a: THREE.Vector3, sa: number, b: THREE.Vector3, sb: number, c: THREE.Vector3, sc: number) => { push(a, sa); push(b, sb); push(c, sc); };
  const base: THREE.Vector3[] = [], rim: THREE.Vector3[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const r0 = .8 + rng() * .12, r1 = .86 + rng() * .1;
    base.push(new THREE.Vector3(Math.cos(a) * r0, -.05, Math.sin(a) * r0));
    rim.push(new THREE.Vector3(Math.cos(a) * r1, .34 + rng() * .08, Math.sin(a) * r1));
  }
  const heart = new THREE.Vector3(0, .4, 0);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    // A low skirt closes the body, so the mass is solid from the side.
    tri(base[i], .74, base[j], .74, rim[j], .84); tri(base[i], .74, rim[j], .84, rim[i], .84);
    tri(rim[i], .84, rim[j], .84, heart, .82);
  }
  // Rings of narrow leaning blades break the top edge into grass: the outer
  // ring fountains past the skirt, the inner rings stand taller. Narrow and
  // tall, so even a wide, short mass keeps a grass silhouette.
  const rings = [{ n: sides * 2 - 2, r: .82, lean: .26, h: .86 }, { n: sides + 2, r: .52, lean: .16, h: 1.0 }, { n: Math.max(4, sides - 2), r: .22, lean: .08, h: 1.1 }];
  for (const ring of rings) for (let k = 0; k < ring.n; k++) {
    const a = (k / ring.n) * Math.PI * 2 + (rng() - .5) * .5;
    const r = ring.r * (.85 + rng() * .25), width = .045 + rng() * .02;
    const cx = Math.cos(a), cz = Math.sin(a), sx = -cz, sz = cx;
    const left = new THREE.Vector3(cx * r - sx * width, .3, cz * r - sz * width);
    const right = new THREE.Vector3(cx * r + sx * width, .3, cz * r + sz * width);
    const lean = ring.lean * (.7 + rng() * .6);
    const tip = new THREE.Vector3(cx * (r + lean) + sx * (rng() - .5) * .1, ring.h * (.85 + rng() * .25), cz * (r + lean) + sz * (rng() - .5) * .1);
    tri(left, .84, right, .84, tip, 1.04 + rng() * .06);
  }
  return finish(positions, normals, colors, `kit-mass-${sides}`);
}

/**
 * A tall-cover mass, open at dog height: dark stems rise to a band of pale
 * seed heads, so a dog inside the stand is a shape against stems instead of
 * lost in a solid wall. CRP switchgrass, big bluestem, cattail.
 */
export function kitStandGeometry(stems = 14, heads = 16, seed = 0x57a4): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const tri = (a: number[], sa: number, b: number[], sb: number, c: number[], sc: number) => {
    positions.push(...a, ...b, ...c); normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    colors.push(sa, sa, sa * .97, sb, sb, sb * .97, sc, sc, sc * .97);
  };
  for (let k = 0; k < stems; k++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * .8, w = .022 + rng() * .012, top = .55 + rng() * .25;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, lean = (rng() - .5) * .16, sx = -Math.sin(a), sz = Math.cos(a);
    tri([x - sx * w, 0, z - sz * w], .5, [x + sx * w, 0, z + sz * w], .5, [x + lean, top, z + lean * .5], .72);
  }
  // Heads: a ragged band of narrow pale spikes high in the stand.
  for (let k = 0; k < heads; k++) {
    const a = (k / heads) * Math.PI * 2 + (rng() - .5) * .4, r = .15 + Math.sqrt(rng()) * .75;
    const cx = Math.cos(a), cz = Math.sin(a), sx = -cz, sz = cx, w = .05 + rng() * .03, base = .52 + rng() * .14;
    const lean = .1 + rng() * .18, tip = .9 + rng() * .25;
    tri([cx * r - sx * w, base, cz * r - sz * w], .86, [cx * r + sx * w, base, cz * r + sz * w], .86,
      [cx * (r + lean), tip, cz * (r + lean)], 1.08 + rng() * .06);
  }
  return finish(positions, normals, colors, 'kit-stand');
}

/**
 * A woody clump: buckbrush, chokecherry, plum. A broad faceted crown on a
 * short dark skirt, open enough at the base to read as shrub, not boulder.
 */
export function kitShrubGeometry(lobes = 5, twigs = 22, seed = 0x5b0b): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, shade: (p: THREE.Vector3) => number, soft: number) => {
    e1.subVectors(b, a); e2.subVectors(c, a); nn.crossVectors(e1, e2).normalize().lerp(up, soft).normalize();
    for (const q of [a, b, c]) { positions.push(q.x, q.y, q.z); normals.push(nn.x, nn.y, nn.z); const s = shade(q); colors.push(s, s, s); }
  };
  // Overlapping faceted lobes make an irregular crown: dark at the base,
  // lit on top, softened toward the sky so it reads as foliage.
  const lobeShade = (q: THREE.Vector3) => .5 + Math.min(1, Math.max(0, q.y)) * .45;
  for (let l = 0; l < lobes; l++) {
    const a = l / lobes * Math.PI * 2 + rng() * .8, off = l === 0 ? 0 : .34 + rng() * .22;
    const cx = Math.cos(a) * off, cz = Math.sin(a) * off;
    const sx = .42 + rng() * .16, sy = .4 + rng() * .14, cy = .5 + rng() * .18 - off * .25;
    const ico = new THREE.IcosahedronGeometry(1, 0), p = ico.getAttribute('position');
    const at = (i: number) => new THREE.Vector3(cx + p.getX(i) * sx, Math.max(.02, cy + p.getY(i) * sy), cz + p.getZ(i) * sx * (.85 + rng() * .1));
    for (let i = 0; i < p.count; i += 3) tri(at(i), at(i + 1), at(i + 2), lobeShade, .55);
    ico.dispose();
  }
  // Bare twigs and leafy sprays break the crown's outline, so a thicket
  // reads as brush up close and not as a boulder.
  const twigShade = (q: THREE.Vector3) => .55 + Math.min(1.2, q.y) * .3;
  for (let k = 0; k < twigs; k++) {
    const a = rng() * Math.PI * 2, r = .3 + rng() * .5, h = .55 + rng() * .4;
    const cx = Math.cos(a), cz = Math.sin(a), sx = -cz, sz = cx, w = .035 + rng() * .02;
    const base = new THREE.Vector3(cx * r * .6, h * .55, cz * r * .6);
    const tip = new THREE.Vector3(cx * (r + .32 + rng() * .2), h + .18 + rng() * .2, cz * (r + .32 + rng() * .2));
    tri(new THREE.Vector3(base.x - sx * w, base.y, base.z - sz * w), new THREE.Vector3(base.x + sx * w, base.y, base.z + sz * w), tip, twigShade, .5);
  }
  return finish(positions, normals, colors, 'kit-shrub');
}

/**
 * Crest fringe: two crossed vertical strips with a ragged top edge, the
 * grass silhouette a swell shows against the sky. Width 2 along x and z.
 */
export function kitFringeGeometry(seed = 0xf41e): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const teeth = 9;
  for (const axis of [0, 1]) {
    for (let i = 0; i < teeth; i++) {
      const u0 = -1 + (i / teeth) * 2, u1 = -1 + ((i + 1) / teeth) * 2, um = (u0 + u1) / 2 + (rng() - .5) * .08;
      const h = .7 + rng() * .3, shoulder = .45 + rng() * .1;
      const P = (u: number, y: number): [number, number, number] => axis ? [0, y, u] : [u, y, 0];
      const quad = [P(u0, 0), P(u1, 0), P(u1, shoulder), P(u0, shoulder)];
      const push = (q: [number, number, number], s: number) => { positions.push(...q); normals.push(0, 1, 0); colors.push(s, s, s * .96); };
      push(quad[0], .55); push(quad[1], .55); push(quad[2], .85);
      push(quad[0], .55); push(quad[2], .85); push(quad[3], .85);
      push(quad[3], .85); push(quad[2], .85); push(P(um, h), 1.04);
    }
  }
  return finish(positions, normals, colors, 'kit-fringe');
}
