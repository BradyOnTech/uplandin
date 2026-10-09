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
    const width = .04 + rng() * .02, arc = .2 + outer * .55 + rng() * .2;
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
 * The low basal mat between bunches: blue grama and buffalograss, short
 * narrow blades in little upright clusters, so the ground at the boots
 * reads as sward rather than bare litter. Garnish only.
 */
export function kitMatGeometry(clusters = 3, blades = 4, seed = 0x3a7e): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  for (let c = 0; c < clusters; c++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * .7, cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    for (let i = 0; i < blades; i++) {
      const lean = rng() * Math.PI * 2, reach = .06 + rng() * .14, w = .03 + rng() * .015;
      const px = -Math.sin(lean) * w, pz = Math.cos(lean) * w, h = .6 + rng() * .4;
      const base = .76 + rng() * .06, tip = 1.0 + rng() * .1;
      positions.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + Math.cos(lean) * reach, h, cz + Math.sin(lean) * reach);
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
      colors.push(base, base, base * .96, base, base, base * .96, tip, tip, tip * .96);
    }
  }
  return finish(positions, normals, colors, 'kit-mat');
}

/**
 * Flowering culms over the bunches: a few thin stalks, each carrying a
 * slim pale head (little bluestem fluff, needle-and-thread awns) that
 * catches the light above the sward. Garnish only.
 */
export function kitCulmGeometry(stalks = 3, seed = 0xc017): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const tri = (a: number[], sa: number, b: number[], sb: number, c: number[], sc: number) => {
    positions.push(...a, ...b, ...c); normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    colors.push(sa, sa, sa * .96, sb, sb, sb * .96, sc, sc, sc * .96);
  };
  for (let k = 0; k < stalks; k++) {
    const a = rng() * Math.PI * 2, r = rng() * .25, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const lean = rng() * Math.PI * 2, bend = .14 + rng() * .2, h = .82 + rng() * .18, w = .012;
    const tx = x + Math.cos(lean) * bend, tz = z + Math.sin(lean) * bend, sx = -Math.sin(lean), sz = Math.cos(lean);
    const head = h * .72;
    const hx = x + Math.cos(lean) * bend * .7, hz = z + Math.sin(lean) * bend * .7;
    tri([x - sx * w, 0, z - sz * w], .7, [x + sx * w, 0, z + sz * w], .7, [hx, head, hz], .95);
    // The head: a narrow pale lozenge continuing the stalk.
    const hw = .016 + rng() * .01;
    tri([hx - sx * hw, head, hz - sz * hw], 1.02, [hx + sx * hw, head, hz + sz * hw], 1.02, [tx, h, tz], 1.08);
  }
  return finish(positions, normals, colors, 'kit-culm');
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
    // A zigzag rim: the skirt's top never reads as one smooth ribbon.
    rim.push(new THREE.Vector3(Math.cos(a) * r1, (i % 2 ? .16 : .38) + rng() * .08, Math.sin(a) * r1));
  }
  // A shallow cone closes the top: looking down into an open skirt from
  // eye height reads as a tray. Its blades hide it from the side.
  const heart = new THREE.Vector3(0, .34, 0);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    tri(base[i], .74, base[j], .74, rim[j], .84); tri(base[i], .74, rim[j], .84, rim[i], .84);
    tri(rim[i], .84, rim[j], .84, heart, .8);
  }
  // Rings of narrow leaning blades break the top edge into grass: the outer
  // ring fountains past the skirt, the inner rings stand taller. Narrow and
  // tall, so even a wide, short mass keeps a grass silhouette.
  const rings = [{ n: sides * 2, r: .84, lean: .26, h: .86 }, { n: sides + 2, r: .52, lean: .16, h: 1.0 }, { n: Math.max(4, sides - 2), r: .22, lean: .08, h: 1.1 }];
  for (const ring of rings) for (let k = 0; k < ring.n; k++) {
    const a = (k / ring.n) * Math.PI * 2 + (rng() - .5) * .5;
    const r = ring.r * (.85 + rng() * .25), width = .045 + rng() * .02;
    const cx = Math.cos(a), cz = Math.sin(a), sx = -cz, sz = cx;
    const left = new THREE.Vector3(cx * r - sx * width, .12, cz * r - sz * width);
    const right = new THREE.Vector3(cx * r + sx * width, .12, cz * r + sz * width);
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
 * A woody clump: buckbrush, chokecherry, buffaloberry, plum. Built the way
 * the sward masses are, because that reads as growth: a low solid core
 * under rings of broad twiggy sprays, fanning out and up into a ragged
 * crown, mottled spray by spray. Taller, darker and coarser than grass, so
 * a thicket reads as brush from the crest and up close, never as a stone.
 */
export function kitShrubGeometry(sides = 8, sprays = 48, seed = 0x5b0b): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const push = (x: number, y: number, z: number, shade: number) => { positions.push(x, y, z); normals.push(0, 1, 0); colors.push(shade, shade, shade); };
  const base: [number, number][] = [], rim: [number, number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2, r0 = .55 + rng() * .15, r1 = .72 + rng() * .14;
    base.push([Math.cos(a) * r0, Math.sin(a) * r0]);
    rim.push([Math.cos(a) * r1, .38 + rng() * .1, Math.sin(a) * r1]);
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    push(base[i][0], -.04, base[i][1], .42); push(base[j][0], -.04, base[j][1], .42); push(rim[j][0], rim[j][1], rim[j][2], .58);
    push(base[i][0], -.04, base[i][1], .42); push(rim[j][0], rim[j][1], rim[j][2], .58); push(rim[i][0], rim[i][1], rim[i][2], .58);
    // A domed top, so the core never reads as a pit from above.
    push(rim[i][0], rim[i][1], rim[i][2], .58); push(rim[j][0], rim[j][1], rim[j][2], .58); push(0, .62, 0, .66);
  }
  // Sprays: outer ones fan low and wide, inner ones stand tall.
  for (let k = 0; k < sprays; k++) {
    const t = k / sprays, a = k * 2.39996 + rng() * .4, inner = 1 - t;
    const r = .12 + t * .62, lean = .08 + t * .26, h = .8 + inner * .28 + rng() * .14;
    const w = .05 + rng() * .035, y0 = .22 + rng() * .14;
    const cx = Math.cos(a), cz = Math.sin(a), sx = -cz, sz = cx;
    const tone = .78 + rng() * .4;
    push(cx * r - sx * w, y0, cz * r - sz * w, .55 * tone); push(cx * r + sx * w, y0, cz * r + sz * w, .55 * tone);
    push(cx * (r + lean) + sx * (rng() - .5) * .12, h, cz * (r + lean) + sz * (rng() - .5) * .12, .9 * tone);
  }
  return finish(positions, normals, colors, 'kit-shrub');
}
