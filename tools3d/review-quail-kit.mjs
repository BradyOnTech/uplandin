import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';
const trees=process.argv.includes('--trees'),props=process.argv.includes('--props');
const outIndex=process.argv.indexOf('--out');
const out=resolve(outIndex>=0?process.argv[outIndex+1]:'docs/3d/art-direction-refresh/kit'+(trees?'/trees':props?'/props':''));mkdirSync(out,{recursive:true});
const manifest=JSON.parse(readFileSync('public/models/quail-kit/'+(trees?'tree-manifest.json':props?'prop-manifest.json':'manifest.json'),'utf8'));
const client=`
import * as THREE from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1500,960);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(38,500/420,.01,100);camera.position.set(...${JSON.stringify(trees?[11,8,14]:props?[2.8,2.1,3.2]:[3,2.7,4])});camera.lookAt(0,${trees?3.8:props?.15:.85},0);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x46504b);scene.add(new THREE.HemisphereLight(0xe9eee5,0x665d49,2));const sun=new THREE.DirectionalLight(0xffe6bc,2.7);sun.position.set(3,5,4);scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshLambertMaterial({color:0x777865}));floor.rotation.x=-Math.PI/2;floor.position.y=-.006;scene.add(floor);
const habits=${JSON.stringify(trees?['spreading','upright','leaning']:props?['slab','split-log','fallen-limb']:['open','low','tall'])},prefix=${JSON.stringify(trees?'field-tree-':props?'ground-prop-':'sand-plum-')};
const ids=['high','lite'].flatMap(detail=>habits.map(habit=>prefix+habit+'-'+detail));
const loaded=await Promise.all(ids.map(id=>new GLTFLoader().loadAsync('/models/'+id+'.glb')));
const report=[];renderer.setScissorTest(true);
for(let row=0;row<2;row++)for(let col=0;col<3;col++){
 const detail=row?'lite':'high',habit=habits[col],id=prefix+habit+'-'+detail;
 const asset=loaded[ids.indexOf(id)];scene.add(asset.scene);asset.scene.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(asset.scene);let triangles=0,meshes=0;asset.scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;}});
 report.push({id,triangles,meshes,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}});
 renderer.setViewport(col*500,960-80-(row+1)*420,500,420);renderer.setScissor(col*500,960-80-(row+1)*420,500,420);renderer.render(scene,camera);scene.remove(asset.scene);
 const label=document.createElement('label');label.textContent=habit+' / '+detail+' / '+triangles+' triangles';label.style.cssText='position:absolute;top:'+(80+row*420)+'px;left:'+(col*500+20)+'px;font:18px Arial;color:#eee';document.body.append(label);
}renderer.setScissorTest(false);window.report=report;window.ready=true;
`;
const bundle=await build({stdin:{contents:client,resolveDir:process.cwd(),loader:'js'},bundle:true,write:false,format:'esm',platform:'browser'});
const server=createServer((req,res)=>{if(req.url.startsWith('/models/')) {const name=req.url.slice(8);if(!manifest.assets.some(a=>a.id+'.glb'===name)){res.writeHead(404);res.end();return;}res.setHeader('content-type','model/gltf-binary');res.end(readFileSync(resolve('public/models/quail-kit',name)));}else if(req.url==='/viewer.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].contents);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#46504b}h1{position:absolute;top:12px;left:20px;font:25px Arial;color:#eee}footer{position:absolute;top:932px;left:20px;font:14px Arial;color:#eee}</style><h1>Quail Fields kit / exported asset review</h1><footer>Staged inspection · original scale · field composition and lighting review pending</footer><script type="module" src="/viewer.js"></script>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await puppeteer.launch({headless:true});
try {const page=await browser.newPage();await page.setViewport({width:1500,height:960,deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction('window.ready===true');const report=await page.evaluate(()=>window.report);
for(const item of report){const expected=manifest.assets.find(a=>a.id===item.id);if(item.triangles!==expected.triangles||item.meshes!==expected.meshes)throw Error('Export budget mismatch '+item.id);if(Math.abs(item.bounds.min[1])>(trees?.16:.04))throw Error('Origin not grounded '+item.id);}
if(errors.length)throw Error(errors.join('\n'));await page.screenshot({path:resolve(out,trees?'field-trees.png':props?'ground-props.png':'sand-plum.png')});writeFileSync(resolve(out,'export-review.json'),JSON.stringify({evidence:'Exported GLB staged review; not gameplay or frame rate evidence',report,errors},null,2));console.log(JSON.stringify(report));
} finally{await browser.close();server.close();}
