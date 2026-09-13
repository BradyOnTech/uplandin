/** Real input variations on the practice drill; telemetry is read-only. */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const out='output/playwright/falconry';mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({headless:true,args:['--disable-frame-rate-limit','--disable-gpu-vsync']});
const page=await browser.newPage();await page.setViewport({width:1280,height:720});
const cases=process.argv.includes('--late')?[{name:'late-3500ms',delay:3500}]:process.argv.includes('--window')?[{name:'one-second',delay:1000},{name:'one-and-half-second',delay:1500}]:process.argv.includes('--sides')?[{name:'left-close',delay:250,strafe:'KeyA',strafeMs:3000},{name:'right-close',delay:250,strafe:'KeyD',strafeMs:3000},{name:'sprint-close',delay:250,sprint:true}]:[{name:'level-immediate',delay:0},{name:'level-250ms',delay:250},{name:'level-500ms',delay:500},{name:'aim-500ms',delay:500,aim:true},{name:'walking-250ms',delay:250,walk:true},{name:'late-3500ms',delay:3500}];
const results=[];let mx=0,my=0;
const look=async(target,s)=>{const c=s.t.camera,dx=target.x-c.x,dz=target.z-c.z;const yaw=Math.atan2(-dx,-dz),pitch=target.y===undefined?c.pitchDeg*Math.PI/180:Math.atan2(target.y-c.y,Math.hypot(dx,dz));const delta=Math.atan2(Math.sin(yaw-c.yawDeg*Math.PI/180),Math.cos(yaw-c.yawDeg*Math.PI/180));mx-=delta/.0022;my-=(pitch-c.pitchDeg*Math.PI/180)/.0022;await page.mouse.move(mx,my);};
const read=()=>page.evaluate(()=>({t:window.__api3d.telemetry(),b:window.__api3d.birds(),h:window.__api3d.hunt()}));
try {for(const c of cases){
 await page.goto('http://127.0.0.1:4527/index3d.html?play=quick&method=goshawk&practice=slip&quality=high',{waitUntil:'domcontentloaded'});
 await page.waitForFunction('window.__ready3d');const button=await page.$('#enter-field');const bounds=await button.boundingBox();mx=bounds.x+bounds.width/2;my=bounds.y+bounds.height/2;await page.click('#enter-field');await page.waitForFunction('document.pointerLockElement');
 await page.waitForFunction(()=>window.__api3d.hunt().dog.state==='pointing',{timeout:15000});
 if(c.strafe){await page.keyboard.down(c.strafe);await sleep(c.strafeMs);await page.keyboard.up(c.strafe);}
 const p=await read(),target=p.t.pointedBird;if(target)await look(target,p);
 if(c.sprint)await page.keyboard.down('ShiftLeft');
 await page.keyboard.down('KeyW');
 const r={...c,frames:[],minDistance:Infinity};let flushAt=0,slipped=false;const start=Date.now();
 while(Date.now()-start<60000){
  const s=await read(),hawk=s.t.falconry,b=s.b.find(x=>x.status==='flying');
  if(!flushAt&&target)await look(target,s);
  if(b&&!flushAt){flushAt=Date.now();r.flush={bird:b,camera:s.t.camera};if(!c.walk)await page.keyboard.up('KeyW');}
  if(flushAt&&!slipped&&Date.now()-flushAt>=c.delay){
   if(c.aim&&b)await look(b,s);
   await page.keyboard.press('Space');slipped=true;r.slip={bird:b,camera:s.t.camera};
  }
  if(hawk.flights){
   r.frames.push({hawk,bird:b,camera:s.t.camera});if(b)r.minDistance=Math.min(r.minDistance,Math.hypot(b.x-hawk.position.x,b.y-hawk.position.y,b.z-hawk.position.z));
   if(hawk.catches||hawk.misses){r.result=hawk.catches?'catch':'miss';r.hawk=hawk;break;}
  }
  if(slipped&&Date.now()-flushAt>5000&&!hawk.flights){r.result='slip-rejected';break;}
  await sleep(35);
 }
 await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');await page.screenshot({path:`${out}/matrix-${c.name}.png`});
 if(r.result!==(c.name.startsWith('late')?'miss':'catch'))process.exitCode=1;
 r.final=await read();results.push(r);writeFileSync(`${out}/slip-matrix${process.argv.includes('--sides')?'-sides':process.argv.includes('--window')?'-window':process.argv.includes('--late')?'-late':''}.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({...c,result:r.result,minDistance:r.minDistance,slip:r.slip}));
}}
finally{await browser.close();}
