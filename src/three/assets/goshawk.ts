import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Point = [number, number, number];
type Plumage = 'mantle' | 'breast' | 'nape' | 'flight' | 'tail' | 'down';

/** Pale juvenile plumage: tapered centres, soft margins and individual barbs.
 * Authored in texture space so detail follows each curved feather vane. */
function plumageTexture(kind: Plumage): THREE.DataTexture {
  const w=128,h=512,data=new Uint8Array(w*h*4);
  const pale=new THREE.Color(kind==='flight'?0xd6d0bd:0xe4dfcf);
  const dark=new THREE.Color(kind==='breast'||kind==='nape'?0x6e6250:0x93866f);
  const c=new THREE.Color();
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const u=x/(w-1)*2-1,v=y/(h-1),a=Math.abs(u);
    const noise=Math.sin(x*12.9898+y*78.233)*43758.5453;
    const grain=(noise-Math.floor(noise))-.5;
    let marking=0;
    if(kind==='mantle') {const edge=Math.sin(v*18+u*8)*.09+Math.sin(v*40-u*12)*.035;marking=(1-THREE.MathUtils.smoothstep(a,.20+edge,.68+edge))*(.18+.66*Math.pow(Math.sin(v*Math.PI),2));}
    if(kind==='breast'||kind==='nape') {
      const width=(kind==='nape'?.13:.20)*(.45+.55*Math.sin(v*Math.PI));
      marking=1-THREE.MathUtils.smoothstep(a+Math.sin(v*28)*.024,width*.45,width);
      marking*=THREE.MathUtils.smoothstep(v,.05,.22)*(1-THREE.MathUtils.smoothstep(v,.77,.98));
    }
    if(kind==='flight'||kind==='tail') {
      const bands=Math.sin((v+a*.035)*Math.PI*(kind==='tail'?9:12));
      marking=THREE.MathUtils.smoothstep(bands,.15,.58)*(kind==='tail'?.45:.40);
      marking+=.15*(1-a);
    }
    const barb=Math.sin((v+a*.18)*420+Math.sin(v*70)*.4);
    c.copy(pale).lerp(dark,Math.max(0,marking+grain*.065));
    c.multiplyScalar(1+grain*.025-Math.max(0,barb)*.045);
    if(a<.012)c.multiplyScalar(.83);
    if(a>.82)c.lerp(pale,(a-.82)*2);
    // DataTexture stores sRGB values; material lighting works in linear space.
    c.convertLinearToSRGB();const i=(y*w+x)*4;
    data[i]=Math.min(255,c.r*255);data[i+1]=Math.min(255,c.g*255);data[i+2]=Math.min(255,c.b*255);data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,w,h);texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}

/** Model-forward +Z. All anatomy is visual; pursuit and recovery stay in the
 * flight model. Static detail is merged within the articulated joints. */
export function createGoshawk() {
  const root=new THREE.Group(),body=new THREE.Group(),head=new THREE.Group();
  root.name='goshawk';body.name='breathing-body';head.name='scanning-head';root.add(body);body.add(head);
  head.position.set(0,.466,.055);
  const materials=new Map<number,THREE.MeshStandardMaterial>(),plumage=new Map<Plumage,THREE.MeshStandardMaterial>();
  const fanMeshes:THREE.Mesh[]=[];
  const textures:THREE.DataTexture[]=[];const skins:THREE.MeshStandardMaterial[]=[];
  const solid=(color:number)=>{let m=materials.get(color);if(!m){m=new THREE.MeshStandardMaterial({color,roughness:.86});materials.set(color,m);}return m;};
  const vane=(kind:Plumage)=>{let m=plumage.get(kind);if(!m){const map=plumageTexture(kind);textures.push(map);m=new THREE.MeshStandardMaterial({map,vertexColors:true,roughness:.98,side:THREE.DoubleSide,emissive:0xb6ad92,emissiveIntensity:.045});plumage.set(kind,m);}return m;};
  function oval(parent:THREE.Object3D,color:number,p:Point,s:Point) {
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),solid(color));mesh.position.set(...p);mesh.scale.set(...s);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function plumedOval(parent:THREE.Object3D,kind:Plumage,p:Point,r:Point,repeats:[number,number]) {
    const texture=vane(kind).map!.clone() as THREE.DataTexture;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(repeats[0],repeats[1]);texture.needsUpdate=true;textures.push(texture);
    const mat=new THREE.MeshStandardMaterial({map:texture,roughness:.98});skins.push(mat);
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,32,24),mat);mesh.position.set(...p);mesh.scale.set(...r);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  /** Rounded vane with a shallow central keel; its width lies tangent to the
   * body rather than always lying in the same plane as the back. */
  function feather(parent:THREE.Object3D,a:Point,b:Point,width:number,kind:Plumage,normal:Point=[0,0,-1],shade=1,conform?:{c:Point;r:Point}) {
    const start=new THREE.Vector3(...a),delta=new THREE.Vector3(...b).sub(start),n=new THREE.Vector3(...normal).normalize();
    const side=new THREE.Vector3().crossVectors(delta,n).normalize();
    const pos:number[]=[],uv:number[]=[],colors:number[]=[],indices:number[]=[];
    const rows=kind==='tail'||kind==='flight'?24:12,lanes=4;
    for(let row=0;row<=rows;row++){
      const t=(1-Math.cos(Math.PI*row/rows))/2;
      const longVane=kind==='tail'||kind==='flight';
      const cap=Math.min(.18,width/delta.length());
      const tip=Math.max(0,(t-(1-cap))/cap);
      const shape=longVane?(.45+.55*(1-Math.exp(-t*16)))*Math.sqrt(Math.max(0,1-tip*tip)):Math.pow(Math.sin(Math.PI*(.13+t*.87)),.58);
      const spread=width*(row===rows?.015:shape);
      for(let lane=0;lane<=lanes;lane++){
        const v=lane/lanes*2-1,p=start.clone().addScaledVector(delta,t).addScaledVector(side,v*spread);
        p.addScaledVector(n,Math.sin(Math.PI*t)*width*.12*(1-v*v));
        if(conform){
          const [cx,cy,cz]=conform.c,[rx,ry,rz]=conform.r;
          const q=new THREE.Vector3((p.x-cx)/rx,(p.y-cy)/ry,(p.z-cz)/rz).normalize();
          const lift=.001+t*.003+(1-v*v)*.0006;
          p.set(cx+q.x*(rx+lift),cy+q.y*(ry+lift),cz+q.z*(rz+lift));
        }
        pos.push(p.x,p.y,p.z);uv.push(lane/lanes,t);colors.push(shade,shade,shade);
        if(row<rows&&lane<lanes){const i=row*(lanes+1)+lane;indices.push(i,i+lanes+1,i+1,i+1,i+lanes+1,i+lanes+2);}
      }
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,vane(kind));parent.add(mesh);return mesh;
  }
  // The pear-shaped chest flows into a narrow raised neck. Wing shoulders
  // carry the width; no separate spherical collar or round belly bib.
  const torso={c:[0,.294,.009] as Point,r:[.091,.159,.087] as Point};
  plumedOval(body,'breast',torso.c,torso.r,[18,10]);
  plumedOval(body,'nape',[0,.411,.039],[.051,.067,.055],[15,7]);
  // Feather tracts wrap the torso and neck. Rows are built from bottom to
  // top so the overlapping upper row covers the roots of the row below it.
  for(let row=0;row<13;row++) {
    const y=.185+row*.022,section=Math.sqrt(Math.max(.1,1-((y-.294)/.159)**2));
    for(let col=0;col<20;col++) {
      const angle=col/20*Math.PI*2+(row%2)*.12+Math.sin(col*7+row*3)*.025;
      const x=Math.cos(angle)*.091*section,z=.009+Math.sin(angle)*.087*section;
      feather(body,[x,y,z],[x*.93,y-.046-Math.sin(col*3+row)*.006,z],.0135,Math.sin(angle)>.1?'breast':'mantle',[Math.cos(angle),.1,Math.sin(angle)],.92+((col*7+row*3)%9)*.01,torso);
    }
  }
  const neck={c:[0,.411,.039] as Point,r:[.051,.067,.055] as Point};
  for(let row=0;row<7;row++)for(let col=0;col<15;col++) {
    const y=.379+row*.015,angle=col/15*Math.PI*2+(row%2)*.17;
    const section=Math.sqrt(Math.max(.2,1-((y-.411)/.067)**2));
    const x=Math.cos(angle)*.051*section,z=.039+Math.sin(angle)*.055*section;
    feather(body,[x,y,z],[x,y-.033,z-.003],.011,'nape',[Math.cos(angle),.1,Math.sin(angle)],1,neck);
  }
  // A low crown and long facial profile, with small lateral eyes beneath a
  // projecting brow. The hook tapers continuously from cere to sharp tip.
  const skull={c:[0,.014,.013] as Point,r:[.046,.043,.068] as Point};
  plumedOval(head,'nape',skull.c,skull.r,[14,6]);
  oval(head,0xe5dfcd,[0,-.014,.035],[.026,.015,.034]);
  for(let row=0;row<7;row++)for(let col=0;col<14;col++) {
    const angle=col/14*Math.PI*2+(row%2)*.19;
    const y=-.006+row*.011,section=Math.sqrt(Math.max(.15,1-((y-.014)/.043)**2));
    const x=Math.cos(angle)*.046*section,z=.013+Math.sin(angle)*.068*section;
    // Leave the eye/cere zone clean; nape and crown remain finely streaked.
    if(z>.046&&Math.abs(x)>.026&&y<.03)continue;
    feather(head,[x,y,z],[x*.96,y-.017,z-.012],.008,'nape',[Math.cos(angle),.5,Math.sin(angle)],1,skull);
  }
  for(let col=-3;col<=3;col++)feather(head,[col*.010,.051,.043],[col*.009,.036,-.043],.008,'nape',[0,1,0],.96,skull);
  const lids:THREE.Mesh[]=[];
  for(const side of [-1,1]) {
    oval(head,0x665e49,[side*.041,.009,.050],[.007,.010,.011]);
    oval(head,0xc4aa44,[side*.046,.010,.051],[.0035,.007,.0075]);
    oval(head,0x101714,[side*.049,.010,.052],[.0016,.0044,.0045]);
    oval(head,0xf7f2db,[side*.050,.012,.054],[.0008,.0013,.0012]);
    const lid=oval(head,0xcfc7b2,[side*.050,.010,.051],[.0013,.008,.009]);lids.push(lid);
    oval(head,0xf0e8d3,[side*.042,.022,.035],[.0045,.002,.031]).rotation.x=-.09;
    // Subtle auricular line behind the eye, broken into short feathers.
    for(let i=0;i<4;i++)feather(head,[side*.044,.008-i*.005,.029],[side*.043,-.001-i*.005,.003],.004,'nape',[side,0,0],.81,skull);
    oval(head,0x9e9a61,[side*.008,-.005,.080],[.010,.010,.014]);
    oval(head,0x444837,[side*.017,-.003,.083],[.0016,.0025,.004]);
  }
  function taperedTube(parent:THREE.Object3D,points:Point[],radius:number,color:number,tip=.04) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),frames=curve.computeFrenetFrames(16,false),pos:number[]=[],indices:number[]=[];
    for(let row=0;row<=16;row++){const t=row/16,p=curve.getPoint(t),r=radius*(1-t)*(1-tip)+radius*tip;
      for(let col=0;col<10;col++){const a=col/10*Math.PI*2,v=p.clone().addScaledVector(frames.normals[row],Math.cos(a)*r).addScaledVector(frames.binormals[row],Math.sin(a)*r);pos.push(v.x,v.y,v.z);if(row<16){const i=row*10+col,j=row*10+(col+1)%10;indices.push(i,i+10,j,j,i+10,j+10);}}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(indices);geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,solid(color));parent.add(mesh);
  }
  taperedTube(head,[[0,-.003,.086],[0,-.007,.102],[0,-.019,.115],[0,-.039,.110]],.012,0x30352f);
  oval(head,0x696b50,[0,-.020,.087],[.010,.004,.021]);
  // Twelve overlapping rectrices form a long, rounded, closed tail.
  const tail=new THREE.Group();tail.name='barred-tail';tail.position.set(0,.175,-.067);body.add(tail);
  for(let i=0;i<12;i++){
    const lane=i-5.5,x=lane*.0084,length=.33-Math.pow(Math.abs(lane)/5.5,2)*.028;
    feather(tail,[x*.48,0,Math.abs(lane)*.001],[x,-length,-.083+Math.abs(lane)*.002],.012,'tail',[0,0,-1],.95+((i*3)%5)*.01);
  }
  // A folded wing is an almond-shaped, curved surface, widest through the
  // shoulder and tapering into the long primaries beside the tail.
  const wings=[-1,1].map(side=>{
    const wing=new THREE.Group();wing.name=`wing-${side}`;wing.position.set(side*.057,.376,-.019);body.add(wing);
    const shell={c:[side*.006,-.086,-.038] as Point,r:[.046,.118,.074] as Point};
    plumedOval(wing,'mantle',shell.c,shell.r,[10,7]);
    // Long remiges lie below the coverts, staggered into a tapered stack.
    for(let i=0;i<10;i++){
      const f=i/9,x=side*(.005+f*.020),z=-.058+f*.065;
      const primary=feather(wing,[x,-.045,z],[side*(-.014+f*.005),-.287+f*.050,-.113+f*.022],.014,'flight',[side*.5,0,-1],.87+i*.01);
      // The folded primaries overlap tightly. In flight they fan into a
      // broad rounded wing; GPU morphs retain one draw call per wing tract.
      const spread=primary.geometry.clone(),positions=spread.getAttribute('position');
      for(let v=0;v<positions.count;v++){
        const t=(1-Math.cos(Math.PI*Math.floor(v/5)/24))/2;
        positions.setX(v,positions.getX(v)+side*(f-.48)*.22*THREE.MathUtils.smoothstep(t,.05,.95));
      }
      spread.computeVertexNormals();
      primary.geometry.morphAttributes.position=[positions.clone()];
      primary.geometry.morphAttributes.normal=[spread.getAttribute('normal').clone()];
      spread.dispose();

    }
    for(let row=0;row<6;row++)for(let col=0;col<8;col++){
      const y=-.173+row*.039,angle=-Math.PI*.80+(col+(row%2)*.32)/7*Math.PI*1.25;
      const section=Math.sqrt(Math.max(.1,1-((y+.086)/.118)**2));
      const x=side*(.006+Math.cos(angle)*.046*section),z=-.038+Math.sin(angle)*.074*section;
      const size=row<3?.075:.049;
      feather(wing,[x,y,z],[x*.86,y-size,z-.012],row<3?.014:.012,'mantle',[side*Math.cos(angle),.08,Math.sin(angle)],.91+((col*3+row*7)%8)*.012,shell);
    }
    return wing;
  });
  const legs=new THREE.Group();legs.name='gripping-feet';root.add(legs);
  for(const side of [-1,1]){
    const thigh={c:[side*.047,.128,.038] as Point,r:[.027,.065,.035] as Point};
    plumedOval(legs,'down',thigh.c,thigh.r,[9,5]);
    for(let row=0;row<6;row++)for(let col=0;col<9;col++){
      const a=col/9*Math.PI*2,y=.088+row*.02,x=side*.047+Math.cos(a)*.026,z=.038+Math.sin(a)*.034;
      feather(legs,[x,y,z],[x,y-.034,z],.009,'down',[Math.cos(a),.1,Math.sin(a)],1,thigh);
    }
    oval(legs,0xc3a53d,[side*.045,.041,.034],[.008,.041,.009]);
    for(let scale=0;scale<7;scale++)oval(legs,scale%2?0xd0b34e:0xbaa044,[side*.045,.016+scale*.008,.041],[.0067,.0026,.0038]);
    for(let toe=-1;toe<=2;toe++){
      const back=toe===2,x=side*.045+(back?side*.013:toe*.020),z=back?-.034:.093-Math.abs(toe)*.012;
      taperedTube(legs,[[side*.045,.015,.035],[x,.013,z*.65],[x,-.003,z]],.0047,0xccae43,.65);
      taperedTube(legs,[[x,-.003,z],[x,-.009,z+(back?-.011:.012)],[x,-.025,z+(back?-.009:.010)]],.0044,0x293129);
      for(let j=1;j<5;j++)oval(legs,0xa78e37,[side*.045+(x-side*.045)*j/5,.014-j*.002,.035+(z-.035)*j/5],[.004,.0016,.003]);
    }
    oval(legs,0x493d30,[side*.045,.038,.034],[.010,.007,.011]);
    // Short free jess ends follow the back of the glove, below the feet.
    taperedTube(legs,[[side*.045,.036,.030],[side*.061,-.009,-.026],[side*.075,-.085,-.035]],.0019,0x685743,.7);
  }
  // Keep every animated joint independent and collapse static feather detail.
  for(const joint of [body,head,tail,...wings,legs]){
    const groups=new Map<THREE.Material,THREE.Mesh[]>();
    for(const child of [...joint.children])if(child instanceof THREE.Mesh&&!lids.includes(child)){const mat=child.material as THREE.Material;const list=groups.get(mat)??[];list.push(child);groups.set(mat,list);}
    for(const [mat,meshes]of groups){if(meshes.length<2)continue;
      const geometries=meshes.map(mesh=>{mesh.updateMatrix();return mesh.geometry.clone().applyMatrix4(mesh.matrix);});
      const merged=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(!merged)continue;
      for(const mesh of meshes){joint.remove(mesh);mesh.geometry.dispose();}
      const mesh=new THREE.Mesh(merged,mat);mesh.castShadow=![...plumage.values()].some(value=>value===mat);mesh.receiveShadow=mesh.castShadow;joint.add(mesh);if(mesh.morphTargetInfluences)fanMeshes.push(mesh);
    }
  }
  let flightBlend=0;
  function pose(time:number,flying:boolean,grounded=false,movement=0,dt=1/60){
    flightBlend=THREE.MathUtils.damp(flightBlend,flying?1:0,14,dt);
    const breath=Math.sin(time*2.6),shift=Math.sin(time*.63)*Math.sin(time*.27);
    // A deliberate turn, a brief hold, then another survey of the field.
    const scan=Math.sin(time*.47)*.36+Math.sin(time*1.21)*.055;
    const ruffle=Math.pow(Math.max(0,Math.sin(time*.71)),18);
    body.position.y=(1-flightBlend)*(breath*.0018+Math.abs(shift)*.0018);
    body.rotation.set(THREE.MathUtils.lerp(grounded?.31:.035+movement*.025,Math.PI*.48,flightBlend),0,(1-flightBlend)*(shift*.02+movement*Math.sin(time*8)*.014));
    head.rotation.set(-flightBlend*.3+(1-flightBlend)*Math.sin(time*.84)*.025,flying?0:scan,0);
    const blink=Math.pow(Math.max(0,Math.cos((time+.4)*1.23)),140);lids.forEach(lid=>lid.scale.y=.008*Math.max(.015,blink));
    legs.visible=flightBlend<.7;
    for(const mesh of fanMeshes)mesh.morphTargetInfluences![0]=flightBlend;
    tail.rotation.set(flying?-.12:.06+shift*.025,shift*.015,0);
    for(let i=0;i<2;i++){const side=i===0?-1:1;wings[i].rotation.z=THREE.MathUtils.lerp(-side*(.025+ruffle*.035),side*(1.55+Math.sin(time*22)*.65),flightBlend);wings[i].rotation.y=side*(flightBlend*.2+ruffle*.022);wings[i].scale.set(1+flightBlend*.4,1+flightBlend*.75,1);}
  }
  pose(0,false);
  return {root,pose,dispose(){root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});materials.forEach(m=>m.dispose());plumage.forEach(m=>m.dispose());skins.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}

export function createFalconryGlove() {
  const root = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: 0x69503b, roughness: .94 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x535c46, roughness: 1 });
  const seam = new THREE.MeshStandardMaterial({ color: 0x9a7d59, roughness: 1 });
  const parts: [Point, Point, THREE.Material][] = [
    [[-.03, -.20, .19], [.072, .18, .074], sleeve],
    [[-.02, -.075, .06], [.087, .12, .083], leather],
    [[0, -.012, .01], [.09, .046, .062], leather],
    [[.075, -.046, .064], [.027, .061, .032], leather],
  ];
  for (let finger = 0; finger < 4; finger++) parts.push([[ -.060 + finger * .039, -.009, -.027], [.022, .032, .054], leather]);
  for (const [p, s, m] of parts) { const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), m); mesh.position.set(...p); mesh.scale.set(...s); root.add(mesh); }
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(side * .070, -.165, .062), new THREE.Vector3(side * .083, -.07, .001), new THREE.Vector3(side * .06, -.015, -.062)]);
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, .0014, 5, false), seam));
  }
  return { root, dispose() { root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); leather.dispose(); sleeve.dispose(); seam.dispose(); } };
}
