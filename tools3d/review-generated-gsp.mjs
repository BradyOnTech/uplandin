import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';
const outIndex=process.argv.indexOf('--out');
const out=resolve(outIndex>=0?process.argv[outIndex+1]:'docs/3d/art-direction-refresh/dog');mkdirSync(out,{recursive:true});
const client=`
import * as THREE from 'three';
import { createGeneratedGsp } from './src/three/dogs/generatedGsp';
const scene=new THREE.Scene();scene.background=new THREE.Color(0x46504b);
scene.add(new THREE.HemisphereLight(0xe9eee5,0x665d49,2));
const sun=new THREE.DirectionalLight(0xffe6bc,2.7);sun.position.set(3,5,4);scene.add(sun);
const dog=createGeneratedGsp(new URLSearchParams(location.search).get('detail')==='lite'?'lite':'high');scene.add(dog.root);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshLambertMaterial({color:0x777865}));floor.rotation.x=-Math.PI/2;floor.position.y=-.015;scene.add(floor);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1400,960);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(32,700/420,.01,30);
window.draw=(pose)=>{
 const moving=pose!=='stand'&&pose!=='point';if(!moving)dog.setPose(pose);document.querySelectorAll('label').forEach(e=>e.remove());
 const labels=moving?['Phase 0','Phase 0.25','Phase 0.5','Phase 0.75']:['Side','Front','Rear','Three-quarter'];const positions=[[2.5,.9,0],[0,.9,2.5],[0,.9,-2.5],[1.8,1.1,1.8]];
 renderer.setScissorTest(true);
 positions.forEach((position,i)=>{const x=i%2*700,y=960-80-(Math.floor(i/2)+1)*420;if(moving)dog.setLocomotion(pose,i*.25);camera.position.set(...(moving?[1.8,1.1,1.8]:position));camera.lookAt(0,.39,0);renderer.setViewport(x,y,700,420);renderer.setScissor(x,y,700,420);renderer.render(scene,camera);const l=document.createElement('label');l.textContent=labels[i];l.style.cssText='position:absolute;left:'+(x+24)+'px;top:'+(80+Math.floor(i/2)*420)+'px;color:#eee;font:18px Arial';document.body.append(l);});
 renderer.setScissorTest(false);document.getElementById('title').textContent='Generated GSP / '+pose+' / '+dog.stats.triangles+' triangles';
 const bounds=new THREE.Box3().setFromObject(dog.root);window.report={...dog.stats,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},pose};
};window.draw('stand');window.ready=true;
`;
const bundle=await build({stdin:{contents:client,resolveDir:process.cwd(),loader:'js'},bundle:true,write:false,format:'esm',platform:'browser'});
const server=createServer((req,res)=>{res.setHeader('content-type',req.url.startsWith('/viewer.js')?'text/javascript':'text/html');res.end(req.url.startsWith('/viewer.js')?bundle.outputFiles[0].contents:'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#46504b}h1{position:absolute;top:12px;left:24px;color:#eee;font:25px Arial}footer{position:absolute;top:932px;left:24px;color:#ddd;font:14px Arial}</style><h1 id="title"></h1><footer>Staged shape study · code-generated joints · staged pose and gait study / field integration pending</footer><script type="module" src="/viewer.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const uncapped=process.argv.includes('--uncapped');
const browser=await puppeteer.launch({headless:true,args:uncapped?['--disable-frame-rate-limit','--disable-gpu-vsync']:[]});
try {const page=await browser.newPage();await page.setViewport({width:1400,height:960,deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});const reports=[];
for(const detail of ['high','lite']) {await page.goto('http://127.0.0.1:'+server.address().port+'/?detail='+detail);await page.waitForFunction('window.ready===true');for(const pose of ['stand','point','walk','trot','canter','gallop']) {await page.evaluate(p=>window.draw(p),pose);await page.screenshot({path:resolve(out,detail+'-'+pose+'.png')});reports.push({detail,...await page.evaluate(()=>window.report)});}}
if(errors.length)throw Error(errors.join('\n'));writeFileSync(resolve(out,'shape-review.json'),JSON.stringify({evidence:'Staged shape inspection; not gameplay or performance evidence',uncapped,reports,errors},null,2));console.log(JSON.stringify(reports));
} finally {await browser.close();server.close();}
