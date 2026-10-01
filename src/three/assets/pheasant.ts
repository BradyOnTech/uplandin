import { pheasantWingPhase } from '../pheasantWingMotion';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Authored around the shared bird shoulder; +Z is forward. Geometry is
// shared across the pool, vertex colored, and requires no image textures.
// October 2026: the body is one lofted, flat-shaded form painted per facet,
// so a rooster flushing at a metre reads as a ringneck rather than a set of
// ovals: a green head with a red face and ear tufts, a white collar, copper
// breast, gold spotted flanks, a scalloped mantle and a slate rump. Barred
// tail feathers fan on the climb and the legs hang before they tuck.
const hex = (value: number) => new THREE.Color(value);
const dark = hex(0x2a2118), ivory = hex(0xe3d9b8);
const ROOSTER = {
  head: hex(0x245c40), sheen: hex(0x3b2d58), face: hex(0xb3261e), collar: hex(0xece6d6), neck: hex(0x5a2c34),
  breast: hex(0x8a3a1c), flank: hex(0xc4954a), mantle: hex(0x9a5a2c), buff: hex(0xd2b27a),
  rump: hex(0x6d7d76), belly: hex(0x4a3426), bill: hex(0xd8cba6),
  coverts: hex(0xb8a57e), primary: hex(0x7a5f40), primaryBar: hex(0xd2be94), tail: hex(0xa88b58), tailBar: hex(0x3a2c1e),
  legs: hex(0x6e6152),
};
const HEN = {
  head: hex(0xb08f63), sheen: hex(0x8e7150), face: hex(0xb08f63), collar: hex(0xb39468), neck: hex(0xb39468),
  breast: hex(0xc2a275), flank: hex(0xc6a77a), mantle: hex(0x9c7a52), buff: hex(0xdcc49a),
  rump: hex(0xa88a62), belly: hex(0xd0b994), bill: hex(0xcbbd98),
  coverts: hex(0xb49a70), primary: hex(0x7a6044), primaryBar: hex(0xd2bd92), tail: hex(0xa98a5e), tailBar: hex(0x4c3a26),
  legs: hex(0x7d6f5c),
};
type Palette = typeof ROOSTER;
const palette = (hen: boolean): Palette => hen ? HEN : ROOSTER;

function paint(geo: THREE.BufferGeometry, base: THREE.Color, patterned = false) {
  const p = geo.attributes.position, colors = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.copy(base);
    if (patterned) {
      const scallop = Math.sin(p.getZ(i) * 185 + Math.abs(p.getX(i)) * 95);
      c.lerp(dark, scallop > .5 ? .34 : .05);
      if (scallop < -.65) c.lerp(ivory, .22);
    }
    colors.set([c.r,c.g,c.b],i*3);
  }
  geo.setAttribute('color',new THREE.BufferAttribute(colors,3)); geo.deleteAttribute('uv');
  return geo;
}
function oval(x:number,y:number,z:number,sx:number,sy:number,sz:number,c:THREE.Color,pattern=false,segments=10,rings=6) {
  return paint(new THREE.SphereGeometry(1,segments,rings).scale(sx,sy,sz).translate(x,y,z),c,pattern);
}
function join(parts:THREE.BufferGeometry[]) {
  const normalized=parts.map(p=>p.index?p.toNonIndexed():p);
  const geo=mergeGeometries(normalized)!;
  new Set([...parts,...normalized]).forEach(p=>p.dispose());
  geo.computeBoundingSphere(); return geo;
}

/** A deterministic 0..1 value per facet, so spots stay put on every bird. */
function facetNoise(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

interface Station { z: number; y: number; w: number; top: number; bottom: number }
/** Rump to bill, model units: deep breast, slim neck, small round head. */
const STATIONS: readonly Station[] = [
  { z: -.106, y: .001, w: .010, top: .009, bottom: .009 },
  { z: -.090, y: .002, w: .024, top: .021, bottom: .019 },
  { z: -.064, y: .002, w: .035, top: .031, bottom: .031 },
  { z: -.034, y: .001, w: .041, top: .037, bottom: .039 },
  { z: -.004, y: .001, w: .042, top: .038, bottom: .043 },
  { z: .024, y: .004, w: .039, top: .035, bottom: .041 },
  { z: .048, y: .010, w: .031, top: .029, bottom: .033 },
  { z: .066, y: .019, w: .021, top: .021, bottom: .022 },
  { z: .080, y: .026, w: .018, top: .018, bottom: .018 },
  { z: .096, y: .034, w: .016, top: .016, bottom: .016 },
  { z: .112, y: .042, w: .017, top: .017, bottom: .016 },
  { z: .126, y: .048, w: .019, top: .019, bottom: .016 },
  { z: .142, y: .050, w: .019, top: .019, bottom: .015 },
  { z: .156, y: .048, w: .013, top: .014, bottom: .011 },
  { z: .166, y: .045, w: .007, top: .007, bottom: .006 },
];
const SEGMENTS = 12;

/** One body facet's colour from its centre and its angle around the body
 * (0 on the back, pi under the belly). */
function bodyFacetColor(pal: Palette, hen: boolean, x: number, y: number, z: number, angle: number): THREE.Color {
  const up = Math.cos(angle), side = Math.abs(Math.sin(angle)), n = facetNoise(x, y, z);
  if (z > .114) {
    if (!hen && z > .13 && z < .153 && side > .62 && up > -.3 && up < .55) return pal.face.clone();
    const head = pal.head.clone();
    if (hen) return n < .3 ? head.lerp(pal.mantle, .55) : head;
    // Mostly green, with a purple sheen on some crown facets.
    return up > .5 ? head.lerp(pal.sheen, .1 + n * .3) : head.lerp(pal.sheen, n * .15);
  }
  if (z > .071 && z < .089) return pal.collar.clone();
  if (z > .050) return pal.neck.clone().lerp(hen ? pal.mantle : pal.sheen, n * .3);
  if (up > .42) {
    if (z < -.042) return pal.rump.clone().lerp(dark, n < .25 ? .35 : 0);
    if (n < .28) return pal.mantle.clone().lerp(dark, .58);
    if (n > .8) return pal.buff.clone();
    return pal.mantle.clone();
  }
  if (up < -.55) return pal.belly.clone().lerp(dark, n * .2);
  if (z > .004) return pal.breast.clone().lerp(dark, n < .2 ? .4 : 0);
  return pal.flank.clone().lerp(dark, n < .26 ? .55 : 0);
}

function loftBody(pal: Palette, hen: boolean): THREE.BufferGeometry {
  const ring = (s: Station, k: number) => {
    const a = k / SEGMENTS * Math.PI * 2, c = Math.cos(a);
    return new THREE.Vector3(Math.sin(a) * s.w, s.y + c * (c > 0 ? s.top : s.bottom), s.z);
  };
  const pos: number[] = [], col: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) => {
    for (const v of [a, b, c]) { pos.push(v.x, v.y, v.z); col.push(color.r, color.g, color.b); }
  };
  for (let i = 0; i < STATIONS.length - 1; i++) {
    for (let k = 0; k < SEGMENTS; k++) {
      const a = ring(STATIONS[i], k), b = ring(STATIONS[i], k + 1), c = ring(STATIONS[i + 1], k + 1), d = ring(STATIONS[i + 1], k);
      const centre = a.clone().add(b).add(c).add(d).multiplyScalar(.25);
      const color = bodyFacetColor(pal, hen, centre.x, centre.y, centre.z, (k + .5) / SEGMENTS * Math.PI * 2);
      tri(a, c, b, color); tri(a, d, c, color);
    }
  }
  const first = STATIONS[0], last = STATIONS[STATIONS.length - 1];
  const tailEnd = new THREE.Vector3(0, first.y, first.z - .004), billBase = new THREE.Vector3(0, last.y, last.z + .003);
  for (let k = 0; k < SEGMENTS; k++) {
    tri(tailEnd, ring(first, k), ring(first, k + 1), pal.rump);
    tri(billBase, ring(last, k + 1), ring(last, k), pal.head);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

export function buildPheasantBody(hen=false):THREE.BufferGeometry {
  const pal = palette(hen);
  const parts: THREE.BufferGeometry[] = [loftBody(pal, hen)];
  // A short, slightly hooked ivory bill.
  parts.push(paint(new THREE.ConeGeometry(.0062,.021,6).rotateX(Math.PI/2+.22).translate(0,.043,.176),pal.bill));
  for (const side of [-1,1]) {
    parts.push(oval(side*.0172,.0525,.145,.0026,.003,.003,dark,false,6,4));
    if (!hen) {
      // The red face stands proud of the head; ear tufts rise behind it.
      parts.push(oval(side*.0158,.0485,.1415,.0058,.0115,.0145,pal.face,false,8,5));
      parts.push(paint(new THREE.ConeGeometry(.0034,.012,4).rotateX(-.75).translate(side*.0068,.0665,.129),pal.head));
    }
  }
  // The white collar is its own band so it holds the silhouette edge.
  if (!hen) parts.push(paint(new THREE.CylinderGeometry(.0203,.0213,.0095,SEGMENTS,1,true).rotateX(Math.PI/2).translate(0,.026,.080),pal.collar));
  const geo=join(parts);
  if(hen) geo.scale(.92,.94,.95);
  // A shared relaxed-neck target keeps the carried bird from looking alert.
  // Bend progressively above the shoulder; the torso and grip stay fixed.
  const relaxed=geo.clone(), p=relaxed.getAttribute('position');
  for(let i=0;i<p.count;i++) {
    const z=p.getZ(i), y=p.getY(i), angle=1.2*THREE.MathUtils.smoothstep(z,.045,.105);
    const dy=y-.015, dz=z-.055;
    p.setY(i,.015+dy*Math.cos(angle)-dz*Math.sin(angle));
    p.setZ(i,.055+dy*Math.sin(angle)+dz*Math.cos(angle));
  }
  relaxed.computeVertexNormals();
  geo.morphAttributes.position=[p.clone()];
  geo.morphAttributes.normal=[relaxed.getAttribute('normal').clone()];
  geo.morphAttributes.position[0].name='relaxed-neck';
  relaxed.dispose();
  geo.computeBoundingSphere();
  return geo;
}

/** Rounded, overlapping flight feathers; both faces are physical geometry. */
function feather(length:number,width:number,color:THREE.Color,bars=false,barColor=dark) {
  const pos:number[]=[],cols:number[]=[];
  const tri=(a:number[],b:number[],c:number[],tone:THREE.Color)=>{for(const v of [a,b,c]){pos.push(...v);cols.push(tone.r,tone.g,tone.b);}};
  const rows=8;
  for(let i=0;i<rows;i++) {
    const t=i/rows,u=(i+1)/rows;
    const at=(f:number,side:number,top:boolean)=>[side*width*(.25+.75*Math.sin(Math.PI*(.12+f*.88)))*.5,
      (top?1:-1)*.0015*Math.sin(Math.PI*f),-length*f];
    const tone=bars && i%3===1?barColor:color;
    for(const top of [true,false]) {
      const a=at(t,-1,top),b=at(t,1,top),c=at(u,1,top),d=at(u,-1,top);
      if(top){tri(a,b,c,tone);tri(a,c,d,tone);}else{tri(c,b,a,tone);tri(d,c,a,tone);}
    }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));geo.computeVertexNormals();return geo;
}

/** The long barred tail: seven feathers, the central pair longest. Its
 * `fan` morph spreads them for the climb. */
export function buildPheasantTail(hen=false):THREE.BufferGeometry {
  const pal = palette(hen);
  const lengths = hen ? [.098, .118, .138, .158] : [.15, .19, .225, .262];
  const build = (spread: number) => {
    const parts:THREE.BufferGeometry[]=[];
    for(let i=-3;i<=3;i++) {
      const length=lengths[3-Math.abs(i)];
      const tone=pal.tail.clone().lerp(dark, Math.abs(i)*.05);
      parts.push(feather(length,.0145,tone,true,pal.tailBar).rotateY(i*(.05+spread)).translate(i*.0045,Math.abs(i)*-.0008,0));
    }
    return join(parts);
  };
  const geo=build(0), fanned=build(.1);
  geo.morphAttributes.position=[fanned.getAttribute('position').clone()];
  geo.morphAttributes.normal=[fanned.getAttribute('normal').clone()];
  geo.morphAttributes.position[0].name='fan';
  fanned.dispose();
  geo.computeBoundingSphere();
  return geo;
}

export function buildPheasantWing(side:-1|1,hen=false):THREE.BufferGeometry {
  const pal = palette(hen);
  const parts:THREE.BufferGeometry[]=[];
  // Rounded hand with separate trailing feather ends, broad at the elbow.
  parts.push(oval(side*.047,.002,-.002,.057,.005,.043,pal.coverts,true));
  for(let i=0;i<9;i++) {
    const x=.027+i*.015;
    const length=.084-Math.pow(i/9,3)*.040;
    // Brown primaries barred with buff, darkening toward the wingtip.
    const tone=pal.primary.clone().lerp(i<3?pal.coverts:dark,i<3?.35-i*.1:i/9*.3);
    parts.push(feather(length,.024,tone,true,pal.primaryBar).rotateY(-side*(.12+i*.045)).translate(side*x,-.001,.027-i*.002));
  }
  const geo=join(parts);
  // The hand folds at the wrist during recovery. Keep the shoulder fixed,
  // retaining one mesh and shared topology instead of a rigid paddle or a
  // separate draw call for every feather. The power stroke uses the complete
  // rounded wing; the recovery target brings the primaries in and aft.
  const recovery=geo.clone(), p=recovery.getAttribute('position');
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i), span=side*x, beyondWrist=Math.max(0,span-.064);
    const angle=.95*THREE.MathUtils.smoothstep(span,.064,.116);
    p.setX(i,side*(span-beyondWrist*(1-Math.cos(angle))));
    p.setZ(i,p.getZ(i)-beyondWrist*Math.sin(angle));
    p.setY(i,p.getY(i)+beyondWrist*.18);
  }
  recovery.computeVertexNormals();
  geo.morphAttributes.position=[p.clone()];
  geo.morphAttributes.normal=[recovery.getAttribute('normal').clone()];
  geo.morphAttributes.position[0].name='recovery-fold';
  recovery.dispose();
  geo.computeBoundingSphere();
  return geo;
}

/** Both legs hanging from the hip line (the mesh origin): grey shanks with
 * three forward toes and a hind toe. Rotate about X to tuck them aft. */
export function buildPheasantLegs(hen=false):THREE.BufferGeometry {
  const tone = palette(hen).legs, parts:THREE.BufferGeometry[]=[];
  for (const side of [-1,1]) {
    const x=side*.012;
    parts.push(paint(new THREE.CylinderGeometry(.0028,.0023,.05,5).translate(x,-.025,0),tone));
    for (const yaw of [-.45,0,.45]) {
      parts.push(paint(new THREE.CylinderGeometry(.0015,.0011,.02,4).rotateX(Math.PI/2).translate(0,0,.01).rotateY(yaw).translate(x,-.05,0),tone));
    }
    parts.push(paint(new THREE.CylinderGeometry(.0013,.001,.008,4).rotateX(Math.PI/2).translate(x,-.05,-.004),tone));
  }
  return join(parts);
}

/** Leg rotation about X from the launch clock: hanging on the jump, tucked aft
 * within the first strokes. */
export function pheasantLegTuck(airMs:number):number {
  return THREE.MathUtils.lerp(.35,1.45,THREE.MathUtils.smoothstep(airMs,180,700));
}

/** Tail spread from the launch clock: fanned on the climb, closing as the
 * bird levels out. */
export function pheasantTailFan(airMs:number,gliding:boolean):number {
  return gliding ? .3 : .1+.85*Math.exp(-Math.max(0,airMs)/800);
}

export function posePheasantFoldedWings(left: THREE.Group, right: THREE.Group): void {
  left.rotation.set(.35, -1.42, .10, 'YXZ');
  right.rotation.set(.35, 1.42, -.10, 'YXZ');
}

/** Same launch cadence as flight, with a narrow recovery and broad drive.
 * Values depend only on the flight clock, so pause and capture agree. */
export function pheasantWingbeat(seconds:number,hz:number,climb:number,phaseOffset=0):{angle:number;recovery:number} {
  const burst=Math.exp(-Math.max(0,seconds)/.55);
  const phase=pheasantWingPhase(seconds,hz,phaseOffset);
  return {
    angle:.05+Math.sin(phase)*(.58+climb*.28+burst*.28),
    // Positive angular velocity raises the wings. Open before the next
    // downward drive, rather than keeping the span rigid throughout.
    recovery:THREE.MathUtils.smoothstep(Math.cos(phase),-.15,.8),
  };
}
