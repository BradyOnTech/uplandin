#!/usr/bin/env node
/** Cold-cache menu preservation through a hard service-worker network boundary.
 * Run against an immutable production preview, not the Vite development server.
 * node tools3d/validate-offline-preservation.mjs --url http://localhost:4173
 */
import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const args=process.argv.slice(2);
const get=(flag,fallback)=>args.includes(flag)?args[args.indexOf(flag)+1]:fallback;
const upstream=get('--url','http://localhost:4173').replace(/\/$/,'');
const out=resolve(get('--out','artifacts/3d/offline-preservation'));
await mkdir(out,{recursive:true});
const html=await fetch(`${upstream}/index.html`).then(r=>{assert.ok(r.ok,'Production preview must be reachable');return r.text();});
assert.ok(!/\/@vite|\/src\/main/.test(html),'Use a built production preview; development reloads invalidate evidence.');
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const report={upstream,startedAt:new Date().toISOString(),checks:[],errors:[],deniedRequests:[],evidence:'ordinary-ui-online-2d-and-cold-offline-menu-to-3d-relaunch'};
let networkOff=false, phase='online-2d';
const server=createServer(async(req,res)=>{
  if(networkOff){report.deniedRequests.push({phase,url:req.url});req.socket.destroy();return;}
  try{const response=await fetch(upstream+req.url);res.statusCode=response.status;res.setHeader('content-type',response.headers.get('content-type')||'application/octet-stream');res.setHeader('cache-control','no-store');res.end(Buffer.from(await response.arrayBuffer()));}
  catch(error){res.statusCode=502;res.end(String(error));}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}`;report.origin=base;
const browser=await puppeteer.launch({headless:!args.includes('--headed'),args:[]});
report.browser=await browser.version();
report.browserLaunchArgs=browser.process()?.spawnargs??[];
report.viewport={width:1280,height:720,dpr:1};
let page;
const scene=name=>page.waitForFunction(name=>window.__uplandin?.scene.isActive(name)&&window.__uplandin.scene.getScene(name).children.list.length>0,{timeout:30000},name);
const click=async(x,y)=>{const r=await page.$eval('canvas',c=>c.getBoundingClientRect().toJSON());await page.mouse.click(r.x+x/480*r.width,r.y+y/270*r.height);};
const read=()=>page.evaluate(()=>{const game=window.__uplandin;const active=game?.scene.scenes.find(s=>s.sys.isActive());return{url:location.href,online:navigator.onLine,scene:active?.sys.settings.key,texts:active?.children.list.filter(o=>typeof o.text==='string').map(o=>o.text),images:active?.children.list.filter(o=>o.type==='Image').map(o=>({key:o.texture.key,width:o.texture.source[0].width,height:o.texture.source[0].height})),background:game?.textures.exists('menu-bg'),career:localStorage.getItem('uplandin.career.v1'),scripts:performance.getEntriesByType('resource').map(e=>e.name).filter(n=>/\.js(?:[?#]|$)/.test(n))};});
const inventory=()=>page.evaluate(async()=>{const list=[];for(const key of await caches.keys()){const c=await caches.open(key);list.push({key,urls:(await c.keys()).map(r=>r.url)});}return list;});
const save=async(name,data)=>{report.checks.push({name,data});await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log('PASS',name);};
const noMissingImages=state=>assert.equal(state.images.some(i=>i.key==='__MISSING'),false);
const notice=state=>state.texts.includes('ARTWORK UNAVAILABLE');
const newContext=async()=>{const context=await browser.createBrowserContext();page=await context.newPage();await page.setViewport({width:1280,height:720});await page.setCacheEnabled(false);page.on('pageerror',e=>report.errors.push({phase,type:'pageerror',error:String(e)}));page.on('requestfailed',r=>report.errors.push({phase,type:'requestfailed',url:r.url(),error:r.failure()?.errorText}));return context;};
const chooseQuail=async()=>{
  for(let i=0;i<15;i++){if(await page.evaluate(()=>window.__uplandin.scene.getScene('QuickScene').cfg.areaId)==='quail-fields')break;await click(411,99);}
  assert.equal(await page.evaluate(()=>window.__uplandin.scene.getScene('QuickScene').cfg.areaId),'quail-fields');
};
try{
 const online=await newContext();await page.goto(`${base}/index.html`,{waitUntil:'domcontentloaded'});await scene('TitleScene');
 let state=await read();assert.ok(state.background);assert.equal(notice(state),false);noMissingImages(state);await page.screenshot({path:`${out}/online-title.png`});await save('Online title retains artwork and no fallback notice',state);
 await click(185,113);await click(240,207);await scene('QuickScene');await chooseQuail();await click(352,222);await scene('DropScene');await page.keyboard.press('Enter');await scene('FieldScene');
 const before=await page.evaluate(()=>({...window.__uplandin.scene.getScene('FieldScene').hunt.hunterPos}));await click(290,130);await sleep(1400);const field=await page.evaluate(()=>{const s=window.__uplandin.scene.getScene('FieldScene');return{area:s.area.id,hunter:s.hunt.hunterPos,birds:s.hunt.birds.length};});assert.equal(field.area,'quail-fields');assert.ok(Math.hypot(field.hunter.x-before.x,field.hunter.y-before.y)>1);await page.screenshot({path:`${out}/online-field.png`});await save('Online 2D Quick Hunt still renders and accepts movement',{before,field});
 await page.keyboard.press('KeyE');await page.waitForFunction('window.__uplandin.scene.getScene("FieldScene").summaryShown===true');await click(302,179);await scene('QuickScene');await page.keyboard.press('Escape');await scene('TitleScene');assert.equal(await page.evaluate(()=>localStorage.getItem('uplandin.career.v1')),null);await save('Online 2D summary returns through setup to menu without creating career',await read());await online.close();

 phase='cold-offline';const cold=await newContext();await page.goto(`${base}/index3d.html?area=quail-fields&breed=gsp&coat=liver-white&quality=lite`,{waitUntil:'domcontentloaded'});await page.waitForFunction('window.__ready3d===true',{timeout:60000});await page.waitForFunction('navigator.serviceWorker.controller!==null',{timeout:30000});
 const beforeOffline=await inventory();assert.equal(beforeOffline.flatMap(c=>c.urls).filter(u=>new URL(u).pathname.includes('/art/')).length,0);await save('Fresh 3D cached without any 2D artwork',beforeOffline);
 networkOff=true;await page.setOfflineMode(true);report.networkBoundary='Server destroys every new origin connection, including service-worker fetches. Browser HTTP cache disabled; CacheStorage retained.';
 await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.click('.menu-link')]);await scene('TitleScene');state=await read();assert.equal(state.background,false);assert.ok(notice(state));noMissingImages(state);await page.screenshot({path:`${out}/offline-title.png`});await save('Cold offline title uses neutral image textures and visible artwork notice',state);
 // CDP's page network emulation does not consistently update navigator.onLine
 // after a service-worker navigation. Set that reported state explicitly too;
 // the origin server remains the independent hard network boundary.
 const networkSession=await page.createCDPSession();await networkSession.send('Network.overrideNetworkState',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});assert.equal(await page.evaluate(()=>navigator.onLine),false);
 const deniedAtTitle=report.deniedRequests.length;await click(295,113);await click(240,207);await scene('QuickScene');await chooseQuail();
 for(let i=0;i<15;i++){if(await page.evaluate(()=>window.__uplandin.scene.getScene('QuickScene').cfg.breedId)==='gsp')break;await click(225,99);}
 assert.equal(await page.evaluate(()=>window.__uplandin.scene.getScene('QuickScene').cfg.breedId),'gsp');state=await read();noMissingImages(state);assert.ok(notice(state));assert.equal(report.deniedRequests.length,deniedAtTitle);await page.screenshot({path:`${out}/offline-quick.png`});await save('Offline setup remains readable with no repeated artwork requests',state);
 await click(352,222);await scene('DropScene');state=await read();noMissingImages(state);assert.ok(notice(state));await page.screenshot({path:`${out}/offline-drop.png`});await save('Offline Quail drop chooser is usable',state);
 await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.keyboard.press('Enter')]);await page.waitForFunction('window.__ready3d===true',{timeout:60000});assert.equal(new URL(page.url()).searchParams.get('play'),'quick');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('uplandin.quick.v1')).areaId),'quail-fields');await page.click('#enter-field');await page.waitForFunction('document.pointerLockElement!==null');
 const cameraBefore=await page.evaluate(()=>window.__api3d.telemetry().camera);await page.keyboard.down('KeyW');await sleep(1000);await page.keyboard.up('KeyW');const live=await page.evaluate(()=>({telemetry:window.__api3d.telemetry(),dogAudit:window.__dogAudit?.state(),ready:window.__ready3d}));assert.ok(Math.hypot(live.telemetry.camera.x-cameraBefore.x,live.telemetry.camera.z-cameraBefore.z)>.2);assert.ok(live.dogAudit);await page.screenshot({path:`${out}/offline-3d-relaunch.png`});await save('Real UI relaunches cached GSP Quail 3D and movement works offline',{url:page.url(),cameraBefore,...live});
 const afterOffline=await inventory();assert.equal(afterOffline.flatMap(c=>c.urls).filter(u=>new URL(u).pathname.includes('/art/')).length,0);assert.equal(report.deniedRequests.some(r=>/models\/gsp/.test(r.url)),false);await save('Offline relaunch fetched no GSP over the network and cached no placeholder artwork',afterOffline);
 await page.keyboard.press('Escape');await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.click('.menu-link')]);await scene('TitleScene');assert.ok(notice(await read()));
 phase='reconnected';networkOff=false;await page.setOfflineMode(false);await networkSession.send('Network.overrideNetworkState',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await click(240,207);await scene('QuickScene');state=await read();assert.ok(state.background);assert.equal(notice(state),false);noMissingImages(state);assert.ok(state.images.some(i=>i.key==='menu-dog-thumb-gsp'&&i.width>32));await page.screenshot({path:`${out}/reconnected-quick.png`});await save('After reconnecting the next menu loads real artwork and clears notice',state);await cold.close();
 assert.equal(report.errors.filter(e=>e.type==='pageerror').length,0);report.result='passed';
}catch(error){process.exitCode=1;report.result='failed';report.failure=String(error);console.error(error);try{await page.screenshot({path:`${out}/failure.png`});report.last=await read();}catch{}}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();server.close();console.log(report.result);}
