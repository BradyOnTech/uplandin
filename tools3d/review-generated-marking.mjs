import {build} from 'esbuild';
import {createServer} from 'node:http';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer';
const args=process.argv.slice(2),outIndex=args.indexOf('--out'),walkingEntry=args.includes('--walk-stop'),acquiring=args.includes('--point-entry')||walkingEntry;
const out=resolve(outIndex>=0?args[outIndex+1]:'docs/3d/art-direction-refresh/dog/marking-study');mkdirSync(out,{recursive:true});
const client=`
import * as THREE from 'three';
import {GeneratedFieldMotion} from './src/three/dogs/generatedFieldMotion';
import {GeneratedAttention} from './src/three/dogs/generatedAttention';
const detail=new URLSearchParams(location.search).get('detail');
const motion=new GeneratedFieldMotion(detail,()=>0),attention=new GeneratedAttention();
const scene=new THREE.Scene();scene.background=new THREE.Color(0x46504b);scene.add(motion.asset.root);
scene.add(new THREE.HemisphereLight(0xe9eee5,0x665d49,2));const sun=new THREE.DirectionalLight(0xffe6bc,2.7);sun.position.set(3,5,4);scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshLambertMaterial({color:0x777865}));floor.rotation.x=-Math.PI/2;scene.add(floor);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1440,900);renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(32,480/400,.01,30);camera.position.set(-1.6,.95,2.1);camera.lookAt(0,.4,0);
const report=[];let frame=0;
const acquiring=${acquiring};
for(let i=0;i<90;i++)motion.update(0,${walkingEntry}? (i-89)*.01 : 0,0,1/60,${walkingEntry},!acquiring);
renderer.setScissorTest(true);
const poses=acquiring?[{label:${walkingEntry}? 'Walking / before point' : 'Before point',frame:0},{label:'Acquiring / 0.05 s',frame:3},{label:'Acquiring / 0.12 s',frame:7},
 {label:'Settling / 0.28 s',frame:17},{label:'Held point / 0.5 s',frame:30},{label:'Held point / 1 s',frame:60}]
 :[{label:'Point',frame:0},{label:'Lowering / 0.05 s',frame:3},{label:'Lowering / 0.12 s',frame:7},
 {label:'Standing / 0.25 s',frame:15},{label:'Watching rising covey',frame:55,target:[3,3,6]},{label:'Following falling bird',frame:110,target:[-3,.1,4]}];
for(const [index,pose] of poses.entries()){
 while(frame<pose.frame){motion.update(0,0,0,1/60,false,acquiring);attention.update(motion.asset,pose.target?new THREE.Vector3(...pose.target):null,1/60);frame++;}
 const x=index%3*480,y=900-70-(Math.floor(index/3)+1)*400;
 renderer.setViewport(x,y,480,400);renderer.setScissor(x,y,480,400);renderer.render(scene,camera);
 const label=document.createElement('label');label.textContent=pose.label;label.style.cssText='position:absolute;left:'+(x+15)+'px;top:'+(70+Math.floor(index/3)*400)+'px;color:#eee;font:17px Arial';document.body.append(label);
 report.push({label:pose.label,frame,neck:motion.asset.joints.neck.rotation.x,tail:motion.asset.joints.tail.rotation.x,yaw:attention.yaw,pitch:attention.pitch,feet:motion.feet.map(f=>f.target.toArray()),clamped:motion.clamped});
}
document.querySelector('h1').textContent=acquiring?'Generated GSP · Acquiring a point · Staged contact study':'Generated GSP · Point to marking · Staged contact and attention study';
window.report={detail,report};window.ready=true;
`;
const bundle=await build({stdin:{contents:client,resolveDir:process.cwd(),loader:'js'},bundle:true,write:false,format:'esm'});
const server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].contents:'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#46504b}h1{position:absolute;top:8px;left:15px;color:#eee;font:24px Arial}</style><h1>Generated GSP · Point to marking · Staged contact and attention study</h1><script type="module" src="/app.js"></script>');});
const uncapped=args.includes('--uncapped');
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await puppeteer.launch({headless:true,args:uncapped?['--disable-frame-rate-limit','--disable-gpu-vsync']:[]});
try{const page=await browser.newPage();await page.setViewport({width:1440,height:900});const errors=[],reports=[];page.on('pageerror',e=>errors.push(String(e)));
for(const detail of ['high','lite']){await page.goto('http://127.0.0.1:'+server.address().port+'/?detail='+detail);await page.waitForFunction('window.ready');reports.push(await page.evaluate(()=>window.report));await page.screenshot({path:resolve(out,detail+'.png')});}
writeFileSync(resolve(out,'report.json'),JSON.stringify({evidence:'Staged actual contact controller and attention study, not gameplay or performance',uncapped,reports,errors},null,2));if(errors.length)throw Error(errors.join('\n'));console.log('Rendered High and Lite marking studies');
}finally{await browser.close();server.close();}
