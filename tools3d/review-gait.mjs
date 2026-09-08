#!/usr/bin/env node
/** Labeled four-phase review of an actual exported GLB, separate from gameplay.
 * node tools3d/review-gait.mjs --clip trot --out artifacts/3d/gait-audit
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const args=process.argv.slice(2),get=(flag,fallback)=>args.includes(flag)?args[args.indexOf(flag)+1]:fallback;
const path=resolve(get('--asset','public/models/gsp/gsp-liver-white-lod0.glb'));
const clip=get('--clip','trot'),out=resolve(get('--out','artifacts/3d/gait-audit'));
const asset=readFileSync(path),hash=createHash('sha256').update(asset).digest('hex');
mkdirSync(out,{recursive:true});
const client=String.raw`
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const W=1280,H=850,top=90,vw=640,vh=360;
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(W,H);renderer.setPixelRatio(1);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
document.body.append(renderer.domElement);
const guides=document.createElementNS('http://www.w3.org/2000/svg','svg');guides.setAttribute('width',String(W));guides.setAttribute('height',String(H));guides.style.cssText='position:absolute;left:0;top:0;pointer-events:none';document.body.append(guides);
const scene=new THREE.Scene();scene.background=new THREE.Color('#25313a');
scene.add(new THREE.HemisphereLight(0xe8f1f5,0x514b37,2.0));
const sun=new THREE.DirectionalLight(0xffedcf,3);sun.position.set(2,4,3);scene.add(sun);
const camera=new THREE.PerspectiveCamera(35,vw/vh,.01,20);camera.position.set(2.3,1.35,1.6);camera.lookAt(0,.37,0);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(10,10),new THREE.MeshStandardMaterial({color:0x53594d,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.003;scene.add(floor);
const gltf=await new GLTFLoader().loadAsync('/dog.glb');scene.add(gltf.scene);
const selected=gltf.animations.find(c=>c.name===window.reviewClip);if(!selected)throw Error('Missing clip '+window.reviewClip);
const mixer=new THREE.AnimationMixer(gltf.scene),action=mixer.clipAction(selected).play();action.paused=true;
const colors={FL:'#ffce67',HR:'#ffce67',FR:'#73d9ff',HL:'#73d9ff'};
const names={FL:'FrontContactL',FR:'FrontContactR',HL:'HindContactL',HR:'HindContactR'};
const dots={};for(const id of Object.keys(names)){const dot=new THREE.Mesh(new THREE.SphereGeometry(.012,10,6),new THREE.MeshBasicMaterial({color:colors[id],depthTest:false}));dot.renderOrder=100;scene.add(dot);dots[id]=dot;}
const label=(text,x,y,color,size=15)=>{const node=document.createElement('div');node.textContent=text;node.style.cssText='position:absolute;left:'+x+'px;top:'+y+'px;color:'+color+';font:600 '+size+'px Arial,sans-serif;pointer-events:none;text-shadow:0 1px 3px #000;';document.body.append(node);};
label('EXPORTED '+window.reviewClip.toUpperCase()+' · FOUR PHASES',24,15,'#edf1ed',24);
label('Amber: left front + right hind     Blue: right front + left hind     +Z forward / +Y up',24,48,'#ccd3cc',16);
const report=[];
renderer.setScissorTest(true);
for(const [index,phase] of [0,.25,.5,.75].entries()){
 const x=(index%2)*vw,y=top+Math.floor(index/2)*vh;
 action.time=phase*selected.duration;mixer.update(0);scene.updateMatrixWorld(true);
 const points={};for(const [id,name] of Object.entries(names)){const bone=gltf.scene.getObjectByName(name);if(!bone)throw Error(name);bone.getWorldPosition(dots[id].position);points[id]=dots[id].position.toArray();}
 renderer.setViewport(x,H-y-vh,vw,vh);renderer.setScissor(x,H-y-vh,vw,vh);renderer.render(scene,camera);
 label('Phase '+phase.toFixed(2),x+20,y+12,'#edf1ed',18);
 const placed=[];
 for(const id of Object.keys(names)){
  const p=dots[id].position.clone().project(camera),px=x+(p.x*.5+.5)*vw,py=y+(.5-p.y*.5)*vh;
  const lx=px+(id.endsWith('L')?8:-29);let ly=py+(id.startsWith('F')?-21:8);
  while(placed.some(b=>Math.abs(b.x-lx)<34&&Math.abs(b.y-ly)<22))ly+=24;
  placed.push({x:lx,y:ly});
  const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',px);line.setAttribute('y1',py);line.setAttribute('x2',lx+10);line.setAttribute('y2',ly+8);line.setAttribute('stroke',colors[id]);line.setAttribute('stroke-opacity','.6');line.setAttribute('stroke-width','1');guides.append(line);
  label(id,lx,ly,colors[id]);
 }
 report.push({phase,points});
}
renderer.setScissorTest(false);
label('Staged asset diagnostic · no game terrain IK · '+window.reviewHash.slice(0,16),24,822,'#ccd3cc',14);
window.reviewData={clip:selected.name,duration:selected.duration,frames:report};window.reviewReady=true;
`;
const bundle=await build({stdin:{contents:client,resolveDir:process.cwd(),loader:'js'},bundle:true,write:false,format:'esm',platform:'browser'});
const html=`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#25313a}canvas{display:block}</style><script>window.reviewClip=${JSON.stringify(clip)};window.reviewHash=${JSON.stringify(hash)};</script><script type="module" src="/viewer.js"></script>`;
const server=createServer((req,res)=>{if(req.url==='/dog.glb'){res.setHeader('content-type','model/gltf-binary');res.end(asset);}else if(req.url==='/viewer.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].contents);}else{res.setHeader('content-type','text/html');res.end(html);}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await puppeteer.launch({headless:true,args:[]});
try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.setViewport({width:1280,height:850,deviceScaleFactor:1});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction('window.reviewReady===true',{timeout:30000});
 const data=await page.evaluate(()=>window.reviewData);if(errors.length)throw Error(errors.join('\n'));await page.screenshot({path:resolve(out,clip+'-four-phases.png')});writeFileSync(resolve(out,clip+'-four-phases.json'),JSON.stringify({asset:path,sha256:hash,evidence:'Staged raw exported GLB clip; no runtime correction',...data},null,2));console.log(resolve(out,clip+'-four-phases.png'));
}finally{await browser.close();server.close();}
