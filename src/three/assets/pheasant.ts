import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Authored around the shared bird shoulder; +Z is forward. Geometry is
// shared across the pool, vertex colored, and requires no image textures.
const copper = new THREE.Color(0xa46535), buff = new THREE.Color(0xbca078);
const dark = new THREE.Color(0x514031), green = new THREE.Color(0x244c3e);
const ivory = new THREE.Color(0xe3d9b8), red = new THREE.Color(0xa83628);
function paint(geo: THREE.BufferGeometry, base: THREE.Color, patterned = false) {
  const p = geo.attributes.position, colors = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.copy(base);
    if (patterned) {
      const scallop = Math.sin(p.getZ(i) * 185 + Math.abs(p.getX(i)) * 95);
      c.lerp(dark, scallop > .5 ? .48 : .06);
      if (scallop < -.65) c.lerp(ivory, .22);
    }
    colors.set([c.r,c.g,c.b],i*3);
  }
  geo.setAttribute('color',new THREE.BufferAttribute(colors,3)); geo.deleteAttribute('uv');
  return geo;
}
function oval(x:number,y:number,z:number,sx:number,sy:number,sz:number,c:THREE.Color,pattern=false) {
  return paint(new THREE.SphereGeometry(1,10,6).scale(sx,sy,sz).translate(x,y,z),c,pattern);
}
function join(parts:THREE.BufferGeometry[]) {
  const normalized=parts.map(p=>p.index?p.toNonIndexed():p);
  const geo=mergeGeometries(normalized)!;
  new Set([...parts,...normalized]).forEach(p=>p.dispose());
  geo.computeBoundingSphere(); return geo;
}
export function buildPheasantBody(hen=false):THREE.BufferGeometry {
  const coat=hen?buff:copper;
  const parts=[
    oval(0,0,-.014,.041,.040,.094,coat,true),
    // Tapered shoulder into a distinct extended neck and small head.
    oval(0,.021,.066,.024,.026,.041,hen?buff:green),
    oval(0,.039,.105,.019,.022,.035,hen?buff:green),
    oval(0,.049,.135,.022,.023,.028,hen?buff:green),
  ];
  if(!hen) parts.push(paint(new THREE.CylinderGeometry(.024,.025,.008,12).rotateX(Math.PI/2).translate(0,.025,.078),ivory));
  for(const side of [-1,1]) {
    if(!hen) parts.push(oval(side*.020,.049,.144,.004,.014,.016,red));
    parts.push(oval(side*.023,.055,.147,.0025,.003,.003,dark));
    // Tucked legs trail under the belly in flight.
    parts.push(oval(side*.018,-.027,-.070,.004,.004,.030,dark));
  }
  parts.push(paint(new THREE.ConeGeometry(.007,.026,6).rotateX(Math.PI/2).translate(0,.041,.170),ivory));
  const geo=join(parts);
  if(hen) geo.scale(.92,.94,.95);
  return geo;
}

/** Rounded, overlapping flight feathers; both faces are physical geometry. */
function feather(length:number,width:number,color:THREE.Color,bars=false) {
  const pos:number[]=[],cols:number[]=[];
  const tri=(a:number[],b:number[],c:number[],tone:THREE.Color)=>{for(const v of [a,b,c]){pos.push(...v);cols.push(tone.r,tone.g,tone.b);}};
  const rows=8;
  for(let i=0;i<rows;i++) {
    const t=i/rows,u=(i+1)/rows;
    const at=(f:number,side:number,top:boolean)=>[side*width*(.25+.75*Math.sin(Math.PI*(.12+f*.88)))*.5,
      (top?1:-1)*.0015*Math.sin(Math.PI*f),-length*f];
    const tone=bars && i%3===1?dark:color;
    for(const top of [true,false]) {
      const a=at(t,-1,top),b=at(t,1,top),c=at(u,1,top),d=at(u,-1,top);
      if(top){tri(a,b,c,tone);tri(a,c,d,tone);}else{tri(c,b,a,tone);tri(d,c,a,tone);}
    }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));geo.computeVertexNormals();return geo;
}
export function buildPheasantTail(hen=false):THREE.BufferGeometry {
  const parts:THREE.BufferGeometry[]=[];
  for(let i=-2;i<=2;i++) {
    const length=(hen?.155:.245)-Math.abs(i)*.025;
    parts.push(feather(length,.014,hen?buff:copper,true).rotateY(i*.055).translate(i*.005,0,0));
  }
  return join(parts);
}
export function buildPheasantWing(side:-1|1,hen=false):THREE.BufferGeometry {
  const parts:THREE.BufferGeometry[]=[];
  // Rounded hand with separate trailing feather ends, broad at the elbow.
  parts.push(oval(side*.047,.002,-.002,.057,.005,.043,hen?buff:copper,true));
  for(let i=0;i<9;i++) {
    const x=.027+i*.015;
    const length=.084-Math.pow(i/9,3)*.040;
    const tone=(i%3===0?buff:hen?buff:copper).clone().lerp(dark,i/9*.35);
    parts.push(feather(length,.024,tone).rotateY(-side*(.12+i*.045)).translate(side*x,-.001,.027-i*.002));
  }
  return join(parts);
}

/** Sweep flight feathers aft against the flanks instead of lifting them. */
export function posePheasantFoldedWings(left: THREE.Group, right: THREE.Group): void {
  left.rotation.set(.35, -1.42, .10, 'YXZ');
  right.rotation.set(.35, 1.42, -.10, 'YXZ');
}
