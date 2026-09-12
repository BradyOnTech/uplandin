import * as THREE from 'three';

/** Editable, procedural juvenile goshawk study: broad rounded wings, a long
 * barred tail, cream streaked breast and conspicuous pale supercilium.
 * Geometry is deliberately independent of behaviour and can be replaced by GLB.
 */
export function createGoshawk() {
  const root=new THREE.Group(), body=new THREE.Group(), head=new THREE.Group();
  root.add(body); body.add(head); head.position.set(0,.405,.025);
  const materials=new Map<number,THREE.MeshStandardMaterial>();
  const material=(color:number)=>{let m=materials.get(color);if(!m){m=new THREE.MeshStandardMaterial({color,roughness:.92,flatShading:true});materials.set(color,m);}return m;};
  const brown=0x665440,dark=0x382e26,cream=0xcdbd93,feet=0xc3a647;
  function oval(parent:THREE.Object3D,color:number,p:number[],s:number[]) {
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),material(color));
    mesh.position.set(p[0],p[1],p[2]);mesh.scale.set(s[0],s[1],s[2]);
    mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function feather(parent:THREE.Object3D,color:number,a:number[],b:number[],width:number) {
    const center=new THREE.Vector3(...a as [number,number,number]).add(new THREE.Vector3(...b as [number,number,number])).multiplyScalar(.5);
    const direction=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const f=oval(parent,color,[center.x,center.y,center.z],[width,direction.length()*.55,.014]);
    f.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return f;
  }
  oval(body,brown,[0,.235,0],[.108,.185,.095]);
  oval(body,cream,[0,.235,.061],[.086,.145,.053]);
  for(let row=0;row<5;row++) for(let col=-2;col<=2;col++) {
    const y=.145+row*.033,x=col*.029;
    const streak=oval(body,dark,[x,y,.109-Math.abs(col)*.005],[.004,.013+(4-row)*.001,.003]);
    streak.rotation.z=col*.13;
  }
  oval(head,brown,[0,0,0],[.074,.075,.072]);
  oval(head,cream,[0,-.03,.048],[.042,.041,.027]);
  // Yellow juvenile iris, black pupil, and long pale eyebrow on both sides.
  for(const side of [-1,1]) {
    oval(head,dark,[side*.059,.012,.037],[.015,.019,.015]);
    oval(head,0xe8cd59,[side*.068,.014,.041],[.009,.012,.011]);
    oval(head,0x171814,[side*.074,.014,.045],[.004,.008,.007]);
    const brow=oval(head,0xe3d4b6,[side*.057,.035,.021],[.015,.009,.047]);brow.rotation.x=.1;
  }
  oval(head,0xb5b075,[0,-.002,.070],[.027,.022,.025]);
  oval(head,0x353a37,[0,-.008,.091],[.025,.023,.028]);
  const hook=new THREE.Mesh(new THREE.ConeGeometry(.017,.041,8),material(0x232927));
  hook.position.set(0,-.029,.106);hook.rotation.x=Math.PI;head.add(hook);
  const tail=new THREE.Group();tail.position.set(0,.115,-.047);body.add(tail);
  for(let i=-2;i<=2;i++) {
    feather(tail,brown,[i*.015,0,0],[i*.023,-.25,-.035],.019);
    for(let stripe=0;stripe<4;stripe++) oval(tail,dark,[i*.02,-.05-stripe*.05,-.026],[.018,.009,.005]);
  }
  const wings=[-1,1].map(side=>{
    const wing=new THREE.Group();wing.position.set(side*.078,.30,-.018);body.add(wing);
    oval(wing,brown,[side*.055,-.08,0],[.065,.115,.038]);
    for(let i=0;i<7;i++) feather(wing,i%2?brown:dark,[side*.02,-.04,-.005],[side*(.02+i*.019),-.25+i*.009,-.035],.018);
    return wing;
  });
  const legs=new THREE.Group();body.add(legs);
  for(const side of [-1,1]) {
    oval(legs,cream,[side*.044,.09,.025],[.038,.071,.041]);
    oval(legs,feet,[side*.044,.022,.04],[.012,.045,.012]);
    for(let toe=-1;toe<=1;toe++) {
      feather(legs,feet,[side*.044,.0,.04],[side*.044+toe*.018,-.008,.103-Math.abs(toe)*.013],.006);
      oval(legs,0x252822,[side*.044+toe*.018,-.012,.108-Math.abs(toe)*.013],[.004,.008,.012]);
    }
  }
  function pose(time:number, flying:boolean, settling=false) {
    body.rotation.x=flying ? Math.PI*.48 : settling ? .45 : 0;
    head.rotation.y=flying ? 0 : Math.sin(time*.65)*.22+Math.sin(time*1.8)*.08;
    head.rotation.x=flying ? -.3 : Math.sin(time*.8)*.035;
    legs.visible=!flying;
    tail.rotation.x=flying ? -.12 : .10;
    for(let i=0;i<2;i++) {
      const side=i===0?-1:1;
      wings[i].rotation.z=flying ? side*(1.55+Math.sin(time*22)*.65) : -side*.17;
      wings[i].rotation.y=flying ? side*.2 : 0;
      wings[i].scale.set(1,flying?1.75:1,1);
    }
  }
  return {root,pose,dispose(){root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});for(const m of materials.values())m.dispose();}};
}

export function createFalconryGlove() {
  const root=new THREE.Group();
  const leather=new THREE.MeshStandardMaterial({color:0x684c38,roughness:1,flatShading:true});
  const sleeve=new THREE.MeshStandardMaterial({color:0x595d49,roughness:1,flatShading:true});
  const parts:[number[],number[],THREE.Material][]=[
    [[-.04,-.15,.14],[.077,.19,.072],sleeve],
    [[0,-.055,.025],[.092,.10,.10],leather],
    [[.008,0,-.025],[.11,.052,.075],leather],
    [[.08,-.035,.055],[.04,.068,.048],leather],
  ];
  for(const [p,s,m] of parts){const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,10,7),m);mesh.position.set(...p as [number,number,number]);mesh.scale.set(...s as [number,number,number]);root.add(mesh);}
  return {root,dispose(){root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});leather.dispose();sleeve.dispose();}};
}
