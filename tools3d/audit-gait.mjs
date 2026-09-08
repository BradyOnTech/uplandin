#!/usr/bin/env node
/** Read actual GLB skin/contact trajectories without rendering or game state.
 * Materials are omitted only in the temporary parser input to avoid DOM image
 * loading in Node. Geometry, skin weights, bind matrices and clips stay intact.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const args=process.argv.slice(2);
const get=(flag,fallback)=>args.includes(flag)?args[args.indexOf(flag)+1]:fallback;
const source=resolve(get('--asset','public/models/gsp/gsp-liver-white-lod0.glb'));
const out=resolve(get('--out','artifacts/3d/gait-audit'));
mkdirSync(out,{recursive:true});
const raw=readFileSync(source), jsonLength=raw.readUInt32LE(12);
const json=JSON.parse(raw.subarray(20,20+jsonLength).toString());
for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
delete json.materials;delete json.images;delete json.textures;delete json.samplers;
const jsonBytes=Buffer.from(JSON.stringify(json));
const padded=Buffer.alloc(Math.ceil(jsonBytes.length/4)*4,0x20);jsonBytes.copy(padded);
const rest=raw.subarray(20+jsonLength), input=Buffer.alloc(20+padded.length+rest.length);
input.writeUInt32LE(0x46546c67,0);input.writeUInt32LE(2,4);input.writeUInt32LE(input.length,8);
input.writeUInt32LE(padded.length,12);input.writeUInt32LE(0x4e4f534a,16);padded.copy(input,20);rest.copy(input,20+padded.length);
const array=input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength);
const gltf=await new GLTFLoader().parseAsync(array,'');
const model=gltf.scene, meshes=[];model.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
const ids=['FL','FR','HL','HR'];
const pointNames={FL:'FrontContactL',FR:'FrontContactR',HL:'HindContactL',HR:'HindContactR'};
const bones=Object.fromEntries(ids.map(id=>[id,model.getObjectByName(pointNames[id])]));
if(Object.values(bones).some(b=>!b))throw new Error('Missing physical contact marker');
const update=()=>{model.updateMatrixWorld(true);for(const mesh of meshes)mesh.skeleton.update();};
const position=(mesh,i)=>{const p=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i);mesh.applyBoneTransform(i,p);return p.applyMatrix4(mesh.matrixWorld);};
update();
const restContacts=Object.fromEntries(ids.map(id=>[id,bones[id].getWorldPosition(new THREE.Vector3()).toArray()]));
// Spatially select paw vertices independently of bone names and weight groups.
// +Z is muzzle-forward, +Y up, so +X is anatomical left (up cross forward).
const selections=Object.fromEntries(ids.map(id=>[id,[]]));
for(const mesh of meshes)for(let i=0;i<mesh.geometry.attributes.position.count;i++){
  const p=position(mesh,i);
  for(const id of ids){const ref=restContacts[id];
    const onSide=id.endsWith('L')?p.x>.025:p.x<-.025;
    const inAxle=id.startsWith('F')?p.z>.08:p.z<-.25;
    if(onSide&&inAxle&&p.y<.06&&Math.abs(p.z-ref[2])<.085)selections[id].push({mesh,i});
  }
}
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
const centroid=id=>{const p=new THREE.Vector3();for(const ref of selections[id])p.add(position(ref.mesh,ref.i));return p.divideScalar(selections[id].length).toArray();};
for(const id of ids)if(!selections[id].length)throw new Error(`No physical ${id} paw vertices`);
const pearson=(a,b)=>{const ma=mean(a),mb=mean(b);let cov=0,va=0,vb=0;for(let i=0;i<a.length;i++){cov+=(a[i]-ma)*(b[i]-mb);va+=(a[i]-ma)**2;vb+=(b[i]-mb)**2;}return cov/Math.sqrt(va*vb);};
const samples=120, report={asset:source,sha256:createHash('sha256').update(raw).digest('hex'),
  evidence:'Actual exported skin and contact-marker trajectories; no manifest contact offsets used',
  coordinates:{forward:'+Z',up:'+Y',anatomicalLeft:'+X'},
  restContacts,physicalPawSelection:Object.fromEntries(ids.map(id=>[id,{vertices:selections[id].length,restCentroid:centroid(id)}])),clips:[]};
const mixer=new THREE.AnimationMixer(model);
for(const name of get('--clips','walk,trot').split(',')){
 const clip=gltf.animations.find(c=>c.name===name);if(!clip)throw new Error(`No ${name} clip`);
 mixer.stopAllAction();const action=mixer.clipAction(clip).play();action.paused=true;
 const frames=[];
 for(let i=0;i<samples;i++){
  const phase=i/samples;action.time=phase*clip.duration;mixer.update(0);update();
  frames.push({phase,paws:Object.fromEntries(ids.map(id=>[id,{contact:bones[id].getWorldPosition(new THREE.Vector3()).toArray(),skin:centroid(id)}]))});
 }
 const metrics={};
 for(const type of ['contact','skin']){
  const z=id=>frames.map(f=>f.paws[id][type][2]);
  const peak=Object.fromEntries(ids.map(id=>{const v=z(id);return[id,v.indexOf(Math.max(...v))/samples];}));
  metrics[type]={foreAftCorrelation:{FL_HR:pearson(z('FL'),z('HR')),FR_HL:pearson(z('FR'),z('HL')),FL_HL:pearson(z('FL'),z('HL')),FR_HR:pearson(z('FR'),z('HR'))},
   maximumForwardPhase:peak,
   forwardPeakOrderFromFL:ids.map(id=>({id,relativePhase:(peak[id]-peak.FL+1)%1})).sort((a,b)=>a.relativePhase-b.relativePhase),
   ranges:Object.fromEntries(ids.map(id=>[id,{forwardMin:Math.min(...z(id)),forwardMax:Math.max(...z(id)),heightMin:Math.min(...frames.map(f=>f.paws[id][type][1])),heightMax:Math.max(...frames.map(f=>f.paws[id][type][1]))}]))};
 }
 report.clips.push({name,duration:clip.duration,metrics,frames});
}
if(args.includes('--verify')){
 const failures=[];
 const tolerance={minimumPawTravelM:.05,walkQuarterPhaseError:.08,minimumDiagonalCorrelation:.95,maximumSameSideCorrelation:-.90};
 for(const clip of report.clips){
  const skin=clip.metrics.skin;
  for(const [id,range] of Object.entries(skin.ranges))if(range.forwardMax-range.forwardMin<tolerance.minimumPawTravelM)failures.push(clip.name+' '+id+' has insufficient motion to certify pairing');
  if(clip.name==='walk'){
   const sequence=['FL','HR','FR','HL'];
   if(skin.forwardPeakOrderFromFL.map(p=>p.id).join(',')!==sequence.join(','))failures.push('walk skin forward-peak order must be FL→HR→FR→HL');
   for(let index=0;index<4;index++){
    const measured=skin.forwardPeakOrderFromFL.find(p=>p.id===sequence[index]).relativePhase;
    if(Math.abs(measured-index*.25)>tolerance.walkQuarterPhaseError)failures.push('walk '+sequence[index]+' phase is outside the measured quarter-cycle tolerance');
   }
  }
  if(clip.name==='trot'){
   for(const pair of ['FL_HR','FR_HL'])if(!(skin.foreAftCorrelation[pair]>tolerance.minimumDiagonalCorrelation))failures.push('trot '+pair+' lacks strong diagonal skin correlation');
   for(const pair of ['FL_HL','FR_HR'])if(!(skin.foreAftCorrelation[pair]<tolerance.maximumSameSideCorrelation))failures.push('trot '+pair+' lacks same-side skin opposition');
  }
 }
 report.verification={result:failures.length?'failed':'passed',tolerance,failures,scope:'Physical exported paw travel and pairing only; not visual, runtime IK, or biological performance approval'};
 if(failures.length)process.exitCode=1;
}
writeFileSync(resolve(out,'exported-gait.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({sha256:report.sha256,restContacts,physicalPawSelection:report.physicalPawSelection,clips:report.clips.map(({frames,...rest})=>rest),verification:report.verification},null,2));
