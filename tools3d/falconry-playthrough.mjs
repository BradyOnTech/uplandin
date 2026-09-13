/** Isolated automated browser test. Normal keyboard/mouse input, no state writes,
 * teleports, forced flushes or catches. Read-only telemetry assists aiming.
 * node tools3d/falconry-playthrough.mjs [catch|escape|recall] [seed] [--practice] [--slip-delay-ms=1000]
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const outcome=process.argv[2]??'catch',seed=process.argv[3]??'61';
const practice=process.argv.includes('--practice');
const slipDelay=Number(process.argv.find(arg=>arg.startsWith('--slip-delay-ms='))?.split('=')[1]??(outcome==='escape'?3500:0));
if(!Number.isFinite(slipDelay)||slipDelay<0)throw new Error('Invalid slip delay');
const out=resolve('output/playwright/falconry');mkdirSync(out,{recursive:true});
const prefix=`${out}/${practice?'practice-':''}${outcome}-${seed}`;
const manifest={kind:practice?'staged-practice-ordinary-gameplay-input':'ordinary-gameplay-automated-input',outcome,seed,slipDelay,limitations:['Frame limiting disabled for this diagnostic; not a device performance benchmark.','Read-only telemetry guides mouse aiming; not a human usability study.','Procedural raptor asset; physical mobile performance not verified.'],events:[],errors:[]};
console.log('Launching test browser');
const browser=await puppeteer.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required','--disable-frame-rate-limit','--disable-gpu-vsync']});
console.log('Browser launched');
const page=await browser.newPage();
console.log('Test page opened');await page.setViewport({width:1280,height:720,deviceScaleFactor:1});
page.on('pageerror',e=>{manifest.errors.push(String(e));console.error('Page error:',e);});
page.on('console',m=>{if(m.type()==='error'){manifest.errors.push(m.text());console.error('Console:',m.text());}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let mx=640,my=360,walking=false;
const read=()=>page.evaluate(()=>({t:window.__api3d.telemetry(),hunt:window.__api3d.hunt(),birds:window.__api3d.birds(),summary:!document.getElementById('hunt-summary').hidden,summaryText:document.getElementById('hunt-summary-copy').textContent,career:localStorage.getItem('uplandin.career.v1')}));
const move=async on=>{if(walking===on)return;walking=on;await page.keyboard[on?'down':'up']('KeyW');};
const look=async(target,state)=>{
  const c=state.t.camera,dx=target.x-c.x,dz=target.z-c.z;
  const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2((target.y??c.y-.6)-c.y,Math.hypot(dx,dz));
  const dyaw=Math.atan2(Math.sin(yaw-c.yawDeg*Math.PI/180),Math.cos(yaw-c.yawDeg*Math.PI/180));
  mx-=dyaw/.0022;my-=(pitch-c.pitchDeg*Math.PI/180)/.0022;
  await page.mouse.move(mx,my);
};
const event=async(name,state,screenshot=false)=>{manifest.events.push({name,seconds:(Date.now()-start)/1000,state});console.log(name,JSON.stringify({hawk:state.t.falconry,dog:state.hunt.dog.state}));if(screenshot)await page.screenshot({path:`${prefix}-${name}.png`});writeFileSync(`${prefix}.json`,JSON.stringify(manifest,null,2));};
const start=Date.now();
try {
 console.log('Loading test hunt');
 await page.goto(`http://localhost:4527/index3d.html?play=quick&method=goshawk&seed=${seed}&tod=morning&quality=lite${practice?'&practice=slip':''}`,{waitUntil:'domcontentloaded'});
 await page.bringToFront();
 console.log('Waiting for hunt initialization');
 await sleep(5000);
 await page.waitForFunction('window.__ready3d === true',{timeout:60000});
 console.log('Entering field');
 await page.click('#enter-field');await page.waitForFunction('document.pointerLockElement?.tagName === "CANVAS"',{timeout:5000});
 const entered=Date.now();
 const initial=await read();await event('fist',initial,true);
 // Empty slip must neither consume a flight nor release a bird.
 await page.keyboard.press('Space');await sleep(100);
 if((await read()).t.falconry.flights!==0)throw new Error('Empty slip created a flight');
 if(!practice)await move(true);
 let sawPoint=false,slipped=false,recallSent=false,recovered=false,lastPhase='',pointTarget=null,lateUntil=0;
 while(Date.now()-start<240000){
  await sleep(60);let state=await read();const h=state.t.falconry;
  if(practice&&!sawPoint&&Date.now()-entered>10000){await event('point-timeout',state);throw new Error('No nearby point within 10 seconds');}
  if(state.t.paused&&!state.summary)throw new Error('Unexpected pause');
  if(h.phase!==lastPhase){await event(h.phase,state,h.phase==='on-quarry');lastPhase=h.phase;}
  if(!sawPoint&&state.hunt.dog.state==='pointing'){
    if(practice){manifest.pointSeconds=(Date.now()-entered)/1000;if(manifest.pointSeconds>10)throw new Error('Practice point took longer than 10 seconds');}
    sawPoint=true;pointTarget=state.t.pointedBird;await move(false);await event('point',state,true);
  }
  if(h.phase==='fist'&&!slipped){
    if(state.birds.some(b=>b.status==='flying')){
      await move(false);
      if(slipDelay>0&&!lateUntil)lateUntil=Date.now()+slipDelay;
      if(!lateUntil||Date.now()>lateUntil){
        const target=state.birds.find(b=>b.status==='flying');await look(target,state);await page.keyboard.press('Space');
        await sleep(80);state=await read();slipped=state.t.falconry.flights>0;
      }
    } else if(sawPoint&&pointTarget){await look(pointTarget,state);await move(true);}
  } else if(['launching','chasing'].includes(h.phase)) {
    await move(false);await look(h.position,state);
    if(outcome==='recall'&&!recallSent){await page.keyboard.press('KeyR');recallSent=true;}
  } else if(h.phase==='on-quarry'){
    if(outcome!=='catch')throw new Error('Expected an unsuccessful flight');
    if(!manifest.checkedCatchHold){
      await move(false);const position={...h.position};
      await page.keyboard.press('KeyR');await sleep(10000);
      const held=await read();
      if(held.t.falconry.phase!=='on-quarry'||held.t.falconry.recovered!==0||JSON.stringify(held.t.falconry.position)!==JSON.stringify(position))throw new Error('Hawk returned from a catch without pickup');
      manifest.checkedCatchHold=true;await event('catch-stays-without-pickup',held,true);
    }

    if(state.hunt.dog.raptorDuty==='guarding'&&!manifest.guarded){manifest.guarded=true;await event('dog-guarding',state,true);}
    if(!manifest.testedNoRecall){await page.keyboard.press('KeyR');manifest.testedNoRecall=true;await sleep(70);if((await read()).t.falconry.phase!=='on-quarry')throw new Error('Recalled from quarry');}
    await look(h.position,state);
    const d=Math.hypot(h.position.x-state.t.camera.x,h.position.z-state.t.camera.z);
    await move(d>1.1);
    if(d<=1.1&&!recovered){if(!manifest.closePickup){manifest.closePickup=true;await event('pickup-close',state,true);await look({x:state.hunt.dog.x,y:h.position.y+.12,z:state.hunt.dog.z},state);await sleep(300);await event('guard-close',await read(),true);await look(h.position,await read());}await page.keyboard.press('KeyE');await sleep(100);recovered=(await read()).t.falconry.phase==='picking-up';}
  } else if(h.phase==='picking-up') { await move(false); if(!manifest.pickupFrame){manifest.pickupFrame=true;await event('hand-pickup',state,true);} } else if(h.phase==='returning') {await move(false);await look(h.position,state);}
  if(slipped&&h.flights>0&&h.phase==='fist'){
    await move(false);
    if(outcome==='catch'&&(!manifest.guarded||h.recovered!==1))throw new Error('The first offered flight did not produce a recovered catch');
    if(outcome==='escape'&&h.misses!==1)throw new Error('Escape not counted');
    if(outcome==='recall'&&h.recalls!==1)throw new Error('Recall not counted');
    if(!sawPoint)throw new Error('No dog point observed');
    if(practice){
      if(!state.summary){
        await page.waitForFunction(()=>!document.getElementById('hunt-summary').hidden||!document.getElementById('end-hunt').disabled,{timeout:30000});
        if(!(await read()).summary){await page.evaluate(()=>document.exitPointerLock());await page.click('#end-hunt');}
      }
      await page.waitForFunction('!document.getElementById("hunt-summary").hidden',{timeout:30000});
      const final=await read();if(final.career!==initial.career)throw new Error('Practice changed career');
      await event('summary',final,true);
      await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.click('#hunt-again')]);
      await page.waitForFunction('window.__ready3d === true',{timeout:60000});
      await page.click('#enter-field');
      await page.waitForFunction(()=>window.__api3d.hunt().dog.state==='pointing',{timeout:10000});
      const restarted=await read();
      if(restarted.t.falconry.flights!==0||restarted.t.pointedBird.id!==pointTarget.id)throw new Error('Drill did not reset');
      await event('restarted-point',restarted,true);
      await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.keyboard.press('KeyT')]);
      await page.waitForFunction('window.__ready3d === true',{timeout:60000});
      if((await read()).t.falconry.flights!==0)throw new Error('Keyboard restart failed');
      manifest.keyboardRestart=true;manifest.passed=manifest.errors.length===0;break;
    }
    // A recalled hawk can land before the flushed bird finishes escaping or
    // the dog arrives. Wait for those ordinary field states before ending.
    await page.waitForFunction(()=>window.__api3d.hunt().dog.state==='heel'&&!document.getElementById('end-hunt').disabled,{timeout:30000});
    // Verify pause freezes the hunt, then Q starts the next search.
    await page.keyboard.press('Escape');const paused=await read();await sleep(300);const after=await read();
    if(!after.t.paused||JSON.stringify(after.t.falconry)!==JSON.stringify(paused.t.falconry)||JSON.stringify(after.hunt)!==JSON.stringify(paused.hunt))throw new Error('Pause advanced simulation');
    await page.click('#enter-field');await page.keyboard.press('KeyQ');await sleep(150);
    const ready=await read();if(ready.hunt.dog.state==='heel'||ready.hunt.dog.state==='recalled')throw new Error('Dog did not cast off after return');
    await event('ready-again',ready,true);
    await page.evaluate(()=>document.exitPointerLock());
    await page.click('#end-hunt');await page.waitForFunction('!document.getElementById("hunt-summary").hidden',{timeout:15000});
    const final=await read();if(final.career!==initial.career)throw new Error('Quick Hunt changed career');
    await event('summary',final,true);manifest.passed=manifest.errors.length===0;if(!manifest.passed)throw new Error('Browser errors');break;
  }
 }
 if(!manifest.passed)throw new Error('Playthrough timed out');
} catch(e){manifest.failure=String(e);console.error(e);await page.screenshot({path:`${prefix}-failure.png`}).catch(()=>{});process.exitCode=1;}
finally{writeFileSync(`${prefix}.json`,JSON.stringify(manifest,null,2));await browser.close();}
