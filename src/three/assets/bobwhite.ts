import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CHESTNUT = new THREE.Color(0x795d43);
const UMBER = new THREE.Color(0x423b31);
const BUFF = new THREE.Color(0xc3ad7d);
const IVORY = new THREE.Color(0xe4d8b7);
const INK = new THREE.Color(0x242b29);

/** Fold the span aft along the flanks, with the feather surfaces against the body. */
export function poseBobwhiteFoldedWings(left: THREE.Group, right: THREE.Group): void {
  left.rotation.set(0.95, -1.36, 0.15, 'YXZ');
  right.rotation.set(0.95, 1.36, -0.15, 'YXZ');
}

function paint(geometry: THREE.BufferGeometry, colorAt: (x: number, y: number, z: number, out: THREE.Color) => void): THREE.BufferGeometry {
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    colorAt(position.getX(i), position.getY(i), position.getZ(i), color);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}
function ellipsoid(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.Color, segments = 12): THREE.BufferGeometry {
  return paint(new THREE.SphereGeometry(1, segments, 8).scale(sx, sy, sz).translate(x,y,z), (_x,_y,_z,out) => out.copy(color));
}
function combine(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const joined = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  joined.computeBoundingSphere();
  return joined;
}

/** Compact rounded gamebird, with a bobwhite's white brow and black eye stripe. */
export function buildBobwhiteBody(): THREE.BufferGeometry {
  const torso = paint(new THREE.SphereGeometry(1, 16, 10).scale(0.038,0.038,0.085).translate(0,0.002,-0.009), (x,y,z,out) => {
    const back = THREE.MathUtils.smoothstep(y, -0.013, 0.025);
    out.copy(BUFF).lerp(CHESTNUT, back);
    // Broad feather scallops, economical enough to read as painted plumage.
    const row = Math.sin(z * 165 + Math.abs(x) * 73);
    if (row > 0.35) out.lerp(UMBER, 0.23 * (1 - back * 0.4));
    if (row < -0.7) out.lerp(IVORY, 0.12);
  });
  const neck = ellipsoid(0,0.026,0.056,0.025,0.029,0.031,BUFF);
  const head = paint(new THREE.SphereGeometry(1, 16, 12).scale(0.026,0.028,0.032).translate(0,0.047,0.082), (x,y,z,out) => {
    out.copy(CHESTNUT);
    if (Math.abs(x) > 0.009) {
      // A white supercilium above a dark eye line; throat is white below it.
      const line = 0.046 + (z - 0.082) * 0.11;
      if (y > line + 0.004 && y < line + 0.012) out.copy(IVORY);
      else if (y > line - 0.008 && y <= line + 0.004) out.copy(UMBER);
      else if (y < line - 0.008 && z > 0.075) out.copy(IVORY);
    }
    if (y > 0.063) out.copy(UMBER).lerp(CHESTNUT, 0.35);
  });
  const bill = new THREE.ConeGeometry(0.01,0.024,8).rotateX(Math.PI / 2).translate(0,0.041,0.12);
  paint(bill, (_x,_y,_z,out) => out.copy(INK));
  const parts = [torso, neck, head, bill];
  for (const side of [-1,1]) {
    parts.push(ellipsoid(side * 0.0245,0.052,0.090,0.0031,0.0032,0.003,INK,8));
    // Feet lie tucked behind the belly during flight, never hanging like a songbird.
    parts.push(ellipsoid(side * 0.016,-0.027,-0.055,0.006,0.003,0.021,UMBER,8));
  }
  // A short rounded fan is central to the quail silhouette.
  for (let feather = -2; feather <= 2; feather++) {
    const tail = ellipsoid(feather * 0.007,0,-0.094 - (2 - Math.abs(feather)) * 0.002,0.008,0.003,0.021,CHESTNUT,8);
    parts.push(tail);
  }
  return combine(parts);
}

/** A cambered wing with short rounded primaries; origin matches the shared shoulder. */
export function buildBobwhiteWing(side: -1 | 1): THREE.BufferGeometry {
  const positions: number[] = []; const colors: number[] = [];
  const add = (a: number[], b: number[], c: number[], color: THREE.Color) => {
    for (const vertex of [a,b,c]) { positions.push(vertex[0] * side,vertex[1],vertex[2]); colors.push(color.r,color.g,color.b); }
  };
  const rows = [
    { x:0, front:0.036, back:-0.033, y:0 },
    { x:0.044, front:0.036, back:-0.048, y:0.006 },
    { x:0.079, front:0.028, back:-0.043, y:0.002 },
    { x:0.108, front:0.017, back:-0.03, y:-0.005 },
    { x:0.124, front:0.002, back:-0.01, y:-0.012 },
  ];
  const shade = new THREE.Color();
  for (let row = 0; row < rows.length - 1; row++) {
    const a = rows[row], b = rows[row + 1];
    for (let strip = 0; strip < 6; strip++) {
      const t = strip / 6, next = (strip + 1) / 6;
      const at = (r: typeof a, f: number, lower = false) => [r.x, r.y + Math.sin(f * Math.PI) * 0.004 - (lower ? 0.002 : 0), r.front + (r.back - r.front) * f];
      const p = at(a,t), q = at(b,t), r = at(b,next), s = at(a,next);
      shade.copy(strip % 2 ? CHESTNUT : BUFF).lerp(UMBER, row * 0.11);
      if (side === 1) { add(p,q,r,shade);add(p,r,s,shade); }
      else { add(r,q,p,shade);add(s,r,p,shade); }
      const u=at(a,t,true),v=at(b,t,true),w=at(b,next,true),x=at(a,next,true);
      shade.copy(BUFF).lerp(UMBER, strip % 2 ? 0.28 : 0.1);
      if (side === 1) { add(w,v,u,shade);add(x,w,u,shade); }
      else { add(u,v,w,shade);add(u,w,x,shade); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return geometry;
}
